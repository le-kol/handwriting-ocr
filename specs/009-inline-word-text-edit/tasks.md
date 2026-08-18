# Tasks: Inline-редактирование текста слова в блоке результатов OCR

**Input**: Design documents from `/specs/009-inline-word-text-edit/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Не запрошены в spec — автотесты не включаются; приёмка по [quickstart.md](./quickstart.md)

**Organization**: Задачи сгруппированы по user stories для независимой проверки каждого инкремента.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Можно выполнять параллельно (разные файлы, нет зависимости от незавершённых задач)
- **[Story]**: User story (US1, US2, US3)
- В описании — точные пути к файлам

## Path Conventions

Клиент: `handwritingocr.client/src/` (Vite React). Backend в этой фиче не меняется.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Подтвердить brownfield draft/save и recognized-text перед inline-редактированием

- [ ] T001 Confirm existing inline-edit prerequisites in `handwritingocr.client/src/App.tsx`: `Word`, `draft`, `words`, `layoutLines`, `handleWordSelect`, `handleTextChange`, `handleSaveClick`, `handleCancelClick`, `wordContentBody`, `.recognized-text` word spans with `draggable={true}` and `onClick` per `specs/009-inline-word-text-edit/plan.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure helpers, shared save pipeline, UI state, CSS — блокируют все user stories

**⚠️ CRITICAL**: User story phases не начинать, пока фаза не завершена

- [ ] T002 [P] Create `handwritingocr.client/src/inlineWordEdit.ts` with pure helpers: `DRAG_CLICK_THRESHOLD_PX` (5), `lastSavedTextForWord(id, words)`, `distanceExceeded(gesture, x, y)`, `caretIndexFromClick(input, clientX, clientY)` per `specs/009-inline-word-text-edit/research.md`
- [ ] T003 Add `inlineEditingWordId: number | null` and `pendingWordGesture` state (types from `specs/009-inline-word-text-edit/data-model.md`) in `handwritingocr.client/src/App.tsx`; reset both in `resetEditorState` and `handleCancelClick`
- [ ] T004 Extract `updateDraftText(text: string)` from `handleTextChange` in `handwritingocr.client/src/App.tsx` — updates `draft` and `layoutLines` text for matching word id (FR-007)
- [ ] T005 Extract `persistWordContent(draft: Word): Promise<Word>` from `handleSaveClick` in `handwritingocr.client/src/App.tsx` — POST/PUT, `replaceWordIdInLayout` for id=0, `fetchWords`, `setWords`, `setDraft(saved)`; shared by panel Save and inline autosave
- [ ] T006 [P] Add `.word-inline-input` styles in `handwritingocr.client/src/App.css` per `specs/009-inline-word-text-edit/contracts/inline-word-text-ui.md` (inherit font, selected outline, minimal padding)

**Checkpoint**: Helpers, state, shared save, CSS — можно подключать inline UX

---

## Phase 3: User Story 1 — Быстрая правка текста на месте (Priority: P1) 🎯 MVP

**Goal**: Выбор слова → клик по выбранному → inline input → Enter/blur autosave при изменении; Escape откат текста; ошибка save — остаться в inline

**Independent Test**: quickstart §1–§7 (выбор, второй клик, Enter save, blur save, unchanged exit, Escape, save error retry)

### Implementation for User Story 1

