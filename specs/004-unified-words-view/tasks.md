# Tasks: Единое представление слов скана с управлением векторизацией

**Input**: Design documents from `/specs/004-unified-words-view/`

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

**Purpose**: Подтвердить brownfield-зависимости от фич 002/003 перед рефакторингом UI

- [X] T001 Confirm prerequisites in `handwritingocr.client/src/`: `curvePoints.ts` (`isWordVectorized`), `WordCurveThumbnail.tsx`, `vectorizeWord` helper and `handleVectorizeClick` in `App.tsx`, and server `POST /api/Scans/{id}/vectorize-batch` (003) per `specs/004-unified-words-view/plan.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Новые fetch-хелперы, layout-helper и state — блокируют все user stories

**⚠️ CRITICAL**: User story phases не начинать, пока фаза не завершена

- [X] T002 Implement `removeWordFromLayout(lines, wordId)` pure helper in `handwritingocr.client/src/App.tsx` (filter word from all lines, drop empty lines)
- [X] T003 Implement `deleteWord(scanId, wordId)` fetch helper in `handwritingocr.client/src/App.tsx`: `DELETE /api/Scans/{scanId}/words/{wordId}`; success on `204`; on `!ok` throw `Error(await response.text())`
- [X] T004 Implement `vectorizeBatch(scanId)` fetch helper in `handwritingocr.client/src/App.tsx`: `POST /api/Scans/{scanId}/vectorize-batch`; on ok parse JSON `Word[]`; on `!ok` throw via `response.text()`
- [X] T005 Add UI state in `handwritingocr.client/src/App.tsx`: `isBatchVectorizing` (boolean), `deleteStatus` (`string | null`); reset both in existing scan/file/recognize reset paths alongside `vectorizingWordId` / `vectorizeStatus`

**Checkpoint**: Хелперы delete/batch и state готовы; UI stories можно подключать

---

## Phase 3: User Story 1 — Единый текстовый просмотр со статусом векторизации (Priority: P1) 🎯 MVP

**Goal**: Слова только в текстовой раскладке; таблица убрана; у каждого слова CSS-индикатор векторизации без изменения текста

**Independent Test**: Открыть скан → виден только текстовый блок; таблицы «Слова скана» нет; индикаторы различают векторизовано/нет (quickstart §1–§2)

### Implementation for User Story 1

- [X] T006 [US1] Remove entire `words-section` / `words-table` JSX block from `handwritingocr.client/src/App.tsx` (including table «Векторизовать» column and `words-section-status` for vectorize-only messages — relocate status display in later phases)
- [X] T007 [US1] Add vectorization status CSS classes on each `.word` span in recognized-text in `handwritingocr.client/src/App.tsx`: append `vectorized` or `not-vectorized` via `isWordVectorized(word)` without modifying `shown.text` inner content
- [X] T008 [P] [US1] Add `.word.vectorized` and `.word.not-vectorized` decorative indicator styles in `handwritingocr.client/src/App.css` (e.g. border/underline/`::after` dot); MUST NOT inject characters into word text
- [X] T009 [US1] Remove unused `.words-section`, `.words-table`, `.words-table th/td`, `.word-curve-cell` rules from `handwritingocr.client/src/App.css`; retain `.word-curve-thumb` if still used by `WordCurveThumbnail`

**Checkpoint**: MVP — единое текстовое представление с индикаторами; таблица отсутствует

---

## Phase 4: User Story 2 — Редактирование, векторизация и удаление в draft-панели (Priority: P1)

**Goal**: Миниатюра (если векторизовано), «Векторизовать» и «Удалить слово» в панели выбранного слова

**Independent Test**: Выбрать слово → vectorize из draft → миниатюра и индикатор обновлены; delete без confirm → слово исчезает, панель закрыта (quickstart §3–§4, §7)

### Implementation for User Story 2

- [X] T010 [US2] Render `WordCurveThumbnail` in draft `.editor` block when `draft !== null && isWordVectorized(draft)` in `handwritingocr.client/src/App.tsx` (separate from scan overlay)
- [X] T011 [US2] Add «Векторизовать» button in draft `.editor` for `draft.id > 0 && !isWordVectorized(draft)` wired to `handleVectorizeClick(draft)` in `handwritingocr.client/src/App.tsx`; disabled while `vectorizingWordId === draft.id`
- [X] T012 [US2] Extend `handleVectorizeClick` early-return guard in `handwritingocr.client/src/App.tsx` to also block when `isBatchVectorizing === true`
- [X] T013 [US2] Implement `handleDeleteClick` in `handwritingocr.client/src/App.tsx`: call `deleteWord`; on success filter word from `words`, apply `removeWordFromLayout` on `layoutLines`, `setDraft(null)` if deleted id matched draft; clear drag state if needed
- [X] T014 [US2] Add «Удалить слово» button in draft `.editor` for `draft.id > 0` (no confirm dialog) wired to `handleDeleteClick` in `handwritingocr.client/src/App.tsx`
- [X] T015 [US2] On delete failure in `handleDeleteClick`, set `deleteStatus` with RU `error.message` and do **not** mutate `words`, `layoutLines`, or `draft` in `handwritingocr.client/src/App.tsx`
- [X] T016 [P] [US2] Add `.editor` styles for vector thumbnail and action buttons (vectorize/delete) in `handwritingocr.client/src/App.css`

**Checkpoint**: Полный цикл правки/векторизации/удаления из draft-панели

---

## Phase 5: User Story 3 — Пакетная векторизация из layout-toolbar (Priority: P1)

**Goal**: Кнопка «Векторизовать все слова» рядом с «Сохранить порядок»; обновление `words` и раскладки из ответа batch

**Independent Test**: Несколько невекторизованных слов → batch → индикаторы обновлены без перезагрузки (quickstart §5)

### Implementation for User Story 3

- [X] T017 [US3] Implement `handleBatchVectorizeClick` in `handwritingocr.client/src/App.tsx`: guard `scanId`; set `isBatchVectorizing`; call `vectorizeBatch`; on success `setWords(data)`, `syncLayoutFromWords(data)`, merge `draft` if same id exists in response; on error set `vectorizeStatus` without replacing words/layout
- [X] T018 [US3] Add «Векторизовать все слова» button in `.layout-toolbar` next to «Сохранить порядок» in `handwritingocr.client/src/App.tsx`; disabled when `isBatchVectorizing` or `vectorizingWordId !== null`
- [X] T019 [US3] Show batch progress/success/error messages via `vectorizeStatus` near layout toolbar in `handwritingocr.client/src/App.tsx` (RU strings: «Пакетная векторизация…» / success / error prefix)

**Checkpoint**: Batch из toolbar обновляет текстовые индикаторы и draft при необходимости

---

## Phase 6: User Story 4 — Сохранение drag-and-drop и сохранения порядка (Priority: P2)

**Goal**: Новые индикаторы и действия не ломают существующий UX раскладки

**Independent Test**: DnD слова → сохранить порядок; редактировать текст → сохранить; индикаторы на правильных словах (quickstart §6)

### Implementation for User Story 4

- [X] T020 [US4] Verify and fix if needed `className` composition on draggable `.word` spans in `handwritingocr.client/src/App.tsx` so `selected` / `dragging` / `drop-target` / vectorization classes coexist without breaking drag handlers
- [X] T021 [US4] Verify «Сохранить порядок» and content save (`handleSaveClick`) still preserve local layout order and do not regress after table removal in `handwritingocr.client/src/App.tsx`; adjust only if regression found

**Checkpoint**: Раскладка и редактирование работают как до фичи

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Согласованность UX и приёмка по quickstart

- [X] T022 [P] Review RU copy (новые кнопки, delete/batch/vectorize messages, черновик id=0) in `handwritingocr.client/src/App.tsx` for consistency with existing App messages
- [X] T023 Run manual validation scenarios from `specs/004-unified-words-view/quickstart.md` §§1–7 against running SPA+API

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Нет зависимостей
- **Foundational (Phase 2)**: После T001 — **блокирует** все user stories
- **US1 (Phase 3)**: После Foundational — MVP (удаление таблицы + индикаторы)
- **US2 (Phase 4)**: После Foundational; логически после US1 (draft actions на едином экране без таблицы)
- **US3 (Phase 5)**: После Foundational; после US1 (toolbar над текстом); mutual exclusion с US2 vectorize guards (T012)
- **US4 (Phase 6)**: После US1 (индикаторы на `.word`); проверка после US2/US3
- **Polish (Phase 7)**: После US1–US3 (минимум); полная приёмка после US4

### User Story Dependencies

- **US1**: Foundational only
- **US2**: Foundational + US1 recommended (таблица удалена, индикаторы видны для проверки vectorize/delete)
- **US3**: Foundational + US1 (toolbar + текст); T012 связывает с US2 guards
- **US4**: US1 (классы на `.word`); независимо тестируется регрессией DnD/save

### Parallel Opportunities

- T008 ∥ T007 после T006 (разные файлы css/tsx) — T008 можно параллельно с T007 если T006 done
- T016 ∥ часть US2 logic после T010–T015
- T022 ∥ финальная проверка T021

### Within Each Story

- Foundational helpers до UI wiring
- US1: удалить таблицу → классы → стили
- US2: thumbnail + vectorize → delete handler → delete button
- US3: handler → button → status messages

---

## Parallel Example: User Story 1

```text
# После T006 (таблица удалена):
Task: "T007 Add vectorized/not-vectorized classes on .word in App.tsx"
Task: "T008 [P] Add indicator CSS in App.css"
Task: "T009 Remove obsolete table CSS in App.css"
```

---

## Parallel Example: Foundational

```text
# После T001:
Task: "T002 removeWordFromLayout in App.tsx"
Task: "T003 deleteWord fetch in App.tsx"
Task: "T004 vectorizeBatch fetch in App.tsx"
# Затем:
Task: "T005 Add isBatchVectorizing and deleteStatus state"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup (T001)
2. Phase 2 Foundational (T002–T005)
3. Phase 3 US1 (T006–T009)
4. **STOP**: quickstart §1–§2 — единый текст, индикаторы, нет таблицы

