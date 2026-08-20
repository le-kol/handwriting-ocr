# Contract: POST batch vectorize (with run params)

**Feature**: `011-vectorize-run-params`  
**Date**: 2026-08-20  
**Extends**: [003 vectorize-batch](../../003-batch-vectorize-scan/contracts/vectorize-batch.md)

## Endpoint

```http
POST /api/Scans/{id}/vectorize-batch
```

| Parameter | In | Type | Description |
|-----------|----|------|-------------|
| `id` | path | int | Id скана |

## Request body (NEW — optional)

**Content-Type**: `application/json`

```json
{
  "paddingPx": 6,
  "approximationTolerance": 2.0
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `paddingPx` | number | optional | Отступ для **всех** слов этого batch-run |
| `approximationTolerance` | number | optional | Погрешность для **всех** слов этого batch-run |

Omitted fields → значения из конфигурации (backward compatible).

Указанные значения MUST применяться одинаково ко всем словам, обрабатываемым в рамках этого запуска (FR-011).

## Success

Без изменений относительно 003: **200 OK** + JSON-массив всех слов скана.

## Error responses (additions)

| Status | Когда | Пример тела |
|--------|-------|-------------|
| 400 | Невалидные run params (те же правила, что single) | plain text RU, объединённое при нескольких ошибках |

Top-level **404** / **503** — без изменений относительно [003](../../003-batch-vectorize-scan/contracts/vectorize-batch.md).

При **400** batch MUST NOT начинать обработку слов; состояние всех слов без изменений.

Per-word ошибки внутри успешного batch (рамка, штрихи) — без изменений: **200**, `curvePoints: null` у проблемных слов.

## Out of scope (removed from 003 out-of-scope)

- ~~Тело запроса с параметрами векторизации~~ — **in scope** данной фичи.
