# Implementation Plan: Удаление скана

**Branch**: `006-delete-scan` | **Date**: 2026-08-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-delete-scan/spec.md`. Дополнение плана: `ScanDbService.DeleteScanAsync` (параметризованный SQL); удаление файла — метод `FileStorageService`; контроллер без SQL. Клиент: один `handleDeleteScan(id)` для обеих кнопок; при удалении текущего скана — `clearToEmptyState()` (полный сброс: `scanId`, upload, file input + `resetEditorState()`), без дублирования setter'ов. Без soft-delete и confirm-диалогов.

## Summary

Добавить `DELETE /api/Scans/{id}`: удаление строки `scans` (слова — `ON DELETE CASCADE`), затем файла на диске через `FileStorageService`. Успех — **204 No Content**; нет записи — **404** «Не найдена запись в БД»; отсутствующий файл не блокирует 204. На клиенте — кнопка «Удалить скан» в панели редактора и «Удалить» в строке таблицы; обе вызывают один обработчик с `id`. После удаления текущего открытого скана — **`clearToEmptyState()`** (полный сброс до «до загрузки»: `scanId`, upload, file input, `resetEditorState`). После удаления из таблицы — перезапрос текущей страницы списка; пустая страница N > 1 → переход на N − 1. Liquibase не меняется.

## Technical Context

**Language/Version**: C# / .NET 8 (`net8.0`); TypeScript + React 19 (Vite)

**Primary Dependencies**: ASP.NET Core 8, Npgsql, существующие `ScanDbService`, `FileStorageService`, `ScansController`; SPA `App.tsx` / `App.css`; постраничный список из фичи `005-scans-table-thumbnails` (`fetchScansPageWithRetry`, `loadScansPage`, `listPage`)

**Storage**: PostgreSQL — таблицы `scans`, `words` (FK `on delete cascade`, уже в `liquibase/changelog.sql`); файлы сканов на диске (`Storage:ScansFolder`). Hard delete, без флагов удаления.

**Testing**: Автотестов в репозитории нет; валидация — ручные сценарии из [quickstart.md](./quickstart.md)

**Target Platform**: Windows/Linux host с Kestrel; SPA+API монолит; браузер с Vite proxy `/api`

**Project Type**: Web application (ASP.NET Core API + React Vite client)

**Performance Goals**: Одиночное удаление по клику; ответ API без тела; обновление таблицы — один GET текущей страницы

**Constraints**: Конституция I–V; без Liquibase; без ORM; SQL только в `ScanDbService`; plain-text ошибки; без confirm-диалогов; без soft-delete; контроллер оркестрирует сервисы, не пишет SQL; клиент не дублирует логику сброса редактора

**Scale/Scope**: 1 endpoint + 2 метода сервисов + UI (2 кнопки, 1 обработчик, опционально `deleteScanStatus` / guard in-flight)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Статус | Как соблюдается |
|---------|--------|-----------------|
| I. Стек и монолит SPA+API | PASS | Без смены стека; тот же `ScansController` и `App.tsx` |
| II. Тонкие контроллеры, сервисы, SQL | PASS | `DELETE` в контроллере: `DeleteScanAsync` (`RETURNING path`) → `DeleteFileIfExistsAsync`. SQL DELETE — только `ScanDbService`. Файл — `FileStorageService` |
| III. Карта ошибок HTTP | PASS | Нет записи → 404 «Не найдена запись в БД»; успех → 204 NoContent; тело ошибки plain text. Отсутствие файла не → 500 |
| IV. Целостность домена скана/слов | PASS | Слова удаляются каскадом FK; отдельный DELETE по `words` не вызывается. Hard delete записи и файла |
| V. Схема только через Liquibase | PASS | Новых changeset'ов нет; используется существующий `on delete cascade` |
| Client–API Contract | PASS | `DELETE /api/Scans/{id}`; клиент `response.text()` при `!ok`; полный сброс через `clearToEmptyState()` |

**Post-design re-check**: PASS — контракты не вводят схему, soft-delete, ProblemDetails или SQL в контроллере.

## Project Structure

### Documentation (this feature)

```text
specs/006-delete-scan/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1
│   ├── delete-scan.md
│   └── delete-scan-ui.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
handwritingOCR.Server/
├── Controllers/ScansController.cs       # + DELETE {id}
├── Services/ScanDbService.cs            # + DeleteScanAsync(int id) → string? (RETURNING path)
└── Services/FileStorageService.cs     # + DeleteFileIfExistsAsync(string path)

handwritingocr.client/src/
├── App.tsx                              # deleteScan(); handleDeleteScan(id);
│                                        # clearToEmptyState(); resetEditorState расширен;
│                                        # кнопки «Удалить скан» / «Удалить» в строке
└── App.css                              # при необходимости — колонка/кнопка в таблице
```

**Structure Decision**: Расширение brownfield-монолита. Оркестрация удаления в контроллере (2 вызова сервисов: `DeleteScanAsync` + `DeleteFileIfExistsAsync`). Отдельный `ScanDeleteService` не вводится — объём операции не оправдывает новый scoped-сервис. Frontend: один обработчик; различие «из редактора» vs «из таблицы» — только пост-обработка (сброс редактора vs refresh списка).

## Complexity Tracking

> Нет нарушений конституции, требующих обоснования.
