# Tasks: Редактирование рамки слова на скане через drag-and-drop

**Input**: Design documents from `/specs/008-dnd-word-frame-edit/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Не запрошены в spec — автотесты не включаются; приёмка по [quickstart.md](./quickstart.md)

**Organization**: Задачи сгруппированы по user stories для независимой проверки каждого инкремента.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Можно выполнять параллельно (разные файлы, нет зависимости от незавершённых задач)
- **[Story]**: User story (US1, US2, US3, US4)
- В описании — точные пути к файлам

## Path Conventions

Клиент: `handwritingocr.client/src/` (Vite React). Backend в этой фиче не меняется.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Подтвердить brownfield SVG overlay и draft-редактирование перед frame drag

- [ ] T001 Confirm existing frame-edit prerequisites in `handwritingocr.client/src/App.tsx`: `Word` x1–y4, `boxPoints`, `draft`, `imageSize`, `handleWordSelect`, `handleCoordinateChange`, `handleSaveClick`, `wordContentBody`, SVG overlay with `viewBox` and `onClick` on polygons per `specs/008-dnd-word-frame-edit/plan.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure helpers, frame-drag state, selection hit-test, CSS — блокируют все user stories

**⚠️ CRITICAL**: User story phases не начинать, пока фаза не завершена

- [ ] T002 [P] Create `handwritingocr.client/src/frameEdit.ts` with pure helpers: `defaultCenterFrame(w, h)` (80×40 centered), `translateFrame(word, dx, dy)`, `setCorner(word, index, x, y)`, `clientToImagePoint(svg, clientX, clientY)`, `pointInQuad(px, py, word)`, `findWordAtPoint(words, draft, px, py)` returning min `orderIndex` hit per `specs/008-dnd-word-frame-edit/research.md`
- [ ] T003 Add `frameDrag: { mode: 'move' | 'corner'; cornerIndex?: number; startImageX: number; startImageY: number; snapshot: Word } | null` state and import from `frameEdit.ts` in `handwritingocr.client/src/App.tsx`
- [ ] T004 Replace polygon `onClick`-only selection in `handwritingocr.client/src/App.tsx` with `onMouseDown` on scan overlay using `findWordAtPoint`: if word not selected → `handleWordSelect` only (no coord change on move before mouseup); if already selected → defer to frame drag handlers (FR-003)
- [ ] T005 Implement window `mousemove`/`mouseup` listener attach/detach in `handwritingocr.client/src/App.tsx` during active `frameDrag`; cleanup on mouseup, `handleCancelClick`, and unmount
- [ ] T006 [P] Add `.frame-handle` styles and selected polygon interior hit-area (`fill: transparent` or rgba) plus `cursor: grab`/`grabbing` in `handwritingocr.client/src/App.css` per `specs/008-dnd-word-frame-edit/contracts/frame-drag-ui.md`
- [ ] T007 Render four `<circle class="frame-handle">` on selected `draft` vertices in SVG block of `handwritingocr.client/src/App.tsx` (visual + pointer-events; drag wiring in US1/US2)

**Checkpoint**: Helpers, state, selection без drag, handles visible — можно подключать move/corner drag

---

## Phase 3: User Story 1 — Перемещение всей рамки (Priority: P1) 🎯 MVP

**Goal**: Оператор перетаскивает внутреннюю заливку выбранной рамки; все четыре вершины сдвигаются одинаково; x1–y4 синхронны в live preview; save только по кнопке

**Independent Test**: Выбрать слово → drag interior → x1–y4 обновляются → «Сохранить» → reload (quickstart §1–§2)

### Implementation for User Story 1

- [ ] T008 [US1] On `mousedown` of selected polygon interior (not handle) in `handwritingocr.client/src/App.tsx`, start `frameDrag` with `mode: 'move'` and `snapshot` copy of `draft`; record `startImageX/Y` via `clientToImagePoint`
- [ ] T009 [US1] On window `mousemove` during move drag in `handwritingocr.client/src/App.tsx`, update `draft` via `translateFrame(snapshot, dx, dy)` with `Math.round` on all coordinates; do not mutate `layoutLines` or call API (FR-001, FR-005, FR-006)
- [ ] T010 [US1] On window `mouseup` in `handwritingocr.client/src/App.tsx`, clear `frameDrag`; verify controlled `<input type="number">` fields x1–y4 reflect `draft` during and after drag

