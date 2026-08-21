# Tasks: Параметры запуска векторизации слов

**Input**: Design documents from `/specs/011-vectorize-run-params/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Не запрошены в spec — автотесты не включаются; приёмка по [quickstart.md](./quickstart.md)

**Organization**: Задачи сгруппированы по user stories для независимой проверки каждого инкремента.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Можно выполнять параллельно (разные файлы, нет зависимости от незавершённых задач)
- **[Story]**: User story (US1–US4)
- В описании — точные пути к файлам

## Path Conventions

- Backend: `handwritingOCR.Server/`
- Клиент: `handwritingocr.client/src/` (Vite React)
- Без изменений `liquibase/changelog.sql`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Подтвердить brownfield-зависимости перед расширением API и UI

- [X] T001 Confirm prerequisites: `WordVectorizationService`, `WordVectorizationOptions`, `POST …/vectorize`, `POST …/vectorize-batch`, `vectorizeWord`/`vectorizeBatch`/`handleVectorizeClick`/`handleBatchVectorizeClick` in `handwritingOCR.Server/Services/WordVectorizationService.cs`, `handwritingOCR.Server/Options/WordVectorizationOptions.cs`, `handwritingOCR.Server/Controllers/ScansController.cs`, `handwritingocr.client/src/App.tsx` per `specs/011-vectorize-run-params/plan.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: DTO, разрешение effective params, GET defaults, расширение POST — блокирует все user stories

**⚠️ CRITICAL**: User story phases не начинать, пока фаза не завершена

- [X] T002 [P] Create `VectorizationRunParamsDto` with nullable `float? PaddingPx` and `float? ApproximationTolerance` in `handwritingOCR.Server/Models/VectorizationRunParamsDto.cs`
- [X] T003 Add `ValidateAndResolveRunParams(VectorizationRunParamsDto?)` returning `(float paddingPx, float approximationTolerance)` with combined RU `ArgumentException` for multiple invalid fields in `handwritingOCR.Server/Services/WordVectorizationService.cs`
- [X] T004 Refactor `VectorizeWordCoreAsync` to accept `float paddingPx, float approximationTolerance` instead of reading `_options` directly in `handwritingOCR.Server/Services/WordVectorizationService.cs`
- [X] T005 Update `VectorizeAsync(int scanId, int wordId, VectorizationRunParamsDto? runParams = null)` to resolve params via `ValidateAndResolveRunParams` and pass to core in `handwritingOCR.Server/Services/WordVectorizationService.cs`
- [X] T006 Add `GET /api/Scans/vectorization-defaults` returning JSON `{ paddingPx, approximationTolerance }` or 503 plain text via `EnsureOptionsValid` in `handwritingOCR.Server/Controllers/ScansController.cs`
- [X] T007 Extend `POST …/words/{wordId}/vectorize` with optional `[FromBody] VectorizationRunParamsDto? body` passed to `VectorizeAsync` in `handwritingOCR.Server/Controllers/ScansController.cs`
- [X] T008 Update `VectorizeBatchAsync(int scanId, VectorizationRunParamsDto? runParams = null)` to resolve once and pass same pair to each `VectorizeWordCoreAsync` call in `handwritingOCR.Server/Services/WordVectorizationService.cs`
- [X] T009 Extend `POST …/vectorize-batch` with optional `[FromBody] VectorizationRunParamsDto? body` passed to `VectorizeBatchAsync` in `handwritingOCR.Server/Controllers/ScansController.cs`

**Checkpoint**: Swagger/curl — GET defaults 200; POST vectorize/batch с body и без body; 400 при невалидных params; без body поведение как до фичи

---

## Phase 3: User Story 1 — Параметры перед векторизацией одного слова (Priority: P1) 🎯 MVP

**Goal**: Оператор видит и редактирует отступ/погрешность рядом с «Векторизовать»; запуск использует указанные значения

