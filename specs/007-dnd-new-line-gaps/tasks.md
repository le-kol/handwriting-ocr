# Tasks: Вставка слова на новую строку через drag-and-drop

**Input**: Design documents from `/specs/007-dnd-new-line-gaps/`

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

**Purpose**: Подтвердить brownfield drag-and-drop перед расширением gap-зонами

- [ ] T001 Confirm existing DnD prerequisites in `handwritingocr.client/src/App.tsx`: `moveWordInLayout`, `layoutLines`, `dropTarget`, `draggedWordId`, `handleDragOverWord`, `handleDragOverLine`, `handleDrop`, `handleSaveLayoutClick`, and `.recognized-text` render per `specs/007-dnd-new-line-gaps/plan.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Helper, state и handlers gap-drop — блокируют все user stories

**⚠️ CRITICAL**: User story phases не начинать, пока фаза не завершена

- [ ] T002 Implement `moveWordToNewLine(lines, wordId, insertAtLineIndex)` pure helper in `handwritingocr.client/src/App.tsx`: remove word, adjust insertAtLineIndex after removal, splice `[word]` at index, filter empty lines (see `specs/007-dnd-new-line-gaps/research.md` §2)
- [ ] T003 Add `gapDropTarget: number | null` state in `handwritingocr.client/src/App.tsx` (insertAtLineIndex активной gap-зоны)
- [ ] T004 Implement `handleGapDragOver(event, insertAtLineIndex)` and `handleGapDrop(event, insertAtLineIndex)` in `handwritingocr.client/src/App.tsx`: `preventDefault`, `stopPropagation`, update `gapDropTarget`, call `moveWordToNewLine` on drop, reset drag state
- [ ] T005 Update `handleDragOverWord`, `handleDragOverLine`, `handleDragEnd`, and `handleCancelClick` in `handwritingocr.client/src/App.tsx` to clear `gapDropTarget` (mutual exclusion with `dropTarget` per `specs/007-dnd-new-line-gaps/data-model.md`)
- [ ] T006 [P] Add `.line-gap-drop` (min-height ≥ 8px, margin) and `.line-gap-drop.active` horizontal line styles in `handwritingocr.client/src/App.css`; color aligned with `.word.drop-target` (`#1b7ff5`)

**Checkpoint**: Helper и handlers готовы; JSX gap-зон можно подключать

---

## Phase 3: User Story 1 — Новая строка в начале документа (Priority: P1) 🎯 MVP

**Goal**: Drop в зону над первой строкой помещает слово на отдельную новую строку в начале документа; gap подсвечивается при drag-over

**Independent Test**: Перетащить слово в gap над первой строкой → слово на новой первой строке; API не вызывается до save (quickstart §1)

### Implementation for User Story 1

- [ ] T007 [US1] Refactor `.recognized-text` render in `handwritingocr.client/src/App.tsx`: insert `.line-gap-drop` sibling with `insertAtLineIndex={0}` before the first `<p>`, wired to `handleGapDragOver` / `handleGapDrop`, class `active` when `gapDropTarget === 0`
- [ ] T008 [US1] On gap drop at index 0 in `handwritingocr.client/src/App.tsx`, update `layoutLines` via `moveWordToNewLine` only (no fetch); confirm `layoutDirty` becomes true via existing `layoutSignature` / «Сохранить порядок» button state

**Checkpoint**: MVP — перенос слова на новую первую строку работает локально

---

## Phase 4: User Story 2 — Новая строка между строками (Priority: P1)

**Goal**: Drop между строкой N и N+1 создаёт отдельную новую строку между ними; только одна gap подсвечена при drag-over

**Independent Test**: Перетащить слово в gap между строками 1 и 2 → новая строка между ними; word/line drop без регрессии (quickstart §2, §5–§6)

### Implementation for User Story 2

- [ ] T009 [US2] Extend `.recognized-text` render loop in `handwritingocr.client/src/App.tsx`: after each `<p>` with `lineIndex === i`, render `.line-gap-drop` with `insertAtLineIndex={i + 1}` (covers gaps between lines; trailing gap for US3 uses `i + 1` when `i === N - 1`)
- [ ] T010 [US2] Verify gap handlers in `handwritingocr.client/src/App.tsx` use `stopPropagation` on dragOver/drop so word and line targets are not triggered when dropping on gap (per `specs/007-dnd-new-line-gaps/contracts/dnd-line-gap-ui.md`)

**Checkpoint**: Межстрочные gap-drop работают; конфликтов с word/line drop нет

---

## Phase 5: User Story 3 — Новая строка в конце документа (Priority: P1)

**Goal**: Drop под последней строкой помещает слово на новую строку в конце документа

**Independent Test**: Перетащить слово в нижнюю gap-зону → отдельная последняя строка (quickstart §3)

### Implementation for User Story 3

- [ ] T011 [US3] Confirm trailing `.line-gap-drop` with `insertAtLineIndex={displayLines.length}` renders after last `<p>` in `handwritingocr.client/src/App.tsx` and `moveWordToNewLine(..., N)` appends a one-word line at document end

**Checkpoint**: Все три позиции gap (начало / между / конец) функциональны

---

