# Contract: UI — единое текстовое представление слов

**Feature**: `004-unified-words-view`  
**Date**: 2026-08-12

Клиент **не** добавляет новых HTTP-маршрутов на сервере. Контракт описывает реорганизацию UI и потребление существующих API.

## Upstream APIs

| Операция | Контракт |
|----------|----------|
| Чтение слов | `GET /api/Scans/{id}/words` — [002 words-list-ui](../../002-words-vector-ui/contracts/words-list-ui.md) |
| Одиночная векторизация | `POST /api/Scans/{id}/words/{wordId}/vectorize` — [001 vectorize-word](../../001-word-stroke-vector/contracts/vectorize-word.md) |
| Пакетная векторизация | `POST /api/Scans/{id}/vectorize-batch` — [003 vectorize-batch](../../003-batch-vectorize-scan/contracts/vectorize-batch.md) |
| Удаление слова | `DELETE /api/Scans/{id}/words/{wordId}` — см. § Delete word ниже |

## Removed UI surface

| Элемент | Статус после фичи |
|---------|-------------------|
| Секция `<section class="words-section">` | **REMOVED** |
| Таблица `.words-table` | **REMOVED** |
| Колонки Текст / Статус / Миниатюра / Действие в таблице | **REMOVED** |
| Кнопка «Векторизовать» в строке таблицы | **MOVED** → draft-панель |

## Text layout (recognized-text)

### Word span

| Аспект | MUST |
|--------|------|
| Текст | `shown.text` без служебных символов в строке |
| Статус векторизации | Визуальный индикатор через CSS-класс(ы) на `.word`, по `isWordVectorized(word)` |
| Выбор | `onClick` → `handleWordSelect` (без регрессии) |
| Drag-and-drop | `draggable`, handlers без регрессии |
| Selected / dragging / drop-target | Существующие классы сохраняются |

Индикатор MUST NOT изменять innerText/textContent слова.

### Layout toolbar

| Элемент | MUST |
|---------|------|
| «Сохранить порядок» | Без регрессии |
| **«Векторизовать все слова»** | **NEW** — POST vectorize-batch для текущего `scanId` |
| Блокировка batch | disabled при `isBatchVectorizing` или активной одиночной векторизации |
| Статус batch | Текстовое сообщение (RU) в toolbar или общем `vectorizeStatus` |

## Draft panel (editor)

| Элемент | Условие | MUST |
|---------|---------|------|
| Text + coordinates + Сохранить/Отмена | `draft !== null` | Без регрессии |
| `WordCurveThumbnail` | `isWordVectorized(draft)` | SVG в СК фрагмента, не на скане |
| «Векторизовать» | `draft.id > 0` && !vectorized | POST vectorize; disabled при `vectorizingWordId === draft.id` или batch |
| «Удалить слово» | `draft.id > 0` | DELETE; **без** confirm dialog |
| Черновик `id === 0` | — | Нет vectorize/delete на сервер |

### После успешной одиночной векторизации

1. Обновить запись в `words` по `id`.
2. `applyWordUpdateInLayout` для `layoutLines`.
3. Если `draft.id === updated.id` — merge в `draft`.
4. Индикатор в тексте → vectorized; в draft — миниатюра вместо кнопки vectorize.

### После успешного DELETE (204)

1. Удалить слово из `words`.
2. `removeWordFromLayout(layoutLines, wordId)`.
3. Если `draft?.id === wordId` → `setDraft(null)`.
4. Сбросить drag state при необходимости.

### После ошибки DELETE

1. `response.text()` → сообщение оператору.
2. `words`, `layoutLines`, `draft` **без** изменений.

## Delete word (upstream)

```http
DELETE /api/Scans/{id}/words/{wordId}
```

| | |
|--|--|
| Body | none |
| Success | `204 NoContent` (без тела) |
| Error | plain text RU, напр. `404` + `Слово не найдено` |

Клиент MUST трактовать только `response.ok` / status 204 как успех удаления.

## Batch vectorize (client consumption)

```http
POST /api/Scans/{id}/vectorize-batch
```

| | |
|--|--|
| Body | none |
| Success | `200` + JSON `Word[]` (полный список скана) |
| Top-level error | `404` / `503` + plain text |

После `200`:

1. `setWords(data)`.
2. `syncLayoutFromWords(data)` — перестроить `layoutLines` и `savedLayoutSignature`.
3. Если `draft` и слово с тем же `id` есть в `data` — обновить поля draft (в т.ч. `curvePoints`).
4. Индикаторы в тексте отражают новые `curvePoints`.

Per-word неудачи: `200` с `curvePoints: null` у отдельных слов; UI не показывает причину в batch-ответе.

## Mutual exclusion

| Активно | Заблокировано |
|---------|---------------|
| `vectorizingWordId !== null` | Повтор vectorize того же/другого слова; batch |
| `isBatchVectorizing === true` | Одиночный vectorize; повторный batch |

## Out of scope

- Изменения тел/форматов upstream API.
- Confirm/undo delete.
- Новые страницы/маршруты.
