# Tasks: Панель просмотра всех векторизованных слов скана

**Input**: Design documents from `/specs/010-scan-vectors-panel/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Не запрошены в spec — автотесты не включаются; приёмка по [quickstart.md](./quickstart.md)

**Organization**: Задачи сгруппированы по user stories для независимой проверки каждого инкремента.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Можно выполнять параллельно (разные файлы, нет зависимости от незавершённых задач)
- **[Story]**: User story (US1–US6)
- В описании — точные пути к файлам

## Path Conventions

Клиент: `handwritingocr.client/src/` (Vite React). Backend в этой фиче не меняется.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Подтвердить brownfield-зависимости перед добавлением панели векторов

- [ ] T001 Confirm prerequisites in `handwritingocr.client/src/`: `WordCurveThumbnail.tsx`, `curvePoints.ts` (`isWordVectorized`), `displayLines` / `effectiveLayout`, `handleWordSelect` / `selectWord`, `draft` state in `App.tsx` per `specs/010-scan-vectors-panel/plan.md` and `contracts/scan-vectors-panel-ui.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Каркас компонента и обёртка workspace — блокируют все user stories

**⚠️ CRITICAL**: User story phases не начинать, пока фаза не завершена

- [ ] T002 Create `ScanVectorsPanel.tsx` in `handwritingocr.client/src/` with props type `{ lines: Word[][]; selectedWordId: number | null; onSelectWord: (word: Word) => void }` and empty `<section className="scan-vectors-panel">` shell
- [ ] T003 Add `.workspace-side-main` flex wrapper in `handwritingocr.client/src/App.tsx` around `recognized-text-block` (sibling slot prepared for `ScanVectorsPanel` below text block)
- [ ] T004 Import and render `ScanVectorsPanel` in `handwritingocr.client/src/App.tsx` inside `.workspace-side-main` when `displayLines` is available; pass `lines={displayLines}`, `selectedWordId={draft?.id ?? null}`, `onSelectWord={handleWordSelect}` (or existing select handler)
- [ ] T005 [P] Add base CSS for `.scan-vectors-panel`, `.vector-line`, `.vector-slot` in `handwritingocr.client/src/App.css`

**Checkpoint**: Пустая секция панели векторов видна под текстом; props подключены

---

## Phase 3: User Story 1 — Одновременный обзор всех векторизованных слов (Priority: P1) 🎯 MVP

**Goal**: Зеркало `displayLines` — строки и слоты на каждую позицию; миниатюры для всех векторизованных слов сразу

**Independent Test**: Открыть скан с несколькими векторизованными словами в разных строках → все миниатюры видны в панели в порядке раскладки без поочерёдного выбора (quickstart §2)

### Implementation for User Story 1

- [ ] T006 [US1] Map `lines` prop to `.vector-line` rows with one `.vector-slot` per word index in `handwritingocr.client/src/ScanVectorsPanel.tsx` (no `line-gap-drop`)
- [ ] T007 [US1] Render `WordCurveThumbnail` with `className="word-curve-thumb"` inside slots where `isWordVectorized(word)` in `handwritingocr.client/src/ScanVectorsPanel.tsx`
- [ ] T008 [US1] Add section heading (RU, e.g. «Векторы слов») to `.scan-vectors-panel` in `handwritingocr.client/src/ScanVectorsPanel.tsx`
- [ ] T009 [US1] Ensure `App.tsx` passes current `displayLines` (not stale `words`-only order) as `lines` to `ScanVectorsPanel` in `handwritingocr.client/src/App.tsx`

**Checkpoint**: MVP — одновременный обзор миниатюр векторизованных слов в порядке раскладки

---

## Phase 4: User Story 2 — Миниатюры в собственной системе координат слова (Priority: P1)

**Goal**: Форма штрихов в СК фрагмента слова; не на изображении скана; согласованность с editor thumbnail

**Independent Test**: Сравнить миниатюру слота с миниатюрой в draft-панели после выбора того же слова (quickstart §5)

### Implementation for User Story 2

- [ ] T010 [US2] Reuse existing `.word-curve-thumb` sizing (9rem × 4.5rem from `App.css`) for slot thumbnails in `handwritingocr.client/src/ScanVectorsPanel.tsx`; do not add scan-coordinate SVG overlay
- [ ] T011 [US2] Verify `ScanFrameOverlay` and `.scan img` remain free of vector curve paths (no changes to overlay components unless regression found) per `contracts/scan-vectors-panel-ui.md`

