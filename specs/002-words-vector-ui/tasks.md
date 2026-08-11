# Tasks: Отображение и векторизация слов на клиенте

**Input**: Design documents from `/specs/002-words-vector-ui/`

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

**Purpose**: Модули-заготовки под геометрию кривых и миниатюру без бизнес-UI

- [X] T001 Create `handwritingocr.client/src/curvePoints.ts` with exported types/helpers stubs: `CurvePoints`, `isWordVectorized`, `filterValidCurves` (empty implementations / TODO bodies ok)
- [X] T002 [P] Create stub component `handwritingocr.client/src/WordCurveThumbnail.tsx` that accepts `curvePoints` prop and returns `null` (or empty placeholder `<svg>`)
- [X] T003 [P] Add CSS placeholders for words table / thumbnail cell in `handwritingocr.client/src/App.css` (e.g. `.words-table`, `.word-curve-thumb`) without wiring into JSX yet

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Клиентский контракт Word + разбор `curvePoints` из GET — блокирует все user stories

**⚠️ CRITICAL**: User story phases не начинать, пока фаза не завершена

- [X] T004 Extend `Word` interface in `handwritingocr.client/src/App.tsx` with optional `curvePoints?: number[][][] | null` per `specs/002-words-vector-ui/contracts/words-list-ui.md` and `data-model.md`
- [X] T005 Implement validation helpers in `handwritingocr.client/src/curvePoints.ts`: treat vectorized iff non-empty array after filtering curves with exactly 4 points × 2 finite numbers; export `isWordVectorized(word)` / `filterValidCurves(curvePoints)`
- [X] T006 Confirm `fetchWords` in `handwritingocr.client/src/App.tsx` keeps full JSON Word objects (including `curvePoints` when present) without stripping unknown fields; fix typing/`JSON.parse` path if anything drops the field

**Checkpoint**: После `GET …/words` в state есть `curvePoints`; статус векторизации вычислим без UI таблицы

---

## Phase 3: User Story 1 — Просмотр слов со статусом векторизации (Priority: P1) 🎯 MVP

**Goal**: Таблица/список слов выбранного скана с текстом и статусом «Векторизовано» / «Не векторизовано»

**Independent Test**: Открыть скан с словами (часть с `curvePoints`, часть без) → в секции «Слова скана» видны все слова, корректные статусы; смена скана обновляет список (quickstart §1, §6)

### Implementation for User Story 1

- [X] T007 [US1] Add section «Слова скана» in `handwritingocr.client/src/App.tsx`: show loading / empty («Нет слов») / error states based on `words` and existing fetch flow when `scanId` is set
- [X] T008 [US1] Render HTML table (or equivalent columnar list) of current `words` in `handwritingocr.client/src/App.tsx` with columns Текст | Статус | Миниатюра | Действие; status via `isWordVectorized` from `curvePoints.ts` (RU labels); Миниатюра/Действие may be «—» until US2/US3
- [X] T009 [US1] Style the words table in `handwritingocr.client/src/App.css` so it is visually separate from the scan image overlay (no absolute positioning over the scan `<img>`)
- [X] T010 [US1] Ensure switching/clearing scan clears or replaces the words table consistently with existing `setWords(null)` reset paths in `handwritingocr.client/src/App.tsx` (no ghost rows from previous scan)

**Checkpoint**: MVP — оператор видит слова и статусы без ручного API

---

## Phase 4: User Story 2 — Миниатюра вектора в собственной СК (Priority: P1)

**Goal**: Для векторизованных слов — SVG-миниатюра по `curvePoints` в bbox фрагмента, не поверх скана

**Independent Test**: У слова с `curvePoints` в колонке миниатюры видна форма штрихов; path не совпадает с рамкой на скане; невалидные данные не роняют страницу (quickstart §3)

### Implementation for User Story 2

- [X] T011 [P] [US2] Implement bbox + SVG path `d` builders in `handwritingocr.client/src/curvePoints.ts` (min/max over control points of valid curves; padding; cubic `M`/`C` segments; guard zero-size bbox)
- [X] T012 [US2] Implement `WordCurveThumbnail` in `handwritingocr.client/src/WordCurveThumbnail.tsx`: render `<svg viewBox={bbox}>` with paths; return null/placeholder if no valid curves; fixed CSS size via `App.css` class
- [X] T013 [US2] Wire `WordCurveThumbnail` into the Миниатюра column in `handwritingocr.client/src/App.tsx` only when `isWordVectorized(word)`; never draw these paths on the scan overlay SVG
- [X] T014 [US2] Harden thumbnail styles in `handwritingocr.client/src/App.css` (compact cell, overflow hidden, distinct from scan overlay) so FR-005/FR-006 stay obvious in UI

**Checkpoint**: Миниатюры читаемы и отделены от изображения скана

---

## Phase 5: User Story 3 — Кнопка «Векторизовать» (Priority: P1)