### Incremental Delivery

1. Setup + Foundational → хелперы delete/batch готовы
2. US1 → единое текстовое представление (MVP)
3. US2 → draft: миниатюра, vectorize, delete
4. US3 → batch в toolbar
5. US4 → регрессия DnD/save
6. Polish → quickstart §§1–7

### Suggested MVP scope

**US1** (T006–T009) после Foundational: оператор видит статус векторизации в тексте без таблицы. US2/US3 — следующие инкременты на том же экране.

---

## Notes

- Backend / Liquibase / новые endpoint'ы **не** входят в задачи
- Не добавлять confirm/undo для delete, overlay вектора на скан, редактирование curvePoints
- Ошибки — только `response.text()`, без ProblemDetails
- Черновик `id === 0`: без «Векторизовать» и «Удалить слово» на сервер
- Формат всех задач: checkbox + ID + опционально [P]/[USn] + путь к файлу

---

## Task Summary

| Phase | Tasks | Count |
|-------|-------|-------|
| Setup | T001 | 1 |
| Foundational | T002–T005 | 4 |
| US1 (P1) MVP | T006–T009 | 4 |
| US2 (P1) | T010–T016 | 7 |
| US3 (P1) | T017–T019 | 3 |
| US4 (P2) | T020–T021 | 2 |
| Polish | T022–T023 | 2 |
| **Total** | **T001–T023** | **23** |
