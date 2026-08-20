# Data Model: Параметры запуска векторизации слов

**Feature**: `011-vectorize-run-params`  
**Date**: 2026-08-20

Изменений схемы БД нет. Новые сущности существуют только на уровне HTTP-запроса и клиентского UI-state.

## Entities

### Scan, Word (существующие)

Без изменений. `Word.CurvePoints` по-прежнему единственный persist-результат векторизации. Параметры отступа/погрешности **не** сохраняются в записи слова.

---

### WordVectorizationOptions (конфигурация сервера, не таблица)

| Field | Type | Default (appsettings) | Notes |
|-------|------|----------------------|-------|
| PaddingPx | float? | 4 | Отступ в px вокруг рамки при вырезке |
| ApproximationTolerance | float? | 1.5 | Допустимое отклонение аппроксимации кривых, px |

**Changes in this feature**: Нет новых ключей конфигурации. Значения становятся **читаемыми клиентом** через `GET /api/Scans/vectorization-defaults`.

Валидация конфигурации (без изменений):

```text
PaddingPx ≥ 0 AND ApproximationTolerance > 0 AND оба not null
```

Иначе → 503 при vectorize / defaults GET.

---

### VectorizationRunParams (transient — тело POST-запроса)

Не персистится. Существует только в рамках одного HTTP-запроса на векторизацию.

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| paddingPx | number (float) | optional | Если указано: ≥ 0 |
| approximationTolerance | number (float) | optional | Если указано: > 0 |

**Resolution rules**:

```text
effectivePaddingPx       = body.paddingPx       ?? config.PaddingPx
effectiveTolerance     = body.approximationTolerance ?? config.ApproximationTolerance
```

Если любой effective value не может быть получен (поле omitted и config null/invalid) → 503 до начала CV.

**Lifecycle**: Создаётся при десериализации body → используется в `VectorizeWordCoreAsync` → уничтожается после ответа. Не записывается в БД, localStorage, session.

---

### VectorizationDefaults (read model — ответ GET)

| Field | Type | Source |
|-------|------|--------|
| paddingPx | number | `WordVectorizationOptions.PaddingPx` |
| approximationTolerance | number | `WordVectorizationOptions.ApproximationTolerance` |

Только для предзаполнения UI. Не кэшируется как постоянное свойство скана/слова.

---

### Client UI state (React, не API entity)

Два **независимых** набора controlled fields:

| State key | Scope | Reset trigger |
|-----------|-------|---------------|
| `singleRunParams` | Кнопка «Векторизовать» | Смена `scanId`, успешная загрузка defaults, повторное открытие слова после операции (FR-012) |
| `batchRunParams` | Кнопка «Векторизовать все слова» | Смена `scanId`, успешная загрузка defaults |

| Field | Type in UI | Notes |
|-------|------------|-------|
| paddingPx | string (controlled input) | Парсится в number перед валидацией |
| approximationTolerance | string | Парсится в number перед валидацией |

**Error state** (`defaultsLoadError: string | null`): при неудаче GET defaults — вместо полей и кнопки показывается текст ошибки (FR-015).

---

## State transitions (Word.CurvePoints — без изменений)

Параметры запуска **не** участвуют в lifecycle слова:

```text
[curve_points NULL] --(vectorize success)--> [curve_points N×4×2]
[curve_points ...]  --(invalid run params rejected)--> [без изменений]
```

Повторная векторизация с другими run params заменяет `curve_points` как и сегодня (контракт 001).

---

## Schema change (Liquibase)

**Нет.** FR-014, конституция V.

## API ↔ UI mapping

| UI action | API | Persisted? |
|-----------|-----|------------|
| Открытие скана | `GET /api/Scans/vectorization-defaults` | Нет |
| «Векторизовать» | `POST …/words/{wordId}/vectorize` + body | Только `curve_points` слова |
| «Векторизовать все слова» | `POST …/vectorize-batch` + body | Только `curve_points` обработанных слов |
| Локальная валидация | — | Нет HTTP-запроса |
