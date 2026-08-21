# Data Model: Глобальная таблица слов и экспорт датасета

**Feature**: `012-global-words-table`  
**Date**: 2026-08-21

Изменений схемы БД нет. Используются существующие таблицы `words` (FK `scan_id` → `scans`, `ON DELETE CASCADE`).

## Entities

### Word (существующая таблица `words`)

| Field (DB) | API (camelCase) | Type | Notes |
|------------|-----------------|------|-------|
| id | id | int | PK |
| scan_id | scanId | int | FK scans |
| word | text | string | Распознанный текст |
| x1..y4 | x1..y4 | float | Вершины рамки |
| order_index | orderIndex | int | Порядок чтения в скане, 0..n |
| line_index | lineIndex | int | Номер строки OCR в скане |
| curve_points | curvePoints | float[][][] \| null | N×4×2; null — не векторизовано |

**Changes in this feature**: Нет новых колонок. Кросс-скановый список читает те же поля, что `GetWordsByScanIdAsync`.

### Word list page (ответ API, не таблица БД)

| Field | Type | Notes |
|-------|------|-------|
| items | Word[] | До `PageSize` (30) записей текущей страницы |
| totalCount | int | Число строк, подходящих под WHERE (все страницы) |

Инварианты:

- `items.length` ≤ `ScanList:PageSize`
- Сортировка items: `scanId ASC`, `orderIndex ASC`
- `page < 1` → 400 до SQL
- Страница за последней: `items = []`, `totalCount` без изменения
- Пустая БД / нет совпадений: `items = []`, `totalCount = 0`

Offset: `(page - 1) * PageSize`.

### Query filters (параметры запроса, не сущности БД)

| Parameter | Values | SQL effect |
|-----------|--------|------------|
| page | int ≥ 1 | LIMIT/OFFSET |
| search | string, optional | `word ILIKE '%…%'` (case-insensitive) |
| vectorized | `all` \| `true` \| `false`, optional | см. research.md §3 |
| scanId | int, optional | `scan_id = @scanId` если > 0 |

### Dataset export line (JSONL, не таблица БД)

| Field | Type | Source |
|-------|------|--------|
| wordId | number | `word.id` |
| scanId | number | `word.scanId` |
| lineIndex | number | `word.lineIndex` |
| text | string | `word.text` |
| curves | number[][][] | `filterValidCurves(word.curvePoints)` |

Строки с пустым `curves` после фильтрации **не** записываются в файл.

### ScanListOptions (переиспользование)

| Field | Type | Notes |
|-------|------|-------|
| PageSize | int | 30 по умолчанию; используется и для `GET /api/Words` |

## State transitions

### Клиент: переключение экранов

```text
[appView=scans, редактор пуст или активен]
  --(кнопка «Слова»)--> [appView=words, WordsTableScreen]
  --(кнопка «Сканы»)--> [appView=scans]

[appView=words]
  --(клик строки scanId+wordId)-->
    [appView=scans] --> handleScanRowClick(scanId) --> GET words(scanId)
    --> selectWord({ id: wordId, ... })
```

### Экспорт (клиент)

```text
[idle] --(клик «Экспортировать …»)--> [loading pages, кнопка disabled]
  --(все страницы OK)--> [формирование JSONL] --> [download] --> [сообщение: N слов]
  --(ошибка fetch)--> [сообщение об ошибке, без частичного файла как успеха]
```

Мутации слов (create/update/delete/vectorize) **не** меняются; таблица слов только читает.

## Schema change (Liquibase)

**Нет.**

## API model mapping

**GET /api/Words?page=1&search=…&vectorized=…&scanId=…**

```json
{
  "items": [
    {
      "id": 101,
      "scanId": 5,
      "text": "пример",
      "x1": 0, "y1": 0, "x2": 10, "y2": 0,
      "x3": 10, "y3": 5, "x4": 0, "y4": 5,
      "orderIndex": 2,
      "lineIndex": 0,
      "curvePoints": [[[0,0],[1,1],[2,2],[3,3]]]
    }
  ],
  "totalCount": 128
}
```

Формат элемента **идентичен** элементу массива `GET /api/Scans/{id}/words`.
