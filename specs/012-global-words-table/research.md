# Research: Глобальная таблица слов и экспорт датасета

**Feature**: `012-global-words-table`  
**Date**: 2026-08-21

## 1. Endpoint кросс-сканового чтения слов

**Decision**: Новый контроллер `WordsController`, маршрут `GET /api/Words` с query-параметрами `page`, `search`, `vectorized`, `scanId`.

**Rationale**: Существующий `GET /api/Scans/{id}/words` привязан к одному скану. Кросс-скановый список — отдельный read-only ресурс «слова системы»; отдельный контроллер не раздувает `ScansController` и соответствует принципу II (тонкий контроллер → `WordDbService`).

**Alternatives considered**:

- **`GET /api/Scans/words`** — смешивает коллекцию сканов и глобальную коллекцию слов; неоднозначный REST-путь.
- **N× `GET /api/Scans/{id}/words` на клиенте** — отвергнуто в spec; не масштабируется для таблицы и экспорта.

## 2. Размер страницы

**Decision**: Переиспользовать `ScanListOptions.PageSize` (30 из `ScanList:PageSize` в `appsettings.json`). Клиент размер страницы не передаёт.

**Rationale**: Уже есть рабочий паттерн (`005-scans-table-thumbnails`); единый размер списков в приложении; не нужен второй Options-класс только для слов.

**Alternatives considered**:

- **Отдельный `WordListOptions`** — дублирование конфигурации без выгоды на текущем масштабе.
- **Query `pageSize`** — противоречит установившемуся контракту списков в проекте.

## 3. SQL: фильтры, поиск, сортировка

**Decision**:

- **Сортировка по умолчанию**: `ORDER BY scan_id ASC, order_index ASC` (уточнение `/speckit-clarify`).
- **Поиск**: `word ILIKE '%' || @search || '%'`; параметр `@search` — экранированная подстрока (`%`, `_`, `\` экранируются для LIKE).
- **Фильтр скана**: `scan_id = @scanId` при переданном `scanId > 0`; отсутствие параметра — все сканы.
- **Фильтр векторизации** (`vectorized` query):
  - отсутствует или `all` — без фильтра;
  - `true` — `curve_points IS NOT NULL`;
  - `false` — `curve_points IS NULL`.
- **Пагинация**: `COUNT(*)` с теми же WHERE; выборка `LIMIT @pageSize OFFSET (@page - 1) * @pageSize`.

**Rationale**: В PostgreSQL нет дешёвой SQL-проверки «валидный N×4×2»; грубый фильтр `IS NOT NULL` на сервере + `isWordVectorized`/`filterValidCurves` на клиенте для статуса в UI и экспорта согласованы со spec (FR-018). Невалидный non-null `curve_points` — редкий edge case, уже описан в spec.

**Alternatives considered**:

- **Фильтр векторизации только на клиенте** — не масштабируется; клиент должен загрузить все слова.
- **JSON-функции PostgreSQL для валидации кривых** — избыточная сложность без изменения схемы.

## 4. Формат ответа API

**Decision**: JSON `{ items: Word[], totalCount: number }` — те же поля `Word`, что `GET /api/Scans/{id}/words` (camelCase, включая `curvePoints`, `orderIndex`, `lineIndex`).

**Rationale**: FR-007; один маппер `ReadWord`; миниатюра и экспорт используют те же данные без второго DTO.

## 5. Навигация SPA (два экрана)

**Decision**: Состояние `appView: 'scans' | 'words'` в `App.tsx`; кнопки «Сканы» / «Слова» в шапке; по умолчанию `'scans'`. Экран «Слова» — отдельный блок (новый компонент `WordsTableScreen.tsx`). Клик по строке: `setAppView('scans')` → существующий поток `handleScanRowClick(scanId)` → после загрузки слов `selectWord` по `wordId`.

**Rationale**: Уточнение clarify (вариант C); минимальное отклонение от «один App.tsx» — вынос таблицы слов в отдельный файл для читаемости, без роутера и state-менеджера (конституция).

**Alternatives considered**:

- **React Router** — новая зависимость и паттерн вне текущего brownfield.
- **Таблица слов как секция под таблицей сканов** — противоречит clarify («отдельный экран»).

## 6. Экспорт JSONL на клиенте

**Decision**:

- Утилита `exportWordsDataset.ts`: последовательный fetch всех страниц `GET /api/Words` с нужными query (для «всё» — без search/scanId; для «отфильтрованное» — snapshot параметров на момент клика).
- Строка: `JSON.stringify({ wordId, scanId, lineIndex, text, curves: filterValidCurves(word.curvePoints) })`.
- Скачивание: `Blob` + временный `<a download>`.
- Имена файлов: `words-dataset-all.jsonl`, `words-dataset-filtered.jsonl`.
- Блокируется только нажатая кнопка экспорта; таблица остаётся интерактивной.

**Rationale**: FR-010–FR-017; переиспользование `filterValidCurves`/`isWordVectorized` из `curvePoints.ts`.

**Alternatives considered**:

- **Server-side export endpoint** — явно вне scope spec.
- **Экспорт только текущей страницы** — противоречит FR-010/FR-011.

## 7. Кнопка «Экспортировать отфильтрованное» (disabled)

**Decision**: Кнопка `disabled`, если `totalCount === 0` **или** активен фильтр «не векторизовано» (`vectorized=false`). При успешном экспорте с 0 записей после клиентской фильтрации — сообщение «Экспортировано слов: 0», не ошибка.

**Rationale**: FR-016; фильтр «не векторизовано» гарантированно не даёт экспортируемых строк; пустой totalCount — явное пустое состояние.

## 8. Поиск в UI

**Decision**: Debounce ~300 ms после ввода; сброс на `page = 1` при смене search/filters.

**Rationale**: Стандарт для таблиц; не требует кнопки «Найти»; снижает число запросов.

**Alternatives considered**:

- **Поиск по Enter** — лишнее действие для оператора.

## 9. Liquibase / схема

**Decision**: Без changeset'ов.

**Rationale**: FR-008; чтение из существующей таблицы `words` с JOIN не требуется (поле `scan_id` уже на слове).
