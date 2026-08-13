# Contract: GET scans page

**Feature**: `005-scans-table-thumbnails`  
**Date**: 2026-08-14

## Endpoint

```http
GET /api/Scans?page={page}
```

| Parameter | In | Type | Description |
|-----------|----|------|-------------|
| `page` | query | int | Номер страницы, **1-based**. Если параметр отсутствует — **1**. Размер страницы **не** передаётся: берётся из `ScanList:PageSize` (30). |

**Body**: none.

**Content-Type ответа (успех)**: `application/json`  
**Content-Type ответа (ошибка)**: `text/plain` (строка на русском), без ProblemDetails.

## Success

**200 OK**

```json
{
  "items": [ { "id": 42 }, { "id": 41 } ],
  "totalCount": 42
}
```

Инварианты:

- `items` — только `{ "id": <int> }`, порядок **id DESC**
- `items.length` ≤ `PageSize` (30)
- `totalCount` — число всех строк `scans`, не только текущей страницы
- пустая БД: `{ "items": [], "totalCount": 0 }`
- `page` больше последней: `{ "items": [], "totalCount": <N> }`

SQL и пагинация выполняются в `ScanDbService` (не в контроллере).

## Error responses

| Status | Когда | Пример тела |
|--------|-------|-------------|
| 400 | `page < 1` | `Номер страницы должен быть не меньше 1` |
| 503 | `ScanList:PageSize` отсутствует или ≤ 0 | русский текст невалидной конфигурации |

## Out of scope

- Query `pageSize` / `sort` / фильтры
- Поля даты, пути, числа слов в `items`
- Удаление скана
