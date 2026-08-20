# Implementation Plan: Параметры запуска векторизации слов

**Branch**: `011-vectorize-run-params` | **Date**: 2026-08-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-vectorize-run-params/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Дать оператору два независимых набора полей (single / batch) для отступа и погрешности аппроксимации перед запуском векторизации. Клиент загружает defaults через новый `GET /api/Scans/vectorization-defaults`, валидирует ввод локально (объединённое сообщение при нескольких ошибках) и передаёт параметры в optional JSON body существующих `POST …/vectorize` и `POST …/vectorize-batch`. Сервер применяет override только к текущему запросу; схема БД не меняется; поведение без body или с defaults-числами идентично pre-feature.

## Technical Context

**Language/Version**: C# / .NET 8 (`net8.0`); TypeScript / React 19 (Vite)

**Primary Dependencies**: ASP.NET Core 8, Npgsql, существующие `WordVectorizationService`, `WordFragmentExtractor`, `StrokeBezierFitter`, `WordVectorizationOptions`; клиент — `App.tsx`, fetch `/api`

**Storage**: PostgreSQL — без изменений (`words.curve_points` only); конфиг `WordVectorization` в appsettings

**Testing**: Автотестов нет; ручная приёмка — [quickstart.md](./quickstart.md)

**Target Platform**: Windows/Linux host, Kestrel + SPA монолит

**Project Type**: Web application (ASP.NET Core API + React Vite client)

**Performance Goals**: Без изменений CV pipeline; один дополнительный GET defaults на открытие скана; negligible overhead JSON body

**Constraints**: Конституция I–V; без Liquibase; plain-text ошибки RU; параметры не персистятся; два независимых UI state; FR-015 error UI при broken config

**Scale/Scope**: 1 новый GET endpoint; 2 расширенных POST; DTO + validation helper; ~100–150 строк backend; UI fields + validation в `App.tsx` (или маленький компонент)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Статус | Как соблюдается |
|---------|--------|-----------------|
| I. Стек и монолит SPA+API | PASS | Без смены стека; расширение существующих API и `App.tsx` |
| II. Тонкие контроллеры, сервисы, SQL | PASS | Контроллер — маршруты + model binding + HTTP map; разрешение effective params и CV — `WordVectorizationService`; без ORM |
| III. Карта ошибок HTTP | PASS | 400 — невалидные run params; 404/503 — без изменений; клиент `response.text()`; GET defaults → 503 при broken config |
| IV. Целостность домена | PASS | Не меняет order/layout/OCR; run params transient; `curve_points` lifecycle без изменений |
| V. Схема только через Liquibase | PASS | Новых changeset'ов нет |

**Post-design re-check**: PASS — data-model и contracts не вводят схему, ORM или JSON ProblemDetails; endpoint под `/api/Scans/...`.

## Project Structure

### Documentation (this feature)

```text
specs/011-vectorize-run-params/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1
│   ├── vectorization-defaults-api.md
│   ├── vectorize-word-run-params.md
│   ├── vectorize-batch-run-params.md
│   └── vectorize-run-params-ui.md
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
handwritingOCR.Server/
├── Controllers/
│   └── ScansController.cs              # + GET vectorization-defaults; POST body на vectorize/batch
├── Models/ (or Dtos/)
│   └── VectorizationRunParamsDto.cs      # NEW optional body
├── Services/
│   └── WordVectorizationService.cs       # effective params; ValidateRunParams
└── Options/
    └── WordVectorizationOptions.cs       # без изменений полей

handwritingocr.client/src/
├── App.tsx                               # defaults fetch, 2 state, inputs, validation, fetch body
└── (optional) VectorizeRunParamsFields.tsx
```

**Structure Decision**: Минимальное расширение brownfield-монолита по паттерну Controller → Service → Imaging. Клиент остаётся в `App.tsx` с опциональным выделением полей в компонент.

## Complexity Tracking

> Нет нарушений конституции, требующих обоснования.

## Phase 0 Output

См. [research.md](./research.md) — решения по transport (JSON body), GET defaults, validation split, independent UI state, FR-015.

## Phase 1 Output

| Artifact | Path |
|----------|------|
| Data model | [data-model.md](./data-model.md) |
| API defaults | [contracts/vectorization-defaults-api.md](./contracts/vectorization-defaults-api.md) |
| API single | [contracts/vectorize-word-run-params.md](./contracts/vectorize-word-run-params.md) |
| API batch | [contracts/vectorize-batch-run-params.md](./contracts/vectorize-batch-run-params.md) |
| UI contract | [contracts/vectorize-run-params-ui.md](./contracts/vectorize-run-params-ui.md) |
| Validation guide | [quickstart.md](./quickstart.md) |

## Implementation Notes (for /speckit-tasks)

### Backend

1. `VectorizationRunParamsDto` — nullable `float? PaddingPx`, `float? ApproximationTolerance`.
2. `WordVectorizationService.ValidateAndResolveRunParams(dto?)` → `(float padding, float tolerance)`; throws `ArgumentException` with combined RU message.
3. `VectorizeWordCoreAsync(..., float paddingPx, float approximationTolerance)` — use params instead of `_options` directly.
4. `VectorizeAsync` / `VectorizeBatchAsync` — accept optional DTO; batch passes same resolved pair to each word in loop.
5. `ScansController`:
   - `GET vectorization-defaults` → read options, EnsureOptionsValid, return JSON.
   - `VectorizeWord` / `VectorizeBatch` — `[FromBody] VectorizationRunParamsDto? body = null`.
6. If both params provided explicitly and valid, allow vectorize even when config section missing (see quickstart §12); if any param omitted, require valid config.

### Frontend

1. On scan load / `scanId` change: `fetchVectorizationDefaults()`; on success init `singleRunParams` and `batchRunParams`; on failure set `defaultsLoadError`.
2. Render inputs or error per [vectorize-run-params-ui.md](./contracts/vectorize-run-params-ui.md).
3. `validateRunParams(paddingStr, toleranceStr): string | null` — combined errors.
4. Update `vectorizeWord` / `vectorizeBatch` to send JSON body.
5. Reset params to defaults after successful operation or scan switch (FR-012).

### Out of scope (explicit)

- OCR / preprocessing params.
- Persist operator values.
- Liquibase / new DB columns.
- Changing batch per-word error swallowing behavior.
