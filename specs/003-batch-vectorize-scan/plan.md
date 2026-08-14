# Implementation Plan: Пакетная векторизация слов скана

**Branch**: `003-batch-vectorize-scan` | **Date**: 2026-08-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-batch-vectorize-scan/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Добавить endpoint `POST /api/Scans/{id}/vectorize-batch`, который для всех слов скана с `curve_points IS NULL` последовательно выполняет ту же векторизацию, что и одиночный `POST …/words/{wordId}/vectorize`, проглатывая ошибки отдельных слов. При найденном скане и валидной конфигурации `WordVectorization` возвращает `200 OK` и полный список слов скана (формат `GET …/words`). Top-level ошибки: 404 (скан не найден), 503 (невалидная конфигурация). Схема БД не меняется; оркестрация — в `WordVectorizationService`, маршрут — в `ScansController`.

## Technical Context

**Language/Version**: C# / .NET 8 (`net8.0`)

**Primary Dependencies**: ASP.NET Core 8 Web API, Npgsql 10.x, существующие `WordVectorizationService`, `WordDbService`, `ScanDbService`, `FileStorageService`, `WordFragmentExtractor`, `StrokeBezierFitter`, `WordVectorizationOptions`

**Storage**: PostgreSQL — существующая nullable-колонка `words.curve_points`; файлы сканов на диске (`Storage:ScansFolder`)

**Testing**: Автотестов в репозитории нет; валидация — ручные сценарии из [quickstart.md](./quickstart.md) (Swagger/HTTP)

**Target Platform**: Windows/Linux host с Kestrel; SPA+API монолит

**Project Type**: Web application (ASP.NET Core API + React Vite client); объём фичи — backend API (UI вне scope)

**Performance Goals**: Последовательная обработка десятков слов на CPU без GPU; накладные расходы batch — преимущественно однократная загрузка файла скана на запрос (см. research.md)

**Constraints**: Конституция I–V; без изменения схемы Liquibase; без partial writes; per-word ошибки не повышают HTTP-статус batch; plain-text top-level ошибки; переиспользование логики одиночной векторизации

**Scale/Scope**: Один новый endpoint + метод batch в сервисе; опциональный SQL-хелпер для выборки невекторизованных слов; клиент не обязателен

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Статус | Как соблюдается |
|---------|--------|-----------------|
| I. Стек и монолит SPA+API | PASS | Без смены стека; без ORM/микросервисов; только расширение существующего API |
| II. Тонкие контроллеры, сервисы, SQL | PASS | Контроллер — маршрут + маппинг HTTP; оркестрация batch — `WordVectorizationService`; чтение слов — `WordDbService`; мутации `curve_points` — через существующий `UpdateCurvePointsAsync` с транзакцией |
| III. Карта ошибок HTTP | PASS | Batch: 404 скан; 503 конфиг; per-word сбои → 200 + `curvePoints: null` у слова; top-level тело — plain text RU |
| IV. Целостность домена скана/слов | PASS | Не меняет `order_index`/`line_index`/OCR-replace; batch не трогает слова с уже заполненным `curve_points`; вектор остаётся атрибутом Word |
| V. Схема только через Liquibase | PASS | Новых changeset'ов нет; используется существующая колонка `curve_points` |

**Post-design re-check**: PASS — контракт и data-model не вводят схему, ORM или JSON ProblemDetails; endpoint следует путям `/api/Scans/...`.

## Project Structure

### Documentation (this feature)

```text
specs/003-batch-vectorize-scan/
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
├── Controllers/
│   └── ScansController.cs           # + POST {id}/vectorize-batch
├── Services/
│   ├── WordVectorizationService.cs  # + VectorizeBatchAsync; рефакторинг общей логики слова
│   └── WordDbService.cs             # + GetUnvectorizedWordsByScanIdAsync (или фильтр в сервисе)
└── (без изменений) Models/, Imaging/, Options/, Program.cs, liquibase/

handwritingocr.client/               # без обязательных изменений
```

**Structure Decision**: Минимальное расширение существующего монолита `handwritingOCR.Server` по паттерну Controller → `WordVectorizationService` → DB/storage/imaging. Клиент и Liquibase не затрагиваются.

## Complexity Tracking

> Нет нарушений конституции, требующих обоснования.