- [ ] T007 [US1] Implement window-attached gesture handlers on selected `.word` in `handwritingocr.client/src/App.tsx`: `onMouseDown` → `pendingWordGesture`; `mousemove`/`mouseup` → threshold check; mouseup without threshold → `enterInlineEdit(wordId, clickClientX/Y)` (FR-002, FR-017)
- [ ] T008 [US1] Remove or replace `handleWordSelect` early-return for same word in `handwritingocr.client/src/App.tsx` — first click on unselected word still selects; inline entry only via gesture mouseup on already-selected word
- [ ] T009 [P] [US1] Create `handwritingocr.client/src/InlineWordInput.tsx` (controlled input: `value`, `onChange`, `onKeyDown`, `onBlur`, `autoFocus`, `className="word word-inline-input selected"`) OR equivalent inline block in `App.tsx`
- [ ] T010 [US1] In recognized-text render in `handwritingocr.client/src/App.tsx`, when `inlineEditingWordId === word.id` render `InlineWordInput` instead of text span; set `draggable={false}` for that word (FR-010)
- [ ] T011 [US1] Implement `enterInlineEdit` in `handwritingocr.client/src/App.tsx`: set `inlineEditingWordId`, focus input, set caret via `caretIndexFromClick` (FR-003)
- [ ] T012 [US1] Implement `commitInlineEdit` in `handwritingocr.client/src/App.tsx`: if `draft.text === lastSavedTextForWord` → clear inline only (FR-005); else call `persistWordContent` → on success clear inline + `saveStatus` «Сохранено»; on error stay inline + RU error (FR-004, FR-014, FR-015)
- [ ] T013 [US1] Wire Enter (`preventDefault`) and `onBlur` on inline input to `commitInlineEdit` in `handwritingocr.client/src/App.tsx`
- [ ] T014 [US1] Implement `cancelInlineEdit` on Escape in `handwritingocr.client/src/App.tsx`: revert `draft.text` and `layoutLines` text to `lastSavedTextForWord`; clear `inlineEditingWordId`; keep panel open (FR-006)

**Checkpoint**: MVP — inline edit + autosave + Escape + error retry без регрессий панели

---

## Phase 4: User Story 2 — Согласованность с панелью (Priority: P1)

**Goal**: Inline onChange синхронизирует поле «Текст»; panel Save без autosave; inline autosave отправляет text + coords черновика

**Independent Test**: quickstart §10; spec User Story 2 acceptance scenarios

### Implementation for User Story 2

