# Data Model: Пакетная векторизация слов скана

**Feature**: `003-batch-vectorize-scan`  
**Date**: 2026-08-12

Изменений схемы БД нет. Используются сущности и поля из `001-word-stroke-vector`.

## Entities

### Scan (существующая)

| Field | Type | Notes |
|-------|------|-------|
| Id | int | PK |
| Path | text | Абсолютный путь к PNG/JPEG на диске |

**Changes in this feature**: Нет.

---

### Word (существующая)

| Field | Type | Notes |
|-------|------|-------|
| Id | int | PK |
| ScanId | int | FK → scans |
| Text | string | Текст слова |
| X1..Y4 | float × 8 | Вершины рамки |
| OrderIndex | int | Плотный порядок чтения |
| LineIndex | int | Номер строки |
| CurvePoints | float[,,]? / PG `real[]` | Nullable — векторное представление |

**Changes in this feature**: Нет новых колонок. Batch читает/обновляет только строки с `curve_points IS NULL`.

#### Критерий отбора для batch

```text
WHERE scan_id = :scanId AND curve_points IS NULL
ORDER BY order_index
```

Слова с `curve_points IS NOT NULL` **исключаются** из обработки (FR-006).

#### State transitions (batch context)

```text
[CurvePoints = NULL]  --(успех в batch)---------------->  [CurvePoints = N×4×2]
[CurvePoints = NULL]  --(неудача в batch)------------->  [CurvePoints = NULL]  (без изменения)
[CurvePoints = ...]   --(batch, слово уже векториз.)-->  без перехода (не обрабатывается)
```

Повторная одиночная векторизация по-прежнему **может** заменить существующий вектор (контракт 001); batch этого не делает.

---

### WordVectorizationOptions (конфигурация, не таблица)

Без изменений: `PaddingPx`, `ApproximationTolerance`. Невалидная конфигурация блокирует весь batch до обработки слов.

---

## Schema change (Liquibase)

**Нет.** FR-014.

## API model mapping

**Успешный ответ batch** — JSON-массив элементов `Word` (camelCase), идентичный `GET /api/Scans/{id}/words`:

```json
[
  {
    "id": 1,
    "scanId": 7,
    "text": "слово",
    "x1": 0, "y1": 0, "x2": 10, "y2": 0, "x3": 10, "y3": 5, "x4": 0, "y4": 5,
    "orderIndex": 0,
    "lineIndex": 0,
    "curvePoints": [ [ [0,0], [1,0], [1,1], [0,1] ] ]
  },
  {
    "id": 2,
    "scanId": 7,
    "text": "другое",
    "x1": 12, "y1": 0, "x2": 22, "y2": 0, "x3": 22, "y3": 5, "x4": 12, "y4": 5,
    "orderIndex": 1,
    "lineIndex": 0,
    "curvePoints": null
  }
]
```

- Элементы с успешной batch-векторизацией: `curvePoints` — непустой массив (контракт 001).
- Элементы без вектора (до batch, после неудачи, или не обрабатывались): `curvePoints: null`.
- Новые поля в элементе **не** вводятся (нет `error`, `vectorizeStatus` и т.п.).
