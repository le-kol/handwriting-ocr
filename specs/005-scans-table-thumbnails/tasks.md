# Tasks: Таблица сканов с пагинацией и миниатюрами

**Input**: Design documents from `/specs/005-scans-table-thumbnails/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Не запрошены в spec — автотесты не включаются; приёмка по [quickstart.md](./quickstart.md)

**Organization**: Задачи сгруппированы по user stories для независимой проверки каждого инкремента.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Можно выполнять параллельно (разные файлы, нет зависимости от незавершённых задач)
- **[Story]**: User story (US1–US4)
- В описании — точные пути к файлам

## Path Conventions

Backend: `handwritingOCR.Server/`  
Клиент: `handwritingocr.client/src/`  
Миграций Liquibase для этой фичи нет

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Подтвердить brownfield-зависимости перед реализацией

- [X] T001 Confirm prerequisites: SixLabors.ImageSharp in `handwritingOCR.Server/handwritingOCR.Server.csproj`; `ScanDbService` (`InsertScanAsync`, `GetScanPathAsync`) in `handwritingOCR.Server/Services/ScanDbService.cs`; `WordVectorizationOptions` + `Configure<>` in `handwritingOCR.Server/Options/WordVectorizationOptions.cs` and `handwritingOCR.Server/Program.cs`; `GetImage` 404 texts in `handwritingOCR.Server/Controllers/ScansController.cs`; `fetchWords` in `handwritingocr.client/src/App.tsx`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Options, DTO страницы и SQL-метод списка — блокируют все user stories

**⚠️ CRITICAL**: User story phases не начинать, пока фаза не завершена

- [X] T002 [P] Add `ScanListOptions` in `handwritingOCR.Server/Options/ScanListOptions.cs` mirroring `WordVectorizationOptions`: `SectionName = "ScanList"`, `PageSize` int default **30**
- [X] T003 [P] Add `ScanListPage` (or equivalent) in `handwritingOCR.Server/Models/ScanListPage.cs`: `Items` as `{ Id }` list + `TotalCount` int per `specs/005-scans-table-thumbnails/data-model.md`
- [X] T004 Add `"ScanList": { "PageSize": 30 }` to `handwritingOCR.Server/appsettings.json`
- [X] T005 Register `builder.Services.Configure<ScanListOptions>(…GetSection(ScanListOptions.SectionName))` in `handwritingOCR.Server/Program.cs`
- [X] T006 Add `GetScansPageAsync(int page, int pageSize)` to `handwritingOCR.Server/Services/ScanDbService.cs`: one pooled connection; `SELECT COUNT(*)::int FROM scans`; `SELECT id FROM scans ORDER BY id DESC LIMIT @limit OFFSET @offset` with `offset = (page - 1) * pageSize`; return `ScanListPage`; no `page < 1` check here

**Checkpoint**: Options и SQL страницы готовы; HTTP и UI ещё нет

---

## Phase 3: User Story 1 — Таблица сканов с миниатюрами (Priority: P1) 🎯 MVP

**Goal**: Первая страница списка (id + облегчённые миниатюры), не больше 30 строк; после upload список на странице 1 обновляется

**Independent Test**: quickstart §1, §3, §4 — `GET /api/Scans?page=1` отдаёт `items`+`totalCount`; миниатюра ~200px с `Cache-Control`; в SPA таблица с thumbnail URL, не `/image`

### Implementation for User Story 1

- [X] T007 [US1] Add `GET` (no template) `?page=` to `handwritingOCR.Server/Controllers/ScansController.cs` per `specs/005-scans-table-thumbnails/contracts/scans-list.md`: inject `IOptions<ScanListOptions>`; missing `page` → 1; `page < 1` → 400 RU «Номер страницы должен быть не меньше 1»; `PageSize <= 0` → 503; else `GetScansPageAsync` → `200` JSON `{ items, totalCount }`; no SQL in controller
- [X] T008 [P] [US1] Add scoped `ScanThumbnailService` in `handwritingOCR.Server/Services/ScanThumbnailService.cs`: `GetScanPathAsync` null → `ResourceNotFoundException("Не найдена запись в БД")`; `GetFileAsync` null → `ResourceNotFoundException("Не найден файл")`; ImageSharp `Load` + `ResizeMode.Max` 200×200 (no upscale); encode as source PNG/JPEG by path extension; catch `UnknownImageFormatException`/`InvalidImageContentException` → `ArgumentException("Повреждённое или нечитаемое изображение скана.")`; register `AddScoped` in `handwritingOCR.Server/Program.cs`
- [X] T009 [US1] Add `GET {id}/thumbnail` to `handwritingOCR.Server/Controllers/ScansController.cs` per `specs/005-scans-table-thumbnails/contracts/scan-thumbnail.md`: map 404/400 like vectorize; `File(bytes, contentType)`; header `Cache-Control: public, max-age=86400`; do not write files to disk
- [X] T010 [P] [US1] Add `.scans-table` (and thumbnail cell) styles in `handwritingocr.client/src/App.css`: compact rows, img max ~200px, overflow hidden
- [X] T011 [US1] Add `SCAN_PAGE_SIZE = 30` and `fetchScansPage(page)` in `handwritingocr.client/src/App.tsx`: `GET /api/Scans?page=`; parse `{ items, totalCount }`; on `!ok` throw `Error(await response.text())`
- [X] T012 [US1] Add list state in `handwritingocr.client/src/App.tsx` (`scanItems`, `totalCount`, `listPage` starting at 1, `listError`) and load page 1 on mount
- [X] T013 [US1] Render scans table on the main screen in `handwritingocr.client/src/App.tsx`: columns thumbnail (`/api/Scans/{id}/thumbnail`, not `/image`) and id; empty DB → no rows
- [X] T014 [US1] After successful upload in `handleFileChange` in `handwritingocr.client/src/App.tsx`: set `listPage` to 1 and refetch page 1 so the new scan appears at the top

**Checkpoint**: MVP — первая страница таблицы с миниатюрами; upload обновляет список

---

## Phase 4: User Story 2 — Пагинация и ошибки списка (Priority: P1)

**Goal**: Вперёд/назад по `totalCount`; границы первой/последней страницы; сбой GET списка не затирает уже показанные строки

**Independent Test**: quickstart §2, §6, §7 — `page=0` → 400; большая page → пустые `items`; UI: next/prev; upload не с первой страницы → страница 1; обрыв API → текст ошибки, строки на месте

### Implementation for User Story 2

- [X] T015 [US2] Add «Назад» / «Вперёд» controls in `handwritingocr.client/src/App.tsx` that change `listPage` and refetch; paging MUST NOT reset `scanId` / editor
- [X] T016 [US2] Compute `lastPage = max(1, ceil(totalCount / SCAN_PAGE_SIZE))` in `handwritingocr.client/src/App.tsx`; disable «Назад» on page 1 and «Вперёд» on last page (including empty DB)
- [X] T017 [US2] On list fetch failure in `handwritingocr.client/src/App.tsx`: set RU `listError` from `error.message`; do **not** `setScanItems([])` if items were already shown; first-load failure → empty table + message
- [X] T018 [US2] Confirm upload-from-page-2+ in `handwritingocr.client/src/App.tsx` always forces `listPage = 1` and refetch (clarification A / FR-012); adjust T014 if still staying on the old page

**Checkpoint**: Пагинация и устойчивость списка к сбоям

---

## Phase 5: User Story 3 — Открытие скана из таблицы (Priority: P1)

**Goal**: Клик по строке сбрасывает редактор как upload, загружает слова выбранного скана (без recognize), выделяет строку текущего `scanId`

**Independent Test**: quickstart §5 — скан A с словами → клик B → редактор B, слова A нет, слова B загружены (или пусто); строка B с классом текущей; recognize не стартует

### Implementation for User Story 3

- [X] T019 [US3] Extract shared editor reset from `handleFileChange` into a helper in `handwritingocr.client/src/App.tsx` (same fields: words, layout, draft, statuses, imageSize, drag, vectorize/delete flags); `handleFileChange` must still call it
- [X] T020 [US3] Implement row-click handler in `handwritingocr.client/src/App.tsx`: call reset helper; `setScanId(id)`; `fetchWords(id)` then `setWords` + `syncLayoutFromWords`; do **not** call recognize; on words error show RU text and keep previous-scan data cleared
- [X] T021 [US3] Apply current-row class on the table row when `item.id === scanId` in `handwritingocr.client/src/App.tsx`; no highlight if current scan is absent from the page or `scanId` is null
- [X] T022 [P] [US3] Add distinguishable `.scans-table tr.current` (or equivalent) styles in `handwritingocr.client/src/App.css`

**Checkpoint**: Переключение сканов из таблицы без утечки состояния и без авто-OCR

---

## Phase 6: User Story 4 — Ошибки миниатюр без поломки таблицы (Priority: P2)

**Goal**: Отсутствующий/битый файл даёт 404/400 по карте векторизации; строка таблицы остаётся, ячейка картинки — placeholder

**Independent Test**: quickstart §8 — строка с отсутствующим файлом: id виден, миниатюра пустая, остальные строки в порядке; HTTP «Не найден файл»

### Implementation for User Story 4

- [X] T023 [US4] Handle thumbnail `onError` in the table `<img>` in `handwritingocr.client/src/App.tsx` so the cell becomes empty/placeholder and the row (id) stays visible
- [X] T024 [US4] Verify `GET …/thumbnail` in `handwritingOCR.Server/Controllers/ScansController.cs` + `ScanThumbnailService.cs` matches `specs/005-scans-table-thumbnails/contracts/scan-thumbnail.md` (404 «Не найдена запись в БД» / «Не найден файл»; 400 corrupt message); fix gaps only

**Checkpoint**: Повреждённая миниатюра не валит список

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Согласованность контракта и ручная приёмка

- [X] T025 [P] Review RU strings (page validation, listError, words-open error) in `handwritingOCR.Server/Controllers/ScansController.cs` and `handwritingocr.client/src/App.tsx` against existing App/controller messages
- [X] T026 Confirm table cells never use `/image` and no new Liquibase changeset exists under `liquibase/`; thumbnail files are not written under `Storage:ScansFolder`
- [X] T027 Run manual validation scenarios from `specs/005-scans-table-thumbnails/quickstart.md` §§1–8 against running SPA+API

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Нет зависимостей
- **Foundational (Phase 2)**: После T001 — **блокирует** все user stories
- **US1 (Phase 3)**: После Foundational — MVP (список + миниатюры + таблица)
- **US2 (Phase 4)**: После US1 (нужны `listPage` / `totalCount` / таблица)
- **US3 (Phase 5)**: После US1 (нужны строки); US2 желателен, но клик работает и на одной странице
- **US4 (Phase 6)**: После US1 (нужны `<img>` миниатюр и thumbnail endpoint)
- **Polish (Phase 7)**: После US1–US3 минимум; полная приёмка после US4

### User Story Dependencies

- **US1**: Foundational only — независимо тестируется первой страницей
- **US2**: US1 (пагинация поверх таблицы)
- **US3**: US1 (клик по строке); highlight не зависит от US2
- **US4**: US1 (endpoint + img); UI `onError` независим от US2/US3

### Parallel Opportunities

- T002 ∥ T003 (разные новые файлы)
- T008 ∥ T007 после Foundational (сервис vs контроллер списка); T010 ∥ backend US1
- T022 ∥ T021 (css vs className в tsx) после договорённости об имени класса
- T025 ∥ подготовка к T027

### Within Each Story

- Models/Options → SQL → HTTP → client fetch → UI
- US1: list GET → thumbnail service/GET → table
- US2: buttons → lastPage/disabled → error preserve → upload jump
- US3: extract reset → row click + words → highlight
- US4: img onError → verify HTTP map

---

## Parallel Example: Foundational

```text
Task: "T002 ScanListOptions in Options/ScanListOptions.cs"
Task: "T003 ScanListPage in Models/ScanListPage.cs"
# Затем:
Task: "T004 appsettings.json ScanList"
Task: "T005 Program.cs Configure"
Task: "T006 GetScansPageAsync in ScanDbService.cs"
```

---

## Parallel Example: User Story 1

```text
# После Foundational:
Task: "T007 GET /api/Scans in ScansController.cs"
Task: "T008 [P] ScanThumbnailService.cs + DI"
Task: "T010 [P] .scans-table in App.css"
# Затем T009 (thumbnail route, тот же контроллер что T007):
Task: "T009 GET {id}/thumbnail in ScansController.cs"
# Клиент после T007:
Task: "T011 fetchScansPage → T012 state/mount → T013 table → T014 upload refresh"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup (T001)
2. Phase 2 Foundational (T002–T006)
3. Phase 3 US1 (T007–T014)
4. **STOP and VALIDATE**: quickstart §1, §3, §4
5. Демо: таблица первой страницы с миниатюрами

### Incremental Delivery

1. Setup + Foundational → SQL и Options
2. US1 → таблица MVP
3. US2 → пагинация и устойчивость ошибок списка
4. US3 → открытие скана из строки
5. US4 → битые миниатюры
6. Polish → полный quickstart §§1–8

### Parallel Team Strategy

1. Вместе: T001–T006
2. Dev A: T007 (list HTTP)
3. Dev B: T008–T009 (thumbnail)
4. Dev C: T010–T014 (таблица)
5. Далее US2 → US3 → US4 последовательно на `App.tsx` (один файл — не параллелить без конфликтов)

---

## Notes

- Новых Liquibase changeset'ов нет
- Клиент не передаёт `pageSize`; константа 30 в Options и `SCAN_PAGE_SIZE`
- Список — только метод `ScanDbService.GetScansPageAsync`
- Миниатюры не сохраняются на диск
- Автотесты не входят в объём
- `[P]` = разные файлы без ожидания незавершённых задач
- Коммитить после задачи или логической группы по желанию пользователя
