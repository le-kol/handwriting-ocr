# Contract: GET global words page

**Feature**: `012-global-words-table`  
**Date**: 2026-08-21

## Endpoint

```http
GET /api/Words?page={page}&search={search}&vectorized={vectorized}&scanId={scanId}
```

| Parameter | In | Type | Description |
|-----------|----|------|-------------|
| `page` | query | int | Номер страницы, **1-based**. Отсутствует → **1** |
| `search` | query | string | Подстрока текста слова (ILIKE, без учёта регистра). Отсутствует или пустая → без фильтра по тексту |
| `vectorized` | query | string | `all` (default), `true`, `false`. `true` → `curve_points IS NOT NULL`; `false` → `curve_points IS NULL` |
| `scanId` | query | int | Фильтр по скану. Отсутствует или ≤ 0 → все сканы |

**Body**: none.

**Content-Type ответа (успех)**: `application/json`  
**Content-Type ответа (ошибка)**: `text/plain` (строка на русском), без ProblemDetails.

Размер страницы **не** передаётся клиентом: `ScanList:PageSize` (30).

## Success

**200 OK**

```json
{
  "items": [ { "...": "Word — см. GET /api/Scans/{id}/words" } ],
  "totalCount": 128
}
```

Инварианты:

- Каждый элемент `items` — полная модель `Word` (camelCase), как в `GET /api/Scans/{id}/words`
- `items.length` ≤ `PageSize`
- Порядок: `scanId ASC`, `orderIndex ASC`
- `totalCount` — число всех подходящих строк `words`, не только текущей страницы
- Нет слов / нет совпадений: `{ "items": [], "totalCount": 0 }`
- `page` больше последней: `{ "items": [], "totalCount": <N> }`

SQL и пагинация — в `WordDbService.GetWordsPageAsync` (не в контроллере).

## Error responses

| Status | Когда | Пример тела |
|--------|-------|-------------|
| 400 | `page < 1` | `Номер страницы должен быть не меньше 1` |
| 400 | `vectorized` не `all`/`true`/`false` | `Недопустимое значение фильтра векторизации` |
| 503 | `ScanList:PageSize` ≤ 0 | русский текст невалидной конфигурации |

## Out of scope

- POST/PUT/DELETE на `/api/Words`
- Изменение формата `Word`
- Query `pageSize`, `sort`
- Server-side генерация JSONL

## Controller

`WordsController` — `[Route("api/[controller]")]`, единственный action на фичу: `GetWordsPage`.