**Independent Test**: Открыть невекторизованное слово → поля предзаполнены defaults → изменить значения → «Векторизовать» → результат отличается от векторизации с defaults (quickstart §2–3)

### Implementation for User Story 1

- [X] T010 [US1] Add `fetchVectorizationDefaults(): Promise<{ paddingPx: number; approximationTolerance: number }>` with plain-text error handling in `handwritingocr.client/src/App.tsx` per `contracts/vectorization-defaults-api.md`
- [X] T011 [US1] Add `singleRunParams` state (`paddingPx`/`approximationTolerance` as strings) and populate from GET defaults when scan opens in `handwritingocr.client/src/App.tsx`
- [X] T012 [US1] Render labeled number inputs (RU: «Отступ, px», «Погрешность, px») in `.editor-actions` before «Векторизовать» button in `handwritingocr.client/src/App.tsx` per `contracts/vectorize-run-params-ui.md`
- [X] T013 [US1] Update `vectorizeWord(scanId, wordId, params)` to `POST` with `Content-Type: application/json` body in `handwritingocr.client/src/App.tsx`
- [X] T014 [US1] Parse `singleRunParams` to numbers and pass to `vectorizeWord` from `handleVectorizeClick` in `handwritingocr.client/src/App.tsx`
- [X] T015 [US1] On defaults fetch failure show `<p className="vectorize-defaults-error">` instead of single fields and «Векторизовать» button in `handwritingocr.client/src/App.tsx` (FR-015)

**Checkpoint**: MVP — одиночная векторизация с настраиваемыми параметрами через UI

---

## Phase 4: User Story 2 — Параметры перед пакетной векторизацией (Priority: P2)

**Goal**: Независимый второй набор полей рядом с «Векторизовать все слова»; те же params применяются ко всем словам batch-run

**Independent Test**: Изменить batch-поля (не трогая single) → «Векторизовать все слова» → все обработанные слова векторизованы с batch params (quickstart §5, §9)

### Implementation for User Story 2

- [X] T016 [US2] Add independent `batchRunParams` state initialized from same GET defaults (not synced with `singleRunParams`) in `handwritingocr.client/src/App.tsx`
- [X] T017 [US2] Render separate labeled inputs in `.layout-toolbar` before «Векторизовать все слова» in `handwritingocr.client/src/App.tsx`
- [X] T018 [US2] Update `vectorizeBatch(scanId, params)` to POST JSON body in `handwritingocr.client/src/App.tsx`
- [X] T019 [US2] Parse `batchRunParams` and pass to `vectorizeBatch` from `handleBatchVectorizeClick` in `handwritingocr.client/src/App.tsx`
- [X] T020 [US2] On defaults fetch failure show error text instead of batch fields and «Векторизовать все слова» in `.layout-toolbar` in `handwritingocr.client/src/App.tsx` (FR-015)

**Checkpoint**: Оба набора полей работают независимо; batch API получает override params

---

## Phase 5: User Story 3 — Отклонение недопустимых значений (Priority: P2)

**Goal**: Клиент и сервер отклоняют невалидный ввод без изменения `curve_points`; одно сообщение при нескольких ошибках

**Independent Test**: Ввести отступ `-1` и погрешность `0` → операция не запускается, одно сообщение с обеими причинами; слово без изменений (quickstart §6–8)

### Implementation for User Story 3

- [X] T021 [US3] Add `validateRunParams(paddingStr, toleranceStr): string | null` returning combined RU message for all violations in `handwritingocr.client/src/App.tsx`
- [X] T022 [US3] Call `validateRunParams` in `handleVectorizeClick` before fetch; on failure set `vectorizeStatus` and return without POST in `handwritingocr.client/src/App.tsx`
- [X] T023 [US3] Call `validateRunParams` in `handleBatchVectorizeClick` before fetch; on failure set `vectorizeStatus` and return without POST in `handwritingocr.client/src/App.tsx`
- [X] T024 [US3] Ensure empty/non-numeric input is rejected client-side with same rules as spec edge cases in `validateRunParams` in `handwritingocr.client/src/App.tsx`