- [ ] T015 [US2] Wire inline input `onChange` to `updateDraftText` in `handwritingocr.client/src/App.tsx` so panel field «Текст» reflects draft in real time during inline edit (FR-007)
- [ ] T016 [US2] Refactor `handleSaveClick` in `handwritingocr.client/src/App.tsx` to delegate to `persistWordContent`; keep explicit button-only save for panel edits — no autosave on `handleTextChange` alone (FR-008)
- [ ] T017 [US2] Verify `persistWordContent` / inline commit sends `wordContentBody(draft)` including x1–y4 from current draft in `handwritingocr.client/src/App.tsx` (FR-009, User Story 2 #4)
- [ ] T018 [US2] Use shared `saveStatus` / `isSaving` for inline autosave in `handwritingocr.client/src/App.tsx` — «Сохранение», «Сохранено», «Ошибка сохранения: …» (FR-014)

**Checkpoint**: Panel и inline используют один draft и один save pipeline

---

## Phase 5: User Story 3 — Сохранение регрессий (Priority: P1)

**Goal**: Click vs drag на выбранном слове; выбор по рамке → один клик по тексту → inline; «Отмена» during inline; text DnD, frame drag, layout save, прочие flows без регрессии

**Independent Test**: quickstart §8–§12; spec User Story 3 acceptance scenarios

### Implementation for User Story 3

- [ ] T019 [US3] Verify gesture threshold in `handwritingocr.client/src/App.tsx`: movement > 5px allows HTML5 `handleDragStart` on selected word without entering inline; short click enters inline (FR-011, FR-017)
- [ ] T020 [US3] Verify frame selection via `ScanFrameOverlay` then single text click opens inline without extra select click in `handwritingocr.client/src/App.tsx` (clarification Q4, acceptance 2a)
- [ ] T021 [US3] Update `handleCancelClick` in `handwritingocr.client/src/App.tsx`: `setInlineEditingWordId(null)` then full draft reset (text + coords to server) — same as pre-inline «Отмена» (FR-016)
- [ ] T022 [US3] Implement blur-then-select ordering in `handwritingocr.client/src/App.tsx`: inline `onBlur` commits current word before `handleWordSelect` on another `.word` (edge case switch word)
- [ ] T023 [US3] Regression pass in `handwritingocr.client/src/App.tsx`: HTML5 text DnD (`handleDragStart`, gap/word/line drop) unchanged; `ScanFrameOverlay` frame drag unchanged; «Сохранить порядок» unchanged; add word / recognize / batch vectorize / delete unchanged (FR-011, FR-012)

**Checkpoint**: Все регрессионные сценарии из FR-011/FR-012 проходят

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases и приёмка по quickstart

- [ ] T024 [P] Handle edge cases in `handwritingocr.client/src/App.tsx`: double-click unselected word (select then inline); empty text save for id=0; guard double `commitInlineEdit` with ref during blur+click; block drag on word while `inlineEditingWordId !== null`
- [ ] T025 Run manual validation scenarios from `specs/009-inline-word-text-edit/quickstart.md` §§1–12 against running SPA+API

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS** all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — **MVP**
- **User Story 2 (Phase 4)**: Depends on Foundational + US1 `commitInlineEdit` / `persistWordContent`
- **User Story 3 (Phase 5)**: Depends on Foundational + US1 inline render; best after US2 for full save sync
- **Polish (Phase 6)**: Depends on US1–US3

### User Story Dependencies

| Story | Depends on | Independent test |
|-------|------------|------------------|
| US1 (P1) | Phase 2 | quickstart §1–§7 |
| US2 (P1) | Phase 2, US1 commit path | quickstart §10 |
| US3 (P1) | Phase 2, US1 inline UI | quickstart §8–§12 |

### Within Each User Story

- Helpers/state (Phase 2) before gesture and render (US1)
- `commitInlineEdit` before panel refactor (US2)
- Core inline before regression verification (US3)

### Parallel Opportunities

- **Phase 2**: T002, T006 in parallel (different files)
- **Phase 3**: T009 (`InlineWordInput.tsx`) parallel with T007–T008 after T003 (App.tsx gesture can follow component stub)
- **Phase 6**: T024 parallel with prep for T025
- **US2 vs US3**: After US1 checkpoint, US2 and US3 can overlap if different developers — US3 regression tasks mostly read-only verify

---

## Parallel Example: User Story 1

```bash
# After Phase 2 complete:
# Parallel: component file + gesture in App
Task T009: "Create InlineWordInput.tsx"
Task T007: "Implement gesture handlers in App.tsx"

# Sequential: render depends on component
Task T010: "Render InlineWordInput when inlineEditingWordId matches"
Task T011–T014: "commitInlineEdit, Enter/blur, Escape"
```

---

## Parallel Example: Foundational Phase

```bash
Task T002: "Create inlineWordEdit.ts"
Task T006: "Add .word-inline-input in App.css"
# Then sequentially in App.tsx:
Task T003 → T004 → T005
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002–T006)
3. Complete Phase 3: User Story 1 (T007–T014)
4. **STOP and VALIDATE**: quickstart §1–§7
5. Demo inline text fix without panel field

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → MVP inline autosave
3. US2 → panel sync and shared save semantics
4. US3 → regressions + «Отмена» + click vs drag
5. Polish → edge cases + full quickstart

### Suggested MVP Scope

**Phases 1–3 only** (T001–T014): оператор может выбрать слово, войти в inline, сохранить Enter/blur, отменить Escape.

---

## Notes

- Backend, Liquibase, API — **не менять** (FR-009)
- Не добавлять autosave на поле «Текст» панели (FR-008)
- Inline autosave MUST NOT вызывать `PUT …/words/layout`
- `curvePoints` не редактировать и не пересчитывать (FR-013)
- Commit после каждой фазы или логической группы задач
