# Tasks: Глобальная таблица слов и экспорт датасета

**Input**: Design documents from `/specs/012-global-words-table/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Не запрошены в spec — автотесты не включаются; приёмка по [quickstart.md](./quickstart.md)

**Organization**: Задачи сгруппированы по user stories для независимой проверки каждого инкремента.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Можно выполнять параллельно (разные файлы, нет зависимости от незавершённых задач)
- **[Story]**: User story (US1–US4); foundational/backend — без метки story
- В описании — точные пути к файлам

## Path Conventions

Монолит: `handwritingOCR.Server/`, `handwritingocr.client/src/`; миграций Liquibase для этой фичи нет

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Убедиться, что brownfield-зависимости на месте

- [X] T001 Verify prerequisites: `ScanList:PageSize` (30) in `handwritingOCR.Server/appsettings.json`, existing `GET /api/Scans/{id}/words` returns full `Word` with `curvePoints`, `handwritingocr.client/src/curvePoints.ts` exports `isWordVectorized` and `filterValidCurves`, `WordCurveThumbnail.tsx` renders valid curves

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Read-only API `GET /api/Words` — блокирует таблицу, экспорт и все user stories на клиенте

**⚠️ CRITICAL**: User story phases не начинать, пока фаза не завершена

- [X] T002 [P] Add `WordListPage` model (`Items`, `TotalCount`) in `handwritingOCR.Server/Models/WordListPage.cs` per `specs/012-global-words-table/data-model.md`
- [X] T003 Implement `GetWordsPageAsync(int page, int pageSize, string? search, string vectorizedFilter, int? scanId)` in `handwritingOCR.Server/Services/WordDbService.cs`: dynamic WHERE (`ILIKE` with escaped `%`/`_`/`\`, `curve_points IS NULL/NOT NULL`, optional `scan_id`); `COUNT(*)` + `SELECT … ORDER BY scan_id ASC, order_index ASC LIMIT/OFFSET`; reuse `ReadWord`
- [X] T004 Add `WordsController` with `GET /api/Words` in `handwritingOCR.Server/Controllers/WordsController.cs` per `specs/012-global-words-table/contracts/words-list-api.md`: inject `WordDbService`, `IOptions<ScanListOptions>`; validate `page >= 1`, `vectorized` in `all`/`true`/`false`; `PageSize <= 0` → 503; return `200` JSON `{ items, totalCount }`; plain-text RU errors

**Checkpoint**: `curl GET /api/Words?page=1` returns paginated words; filters and `page=0` → 400 work per quickstart §1

---

## Phase 3: User Story 1 — Просмотр и поиск слов по всем сканам (Priority: P1) 🎯 MVP

**Goal**: Экран «Слова» с таблицей, поиском, фильтрами (статус, скан), пагинацией и миниатюрами; навигация «Сканы» / «Слова», по умолчанию «Сканы»

**Independent Test**: quickstart §2 — открыть «Слова», применить поиск/фильтры, переключить страницу; миниатюры только у векторизованных

### Implementation for User Story 1

- [X] T005 [P] [US1] Add client fetch helper `fetchWordsPage(params)` and types in `handwritingocr.client/src/wordsApi.ts` calling `GET /api/Words` with `page`, `search`, `vectorized`, `scanId`; `readError` on `!ok`; constant `WORDS_PAGE_SIZE = 30`
- [X] T006 [P] [US1] Create `WordsTableScreen.tsx` in `handwritingocr.client/src/WordsTableScreen.tsx`: props for filters state, `fetchWordsPage`, columns (text, scanId, status via `isWordVectorized`, `WordCurveThumbnail`), pagination controls, empty state; debounced search ~300 ms; scan filter select (load ids from existing `GET /api/Scans`)
- [X] T007 [US1] Add `appView: 'scans' | 'words'` state and nav buttons «Сканы» / «Слова» in `handwritingocr.client/src/App.tsx`: default `'scans'`; render `WordsTableScreen` when `'words'`; hide scans table/editor layout appropriately per `specs/012-global-words-table/contracts/words-table-ui.md`
- [X] T008 [US1] Wire `WordsTableScreen` data loading in `handwritingocr.client/src/App.tsx` or within component: reset `page` to 1 on filter/search change; display loading/error states in RU
- [X] T009 [P] [US1] Add styles for app nav and words table in `handwritingocr.client/src/App.css` (`.app-nav`, `.words-table`, pagination, filter row)

**Checkpoint**: MVP — глобальная таблица с фильтрами и пагинацией без экспорта и без перехода в редактор

---

## Phase 4: User Story 2 — Переход к редактированию слова (Priority: P1)

**Goal**: Клик по строке → экран «Сканы», редактор скана, слово выбрано

**Independent Test**: quickstart §3 — клик строки → панель редактирования слова; «Слова» снова открывает таблицу

### Implementation for User Story 2

- [X] T010 [US2] Implement `openWordFromTable(scanId, wordId)` in `handwritingocr.client/src/App.tsx`: `setAppView('scans')`; reuse `handleScanRowClick(scanId)` pattern; after `fetchWords` resolve, call `selectWord` for `wordId` with generation guard (`editorGenerationRef` / `scanIdRef`)
- [X] T011 [US2] Pass `onRowClick(word)` from `App.tsx` to `WordsTableScreen` in `handwritingocr.client/src/WordsTableScreen.tsx`: row `onClick` invokes callback with full word; show error if scan/words load fails

**Checkpoint**: US1 + US2 — полный обзор и навигация в редактор

---

## Phase 5: User Story 3 — Экспорт полного датасета (Priority: P2)

**Goal**: «Экспортировать всё» → `words-dataset-all.jsonl` со всеми векторизованными словами; сообщение с количеством

**Independent Test**: quickstart §4 — файл с полями `wordId`, `scanId`, `lineIndex`, `text`, `curves`; игнорирует UI-фильтры

### Implementation for User Story 3

- [X] T012 [P] [US3] Create `exportWordsDataset.ts` in `handwritingocr.client/src/exportWordsDataset.ts`: `fetchAllWordsPages(query)` loop; `wordToDatasetLine(word)` → `{ wordId, scanId, lineIndex, text, curves: filterValidCurves(...) }`; skip empty curves; `downloadJsonl(filename, lines)` via Blob + temporary `<a download>`
- [X] T013 [US3] Add «Экспортировать всё» button in `handwritingocr.client/src/WordsTableScreen.tsx`: fetch all pages without search/scanId filters; filename `words-dataset-all.jsonl`; show `Экспортировано слов: N`; disable only this button during export; on fetch error show `Ошибка экспорта: …` without partial download as success

**Checkpoint**: Полный JSONL-экспорт работает независимо от фильтров таблицы

---

## Phase 6: User Story 4 — Экспорт отфильтрованного датасета (Priority: P2)

**Goal**: «Экспортировать отфильтрованное» → `words-dataset-filtered.jsonl` по snapshot фильтров; кнопка disabled при пустом наборе или фильтре «не векторизовано»

**Independent Test**: quickstart §5 — filtered file matches filters; disabled when `vectorized=false` or `totalCount===0`

### Implementation for User Story 4

- [X] T014 [US4] Extend `exportWordsDataset.ts` in `handwritingocr.client/src/exportWordsDataset.ts`: `exportFiltered(snapshot)` uses frozen `search`/`vectorized`/`scanId` from click moment; same line format and skip rules as «всё»
- [X] T015 [US4] Add «Экспортировать отфильтрованное» in `handwritingocr.client/src/WordsTableScreen.tsx`: disabled when `totalCount === 0` OR `vectorizedFilter === 'false'` (or label «Нет слов для экспорта»); filename `words-dataset-filtered.jsonl`; independent button loading state per `specs/012-global-words-table/contracts/dataset-export.md`

**Checkpoint**: Оба вида экспорта; таблица остаётся интерактивной во время экспорта

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Сквозная проверка и регрессия

- [X] T016 [P] Run all scenarios in `specs/012-global-words-table/quickstart.md` and fix gaps against contracts in `specs/012-global-words-table/contracts/`
- [X] T017 [P] Add brief «почему» comments in `handwritingOCR.Server/Services/WordDbService.cs` for LIKE escaping and fixed sort order (`scan_id`, `order_index`)
- [X] T018 Confirm no regression: existing `GET /api/Scans/{id}/words`, word CRUD, vectorize single/batch unchanged; scans table and editor on «Сканы» screen work as before

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: без зависимостей
- **Foundational (Phase 2)**: после Setup — **блокирует** все client stories
- **US1 (Phase 3)**: после Foundational — **MVP** (таблица + навигация)
- **US2 (Phase 4)**: после US1 (нужна таблица и `App.tsx` nav)
- **US3 (Phase 5)**: после Foundational; UI-кнопка логично после US1 (можно параллельно с US2)
- **US4 (Phase 6)**: после US3 (расширение export module)
- **Polish (Phase 7)**: после желаемых stories

### User Story Dependencies

| Story | Depends on | Independent test |
|-------|------------|------------------|
| US1 (P1) | Foundational | quickstart §2 |
| US2 (P1) | US1 | quickstart §3 |
| US3 (P2) | Foundational (+ US1 for button placement) | quickstart §4 |
| US4 (P2) | US3 | quickstart §5 |
| Backend (US5 in spec) | Foundational phase | quickstart §1 |

### Within Each User Story

- Models (server) before controller
- `wordsApi.ts` before `WordsTableScreen`
- `exportWordsDataset.ts` before export buttons
- Story checkpoint before next priority

### Parallel Opportunities

- **Phase 2**: T002 ∥ T003 (different files) — T004 after T002+T003
- **Phase 3**: T005 ∥ T006 ∥ T009; then T007 → T008
- **Phase 5–6**: T012 before T013/T014/T015
- **Polish**: T016 ∥ T017

---

## Parallel Example: User Story 1

```bash
# Параллельно после Foundational:
Task T005: wordsApi.ts
Task T006: WordsTableScreen.tsx (skeleton)
Task T009: App.css

