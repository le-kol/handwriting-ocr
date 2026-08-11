# Data Model: Векторизация штрихов слова

**Feature**: `001-word-stroke-vector`  
**Date**: 2026-08-11

## Entities

### Scan (существующая)

| Field | Type | Notes |
|-------|------|-------|
| Id | int | PK |
| Path | text | Абсолютный путь к PNG/JPEG на диске |

**Relationships**: 1 Scan → N Word (`ON DELETE CASCADE`).

**Changes in this feature**: Нет.

---

### Word (существующая, расширяется)

| Field | Type | Notes |
|-------|------|-------|
| Id | int | PK |
| ScanId | int | FK → scans |
| Text | string | Текст слова |
| X1..Y4 | float × 8 | Вершины рамки (порядок Yandex OCR); возможен повёрнутый четырёхугольник |
| OrderIndex | int | Плотный порядок чтения в скане |
| LineIndex | int | Плотный номер строки |
| **CurvePoints** | **float[,,]? / PG `real[]`** | **NEW, nullable** — векторное представление |

#### CurvePoints — логическая структура

```text
curve_points[curveIndex][pointIndex 0..3][coordIndex 0..1]
  pointIndex: 0=P0, 1=P1, 2=P2, 3=P3 (кубическая Безье)
  coordIndex: 0=x, 1=y
```

- Число кривых `N ≥ 1` после успешной векторизации; `NULL` — ещё не векторизовано.
- Координаты в системе выровненного фрагмента слова (не абсолютные координаты скана).
- Порядок элементов по `curveIndex` **не** означает порядок написания.

#### Validation rules

- Рамка: четыре вершины; не вырождена (площадь ≥ 1 px² и стороны ≥ 1 px) и пересекается с изображением скана (площадь пересечения ≥ 1 px²) до применения отступа — иначе векторизация отклоняется (разные сообщения об ошибке; см. research.md §2a). Клип отступа у края изображения не является ошибкой.
- `CurvePoints`: либо `NULL`, либо массив с `N ≥ 1`, у каждой кривой ровно 4 точки × 2 координаты; пустой массив в БД не хранится.
- Отступ и tolerance — из конфигурации, не из полей Word.

#### State transitions

```text
[CurvePoints = NULL]  --(успешная векторизация)-->  [CurvePoints = N×4×2]
[CurvePoints = ...]   --(успешная повторная)------>  [CurvePoints = N'×4×2]  (полная замена)
[CurvePoints = ...]   --(ошибка векторизации)----->  без изменения
[любое]               --(DELETE word / Replace OCR)-> запись удаляется
```

---

### WordVectorizationOptions (конфигурация, не таблица)

| Field | Type | Constraints | Default (план) |
|-------|------|-------------|----------------|
| PaddingPx | float/int | ≥ 0 | 4 |
| ApproximationTolerance | float | > 0 | 1.5 |

---

## Schema change (Liquibase)

Новый changeset в `liquibase/changelog.sql`:

```sql
--changeset …:5
alter table words add column curve_points real[];
--rollback alter table words drop column curve_points;
```

- Nullable по умолчанию (без `NOT NULL`).
- Отдельные таблицы / FK на векторы **не** создаются.

## API model mapping

JSON (camelCase), расширение существующего `Word`:

```json
{
  "id": 1,
  "scanId": 1,
  "text": "слово",
  "x1": 0, "y1": 0, "x2": 1, "y2": 0, "x3": 1, "y3": 1, "x4": 0, "y4": 1,
  "orderIndex": 0,
  "lineIndex": 0,
  "curvePoints": [ [ [0,0], [1,0], [1,1], [0,1] ] ]
}
```

`curvePoints` отсутствует или `null`, если колонка NULL.
