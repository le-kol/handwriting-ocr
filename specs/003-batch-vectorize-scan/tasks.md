# Tasks: Пакетная векторизация слов скана

**Input**: Design documents from `/specs/003-batch-vectorize-scan/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md; фича `001-word-stroke-vector` реализована

**Tests**: Не запрошены в spec — автотесты не включаются; приёмка по [quickstart.md](./quickstart.md)

**Organization**: Задачи сгруппированы по user stories для независимой проверки каждого инкремента.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Можно выполнять параллельно (разные файлы, нет зависимости от незавершённых задач)
- **[Story]**: User story (US1–US4)
- В описании — точные пути к файлам

## Path Conventions

Монолит: `handwritingOCR.Server/`; миграций для этой фичи нет

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Убедиться, что зависимости от `001-word-stroke-vector` на месте

- [X] T001 Verify prerequisites: column `words.curve_points`, scoped `WordVectorizationService`, and valid `WordVectorization` section in `handwritingOCR.Server/appsettings.json` / `appsettings.Development.json` (single-word `POST …/vectorize` works)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: SQL-выборка невекторизованных слов и общая логика векторизации одного слова — блокирует все user stories

**⚠️ CRITICAL**: User story phases не начинать, пока фаза не завершена

- [X] T002 Add `GetUnvectorizedWordsByScanIdAsync(int scanId)` to `handwritingOCR.Server/Services/WordDbService.cs`: `SELECT … FROM words WHERE scan_id = @scanId AND curve_points IS NULL ORDER BY order_index`; reuse `ReadWord`
- [X] T003 Refactor shared per-word pipeline into private `VectorizeWordCoreAsync(Word word, byte[] fileBytes, int scanId)` in `handwritingOCR.Server/Services/WordVectorizationService.cs` (extract → fit → `UpdateCurvePointsAsync`; throws on failure as today)
- [X] T004 Update public `VectorizeAsync(int scanId, int wordId)` in `handwritingOCR.Server/Services/WordVectorizationService.cs` to load path/word/file and delegate to `VectorizeWordCoreAsync` without changing single-word HTTP behavior

**Checkpoint**: Невекторизованные слова читаются из БД; одиночная векторизация по-прежнему работает после рефакторинга

---

## Phase 3: User Story 1 — Пакетная векторизация всех невекторизованных слов (Priority: P1) 🎯 MVP

**Goal**: По `POST /api/Scans/{id}/vectorize-batch` обработать все слова с `curve_points IS NULL` и вернуть полный список слов скана

**Independent Test**: quickstart §1 — несколько слов без `curvePoints` → batch → `200`, успешные слова с массивом, ответ содержит все слова скана

### Implementation for User Story 1

- [X] T005 [US1] Implement `VectorizeBatchAsync(int scanId)` in `handwritingOCR.Server/Services/WordVectorizationService.cs`: `EnsureOptionsValid()`; `GetScanPathAsync` → throw `ResourceNotFoundException` if null; load file bytes once; if bytes null skip word loop (research §2a); foreach word from `GetUnvectorizedWordsByScanIdAsync` call core inside try/catch for `ArgumentException` and `ResourceNotFoundException` (swallow, continue); return `GetWordsByScanIdAsync(scanId)`
- [X] T006 [US1] Add `POST {id}/vectorize-batch` to `handwritingOCR.Server/Controllers/ScansController.cs` per `specs/003-batch-vectorize-scan/contracts/vectorize-batch.md`: thin controller; `200 OK` + JSON array of `Word` (same as `GetWords`); no request body

**Checkpoint**: Happy-path batch и смешанный результат (quickstart §1–2) — MVP

---

## Phase 4: User Story 2 — Пропуск уже векторизованных слов (Priority: P1)

**Goal**: Batch не перезаписывает и не повторно обрабатывает слова с уже сохранённым `curve_points`

**Independent Test**: quickstart §3–4 — одиночный vectorize → batch → прежний `curvePoints` без изменений; повторный batch на полностью векторизованном скане → `200` без лишней CV-работы

### Implementation for User Story 2

- [X] T007 [US2] Verify SQL in `GetUnvectorizedWordsByScanIdAsync` in `handwritingOCR.Server/Services/WordDbService.cs` strictly filters `curve_points IS NULL` (no in-memory fallback that re-processes vectorized words)
- [X] T008 [US2] Confirm `VectorizeBatchAsync` in `handwritingOCR.Server/Services/WordVectorizationService.cs` iterates only the unvectorized list and never calls `UpdateCurvePointsAsync` for words with existing vectors (manual quickstart §3–4)

**Checkpoint**: Идемпотентность batch по отношению к уже векторизованным словам

---

## Phase 5: User Story 3 — Предсказуемые ошибки уровня запроса (Priority: P1)

**Goal**: 404 для отсутствующего скана и 503 для невалидной конфигурации до обработки слов; plain text RU

**Independent Test**: quickstart §6–7 — несуществующий scan → `404`; битый `WordVectorization` → `503`; слова в БД не меняются

### Implementation for User Story 3

- [X] T009 [US3] Map batch top-level exceptions in `POST {id}/vectorize-batch` action in `handwritingOCR.Server/Controllers/ScansController.cs`: `ResourceNotFoundException` → `404` plain text RU; `InvalidOperationException` → `503` plain text RU (constitution III)
- [X] T010 [US3] Ensure `VectorizeBatchAsync` in `handwritingOCR.Server/Services/WordVectorizationService.cs` calls `EnsureOptionsValid()` and scan-path check before the word loop and never returns `200` with word list when those checks fail

**Checkpoint**: Top-level ошибки отличимы от per-word неудач внутри `200`

---

## Phase 6: User Story 4 — Диагностика через одиночный endpoint (Priority: P2)

**Goal**: После batch слова без вектора диагностируются существующим `POST …/words/{wordId}/vectorize` с текстовой ошибкой; batch-ответ не содержит причин по словам

**Independent Test**: quickstart §2 step 3 — batch `200` с `curvePoints: null` у слова → одиночный vectorize → `400`/`404` с plain-text причиной

### Implementation for User Story 4

- [X] T011 [US4] Verify batch response in `handwritingOCR.Server/Controllers/ScansController.cs` has no per-word error fields; smoke-test that unchanged single-word `POST {id}/words/{wordId}/vectorize` still returns diagnostic errors per `specs/001-word-stroke-vector/contracts/vectorize-word.md` after batch left word unvectorized

**Checkpoint**: Диагностика per-word остаётся на одиночном контракте

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Сквозная проверка и мелкая подчистка

- [X] T012 [P] Run through all scenarios in `specs/003-batch-vectorize-scan/quickstart.md` and fix gaps against `specs/003-batch-vectorize-scan/contracts/vectorize-batch.md`
- [X] T013 [P] Add brief «почему» comments in `handwritingOCR.Server/Services/WordVectorizationService.cs` for single file load per batch and swallowed per-word exceptions (FR-008, FR-012)
- [X] T014 Confirm batch `200` response array matches `GET /api/Scans/{id}/words` element format (`curvePoints` null vs N×4×2) via same `GetWordsByScanIdAsync` path in `handwritingOCR.Server/Services/WordDbService.cs`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: без зависимостей
- **Foundational (Phase 2)**: после Setup — **блокирует** все stories
- **US1 (Phase 3)**: после Foundational — MVP
- **US2 (Phase 4)**: после US1 (нужен batch-путь; проверка фильтра SQL)
- **US3 (Phase 5)**: после US1 (нужен endpoint; может параллельно с US2)
- **US4 (Phase 6)**: после US1 (нужен batch + одиночный endpoint)
- **Polish (Phase 7)**: после US1–US4

### User Story Dependencies

- **US1 (P1)**: только Foundational
- **US2 (P1)**: опирается на US1 + T002 SQL-фильтр; независимо тестируется quickstart §3–4
- **US3 (P1)**: опирается на US1 endpoint; независимо тестируется quickstart §6–7
- **US4 (P2)**: опирается на US1; не требует нового кода, только верификация контракта 001

### Within Each User Story

- Foundational refactor before batch orchestration
- Service before controller endpoint
- Per-word try/catch inside service, not controller

### Parallel Opportunities

- T003 → T004 последовательно в одном файле
- После Phase 2: US2 (T007–T008) и US3 (T009–T010) — разные аспекты, можно параллельно после T006
- T012 и T013 в Polish — разные файлы/задачи

---

## Parallel Example: User Story 1

```bash
# После Phase 2 последовательно (один сервис, затем контроллер):
Task: "Implement VectorizeBatchAsync in handwritingOCR.Server/Services/WordVectorizationService.cs"
Task: "Add POST {id}/vectorize-batch in handwritingOCR.Server/Controllers/ScansController.cs"
```

---

## Parallel Example: After MVP (US2 + US3)

```bash
Task: "Verify GetUnvectorizedWordsByScanIdAsync SQL in WordDbService.cs"        # US2
Task: "Map batch 404/503 in ScansController.cs"                                  # US3
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup  
2. Phase 2 Foundational  
3. Phase 3 US1  
4. **STOP** — проверить quickstart §1–2  
5. Demo/проверка

### Incremental Delivery

1. Setup + Foundational  
2. US1 → MVP (batch happy path + mixed per-word failures)  
3. US2 → идемпотентность по уже векторизованным  
4. US3 → top-level 404/503  
5. US4 → подтверждение диагностики через одиночный endpoint  
6. Polish → полный quickstart

### Parallel Team Strategy

1. Вместе: Setup + Foundational (T001–T004)  
2. Dev A: US1 service + endpoint (T005–T006)  
3. Dev B (после T006): US2 verification + US3 controller mapping (T007–T010)  
4. US4 + Polish — короткий follow-up  

---

## Notes

- Новых Liquibase changeset'ов нет (FR-014)
- UI клиента вне scope (FR-015)
- Per-word ошибки не повышают HTTP-статус batch (остаётся `200`)
- `[P]` = разные файлы без ожидания незавершённых задач
- Коммитить после задачи или логической группы по желанию пользователя