**Checkpoint**: MVP — перемещение рамки целиком с live sync; без автосохранения

---

## Phase 4: User Story 2 — Изменение формы перетаскиванием углов (Priority: P1)

**Goal**: Перетаскивание углового маркера двигает одну вершину; маркеры имеют приоритет над зоной move; «Отмена» и «Сохранить» работают как для числового edit

**Independent Test**: Drag one corner → only x/i,y/i change → Cancel restores server coords → Save persists (quickstart §3–§4, §8)

### Implementation for User Story 2

- [ ] T011 [US2] Wire `onMouseDown` on each `.frame-handle` in `handwritingocr.client/src/App.tsx` to start `frameDrag` with `mode: 'corner'` and `cornerIndex` 0–3; must run before interior move handler (FR-001a)
- [ ] T012 [US2] On window `mousemove` during corner drag in `handwritingocr.client/src/App.tsx`, update `draft` via `setCorner(snapshot, cornerIndex, x, y)` with rounded image-space cursor position
- [ ] T013 [US2] Verify corner-vs-move priority at handle boundary in `handwritingocr.client/src/App.tsx`: mousedown on handle always corner drag; mousedown on interior never moves a corner (quickstart §4)

**Checkpoint**: Move и corner drag оба работают с приоритетом углов

---

## Phase 5: User Story 3 — Начальная рамка для нового слова (Priority: P2)

**Goal**: «Добавить слово» показывает rect 80×40 по центру скана с маркерами; оператор правит углами и сохраняет через POST

**Independent Test**: Add word → center frame visible → drag corners → Save → reload (quickstart §7)

### Implementation for User Story 3

- [ ] T014 [US3] Update `handleAddClick` in `handwritingocr.client/src/App.tsx` to set initial coords via `defaultCenterFrame(imageSize.width, imageSize.height)` when `imageSize` available; if add before image load, apply center frame when `imageSize` becomes available for id=0 draft
- [ ] T015 [US3] Ensure id=0 `<polygon class="selected">` and four handles in `handwritingocr.client/src/App.tsx` support move/corner drag same as saved words; POST via existing `handleSaveClick` sends dragged coords

**Checkpoint**: Новое слово с осмысленной начальной рамкой, не (0,0) degenerate

---

## Phase 6: User Story 4 — Синхронизация и регрессии (Priority: P1)

**Goal**: Числовые поля ↔ рамка; min orderIndex при перекрытии; text HTML5 DnD и «Сохранить порядок» без регрессии; frame drag не меняет lineIndex/orderIndex

**Independent Test**: Numeric x1 edit; overlap click; text DnD + save layout; coords unchanged on server until word Save (quickstart §5–§6, §9–§10)

### Implementation for User Story 4

- [ ] T016 [US4] Verify `handleCoordinateChange` in `handwritingocr.client/src/App.tsx` still updates selected polygon live (numeric → scan); frame drag → numeric remains bidirectional (FR-009)
- [ ] T017 [US4] Verify `findWordAtPoint` min `orderIndex` selection on overlapping quads in `handwritingocr.client/src/App.tsx` (FR-003a; quickstart §6)
- [ ] T018 [US4] Verify HTML5 text DnD in `.recognized-text` (`handleDragStart`, gap/word/line handlers) unchanged in `handwritingocr.client/src/App.tsx`; frame edit uses mouse events only on SVG (FR-011)
- [ ] T019 [US4] Verify `handleSaveLayoutClick` in `handwritingocr.client/src/App.tsx` does not send frame-draft coords; `handleSaveClick` still uses `wordContentBody(draft)` for POST/PUT; RU statuses unchanged (FR-010, FR-012, FR-013)
- [ ] T020 [US4] Update `handleCancelClick` in `handwritingocr.client/src/App.tsx` to abort active `frameDrag` and reset listeners before clearing `draft` (FR-007)

**Checkpoint**: Регрессии DnD текста, save layout, numeric sync — пройдены

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases и приёмка по quickstart

