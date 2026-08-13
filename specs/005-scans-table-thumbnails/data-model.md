# Data Model: Таблица сканов с пагинацией и миниатюрами

**Feature**: `005-scans-table-thumbnails`  
**Date**: 2026-08-14

Изменений схемы БД нет. Используется существующая таблица `scans`.

## Entities

### Scan (существующая)

| Field | Type | Notes |
|-------|------|-------|
| Id | int | PK, сортировка списка DESC |
| Path | text | Абсолютный путь к PNG/JPEG; нужен миниатюре и редактору, **не** входит в элемент списка |

**Changes in this feature**: Нет колонок. Список читает только `id`. Миниатюра читает `path`, затем байты с диска.

### Scan list page (ответ API, не таблица БД)

| Field | Type | Notes |
|-------|------|-------|
| Items | `{ id: int }[]` | До `PageSize` элементов текущей страницы |
| TotalCount | int | `COUNT(*)` по всей таблице `scans` |

Инварианты:

- `Items.Length <= PageSize` (30 при валидном конфиге)
- `page < 1` на этот объект не маппится (400 до SQL)
- страница за последней: `Items = []`, `TotalCount` прежний
- пустая БД: `Items = []`, `TotalCount = 0`

Offset: `(page - 1) * PageSize`.

### ScanListOptions (конфигурация, не таблица)

| Field | Type | Notes |
|-------|------|-------|
| PageSize | int | Дефолт 30; секция `ScanList`. Клиент размер не задаёт |
| SectionName | const string | `"ScanList"` |

`PageSize <= 0` — невалидная конфигурация (503), список не выполняется.

### Миниатюра (эфемерная)

Не сущность БД и не файл. На запрос: исходные байты скана → кадр с большей стороной ≤ ~200px, пропорции сохранены, без апскейла. На диск не пишется.

## State transitions

Список и миниатюра **не** меняют состояние Scan/Word.

Клиентский редактор при открытии из таблицы:

```text
[скан A в редакторе] --(клик строки B)--> [сброс состояния A] --> [scanId = B]
                                         --> GET words(B) --> [слова B или пусто]
```

Recognize **не** вызывается → `ReplaceWordsFromOcrAsync` не выполняется.

## Schema change (Liquibase)

**Нет.**

## API model mapping

**GET /api/Scans?page=1** (camelCase):

```json
{
  "items": [ { "id": 42 }, { "id": 41 } ],
  "totalCount": 2
}
```

Поля даты, пути, числа слов **отсутствуют**.
