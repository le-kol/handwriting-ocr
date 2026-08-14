# Contract: POST batch vectorize scan words

**Feature**: `003-batch-vectorize-scan`  
**Date**: 2026-08-12

## Endpoint

```http
POST /api/Scans/{id}/vectorize-batch
```

| Parameter | In | Type | Description |
|-----------|----|------|-------------|
| `id` | path | int | Id скана |

**Body**: none (отступ и погрешность — из `WordVectorization` в конфигурации сервера).

**Content-Type ответа (успех)**: `application/json`  
**Content-Type ответа (ошибка top-level)**: `text/plain` (строка на русском), без ProblemDetails.

## Success

**200 OK** — тело: JSON-массив всех слов скана после завершения batch (тот же контракт элементов, что у `GET /api/Scans/{id}/words`).

```json
[
  {
    "id": 42,
    "scanId": 7,
    "text": "пример",
    "x1": 10.0,
    "y1": 20.0,
    "x2": 110.0,
    "y2": 18.0,
    "x3": 112.0,
    "y3": 60.0,
    "x4": 12.0,
    "y4": 62.0,
    "orderIndex": 0,
    "lineIndex": 0,
    "curvePoints": [
      [
        [1.0, 2.0],
        [3.5, 2.2],
        [6.0, 8.0],
        [9.0, 8.1]
      ]
    ]
  },
  {
    "id": 43,
    "scanId": 7,
    "text": "слово",
    "x1": 120.0,
    "y1": 20.0,
    "x2": 180.0,
    "y2": 20.0,
    "x3": 180.0,
    "y3": 50.0,
    "x4": 120.0,
    "y4": 50.0,
    "orderIndex": 1,
    "lineIndex": 0,
    "curvePoints": null
  }
]
```

Инварианты ответа при 200:

- массив содержит **все** слова скана (не только обработанные);
- порядок элементов — как у `GET …/words` (обычно `order_index`);
- слова с уже существующим вектором до вызова сохраняют `curvePoints` без повторной обработки;
- слова, успешно векторизованные в этом batch, имеют непустой `curvePoints` (формат N×4×2 — см. `001-word-stroke-vector`);
- слова без вектора (неудача batch, не обрабатывались, или были null до вызова) имеют `curvePoints: null`;
- в ответе **нет** полей с причинами неудачи по отдельным словам.

Пустой скан: `200 OK` + `[]`.

## Error responses (top-level only)

| Status | Когда | Пример тела |
|--------|-------|-------------|
| 404 | Скан не найден в БД | `Не найдена запись в БД` |
| 503 | Не задана или невалидна конфигурация `WordVectorization` | русский текст из сервиса |

Per-word ошибки (файл на диске, рамка, штрихи и т.д.) **не** возвращаются как HTTP-ошибки batch. Запрос остаётся **200**; у затронутых слов `curvePoints` остаётся `null`. Диагностика — через:

```http
POST /api/Scans/{id}/words/{wordId}/vectorize
```

(контракт: `specs/001-word-stroke-vector/contracts/vectorize-word.md`).

## Related read contract (совместимость)

`GET /api/Scans/{id}/words` — эталон формата элементов массива ответа batch. Клиент MAY использовать один и тот же парсер JSON для обоих endpoint'ов.

## Out of scope

- Тело запроса с фильтром слов или параметрами векторизации.
- Возврат статистики (число успехов/неудач).
- UI-кнопка «Векторизовать все».
- Параллельная обработка слов.
- Повторная векторизация слов с уже заполненным `curve_points` через batch.
