# Implementation Plan: Отображение и векторизация слов на клиенте

**Branch**: `002-words-vector-ui` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-words-vector-ui/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Добавить на существующий React-экран список/таблицу слов выбранного скана: текст, статус векторизации (по наличию `curvePoints`), миниатюру кубических Безье в собственной СК (SVG `viewBox` по bounding box кривых, без наложения на скан) и кнопку «Векторизовать», вызывающую уже существующий `POST /api/Scans/{id}/words/{wordId}/vectorize` с обновлением строки слова после успеха. Backend/схема не меняются — только клиентский контракт типа `Word` и UI поверх API фичи `001-word-stroke-vector`.

## Technical Context

**Language/Version**: TypeScript + React 19 (Vite); backend уже на C# / .NET 8 — в объёме фичи не меняется

**Primary Dependencies**: Существующий SPA (`handwritingocr.client`): React, fetch к `/api/Scans/...`; SVG для превью кривых; серверные endpoint'ы `GET …/words` и `POST …/vectorize` (фича 001)

**Storage**: N/A для клиента (чтение/запись `curve_points` уже на сервере/PostgreSQL)

**Testing**: Автотестов в репозитории нет; валидация — ручные сценарии из [quickstart.md](./quickstart.md)

**Target Platform**: Браузер (Chrome/Edge) против локального Kestrel + Vite proxy `/api`

**Project Type**: Web application (ASP.NET Core API + React Vite client); объём фичи — frontend UI

**Performance Goals**: Список и миниатюры типичного скана (десятки–сотни слов) отрисовываются без заметных подвисаний UI; векторизация одного слова — ожидание ответа сервера с блокировкой кнопки этого слова

**Constraints**: Конституция I, III (plain-text ошибки), Client–API Contract (зеркало модели Word, RU UX, без state-менеджера); координаты миниатюры только в СК фрагмента; без overlay на скан / batch / edit вектора

**Scale/Scope**: Один основной экран (`App.tsx` + при необходимости небольшие компоненты/хелперы рядом); без новых API и миграций

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Статус | Как соблюдается |
|---------|--------|-----------------|
| I. Стек и монолит SPA+API | PASS | Только React/TS клиент в существующем Vite SPA; без новых сервисов/стеков |
| II. Тонкие контроллеры, сервисы, SQL | PASS (N/A) | Backend не трогаем; SQL/контроллеры без изменений |
| III. Карта ошибок HTTP | PASS | Клиент читает `response.text()` при `!ok` для vectorize; показывает RU-текст оператору |
| IV. Целостность домена скана/слов | PASS | Не меняет order/line/OCR; UI отражает атрибут `curvePoints` существующей записи Word |
| V. Схема только через Liquibase | PASS (N/A) | Миграций нет; колонка уже из 001 |
| Client–API Contract & UX State | PASS | Расширение клиентского `Word` полем `curvePoints`; fetch к `/api/Scans/...`; сохранение текста/раскладки не ломается |

**Post-design re-check**: PASS — contracts описывают потребление существующих endpoint'ов и UI-состояние без новых маршрутов API, ORM или ProblemDetails.

## Project Structure

### Documentation (this feature)

```text
specs/002-words-vector-ui/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
handwritingocr.client/
├── src/
│   ├── App.tsx                    # + тип Word.curvePoints; список/таблица слов; вызов vectorize; состояния загрузки/ошибок
│   ├── App.css                    # + стили таблицы/миниатюр (отдельно от SVG-оверлея скана)
│   ├── WordCurveThumbnail.tsx     # NEW (рекомендуется): SVG-превью curvePoints в bbox СК фрагмента
│   └── curvePoints.ts             # NEW (рекомендуется): валидация/bbox/`path` d для кубических Безье
├── vite.config.ts                 # без изменений (прокси /api)
└── …

handwritingOCR.Server/             # без изменений в этой фиче
```

**Structure Decision**: Расширяем существующий клиентский монолит вокруг `App.tsx`. Вынос миниатюры и геометрии кривых в 1–2 небольших модуля рядом с `App.tsx` — для читаемости, без отдельного state-менеджера и без новых страниц/маршрутов. Backend не изменяется.

## Complexity Tracking

> Нет нарушений конституции, требующих обоснования.
