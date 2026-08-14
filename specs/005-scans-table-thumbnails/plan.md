# Implementation Plan: Таблица сканов с пагинацией и миниатюрами

**Branch**: `005-scans-table-thumbnails` | **Date**: 2026-08-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-scans-table-thumbnails/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Добавить постраничный список сканов (`GET /api/Scans?page={page}`) и миниатюру (`GET /api/Scans/{id}/thumbnail`), плюс таблицу на основном экране SPA. Размер страницы — **30**, задаётся в `ScanListOptions` по образцу `WordVectorizationOptions` (не query-параметр клиента). Выборка страницы — **метод `ScanDbService`**. Миниатюра ~200px строится на лету через уже подключённый SixLabors.ImageSharp, без записи на диск, с `Cache-Control`. Клик по строке сбрасывает редактор как при upload, затем читает слова скана; после upload таблица всегда открывает первую страницу.

## Technical Context

**Language/Version**: C# / .NET 8 (`net8.0`); TypeScript + React 19 (Vite)

**Primary Dependencies**: ASP.NET Core 8, Npgsql, `ScanDbService`, `FileStorageService`, SixLabors.ImageSharp 3.1.x, `IOptions<T>` (`WordVectorizationOptions` как образец), существующий SPA `App.tsx` / `App.css`

**Storage**: PostgreSQL — существующая таблица `scans` (только `id`, `path`); файлы сканов на диске (`Storage:ScansFolder`). Миниатюры **не** хранятся.

**Testing**: Автотестов в репозитории нет; валидация — ручные сценарии из [quickstart.md](./quickstart.md)

**Target Platform**: Windows/Linux host с Kestrel; SPA+API монолит; браузер с Vite proxy `/api`

**Project Type**: Web application (ASP.NET Core API + React Vite client)

**Performance Goals**: Страница ≤30 строк; миниатюры легче полноразмерного `/image` (большая сторона ~200px); кэш браузера для повторных просмотров той же страницы

**Constraints**: Конституция I–V; без Liquibase; без ORM; тонкий контроллер; SQL только в `ScanDbService`; plain-text ошибки; клиент не передаёт размер страницы; без удаления/поиска/даты/числа слов

**Scale/Scope**: 2 endpoint'а + Options + метод БД + Imaging-хелпер миниатюры + секция таблицы в `App.tsx`/`App.css`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Статус | Как соблюдается |
|---------|--------|-----------------|
| I. Стек и монолит SPA+API | PASS | Без смены стека; ImageSharp уже в csproj; React на том же `App.tsx` |
| II. Тонкие контроллеры, сервисы, SQL | PASS | Контроллер: валидация `page`, вызов сервисов, HTTP-маппинг. SQL списка — `ScanDbService`. Файлы — `FileStorageService`. Ресайз — Imaging, не контроллер |
| III. Карта ошибок HTTP | PASS | `page < 1` → 400 RU; нет записи → 404 «Не найдена запись в БД»; нет файла → 404 «Не найден файл»; битое изображение → 400 `ArgumentException`; невалидный `ScanList:PageSize` → 503. Тело — plain text |
| IV. Целостность домена скана/слов | PASS | Список не меняет слова. Открытие из таблицы не вызывает recognize (не `ReplaceWordsFromOcr`). Слова читаются существующим GET |
| V. Схема только через Liquibase | PASS | Новых changeset'ов нет; `scans` без новых колонок |
| Client–API Contract | PASS | Новые пути `/api/Scans…`; клиент `response.text()` при `!ok`; прокси `/api` без изменений |

**Post-design re-check**: PASS — контракты не вводят схему, ORM или ProblemDetails; `PageSize` в Options, не в query; SQL списка в `ScanDbService`.

## Project Structure

### Documentation (this feature)

```text
specs/005-scans-table-thumbnails/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
handwritingOCR.Server/
├── Controllers/ScansController.cs     # GET "" ?page= ; GET {id}/thumbnail
├── Options/ScanListOptions.cs         # NEW, образец WordVectorizationOptions
├── Models/ScanListPage.cs             # NEW: items[{id}] + totalCount
├── Services/ScanDbService.cs          # + GetScansPageAsync
├── Services/ScanThumbnailService.cs   # NEW: path/file + ресайз, исключения домена
├── Imaging/                           # ресайз ImageSharp (хелпер или внутри сервиса)
├── Program.cs                         # Configure<ScanListOptions>
└── appsettings.json                   # секция ScanList: { PageSize: 30 }

handwritingocr.client/src/
├── App.tsx                            # таблица, пагинация, open-from-row, refresh после upload
└── App.css                            # .scans-table, выделение текущей строки, миниатюры
```

**Structure Decision**: Расширение существующего монолита. Backend: Controller → `ScanDbService` / `ScanThumbnailService` → storage/ImageSharp. Frontend: тот же единственный экран, без нового роутера и state-менеджера. Liquibase не затрагивается.

## Complexity Tracking

> Нет нарушений конституции, требующих обоснования.
