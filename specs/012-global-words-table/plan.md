# Implementation Plan: Глобальная таблица слов и экспорт датасета

**Branch**: `012-global-words-table` | **Date**: 2026-08-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-global-words-table/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Добавить экран «Слова» с глобальной таблицей всех слов (поиск, фильтры по векторизации и скану, серверная пагинация, миниатюры `WordCurveThumbnail`) и двумя кнопками клиентского экспорта JSONL. Backend: один read-only endpoint `GET /api/Words` с query `page`, `search`, `vectorized`, `scanId`; SQL в `WordDbService.GetWordsPageAsync`; размер страницы — `ScanListOptions.PageSize` (30). Навигация: два экрана «Сканы» / «Слова» (кнопки; по умолчанию «Сканы»); клик по строке → редактор скана с выбранным словом. Без изменений схемы БД и мутационных API.

## Technical Context

**Language/Version**: C# / .NET 8 (`net8.0`); TypeScript + React 19 (Vite)

**Primary Dependencies**: ASP.NET Core 8, Npgsql, `WordDbService`, `ScanDbService`, `IOptions<ScanListOptions>`, существующие `App.tsx`, `WordCurveThumbnail`, `curvePoints.ts` (`isWordVectorized`, `filterValidCurves`)

**Storage**: PostgreSQL — таблица `words` (read-only для фичи); без Liquibase changeset'ов

**Testing**: Автотестов в репозитории нет; валидация — [quickstart.md](./quickstart.md)

**Target Platform**: Windows/Linux host с Kestrel; SPA+API монолит; Vite proxy `/api`

**Project Type**: Web application (ASP.NET Core API + React Vite client)

**Performance Goals**: Страница ≤30 слов; переключение страницы — интерактивно (секунды); экспорт тысяч слов не блокирует таблицу (только кнопка экспорта)

**Constraints**: Конституция I–V; без ORM; тонкий контроллер; plain-text ошибки; клиент не передаёт `pageSize`; сортировка фиксирована `scanId ASC, orderIndex ASC`; экспорт только на клиенте

**Scale/Scope**: 1 новый controller + 1 метод БД + 1 модель ответа + 2–3 клиентских файла + правки `App.tsx`/`App.css`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Статус | Как соблюдается |
|---------|--------|-----------------|
| I. Стек и монолит SPA+API | PASS | Без смены стека; React в том же Vite-клиенте; новый API под `/api` |
| II. Тонкие контроллеры, сервисы, SQL | PASS | `WordsController`: валидация query → `WordDbService.GetWordsPageAsync` → JSON. SQL только в сервисе |
| III. Карта ошибок HTTP | PASS | `page < 1` → 400 RU; невалидный `vectorized` → 400 RU; `PageSize <= 0` → 503. Тело — plain text |
| IV. Целостность домена скана/слов | PASS | Только read; `order_index`/`line_index` не меняются; формат `Word` тот же |
| V. Схема только через Liquibase | PASS | Без changeset'ов |
| Client–API Contract | PASS | `Word` camelCase; `response.text()` при `!ok`; прокси `/api` без изменений |

**Post-design re-check**: PASS — контракты не вводят схему, ORM или ProblemDetails; `PageSize` из `ScanListOptions`; SQL в `WordDbService`; экспорт без server-side upload.

## Project Structure

### Documentation (this feature)

```text
specs/012-global-words-table/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1
│   ├── words-list-api.md
│   ├── words-table-ui.md
│   └── dataset-export.md
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
handwritingOCR.Server/
├── Controllers/WordsController.cs       # NEW: GET /api/Words
├── Models/WordListPage.cs               # NEW: items + totalCount
├── Services/WordDbService.cs            # + GetWordsPageAsync
└── (ScanListOptions — без изменений, переиспользуется)

handwritingocr.client/src/
├── App.tsx                              # appView, nav «Сканы»/«Слова», open word from table
├── App.css                              # nav + words table styles
├── WordsTableScreen.tsx                 # NEW: таблица, фильтры, пагинация, export buttons
├── exportWordsDataset.ts                # NEW: fetch all pages, JSONL, Blob download
├── WordCurveThumbnail.tsx               # reuse
└── curvePoints.ts                       # reuse isWordVectorized, filterValidCurves
```

**Structure Decision**: Расширение монолита. Backend: `WordsController` → `WordDbService`. Frontend: новый экран в отдельном компоненте, навигация в `App.tsx` без React Router. Liquibase не затрагивается.

## Complexity Tracking

> Нет нарушений конституции, требующих обоснования.

## Phase 0 & Phase 1 Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Research | [research.md](./research.md) | Complete |
| Data model | [data-model.md](./data-model.md) | Complete |
| API contract | [contracts/words-list-api.md](./contracts/words-list-api.md) | Complete |
| UI contract | [contracts/words-table-ui.md](./contracts/words-table-ui.md) | Complete |
| Export contract | [contracts/dataset-export.md](./contracts/dataset-export.md) | Complete |
| Quickstart | [quickstart.md](./quickstart.md) | Complete |

## Implementation Notes (for /speckit-tasks)

1. **WordDbService.GetWordsPageAsync**: динамический WHERE; `EscapeLikePattern` для search; COUNT + SELECT с ORDER BY `scan_id, order_index`.
2. **WordsController**: inject `WordDbService`, `IOptions<ScanListOptions>`; map `vectorized` string → enum/filter.
3. **WordsTableScreen**: state `page`, `search`, `vectorizedFilter`, `scanIdFilter`; debounced search; `totalCount` для пагинации и disabled export.
4. **openWordFromTable(scanId, wordId)**: reuse `handleScanRowClick` + `selectWord` after words loaded (generation guard как в существующем коде).
5. **exportWordsDataset**: loop pages until `items.length === 0` or page > lastPage; snapshot filters for filtered export on click.