**Goal**: Запуск существующего `POST …/vectorize`, блокировка кнопки на время запроса, точечное обновление слова / показ plain-text ошибки без порчи UI

**Independent Test**: Кнопка у слова с `id > 0` → успех обновляет статус и миниатюру; повторная замена; ошибка показывает RU-текст и сохраняет прежнее превью; `id === 0` без vectorize (quickstart §2, §4, §5)

### Implementation for User Story 3

- [X] T015 [US3] Add UI state in `handwritingocr.client/src/App.tsx`: `vectorizingWordId` (`number | null`) and `vectorizeStatus` / error string (`string | null`)
- [X] T016 [US3] Implement `vectorizeWord(scanId, wordId)` fetch helper in `handwritingocr.client/src/App.tsx` (or small adjacent module): `POST /api/Scans/{scanId}/words/{wordId}/vectorize`, no body; on `!ok` throw/return `await response.text()`; on ok parse JSON `Word`
- [X] T017 [US3] On success, replace the matching word in `words` by `id` with response payload (including `curvePoints`); sync the same `curvePoints` onto the matching word object inside `layoutLines` without resetting line order
- [X] T018 [US3] On failure, set RU error message for the operator and do **not** clear existing `curvePoints` / thumbnail state for that word in `handwritingocr.client/src/App.tsx`
- [X] T019 [US3] Render «Векторизовать» button in the Действие column of the words table in `handwritingocr.client/src/App.tsx`: hidden or disabled for `id === 0`; `disabled` while `vectorizingWordId === word.id`; wire click to T016–T018

**Checkpoint**: Полный цикл просмотр → векторизация → обновление превью на клиенте

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Согласованность UX и приёмка по quickstart

- [X] T020 [P] Review RU copy (статусы, кнопка, пустой список, ошибки) in `handwritingocr.client/src/App.tsx` for consistency with existing App messages
- [X] T021 Verify no vector paths are drawn on the scan image overlay in `handwritingocr.client/src/App.tsx` (scope: no overlay / no batch / no curve edit UI)
- [X] T022 Run manual validation scenarios from `specs/002-words-vector-ui/quickstart.md` §§1–6 against running SPA+API

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Нет зависимостей — стартовать сразу
- **Foundational (Phase 2)**: После Setup — **блокирует** все user stories
- **US1 (Phase 3)**: После Foundational — MVP
- **US2 (Phase 4)**: После Foundational; практически после колонки миниатюры из US1 (T008), иначе некуда встраивать превью
- **US3 (Phase 5)**: После Foundational; кнопка в таблице US1 (T008); выигрывает от US2 для видимого обновления миниатюры, но статус «Векторизовано» проверяем и без превью
- **Polish (Phase 6)**: После нужных user stories

### User Story Dependencies

- **US1**: Только Foundational
- **US2**: Foundational + место в таблице (US1 T008); независимо тестируется на словах, у которых `curvePoints` уже в БД
- **US3**: Foundational + таблица (US1); миниатюра (US2) усиливает демо, но не блокирует контракт кнопки/ошибок

### Parallel Opportunities

- T001 ∥ T002 ∥ T003 (Setup)
- T011 ∥ подготовка стилей T014 после T012 (частично)
- T020 ∥ T021 в Polish

### Within Each Story

- Хелперы/компонент до встраивания в `App.tsx`
- State/fetch до кнопки
- Успех и ошибка vectorize до финальной проводки UI

---

## Parallel Example: User Story 2

```text
# После T008 (колонка миниатюры существует):
Task: "T011 Implement bbox + path d in handwritingocr.client/src/curvePoints.ts"
# Затем:
Task: "T012 Implement WordCurveThumbnail.tsx"
Task: "T013 Wire thumbnail into App.tsx Миниатюра column"
```

---

## Parallel Example: Setup

```text
Task: "T001 Create curvePoints.ts stubs"
Task: "T002 Create WordCurveThumbnail.tsx stub"
Task: "T003 Add App.css placeholders"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup
2. Phase 2 Foundational
3. Phase 3 US1 — таблица + статусы
4. **STOP**: проверить quickstart §1 / §6
5. Далее US2 → US3 → Polish

### Incremental Delivery

1. Setup + Foundational → тип Word и хелперы готовы
2. US1 → демо статусов (MVP)
3. US2 → демо миниатюр на уже векторизованных словах (через API 001)
4. US3 → полный UI-цикл vectorize
5. Polish → quickstart §§1–6

### Suggested MVP scope

Только **US1** (T007–T010): список слов и статусы. US2/US3 — следующие инкременты на том же экране.

---

## Notes

- Backend / Liquibase / новые endpoint'ы **не** входят в задачи
- Не добавлять batch-векторизацию, редактирование кривых, overlay на скан
- Ошибки vectorize — только `response.text()`, без ProblemDetails
- Черновик `id === 0` не векторизуется
- Формат всех задач: checkbox + ID + опционально [P]/[USn] + путь к файлу