# Затем последовательно:
Task T007: App.tsx nav + appView
Task T008: wire data loading
```

---

## Parallel Example: Foundational

```bash
# Параллельно:
Task T002: WordListPage.cs
Task T003: WordDbService.GetWordsPageAsync

# После обоих:
Task T004: WordsController.cs
```

---

## Implementation Strategy

### MVP First (Foundational + User Story 1)

1. Phase 1: Setup
2. Phase 2: Foundational (API)
3. Phase 3: User Story 1 (таблица + навигация экранов)
4. **STOP and VALIDATE**: quickstart §1–2
5. Phase 4: User Story 2 (переход в редактор)

### Incremental Delivery

1. Setup + Foundational → API готов
2. US1 → таблица слов (MVP для обзора)
3. US2 → переход в редактор
4. US3 → экспорт всего
5. US4 → экспорт отфильтрованного
6. Polish → quickstart + регрессия

### Parallel Team Strategy

1. Developer A: Foundational backend (T002–T004)
2. After API ready — Developer B: US1 frontend (T005–T009) while A starts US3 export module (T012)
3. US2/US4 sequential on shared `App.tsx` / `WordsTableScreen.tsx`

---

## Notes

- User Story 5 (spec) «Надёжная загрузка данных» = Phase 2 Foundational; отдельной фазы не требует
- Не менять Liquibase, формат `Word`, мутационные endpoints
- `[P]` только при отсутствии конфликта по одному файлу
- Commit после каждой фазы или логической группы задач

---

## Task Summary

| Phase | Tasks | Story |
|-------|-------|-------|
| Setup | T001 | — |
| Foundational | T002–T004 | backend (US5) |
| US1 | T005–T009 | 5 |
| US2 | T010–T011 | 2 |
| US3 | T012–T013 | 2 |
| US4 | T014–T015 | 2 |
| Polish | T016–T018 | — |
| **Total** | **18 tasks** | |

**MVP scope**: Phase 1 + Phase 2 + Phase 3 (T001–T009) — API и таблица слов с фильтрами.

**Format validation**: All 18 tasks use `- [ ] Tnnn [P?] [USn?] Description with file path`.
