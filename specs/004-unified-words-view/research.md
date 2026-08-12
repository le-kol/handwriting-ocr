# Research: Единое представление слов скана с управлением векторизацией

**Feature**: `004-unified-words-view`  
**Date**: 2026-08-12

## 1. Объединение представлений: что убрать и что оставить

**Decision**: Единственным списком слов на экране остаётся **текстовая раскладка** (`recognized-text` / `layoutLines`). Секция **«Слова скана»** с HTML-таблицей (`words-table`) и связанные стили **удаляются**. Функции таблицы переносятся в два места: индикатор статуса — inline у каждого `.word` в тексте; векторизация/миниатюра/удаление — в **панель редактирования** (`draft`); пакетная векторизация — в **layout-toolbar**.

**Rationale**: Spec FR-001 требует приоритет текстового представления; таблица дублирует текст и статус. Brownfield уже имеет drag-and-drop, выбор слова и draft-панель — логичное место для действий над выбранным словом.

**Alternatives considered**:
- **Tabs «Текст / Таблица»** — против spec (таблица должна быть убрана, не спрятана).
- **Оставить таблицу только для batch** — лишний UI; batch переносится в toolbar.

## 2. Визуальный индикатор статуса в тексте

**Decision**: Добавить CSS-классы на span слова: `.word.vectorized` / `.word.not-vectorized` (или эквивалент через `data-vectorized`), определяемые функцией `isWordVectorized(word)` из `curvePoints.ts`. Индикация — **декоративная** (нижняя граница, лёгкий фон, точка через `::after`), **без** изменения `shown.text` и без вставки символов в DOM-текст.

**Rationale**: FR-002 запрещает менять текст слова; CSS-класс на обёртке — минимальный diff, не ломает drag-and-drop и selection (классы `.selected`, `.dragging` уже на `.word`).

**Alternatives considered**:
- **Prefix «✓» в тексте** — нарушает FR-002.
- **Отдельный span-иконка после слова** — допустимо, но увеличивает DOM; CSS pseudo-element проще и не влияет на пробелы между словами.
- **Tooltip-only** — статус не виден без hover; хуже для SC-007.

## 3. Панель редактирования: миниатюра, векторизация, удаление

**Decision**:
- **Миниатюра**: переиспользовать `WordCurveThumbnail` в блоке `.editor`, если `isWordVectorized(draft)`.
- **«Векторизовать»**: кнопка в `.editor` для `draft.id > 0` и невекторизованного слова; handler — существующий `handleVectorizeClick(draft)` без изменения контракта POST vectorize.
- **«Удалить слово»**: новый `handleDeleteClick`; `DELETE /api/Scans/{scanId}/words/{wordId}`; при `204` — удалить id из `words`, вызвать `removeWordFromLayout(layoutLines, wordId)`, `setDraft(null)` если удалённое было выбранным; при ошибке — `response.text()`, слово остаётся.

**Rationale**: Spec явно переносит действия из таблицы в draft-панель; delete endpoint уже есть на сервере (204 NoContent).

**Alternatives considered**:
- **Confirm dialog** — вне scope spec.
- **Soft delete / undo** — вне scope.
- **Удаление черновика `id === 0`** — только локально через «Отмена» / убрать из layout; серверный DELETE недоступен.

## 4. Удаление слова: синхронизация layout

**Decision**: Новый pure helper `removeWordFromLayout(lines, wordId): Word[][] | null` — клон layout, фильтрация слова по id из всех строк, удаление пустых строк. Параллельно `setWords(words.filter(w => w.id !== wordId))`. **Не** вызывать полный `syncLayoutFromWords` после delete — сохраняет локальный порядок оставшихся слов без лишнего пересчёта line/order с сервера.

**Rationale**: Delete не меняет order_index остальных на сервере в одной транзакции (см. `DeleteWordAsync`); локальная раскладка должна отражать отсутствие слова немедленно. Если оператор менял порядок локально — не сбрасывать его.

**Alternatives considered**:
- **Refetch words после delete** — лишний round-trip; допустим как fallback при ошибке синхронизации.
- **syncLayoutFromWords** — перестроит строки по `lineIndex`/`orderIndex` с сервера и может сбросить несохранённый drag-order.

## 5. Пакетная векторизация в layout-toolbar

**Decision**: Кнопка **«Векторизовать все слова»** рядом с «Сохранить порядок». Новый fetch-helper `vectorizeBatch(scanId)` → `POST /api/Scans/{id}/vectorize-batch`. State: `isBatchVectorizing: boolean` (или переиспользовать общий флаг блокировки). При успехе: `setWords(data)`, `syncLayoutFromWords(data)` (как после recognize — spec требует обновить words **и** раскладку из ответа), обновить `draft` если выбранное слово есть в ответе (`merge` полей включая `curvePoints`). Статус — в `vectorizeStatus` или отдельный `batchVectorizeStatus`.

**Rationale**: Ответ batch — полный список слов с актуальными `curvePoints` (контракт 003); `syncLayoutFromWords` — уже проверенный путь согласования layout с серверным порядком после массовой операции.

**Alternatives considered**:
- **Точечный merge curvePoints без syncLayout** — риск рассинхрона при изменении order/line на сервере (batch не меняет order, но единообразие с recognize проще).
- **Кнопка в draft-панели** — spec указывает layout-toolbar.

## 6. Взаимная блокировка операций векторизации

**Decision**: Пока `vectorizingWordId !== null` **или** `isBatchVectorizing === true`:
- кнопка «Векторизовать» (draft) disabled;
- кнопка «Векторизовать все слова» disabled;
- кнопка vectorize в таблице N/A (таблица удалена).

Одиночная векторизация: guard в `handleVectorizeClick` расширить проверкой `isBatchVectorizing`.

**Rationale**: FR-012; предотвращает параллельные конфликтующие запросы без state-менеджера.

## 7. Размещение сообщений об ошибках/успехе

**Decision**: Переиспользовать `vectorizeStatus` для одиночной и пакетной векторизации (префиксы «Векторизация…», «Пакетная векторизация…»). Для удаления — `saveStatus` или новый `deleteStatus` в draft-панели (рядом с существующим `saveStatus`).

**Rationale**: Таблица с `words-section-status` удаляется; сообщения должны остаться видимыми у toolbar или editor.

## 8. Backend / схема

**Decision**: **Не менять** сервер, Liquibase, формат JSON Word. Потребление: `DELETE …/words/{wordId}`, `POST …/vectorize-batch` (003), существующий `POST …/vectorize` (001).

**Rationale**: Spec FR-014; фича — реорганизация клиентского UI.

## Resolved clarifications

Все пункты Technical Context закрыты без `NEEDS CLARIFICATION`: brownfield `App.tsx` определяет стек; индикатор — CSS на `.word`; delete/batch — существующие endpoint'ы.