**Checkpoint**: Миниатюры только в панели векторов и editor; не на скане

---

## Phase 5: User Story 3 — Выбор слова кликом по слоту (Priority: P1)

**Goal**: Клик по любому слоту (миниатюра или empty) выбирает слово; подсветка слота согласована с текстом и рамкой

**Independent Test**: Клик по миниатюре и по empty-слоту → тот же draft, что при клике в тексте; слот выделен (quickstart §4)

### Implementation for User Story 3

- [ ] T012 [US3] Add `onClick` on each `.vector-slot` calling `onSelectWord(word)` with `type="button"` or role=button semantics in `handwritingocr.client/src/ScanVectorsPanel.tsx`
- [ ] T013 [US3] Apply `.vector-slot.selected` when `word.id === selectedWordId` in `handwritingocr.client/src/ScanVectorsPanel.tsx`
- [ ] T014 [P] [US3] Add `.vector-slot.selected` styles mirroring `.word.selected` (accent background + outline) in `handwritingocr.client/src/App.css`
- [ ] T015 [US3] Confirm `onSelectWord` from `App.tsx` is the same handler used by text `.word` click and frame select (single selection path) in `handwritingocr.client/src/App.tsx`

**Checkpoint**: Панель векторов — полноценный канал навигации и выбора слова

---

## Phase 6: User Story 4 — Раскладка экрана и адаптивность (Priority: P2)

**Goal**: Правая колонка: текст сверху, панель векторов снизу, обе видны на desktop; mobile stack «скан → текст → векторы»

**Independent Test**: Desktop ≥1024×768 — обе секции в правой колонке без прокрутки всей страницы; narrow — vertical stack (quickstart §1, §8)

### Implementation for User Story 4

- [ ] T016 [P] [US4] Add flex column layout to `.workspace-side` and `.workspace-side-main` with `min-height: 0` in `handwritingocr.client/src/App.css`
- [ ] T017 [P] [US4] Set `flex: 1 1 0`, `min-height: 12rem`, `overflow: auto` on `.recognized-text-block` and `.scan-vectors-panel` inside `.workspace-side-main` in `handwritingocr.client/src/App.css`
- [ ] T018 [US4] Add desktop height context on `.workspace` (e.g. `min-height` / `height: calc(100vh - …)` or equivalent) so both right sections share viewport without whole-page scroll in `handwritingocr.client/src/App.css`
- [ ] T019 [US4] Add `@media (max-width: 900px) { .workspace { flex-direction: column; } }` for mobile stack order scan → text → vectors in `handwritingocr.client/src/App.css`

**Checkpoint**: Компоновка соответствует FR-008, FR-010 и контракту layout

---

## Phase 7: User Story 5 — Пустое состояние и обновление после векторизации (Priority: P2)

**Goal**: Зеркало раскладки с empty-слотами при отсутствии векторов; автообновление после vectorize/batch/delete/DnD без reload

**Independent Test**: Скан без векторизованных — все слоты empty; vectorize one/batch — слоты обновляются (quickstart §3, §6)

### Implementation for User Story 5

- [ ] T020 [US5] Render `.vector-slot.empty` (dashed neutral marker, no SVG path) for `!isWordVectorized(word)` slots in `handwritingocr.client/src/ScanVectorsPanel.tsx`
- [ ] T021 [US5] When no words are vectorized, still render full line/slot mirror with all `.vector-slot.empty` (panel visible, not hidden) in `handwritingocr.client/src/ScanVectorsPanel.tsx`
- [ ] T022 [US5] If `isWordVectorized(word)` but `WordCurveThumbnail` returns null (invalid curves), show neutral/empty slot without throwing in `handwritingocr.client/src/ScanVectorsPanel.tsx`
- [ ] T023 [US5] When `lines.length === 0`, show minimal empty state inside `.scan-vectors-panel` (no slot rows) in `handwritingocr.client/src/ScanVectorsPanel.tsx`
- [ ] T024 [US5] Do **not** add separate panel state in `App.tsx`; confirm panel updates via existing `words` / `layoutLines` / `displayLines` after vectorize, batch, delete, and DnD handlers