**Checkpoint**: 100% локальных invalid attempts не отправляют HTTP; серверная 400 дублирует правила для API-only вызовов

---

## Phase 6: User Story 4 — Параметры не сохраняются между запусками (Priority: P3)

**Goal**: После операции или смены скана поля снова показывают server defaults, не последний ввод оператора

**Independent Test**: Ввести нестандартные значения → сменить скан → поля снова defaults; после успешной vectorize — defaults при следующем показе (quickstart §10)

### Implementation for User Story 4

- [X] T025 [US4] On `scanId` change refetch defaults and reset both `singleRunParams` and `batchRunParams` in `handwritingocr.client/src/App.tsx`
- [X] T026 [US4] After successful single or batch vectorize reset both param states to last loaded server defaults in `handwritingocr.client/src/App.tsx`

**Checkpoint**: FR-012 — нет persist в localStorage/state между сессиями скана

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Стили и полная ручная приёмка

- [X] T027 [P] Add CSS for `.vectorize-run-params` inputs/labels and `.vectorize-defaults-error` in `handwritingocr.client/src/App.css`
- [X] T028 Run all scenarios in `specs/011-vectorize-run-params/quickstart.md` and fix regressions in touched files

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Без зависимостей
- **Foundational (Phase 2)**: После Setup — **блокирует** все user stories
- **US1 (Phase 3)**: После Foundational — MVP
- **US2 (Phase 4)**: После Foundational; UI параллельно с US1 возможен после T010–T011 (общий fetch defaults)
- **US3 (Phase 5)**: После US1/US2 handlers существуют (T014, T019)
- **US4 (Phase 6)**: После US1/US2 state существует
- **Polish (Phase 7)**: После желаемых user stories

### User Story Dependencies

| Story | Depends on | Independent test |
|-------|------------|------------------|
| US1 (P1) | Phase 2 | Single fields + POST body + defaults |
| US2 (P2) | Phase 2; логически после T010–T011 | Batch fields independent of single |
| US3 (P2) | US1 + US2 handlers | Invalid input blocked locally |
| US4 (P3) | US1 + US2 state | Reset on scan switch / after success |

### Parallel Opportunities

- **Phase 2**: T002 [P] параллельно с чтением T003–T005 (разные секции одного файла — лучше последовательно T002 → T003)
- **Phase 3 + 4**: После T011 — T012–T015 [US1] и T016–T017 [US2] частично параллельны (разные секции UI)
- **Phase 7**: T027 [P] параллельно с финальной проверкой

### Parallel Example: After Foundational

```text
Developer A: T010 → T011 → T012 → T013 → T014 → T015 (US1 MVP)
Developer B: T016 → T017 → T018 → T019 → T020 (US2, after T010–T011 shared fetch)
Developer C: T003–T009 (Foundational backend) before either UI track
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup (T001)
2. Phase 2: Foundational (T002–T009) — минимум T002–T007 для single API
3. Phase 3: US1 (T010–T015)
4. **STOP and VALIDATE**: quickstart §1–3
5. Demo одиночной векторизации с params

### Incremental Delivery

1. Setup + Foundational → API готов
2. US1 → MVP в UI
3. US2 → batch params
4. US3 → validation hardening
5. US4 → reset behavior
6. Polish → quickstart полностью

### Suggested MVP Scope

**User Story 1 only** (Phases 1–3): backend GET defaults + POST vectorize body + single UI block. Batch можно временно работать без UI fields (defaults via empty body) до US2.

---

## Notes

- Не добавлять Liquibase changeset — вне scope (FR-014)
- Plain-text ошибки RU — конституция III
- Batch per-word error swallowing не менять (003 behavior)
- `[P]` = разные файлы; правки одного `App.tsx` лучше последовательно внутри story
- Commit после каждой phase checkpoint
