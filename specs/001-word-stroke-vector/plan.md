# Implementation Plan: Векторизация штрихов слова

**Branch**: `001-word-stroke-vector` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-word-stroke-vector/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Добавить серверный запрос векторизации существующего слова: по Id слова извлечь выровненный (с учётом повёрнутой рамки и конфигурируемого отступа) фрагмент изображения скана, аппроксимировать осевые линии штрихов кубическими кривыми Безье с настраиваемой погрешностью и сохранить результат в nullable-колонку `curve_points` (`real[]`, логически `[кривая][точка 0..3][x|y]`) таблицы `words` через новый Liquibase changeset — без отдельной таблицы. Подход: тонкий endpoint в `ScansController`, оркестрация в scoped-сервисе векторизации, I/O файлов через `FileStorageService`, мутация — через `WordDbService` с явной транзакцией; обработка изображения — managed-библиотека + детерминированный pipeline (вырезка → бинаризация → скелетизация → аппроксимация Безье).

## Technical Context

**Language/Version**: C# / .NET 8 (`net8.0`)

**Primary Dependencies**: ASP.NET Core 8 Web API, Npgsql 10.x, SixLabors.ImageSharp (декод PNG/JPEG и работа с пикселями; см. research.md), существующие `FileStorageService` / `WordDbService` / `ScanDbService`

**Storage**: PostgreSQL — колонка `words.curve_points real[]` (nullable, многомерный массив); файлы сканов на диске (`Storage:ScansFolder`)

**Testing**: Автотестов в репозитории нет; валидация — ручные сценарии из [quickstart.md](./quickstart.md) (Swagger/HTTP) + проверка БД после Liquibase

**Target Platform**: Windows/Linux host с Kestrel; SPA+API монолит

**Project Type**: Web application (ASP.NET Core API + React Vite client); объём фичи — backend API (UI вне scope)

**Performance Goals**: Векторизация одного слова — интерактивно приемлемо для дипломного объёма (ориентир: завершение типичного слова за единицы секунд на CPU без GPU)

**Constraints**: Конституция I–V (без ORM, тонкий контроллер, карта HTTP-ошибок, Liquibase-only схема); без stroke order; без partial writes; параметры только из конфигурации; координаты кривых — в системе фрагмента после выравнивания

**Scale/Scope**: Один новый endpoint + миграция + расширения модели/сервисов; UI и handwriting synthesis — вне scope

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Статус | Как соблюдается |
|---------|--------|-----------------|
| I. Стек и монолит SPA+API | PASS | Без смены стека; PostgreSQL + Liquibase; без ORM/микросервисов; ImageSharp — доп. библиотека обработки изображений, не альтернатива OCR/стеку |
| II. Тонкие контроллеры, сервисы, SQL | PASS | Контроллер валидирует/маппит HTTP; SQL только в `WordDbService`/`ScanDbService`; файлы — `FileStorageService`; векторизация — отдельный scoped-сервис; мутация `curve_points` в транзакции |
| III. Карта ошибок HTTP | PASS | 404 слово/файл; 400 вырожденная рамка / рамка вне изображения / нет штрихов / невалидные данные; 503 отсутствующая/битая конфигурация векторизации; тело — plain text RU |
| IV. Целостность домена скана/слов | PASS | Не меняет `order_index`/`line_index`/OCR-replace; вектор — атрибут записи Word; повторный OCR по-прежнему удаляет старые слова вместе с их векторами (CASCADE по строкам) |
| V. Схема только через Liquibase | PASS | Новый changeset `ALTER TABLE words ADD COLUMN curve_points real[]` + `--rollback`; код схему не создаёт |

**Post-design re-check**: PASS — контракт и data-model не вводят отдельную таблицу векторов, ORM или JSON ProblemDetails; endpoint вписан в `/api/Scans/...`.

## Project Structure

### Documentation (this feature)

```text
specs/001-word-stroke-vector/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
liquibase/
└── changelog.sql                    # + changeset: words.curve_points

handwritingOCR.Server/
├── Controllers/
│   └── ScansController.cs           # + POST …/words/{wordId}/vectorize
├── Models/
│   └── Word.cs                      # + CurvePoints
├── Options/                         # NEW (или аналог рядом с Models)
│   └── WordVectorizationOptions.cs  # PaddingPx, ApproximationTolerance
├── Serialization/                   # NEW
│   └── Float3DJsonConverter.cs      # JSON [[[x,y],...]] ↔ float[,,]
├── Services/
│   ├── FileStorageService.cs        # без изменений контракта (чтение байтов)
│   ├── ScanDbService.cs             # путь скана
│   ├── WordDbService.cs             # SELECT/UPDATE curve_points; GetWord; UpdateCurvePoints
│   └── WordVectorizationService.cs  # NEW: оркестрация crop → vectorize → persist
├── Imaging/                         # NEW: вырезка/скелет/Безье (внутренние типы)
│   ├── WordFragmentExtractor.cs
│   └── StrokeBezierFitter.cs
├── Program.cs                       # DI: options + WordVectorizationService + Float3DJsonConverter
└── appsettings.json                 # секция WordVectorization

handwritingocr.client/               # без обязательных изменений в этой фиче
```

**Structure Decision**: Расширяем существующий монолит `handwritingOCR.Server` по текущим паттернам (Controller → scoped Services → Npgsql). Алгоритмы CV выносим в `Imaging/` без отдельного проекта; клиент не обязателен для MVP.

## Complexity Tracking

> Нет нарушений конституции, требующих обоснования.