- [ ] T021 [P] Handle edge cases in `handwritingocr.client/src/App.tsx`: mousedown on unselected frame with mouse move selects only; zero-move mouseup leaves coords unchanged; abort drag if selection changes mid-drag per spec edge cases
- [ ] T022 Run manual validation scenarios from `specs/008-dnd-word-frame-edit/quickstart.md` §§1–10 against running SPA+API

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Нет зависимостей
- **Foundational (Phase 2)**: После T001 — **блокирует** все user stories
- **US1 (Phase 3)**: После Foundational — MVP (move drag)
- **US2 (Phase 4)**: После US1 (shared frameDrag pipeline + handles from T007)
- **US3 (Phase 5)**: После US2 (handles/drag для id=0)
- **US4 (Phase 6)**: После US1 minimum; полная проверка после US2–US3
- **Polish (Phase 7)**: После US1–US4

### User Story Dependencies

- **US1**: Foundational only
- **US2**: US1 (move drag infrastructure)
- **US3**: US2 (corner + move on draft polygon)
- **US4**: US1 minimum; overlap/corner checks лучше после US2–US3

### Parallel Opportunities

- T002 [P] ∥ T003 после T001 (frameEdit.ts vs state stub — T003 depends on T002 imports; actually T003 needs T002, so T002 first then T003)
- T006 [P] ∥ T004–T005 после T002 (App.css vs App.tsx)
- T021 [P] ∥ T020 после US4 core
- US4 tasks T016–T020 mostly sequential in App.tsx but T018 can parallel T017 if different review focus

### Within Each Story

- Foundational: frameEdit.ts → state → selection mousedown → listeners → CSS → handle render
- US1: move mousedown → mousemove translate → mouseup + input sync
- US2: handle mousedown → corner mousemove → priority verify
- US3: handleAddClick center frame → id=0 drag parity
- US4: numeric sync → overlap → text DnD → save regression → cancel abort

---

## Parallel Example: Foundational

```text
# После T001:
Task: "T002 [P] frameEdit.ts helpers"
Task: "T003 frameDrag state in App.tsx"        # after T002
Task: "T004 selection mousedown in App.tsx"  # after T002
Task: "T005 window listeners in App.tsx"
Task: "T006 [P] frame-handle CSS in App.css"  # parallel with T003–T005
Task: "T007 handle render in App.tsx"
```

---

## Parallel Example: User Story 1

```text
# После Phase 2:
Task: "T008 [US1] move mousedown in App.tsx"
Task: "T009 [US1] translateFrame mousemove in App.tsx"
Task: "T010 [US1] mouseup + input sync in App.tsx"
# STOP: quickstart §1–§2
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup (T001)
2. Phase 2 Foundational (T002–T007)
3. Phase 3 US1 (T008–T010)
4. **STOP**: quickstart §1–§2 — move рамки, live x1–y4, save + reload

### Incremental Delivery

1. Setup + Foundational → helpers, selection, handles
2. US1 → move entire frame (MVP)
3. US2 → corner edit + priority
4. US3 → new word center frame
5. US4 → numeric sync + DnD/layout regression
6. Polish → quickstart §§1–10

### Suggested MVP scope

**US1** (T008–T010) после Foundational: оператор может сдвинуть рамку на scan без ввода чисел. US2–US4 — следующие инкременты на том же `frameDrag` pipeline.

---

## Notes

- Backend / Liquibase / новые endpoint'ы **не** входят в задачи
- Frame drag — **mouse events**, не HTML5 DnD (отделить от text DnD)
- Не добавлять autosave on mouseup, touch edit, clamp to image bounds, auto-revectorize
- `layoutLines` не менять при frame drag — только `draft` coordinates
- Формат всех задач: checkbox + ID + опционально [P]/[USn] + путь к файлу

---

## Task Summary

| Phase | Tasks | Count |
|-------|-------|-------|
| Setup | T001 | 1 |
| Foundational | T002–T007 | 6 |
| US1 (P1) MVP | T008–T010 | 3 |
| US2 (P1) | T011–T013 | 3 |
| US3 (P2) | T014–T015 | 2 |
| US4 (P1) | T016–T020 | 5 |
| Polish | T021–T022 | 2 |
| **Total** | **T001–T022** | **22** |