**Checkpoint**: Пустые и частично заполненные состояния корректны; данные актуальны без перезагрузки

---

## Phase 8: User Story 6 — Сохранение существующего поведения (Priority: P2)

**Goal**: Без регрессии editor, индикаторов, DnD, save layout, vectorize/batch/delete

**Independent Test**: Пройти quickstart §9 — все существующие сценарии без новых дефектов

### Implementation for User Story 6

- [ ] T025 [US6] Regression pass: draft `.editor` thumbnail, «Векторизовать», «Удалить слово», layout toolbar batch unchanged in `handwritingocr.client/src/App.tsx`
- [ ] T026 [US6] Verify DnD reorder updates vector slot positions to match `displayLines` without save in `handwritingocr.client/src/ScanVectorsPanel.tsx`
- [ ] T027 [US6] Verify switching `scanId` clears panel (no thumbnails from previous scan) via props reset in `handwritingocr.client/src/App.tsx`

**Checkpoint**: Смежный UX не сломан

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Финальная приёмка и визуальная полировка

- [ ] T028 Run full manual validation per `specs/010-scan-vectors-panel/quickstart.md` (all sections §1–§10)
- [ ] T029 [P] Tune horizontal spacing/gap between `.vector-slot` elements to align visually with word spacing in `.recognized-text` in `handwritingocr.client/src/App.css`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **US1 (Phase 3)**: Depends on Foundational — **MVP**
- **US2 (Phase 4)**: Depends on US1 (thumbnails must exist)
- **US3 (Phase 5)**: Depends on US1 (slots must exist); can parallel CSS T014 with T012–T013
- **US4 (Phase 6)**: Depends on Foundational; can start after T003–T005; ideally after US1 for meaningful layout test
- **US5 (Phase 7)**: Depends on US1; extends slot rendering
- **US6 (Phase 8)**: Depends on US1–US5 complete
- **Polish (Phase 9)**: Depends on US6

### User Story Dependencies

| Story | Priority | Depends on | Independent test |
|-------|----------|------------|------------------|
| US1 | P1 | Phase 2 | quickstart §2 |
| US2 | P1 | US1 | quickstart §5 |
| US3 | P1 | US1 | quickstart §4 |
| US4 | P2 | Phase 2 (+ US1 for visual check) | quickstart §1, §8 |
| US5 | P2 | US1 | quickstart §3, §6 |
| US6 | P2 | US1–US5 | quickstart §9 |

### Parallel Opportunities

- **Phase 2**: T005 [P] parallel with T002–T004 after T002 types exist
- **US3**: T014 [P] parallel with T012–T013 (CSS vs TSX)
- **US4**: T016 [P] and T017 [P] parallel (same file but independent rules)
- **Polish**: T029 [P] after T028 issues identified

### Parallel Example: User Story 4

```bash
# CSS layout tasks in parallel (same file — coordinate merges):
T016: flex column on .workspace-side / .workspace-side-main in App.css
T017: flex 1 + overflow on text block and scan-vectors-panel in App.css
```

### Parallel Example: After Foundational

```bash
# Sequential recommended for one developer:
Phase 3 (US1) → Phase 4 (US2) → Phase 5 (US3)
# US4 CSS can start after T003 while US1 TSX work continues (different files)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002–T005)
3. Complete Phase 3: User Story 1 (T006–T009)
4. **STOP and VALIDATE**: quickstart §2 — все миниатюры видны в зеркале раскладки
5. Demo if ready

### Incremental Delivery

1. Setup + Foundational → каркас панели
2. US1 → одновременный обзор (MVP)
3. US2 + US3 → корректные миниатюры и выбор слота
4. US4 → desktop/mobile layout
5. US5 → empty states и reactive updates
6. US6 + Polish → регрессия и quickstart

### Suggested MVP Scope

**Phases 1–3 (T001–T009)**: панель с зеркалом раскладки и миниатюрами векторизованных слов.

---

## Notes

- Панель **не** вызывает API; все данные из существующего state `App.tsx`
- Не рендерить `line-gap-drop` в `ScanVectorsPanel` (research §10)
- Кликабельны **все** слоты, включая empty (clarify Q4)
- Backend / Liquibase: **без изменений**
