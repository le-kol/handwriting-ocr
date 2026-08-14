# Implementation Plan: Единое представление слов скана с управлением векторизацией

**Branch**: `004-unified-words-view` | **Date**: 2026-08-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-unified-words-view/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Объединить просмотр слов скана в **единое текстовое представление** (`recognized-text`): убрать таблицу `words-table`, добавить **CSS-индикатор** статуса векторизации у каждого слова без изменения текста. Перенести **миниатюру**, **«Векторизовать»** и новую **«Удалить слово»** в существующую **draft-панель**; добавить **«Векторизовать все слова»** в **layout-toolbar**. Backend не меняется — только клиент: `App.tsx`, `App.css`, переиспользование `WordCurveThumbnail`, `isWordVectorized`, новые fetch-хелперы `deleteWord` / `vectorizeBatch` и helper `removeWordFromLayout`.

## Technical Context

**Language/Version**: TypeScript + React 19 (Vite); backend C# / .NET 8 — **не меняется**

**Primary Dependencies**: Существующий SPA (`handwritingocr.client`); `WordCurveThumbnail`, `curvePoints.ts`; fetch к `/api/Scans/...` (GET words, POST vectorize, POST vectorize-batch, DELETE word)

**Storage**: N/A (клиент); PostgreSQL/`curve_points` без изменений

**Testing**: Автотестов нет; валидация — [quickstart.md](./quickstart.md)

**Target Platform**: Браузер + локальный Kestrel / Vite proxy `/api`

**Project Type**: Web application (ASP.NET Core + React); объём — **frontend-only refactor**

**Performance Goals**: Индикаторы и draft-панель без подвисаний на типичном скане; batch — ожидание ответа сервера с блокировкой кнопки

**Constraints**: Конституция I, III, Client–API Contract (Word mirror, plain-text ошибки, `layoutLines` vs `words`, RU UX); FR-014 — без backend/схемы/confirm delete

**Scale/Scope**: `App.tsx` (основной diff), `App.css` (индикаторы, удаление стилей таблицы); без новых страниц и state-менеджера

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Статус | Как соблюдается |
|---------|--------|-----------------|
| I. Стек и монолит SPA+API | PASS | Только React/TS в существующем Vite SPA |
| II. Тонкие контроллеры, SQL | PASS (N/A) | Backend не трогаем |
| III. Карта ошибок HTTP | PASS | `response.text()` при !ok для vectorize, batch, delete |
| IV. Целостность домена | PASS | Delete через существующий DELETE; batch/vectorize не меняют order API; сохранение текста/раскладки раздельно |
| V. Liquibase | PASS (N/A) | Миграций нет |
| Client–API Contract | PASS | Тип Word без изменений; `syncLayoutFromWords` после batch; delete закрывает draft; черновик id=0 без server delete |

**Post-design re-check**: PASS — contracts фиксируют потребление существующих endpoint'ов; новых маршрутов и ProblemDetails нет.

## Project Structure

### Documentation (this feature)

```text
specs/004-unified-words-view/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── unified-words-view-ui.md
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
handwritingocr.client/
├── src/
│   ├── App.tsx          # REMOVE words-table section; CSS classes on .word;
│   │                    # draft: thumbnail, vectorize, delete; toolbar: batch;
│   │                    # + deleteWord, vectorizeBatch, removeWordFromLayout
│   ├── App.css          # + .word.vectorized / .not-vectorized; REMOVE .words-table*
│   ├── WordCurveThumbnail.tsx   # без изменений (reuse в editor)
│   └── curvePoints.ts           # без изменений (isWordVectorized)

handwritingOCR.Server/   # без изменений
```

**Structure Decision**: Монолитный экран `App.tsx` — все изменения UI и fetch-хелперы рядом с существующими `vectorizeWord`, `handleVectorizeClick`, `syncLayoutFromWords`. Табличная секция удаляется целиком; стили таблицы — удалить или оставить неиспользуемыми только если не мешают (предпочтительно удалить).

## Complexity Tracking

> Нет нарушений конституции, требующих обоснования.

## Phase 0 & 1 Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Research | [research.md](./research.md) | Complete |
| Data model | [data-model.md](./data-model.md) | Complete |
| UI contract | [contracts/unified-words-view-ui.md](./contracts/unified-words-view-ui.md) | Complete |
| Quickstart | [quickstart.md](./quickstart.md) | Complete |

## Implementation Notes (for /speckit-tasks)

1. **Удалить** JSX блок `words-section` / `words-table` (~строки 711–771 в текущем `App.tsx`).
2. **Добавить** на span `.word` className с `isWordVectorized(word)` → `vectorized` / `not-vectorized`.
3. **Расширить** `.editor`: условный `WordCurveThumbnail`; кнопки «Векторизовать» / «Удалить слово» с guards `draft.id > 0`.
4. **Добавить** `handleDeleteClick`, `deleteWord()`, `removeWordFromLayout()`.
5. **Добавить** в `.layout-toolbar` кнопку «Векторизовать все слова», `vectorizeBatch()`, state `isBatchVectorizing`; success → `setWords` + `syncLayoutFromWords`.
6. **Расширить** guards в `handleVectorizeClick`: блок при batch.
7. **CSS**: стили индикатора; удалить `.words-section`, `.words-table`, `.word-curve-cell` (если не используются в editor — thumb class может остаться для `WordCurveThumbnail`).