## Phase 6: User Story 4 — Сохранение существующего drag-and-drop (Priority: P1)

**Goal**: Drop на слово (вставка перед) и drop на строку (в конец) работают как до фичи; сохранение порядка через PUT layout без изменений backend

**Independent Test**: Drop на слово, drop на `<p>`, «Сохранить порядок» после gap-drop (quickstart §4–§6)

### Implementation for User Story 4

- [ ] T012 [US4] Verify drop on `.word` in `handwritingocr.client/src/App.tsx` still calls `moveWordInLayout` (insert before target word); gap zones must not intercept when cursor is on word
- [ ] T013 [US4] Verify drop on `<p>` (line area) in `handwritingocr.client/src/App.tsx` still appends to line end via `handleDrop(..., lineWords.length)`; `handleDragOverLine` clears `gapDropTarget`
- [ ] T014 [US4] Verify `handleSaveLayoutClick` in `handwritingocr.client/src/App.tsx` sends `layoutToLineIds` with one-word inner arrays after gap-drop; RU messages («Порядок сохранён», «Сначала сохраните новое слово», etc.) unchanged; no backend changes

**Checkpoint**: 100% регрессионных сценариев DnD и save layout сохранены

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases и приёмка по quickstart

- [ ] T015 [P] Handle single-line document edge case in `handwritingocr.client/src/App.tsx`: only gaps at `insertAtLineIndex` 0 and 1 (no between-line gap when N=1) per spec edge cases
- [ ] T016 Run manual validation scenarios from `specs/007-dnd-new-line-gaps/quickstart.md` §§1–9 against running SPA+API

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Нет зависимостей
- **Foundational (Phase 2)**: После T001 — **блокирует** все user stories
- **US1 (Phase 3)**: После Foundational — MVP (gap над первой строкой)
- **US2 (Phase 4)**: После US1 (render loop расширяется поверх gap index 0)
- **US3 (Phase 5)**: После US2 (trailing gap — часть того же render loop)
- **US4 (Phase 6)**: После US2 (нужны все gap-зоны для регрессии word/line vs gap)
- **Polish (Phase 7)**: После US1–US4

### User Story Dependencies

- **US1**: Foundational only
- **US2**: Foundational + US1 (базовая структура render с gap 0)
- **US3**: US2 (trailing gap в том же loop)
- **US4**: US2 minimum (полный набор gap для проверки конфликтов); логически после US3

### Parallel Opportunities

- T006 [P] ∥ T002–T005 (App.css vs App.tsx logic) после T001
- T015 [P] ∥ T014 после US4 core checks
- US4 tasks T012–T014 последовательны в одном файле, но независимы от US3 implementation если T009 done

### Within Each Story

- Foundational: helper → state → handlers → CSS
- US1: gap index 0 render → layoutDirty verification
- US2: inter-line gaps → stopPropagation verification
- US3: trailing gap confirmation
- US4: word drop → line drop → save layout regression

---

## Parallel Example: Foundational

```text
# После T001:
Task: "T002 moveWordToNewLine in App.tsx"
Task: "T003 gapDropTarget state in App.tsx"
Task: "T004 handleGapDragOver/Drop in App.tsx"
Task: "T005 mutual exclusion in App.tsx"
Task: "T006 [P] gap CSS in App.css"   # parallel with T002–T005
```

---

## Parallel Example: User Story 1

```text
# После Phase 2:
Task: "T007 [US1] gap insertAt=0 render in App.tsx"
Task: "T008 [US1] moveWordToNewLine + layoutDirty in App.tsx"
# STOP: quickstart §1
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup (T001)
2. Phase 2 Foundational (T002–T006)
3. Phase 3 US1 (T007–T008)
4. **STOP**: quickstart §1 — gap над первой строкой, локальный layout, подсветка

### Incremental Delivery

1. Setup + Foundational → helper и handlers готовы
2. US1 → drop в начало документа (MVP)
3. US2 → gap между строками
4. US3 → gap в конце документа
5. US4 → регрессия word/line drop и save layout
6. Polish → quickstart §§1–9

### Suggested MVP scope

**US1** (T007–T008) после Foundational: оператор может вынести слово на новую первую строку одним drag-and-drop. US2–US4 — следующие инкременты на том же render loop.

---

## Notes

- Backend / Liquibase / новые endpoint'ы **не** входят в задачи
- Не добавлять DnD на SVG-скана, автосохранение layout, touch/keyboard DnD
- `moveWordInLayout` и word/line handlers — без изменения семантики (только mutual exclusion с gap)
- Черновик `id === 0`: DnD допустим; guard «Сначала сохраните новое слово» на save layout — без изменений
- Формат всех задач: checkbox + ID + опционально [P]/[USn] + путь к файлу

---

## Task Summary

| Phase | Tasks | Count |
|-------|-------|-------|
| Setup | T001 | 1 |
| Foundational | T002–T006 | 5 |
| US1 (P1) MVP | T007–T008 | 2 |
| US2 (P1) | T009–T010 | 2 |
| US3 (P1) | T011 | 1 |
| US4 (P1) | T012–T014 | 3 |
| Polish | T015–T016 | 2 |
| **Total** | **T001–T016** | **16** |
