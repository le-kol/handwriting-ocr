# Tasks: Векторизация штрихов слова

**Input**: Design documents from `/specs/001-word-stroke-vector/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Не запрошены в spec — автотесты не включаются; приёмка по [quickstart.md](./quickstart.md)

**Organization**: Задачи сгруппированы по user stories для независимой проверки каждого инкремента.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Можно выполнять параллельно (разные файлы, нет зависимости от незавершённых задач)
- **[Story]**: User story (US1, US2, US3)
- В описании — точные пути к файлам

## Path Conventions

Монолит: `handwritingOCR.Server/`, миграции: `liquibase/changelog.sql`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Зависимости, папки и конфигурация без бизнес-логики векторизации

- [ ] T001 Add NuGet package SixLabors.ImageSharp to `handwritingOCR.Server/handwritingOCR.Server.csproj`
- [ ] T002 [P] Create `handwritingOCR.Server/Options/WordVectorizationOptions.cs` with `PaddingPx` (≥ 0) and `ApproximationTolerance` (> 0)
- [ ] T003 [P] Add `WordVectorization` section with defaults (`PaddingPx`: 4, `ApproximationTolerance`: 1.5) to `handwritingOCR.Server/appsettings.json` and `handwritingOCR.Server/appsettings.Development.json`
- [ ] T004 [P] Create empty stubs `handwritingOCR.Server/Imaging/WordFragmentExtractor.cs` and `handwritingOCR.Server/Imaging/StrokeBezierFitter.cs` (namespaces only / class shells)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Схема БД, модель и SQL-доступ к `curve_points` — блокирует все user stories

**⚠️ CRITICAL**: User story phases не начинать, пока фаза не завершена

- [ ] T005 Add Liquibase changeset to `liquibase/changelog.sql`: `ALTER TABLE words ADD COLUMN curve_points real[]` with `--rollback alter table words drop column curve_points`
- [ ] T006 Add nullable property `float[,,]? CurvePoints` to `handwritingOCR.Server/Models/Word.cs` (JSON camelCase `curvePoints`)
- [ ] T007 Extend `LoadWordsAsync` / `ReadWord` in `handwritingOCR.Server/Services/WordDbService.cs` to SELECT and map `curve_points` into `Word.CurvePoints` (`float[,,]?`, NULL → null)
- [ ] T007b Add `handwritingOCR.Server/Serialization/Float3DJsonConverter.cs` (`JsonConverter<float[,,]>`: `Write` serializes to nested JSON array `[[[x,y],...],...]`; `Read` is not required — the value is written to the DB via an Npgsql parameter, never deserialized from a JSON request body). Register the converter once in `handwritingOCR.Server/Program.cs` via `AddControllers().AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new Float3DJsonConverter()))`. `Word.CurvePoints` stays `float[,,]?` everywhere; the converter transparently covers every action that serializes `Word` with a non-null value (including the existing `GetWords`), not just the future vectorize endpoint — required as soon as T007 makes reading a non-null `curve_points` value possible.
- [ ] T008 Add `GetWordAsync(int scanId, int wordId)` to `handwritingOCR.Server/Services/WordDbService.cs` returning `Word?` (null if missing or wrong scan)
- [ ] T009 Add `UpdateCurvePointsAsync(int scanId, int wordId, float[,,] curvePoints)` to `handwritingOCR.Server/Services/WordDbService.cs`: explicit transaction, single UPDATE of `curve_points` only after non-empty `N×4×2` array; return updated `Word?`; never write empty array
- [ ] T010 Register `IOptions<WordVectorizationOptions>` (or `Configure<WordVectorizationOptions>`) in `handwritingOCR.Server/Program.cs`

**Checkpoint**: Миграция готова; слова читаются с `curvePoints`; UPDATE вектора доступен из сервиса

---

## Phase 3: User Story 1 — Векторизация слова по запросу (Priority: P1) 🎯 MVP

**Goal**: По `POST /api/Scans/{id}/words/{wordId}/vectorize` извлечь выровненный фрагмент, аппроксимировать штрихи кубическими Безье и сохранить `curve_points` у записи Word

**Independent Test**: Скан с валидным словом → vectorize → `200` и непустой `curvePoints` (4 точки на кривую); `GET …/words` возвращает то же представление (см. quickstart §1)

### Implementation for User Story 1

- [ ] T011 [US1] Implement perspective crop with configurable padding and image-bounds clip in `handwritingOCR.Server/Imaging/WordFragmentExtractor.cs` (input: scan bytes + X1..Y4 + `PaddingPx`; output: aligned fragment; before padding: reject degenerate quad — area < 1.0 px² or any edge < 1.0 px — with RU «вырожденная рамка…»; reject empty/near-empty intersection of raw quad with image bounds — intersection area < 1.0 px² — with distinct RU «рамка слова не пересекается с изображением скана»; then apply padding and clip to image bounds without rejecting reduced padding at edges or post-clip fragment size; see research.md §2a)
- [ ] T012 [P] [US1] Implement binarize → Zhang–Suen (or equivalent) skeleton → polyline trace → cubic Bézier fit with `ApproximationTolerance` in `handwritingOCR.Server/Imaging/StrokeBezierFitter.cs`; return `float[,,]` shaped `N×4×2`; throw `ArgumentException` if zero strokes/curves
- [ ] T013 [US1] Implement orchestration in `handwritingOCR.Server/Services/WordVectorizationService.cs`: validate options (invalid → `InvalidOperationException`); load word + scan path; load file via `FileStorageService`; extract → fit → `UpdateCurvePointsAsync`; do not call UPDATE on failure
- [ ] T014 [US1] Register scoped `WordVectorizationService` in `handwritingOCR.Server/Program.cs`
- [ ] T015 [US1] Add `POST {id}/words/{wordId}/vectorize` to `handwritingOCR.Server/Controllers/ScansController.cs` per `specs/001-word-stroke-vector/contracts/vectorize-word.md`: thin controller; `200` + Word JSON; map missing scan/word/file → `404` plain text RU; `ArgumentException` → `400`; `InvalidOperationException` → `503`

**Checkpoint**: Happy-path векторизация работает end-to-end — MVP

---

## Phase 4: User Story 3 — Предсказуемые ошибки без порчи данных (Priority: P1)

**Goal**: Все негативные сценарии возвращают карту ошибок конституции III и не оставляют пустого/частичного `curve_points`

**Independent Test**: quickstart §3–6 — 404 unknown word, 404 missing file, 400 no strokes, 503 bad config; в БД нет пустого массива и нет «полузаписи»

### Implementation for User Story 3

- [ ] T016 [US3] Harden file/decode failures in `handwritingOCR.Server/Services/WordVectorizationService.cs`: missing file → signal for `404` «Не найден файл»; corrupt image → `ArgumentException` with RU message; never UPDATE on these paths
- [ ] T017 [P] [US3] Ensure degenerate-quad, non-intersecting-quad, and zero-stroke outcomes only throw before persist in `handwritingOCR.Server/Imaging/WordFragmentExtractor.cs` and `handwritingOCR.Server/Imaging/StrokeBezierFitter.cs` (distinct RU messages for §2a cases 1–2 and for zero strokes; no post-clip MinFragmentSidePx / empty-after-padding reject; suitable for `400` body)
- [ ] T018 [US3] Verify `UpdateCurvePointsAsync` in `handwritingOCR.Server/Services/WordDbService.cs` rejects empty/invalid rank arrays and commits only a full replace so failed vectorization cannot clear an existing value mid-flight
- [ ] T019 [US3] Align exception→HTTP mapping and RU plain-text messages in `handwritingOCR.Server/Controllers/ScansController.cs` with research error table and constitution principle III

**Checkpoint**: Негативные сценарии стабильны; данные слова не портятся

---

## Phase 5: User Story 2 — Повторная векторизация (Priority: P2)

**Goal**: Повторный успешный вызов заменяет прежнее представление целиком; неуспешный повтор не затирает старое значение

**Independent Test**: quickstart §2 — два успешных vectorize подряд → одно актуальное представление; затем сбой (пустая область/нет файла) → прежний `curvePoints` сохранён

### Implementation for User Story 2

- [ ] T020 [US2] Confirm/adjust `UpdateCurvePointsAsync` in `handwritingOCR.Server/Services/WordDbService.cs` so successful re-vectorize is a single full-column UPDATE (replace), not append or second row
- [ ] T021 [US2] Ensure `WordVectorizationService` in `handwritingOCR.Server/Services/WordVectorizationService.cs` computes the full new `float[,,]` before any DB write so a failed second attempt leaves prior `curve_points` unchanged
- [ ] T022 [US2] Smoke-check via endpoint in `handwritingOCR.Server/Controllers/ScansController.cs` / manual quickstart §2: response always returns the latest full `curvePoints` after success

**Checkpoint**: US1 + US3 + US2 выполняются независимо по критериям quickstart

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Сквозная проверка и мелкая подчистка

- [ ] T023 [P] Run through all scenarios in `specs/001-word-stroke-vector/quickstart.md` and fix gaps against `contracts/vectorize-word.md`
- [ ] T024 [P] Add brief «почему» comments only for non-obvious invariants (3D `curve_points` layout, no partial UPDATE, fragment-relative coords) in touched files under `handwritingOCR.Server/`
- [ ] T025 Confirm `GET /api/Scans/{id}/words` serialization of `curvePoints` (`null` vs `N×4×2`) matches `specs/001-word-stroke-vector/data-model.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: без зависимостей
- **Foundational (Phase 2)**: после Setup — **блокирует** все stories
- **US1 (Phase 3)**: после Foundational — MVP
- **US3 (Phase 4)**: после US1 (нужен endpoint/сервис для карты ошибок)
- **US2 (Phase 5)**: после US1 (повторная векторизация на том же UPDATE); желательно после US3 для проверки «ошибка не затирает»)
- **Polish (Phase 6)**: после выбранных stories

