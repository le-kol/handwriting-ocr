# Tasks: Удаление скана

**Input**: Design documents from `/specs/006-delete-scan/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Не запрошены в spec — автотесты не включаются; приёмка по [quickstart.md](./quickstart.md)

**Organization**: Задачи сгруппированы по user stories для независимой проверки каждого инкремента.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Можно выполнять параллельно (разные файлы, нет зависимости от незавершённых задач)
- **[Story]**: User story (US1–US3)
- В описании — точные пути к файлам

## Path Conventions

Backend: `handwritingOCR.Server/`  
Клиент: `handwritingocr.client/src/`  
Миграций Liquibase для этой фичи нет

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Подтвердить brownfield-зависимости перед реализацией

- [X] T001 Confirm prerequisites: `ON DELETE CASCADE` on `words.scan_id` in `liquibase/changelog.sql`; `ScanDbService` (`GetScanPathAsync`, `InsertScanAsync`) in `handwritingOCR.Server/Services/ScanDbService.cs`; `FileStorageService` in `handwritingOCR.Server/Services/FileStorageService.cs`; `DELETE …/words/{wordId}` → `204 NoContent` in `handwritingOCR.Server/Controllers/ScansController.cs`; `resetEditorState()` and `loadScansPage` / `fetchScansPageWithRetry` in `handwritingocr.client/src/App.tsx` (фича `005-scans-table-thumbnails`)

---

## Phase 2: Foundational — Серверное удаление (User Story 3, Priority: P1)

**Purpose**: `DELETE /api/Scans/{id}` — блокирует UI user stories US1 и US2

**⚠️ CRITICAL**: Фазы US1/US2 не начинать, пока backend не отдаёт 204/404 по контракту

**Goal (US3)**: Hard delete записи и файла; слова каскадом; отсутствие файла не → 500

**Independent Test**: quickstart §1–§3 — `DELETE` существующего id → 204; повторный GET image/words → 404; несуществующий id → 404 «Не найдена запись в БД»; запись есть, файл на диске удалён вручную → 204

- [X] T002 [P] [US3] Add `DeleteScanAsync(int id)` → `Task<string?>` in `handwritingOCR.Server/Services/ScanDbService.cs`: `DELETE FROM scans WHERE id = @id RETURNING path`; parameterized `@id`; return `path` or `null`; one pooled connection (`await using`); no separate DELETE on `words`
- [X] T003 [P] [US3] Add `DeleteFileIfExistsAsync(string path)` in `handwritingOCR.Server/Services/FileStorageService.cs`: if `!File.Exists(path)` return without error; else `File.Delete(path)`; do not throw for missing file
- [X] T004 [US3] Add `DELETE {id}` to `handwritingOCR.Server/Controllers/ScansController.cs` per `specs/006-delete-scan/contracts/delete-scan.md`: `path = await DeleteScanAsync(id)` → `null` → `404` plain text «Не найдена запись в БД»; `await DeleteFileIfExistsAsync(path)`; `204 NoContent()`; no SQL in controller

**Checkpoint**: Backend удаления готов; можно проверять curl/Swagger до UI

---

## Phase 3: User Story 1 — Удаление текущего скана из редактора (Priority: P1) 🎯 MVP

**Goal**: Кнопка «Удалить скан» без confirm; после 204 — пустой редактор (`scanId` null, `resetEditorState`)

**Independent Test**: quickstart §4 — открытый скан с словами/черновиком → «Удалить скан» → редактор пуст; ошибка сети → скан остаётся открытым

### Implementation for User Story 1

- [X] T005 [US1] Extend `resetEditorState()` in `handwritingocr.client/src/App.tsx`: also clear `isRecognizing`, `isSaving`, `isSavingLayout`, `wordsOpenError` (do **not** put `scanId` / upload fields here). Add `clearToEmptyState()` per `specs/006-delete-scan/contracts/delete-scan-ui.md`: `setScanId(null)`, `setSelectedFile(null)`, `setUploadStatus(null)`, then `resetEditorState()`; ref on file `<input type="file">` → `value = ""` for full FR-008 empty state
- [X] T006 [P] [US1] Add `deleteScan(id: number): Promise<void>` in `handwritingocr.client/src/App.tsx`: `DELETE /api/Scans/{id}`; success only on `204`; on `!ok` throw `Error(await response.text())`
- [X] T007 [US1] Add `isDeletingScan` state and `handleDeleteScan(id: number, options?: { refreshList?: boolean })` in `handwritingocr.client/src/App.tsx`: guard in-flight (`isDeletingScan`, recognize/batch/vectorize); `deleteScanStatus` on error (RU text, no UI reset on failure); on success if `id === scanId` → **`clearToEmptyState()`** (full reset incl. upload UI); if `options.refreshList` → defer list logic to US2 (T009); disable buttons while deleting
- [X] T008 [US1] Add «Удалить скан» button in `handwritingocr.client/src/App.tsx` `.workspace-side` next to «Распознать текст» and «Добавить слово»: render only when `scanId !== null`; `onClick={() => handleDeleteScan(scanId!)}` without confirm; disabled when `isDeletingScan` or recognize/batch/vectorize in progress; show `deleteScanStatus` near actions

**Checkpoint**: MVP — удаление открытого скана из редактора end-to-end (таблица может показывать устаревшую строку до листания — по spec)

---

## Phase 4: User Story 2 — Удаление скана из строки таблицы (Priority: P1)

**Goal**: Кнопка «Удалить» в каждой строке; refresh текущей страницы; пустая страница N > 1 → N − 1; сброс редактора только если удалён текущий `scanId`

**Independent Test**: quickstart §5–§7, §10 — удалить B при открытом A → редактор на A; удалить A из строки → редактор пуст; последний скан на стр. 2 → показ стр. 1; клик «Удалить» не открывает скан

### Implementation for User Story 2

- [X] T009 [US2] Complete list refresh in `handleDeleteScan` in `handwritingocr.client/src/App.tsx` when `options.refreshList === true`: after 204 call `fetchScansPageWithRetry(listPage)` (or `loadScansPage` with callback); if `items.length === 0` and `listPage > 1` → `setListPage(listPage - 1)`; if `id !== scanId` do not change editor state
- [X] T010 [US2] Add «Удалить» button per row in `handwritingocr.client/src/App.tsx` `.scans-table`: `onClick` with `e.stopPropagation()` then `handleDeleteScan(item.id, { refreshList: true })`; disabled when `isDeletingScan` or same in-flight guards as editor button
- [X] T011 [P] [US2] Add table delete column/cell styles in `handwritingocr.client/src/App.css` if needed (compact action column; button does not trigger row hover as link)

**Checkpoint**: Оба пути удаления работают через один `handleDeleteScan`; таблица актуальна после delete из строки

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Контракт, регрессии, полный quickstart

- [X] T012 Verify `DELETE {id}` in `handwritingOCR.Server/Controllers/ScansController.cs` + services match `specs/006-delete-scan/contracts/delete-scan.md` (`RETURNING path`, 404 text, 204, missing file on disk); fix gaps only
- [X] T013 Verify client flows in `handwritingocr.client/src/App.tsx` match `specs/006-delete-scan/contracts/delete-scan-ui.md` (single handler, no confirm, `clearToEmptyState` on current scan delete incl. upload UI, stopPropagation, 404 on double-click shows error without false success)
- [X] T014 Run manual scenarios in `specs/006-delete-scan/quickstart.md` (§1–§10); note any failures
- [X] T015 [P] Regression smoke: `GET /api/Scans?page=1`, `POST /api/Scans/upload`, `DELETE /api/Scans/{id}/words/{wordId}` still behave per prior features after scan delete shipped

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Старт сразу
- **Foundational / US3 (Phase 2)**: После T001 — **блокирует** US1 и US2
- **US1 (Phase 3)**: После Phase 2 — MVP клиента (редактор)
- **US2 (Phase 4)**: После T007 (нужен `handleDeleteScan`) — таблица
- **Polish (Phase 5)**: После US1 + US2

### User Story Dependencies

- **US3 (backend)**: Phase 2 — без зависимостей от других stories
- **US1**: Зависит от US3 (API); не зависит от US2
- **US2**: Зависит от US3 и T007 (`handleDeleteScan`); independently testable после US1 checkpoint с mock или ручным DELETE

### Within Each User Story

- Services (`T002`, `T003`) параллельно → controller `T004`
- `resetEditorState` / `deleteScan` → `handleDeleteScan` → кнопки
- US2 list refresh дополняет handler, не дублирует delete HTTP

### Parallel Opportunities

```text
Phase 2: T002 ∥ T003  (ScanDbService ∥ FileStorageService)
Phase 3: T006 ∥ (after T005) — deleteScan helper parallel to CSS if any
Phase 4: T011 ∥ T010 only if T010 markup done first — prefer T010 then T011
Phase 5: T015 ∥ часть ручных проверок T014
```

---

## Parallel Example: Foundational (US3)

```bash
# Backend services in parallel:
Task: "T002 DeleteScanAsync RETURNING path in ScanDbService.cs"
Task: "T003 DeleteFileIfExistsAsync in FileStorageService.cs"
# Then sequentially:
Task: "T004 DELETE {id} in ScansController.cs"
```

---

## Parallel Example: User Story 1

```bash
Task: "T006 deleteScan() fetch helper in App.tsx"
# After T005–T007:
Task: "T008 «Удалить скан» button in App.tsx"
```

---

## Implementation Strategy

### MVP First (US3 backend + US1 editor)

1. Phase 1: T001  
2. Phase 2: T002–T004 → проверить quickstart §1–§3  
3. Phase 3: T005–T008 → проверить quickstart §4  
4. **STOP**: MVP — удаление из редактора

### Incremental Delivery

1. Foundational (US3) → API готов  
2. US1 → удаление из редактора  
3. US2 → удаление из таблицы + pagination edge case  
4. Polish → quickstart + regression

### Suggested MVP Scope

**US3 (Phase 2) + US1 (Phase 3)** — минимальная ценность: оператор удаляет открытый скан одним кликом.

---

## Notes

- Soft-delete, confirm-диалоги, массовое удаление, undo — **не** реализовывать (FR-015).
- После delete из редактора таблицу **не** обязательно refresh (spec path 1 / delete-scan-ui.md).
- `DeleteScanAsync` MUST use `RETURNING path`, not отдельный `GetScanPathAsync` перед DELETE (research §1, §3).
- Не дублировать сброс редактора: при удалении текущего скана — **`clearToEmptyState()`** (`scanId`, upload, file input ref + `resetEditorState()`), не отдельный блок setter'ов.
