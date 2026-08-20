# Contract: GET vectorization defaults

**Feature**: `011-vectorize-run-params`  
**Date**: 2026-08-20

## Endpoint

```http
GET /api/Scans/vectorization-defaults
```

**Parameters**: none.

**Content-Type ответа (успех)**: `application/json`  
**Content-Type ответа (ошибка)**: `text/plain` (строка на русском), без ProblemDetails.

## Success

**200 OK**

```json
{
  "paddingPx": 4,
  "approximationTolerance": 1.5
}
```

| Field | Type | Description |
|-------|------|-------------|
| `paddingPx` | number | Действующий отступ в px из `WordVectorization:PaddingPx` |
| `approximationTolerance` | number | Действующая погрешность из `WordVectorization:ApproximationTolerance` |

Инварианты:

- Значения MUST совпадать с теми, что использует сервер при vectorize **без** body override.
- Клиент MUST использовать ответ для предзаполнения **обоих** независимых наборов полей (single и batch) при открытии скана.

## Error responses

| Status | Когда | Пример тела |
|--------|-------|-------------|
| 503 | Секция `WordVectorization` отсутствует, null, или `PaddingPx < 0`, или `ApproximationTolerance <= 0` | `Не задана или невалидна конфигурация WordVectorization: PaddingPx ≥ 0, ApproximationTolerance > 0.` |

## Client behavior (FR-015)

При **503** (или сетевой ошибке GET):

- Не показывать поля отступа/погрешности и кнопки «Векторизовать» / «Векторизовать все слова».
- Показать понятный текст ошибки на месте соответствующего блока UI.

## Related

- Overrides на POST: [vectorize-word-run-params.md](./vectorize-word-run-params.md), [vectorize-batch-run-params.md](./vectorize-batch-run-params.md)
- Базовый контракт одиночной векторизации: [001 vectorize-word](../../001-word-stroke-vector/contracts/vectorize-word.md)

## Out of scope

- Изменение конфигурации через API.
- Кэширование defaults на сервере per-user/per-scan.