### User Story Dependencies

- **US1 (P1)**: только Foundational
- **US3 (P1)**: опирается на код US1; независимо тестируется негативными вызовами
- **US2 (P2)**: опирается на persist-путь US1; независимо тестируется повторными вызовами

### Within Each User Story

- Imaging/helpers before orchestration service
- Service before controller endpoint
- Persist only after successful full compute

### Parallel Opportunities

- T002, T003, T004 после/параллельно с T001 (разные файлы)
- T011 и T012 после Foundational — разные файлы Imaging
- T017 параллельно с уточнениями сервиса в US3
- T023 и T024 в Polish

---

## Parallel Example: User Story 1

```bash
# После Phase 2 можно параллельно:
Task: "Implement WordFragmentExtractor in handwritingOCR.Server/Imaging/WordFragmentExtractor.cs"
Task: "Implement StrokeBezierFitter in handwritingOCR.Server/Imaging/StrokeBezierFitter.cs"

# Затем последовательно:
Task: "WordVectorizationService orchestration"
Task: "DI registration + ScansController endpoint"
```

---

## Parallel Example: User Story 3

```bash
Task: "Harden extractor/fitter ArgumentException messages in Imaging/"
Task: "Verify UpdateCurvePointsAsync no empty writes in WordDbService.cs"
# Затем: controller HTTP mapping alignment
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup  
2. Phase 2 Foundational  
3. Phase 3 US1  
4. **STOP** — проверить quickstart §1  
5. Demo/проверка

### Incremental Delivery

1. Setup + Foundational  
2. US1 → MVP  
3. US3 → жёсткая карта ошибок  
4. US2 → идемпотентная замена  
5. Polish → полный quickstart

### Parallel Team Strategy

1. Вместе: Setup + Foundational  
2. Dev A: Imaging (T011/T012) + US1 service/endpoint  
3. Dev B (после US1 skeleton): US3 error hardening  
4. US2 — короткий follow-up на persist-семантике  

---

## Notes

- C#-тип `CurvePoints`: только `float[,,]?` (см. data-model.md)
- Отдельная таблица векторов запрещена
- UI клиента и handwriting synthesis — вне scope
- `[P]` = разные файлы без ожидания незавершённых задач
- Коммитить после задачи или логической группы по желанию пользователя
