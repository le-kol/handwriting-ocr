# Contract: POST vectorize word (with run params)

**Feature**: `011-vectorize-run-params`  
**Date**: 2026-08-20  
**Extends**: [001 vectorize-word](../../001-word-stroke-vector/contracts/vectorize-word.md)

## Endpoint

```http
POST /api/Scans/{id}/words/{wordId}/vectorize
```

| Parameter | In | Type | Description |
|-----------|----|------|-------------|
| `id` | path | int | Id скана |
| `wordId` | path | int | Id слова |

## Request body (NEW — optional)

**Content-Type**: `application/json`

```json
{
  "paddingPx": 4,
  "approximationTolerance": 1.5
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `paddingPx` | number | optional | Отступ в px; если omitted — из конфигурации |
| `approximationTolerance` | number | optional | Погрешность аппроксимации; если omitted — из конфигурации |

**Backward compatibility**: Пустое тело или отсутствие `Content-Type` → поведение идентично pre-011 (только конфигурация).

**FR-005**: Body с числами, равными текущим defaults сервера, MUST давать тот же `curvePoints`, что и запрос без body.

## Success

Без изменений относительно 001: **200 OK** + объект `Word` с заполненным `curvePoints`.

## Error responses (additions)

| Status | Когда | Пример тела |
|--------|-------|-------------|
| 400 | `paddingPx` указан и < 0 | `Отступ не может быть отрицательным.` (или объединённое сообщение) |
| 400 | `approximationTolerance` указан и ≤ 0 или не число | `Допустимая погрешность должна быть больше 0.` |
| 400 | Оба поля невалидны | Одно сообщение с **обеими** причинами (FR-008) |

Остальные статусы (404, 503) — без изменений относительно [001](../../001-word-stroke-vector/contracts/vectorize-word.md).

При **400** из-за run params `curve_points` в БД MUST NOT изменяться.

## Out of scope (removed from 001 out-of-scope)

- ~~Query/body параметры отступа и tolerance~~ — **in scope** данной фичи.
