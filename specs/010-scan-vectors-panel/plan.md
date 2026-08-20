# Implementation Plan: Панель просмотра всех векторизованных слов скана

**Branch**: `010-scan-vectors-panel` | **Date**: 2026-08-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-scan-vectors-panel/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Добавить **панель векторов** в правую колонку workspace: ниже текстовой раскладки, зеркалирующую `displayLines` слотами на каждую позицию слова. Векторизованные — `WordCurveThumbnail`; невекторизованные — пустой/нейтральный слот. Клик по любому слоту → существующий select; подсветка выбранного слота. Раскладка: flex column в `.workspace-side` (50/50 текст/векторы с локальным scroll); mobile — column stack. **Frontend-only**: новый `ScanVectorsPanel.tsx`, правки `App.tsx` / `App.css`; backend без изменений.

## Technical Context

**Language/Version**: TypeScript + React 19 (Vite); backend C# / .NET 8 — **не меняется**

**Primary Dependencies**: `WordCurveThumbnail`, `curvePoints.ts` (`isWordVectorized`); существующий `displayLines` / `handleWordSelect` в `App.tsx`

**Storage**: N/A (клиент); PostgreSQL/`curve_points` без изменений

**Testing**: Автотестов нет; валидация — [quickstart.md](./quickstart.md)

**Target Platform**: Браузер + локальный Kestrel / Vite proxy `/api`

**Project Type**: Web application (ASP.NET Core + React); объём — **frontend-only**

**Performance Goals**: Панель с до ~50 миниатюр без подвисаний на типичном скане; локальный scroll в секции при длинных сканах

**Constraints**: Конституция I, III, Client–API Contract; без API/схемы; кривые не на изображении скана; RU UX

**Scale/Scope**: `ScanVectorsPanel.tsx` (new), `App.tsx` (layout + props), `App.css` (flex split, slots, breakpoint); ~1 новый компонент

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Статус | Как соблюдается |
|---------|--------|-----------------|
| I. Стек и монолит SPA+API | PASS | Только React/TS в существующем Vite SPA |
| II. Тонкие контроллеры, SQL | PASS (N/A) | Backend не трогаем |
| III. Карта ошибок HTTP | PASS (N/A) | Панель не добавляет fetch |
| IV. Целостность домена | PASS | Порядок из `layoutLines`; без мутаций order API |
| V. Liquibase | PASS (N/A) | Миграций нет |
| Client–API Contract | PASS | Тип Word без изменений; select/draft общий; `displayLines` источник порядка |

**Post-design re-check**: PASS — contracts фиксируют UI-only; новых endpoint'ов нет.

## Project Structure

### Documentation (this feature)

```text
specs/010-scan-vectors-panel/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── scan-vectors-panel-ui.md
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
handwritingocr.client/
├── src/
│   ├── App.tsx              # workspace-side flex; render ScanVectorsPanel;
│   │                        # pass displayLines, draft?.id, handleWordSelect
│   ├── App.css              # workspace-side column; scan-vectors-panel;
│   │                        # vector-slot, breakpoint
│   ├── ScanVectorsPanel.tsx # NEW — mirror lines → slots
│   ├── WordCurveThumbnail.tsx # reuse без изменений
│   └── curvePoints.ts         # reuse isWordVectorized

handwritingOCR.Server/       # без изменений
```

**Structure Decision**: Монолитный экран `App.tsx` остаётся orchestrator; панель векторов — отдельный компонент для читаемости. State не дублируется — props из существующих `displayLines` и `draft`.

## Complexity Tracking

> Нет нарушений конституции, требующих обоснования.

## Phase 0 & 1 Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Research | [research.md](./research.md) | Complete |
| Data model | [data-model.md](./data-model.md) | Complete |
| UI contract | [contracts/scan-vectors-panel-ui.md](./contracts/scan-vectors-panel-ui.md) | Complete |
| Quickstart | [quickstart.md](./quickstart.md) | Complete |

## Implementation Notes (for /speckit-tasks)

1. **Создать** `ScanVectorsPanel.tsx`: map `lines` → `.vector-line` → `.vector-slot` per word; click → `onSelectWord(word)`; `WordCurveThumbnail` if vectorized.
2. **Обернуть** `recognized-text-block` + `ScanVectorsPanel` в `.workspace-side-main` (flex column, `min-height: 0`).
3. **CSS**: `.workspace-side` column flex; text block и `.scan-vectors-panel` — `flex: 1 1 0; min-height: 12rem; overflow: auto`.
4. **Слоты**: `.vector-slot.empty` dashed без SVG; `.vector-slot.selected` как `.word.selected`.
5. **Рендер панели** при `displayLines` (включая все-non-vectorized — зеркало с empty slots); при пустом `lines` — minimal empty.
6. **Не рендерить** line-gap-drop в панели векторов.
7. **@media (max-width: 900px)**: `.workspace { flex-direction: column; }`.
8. **Регрессия**: editor thumbnail, vectorize/batch handlers уже обновляют `words` — панель подхватывает через props без отдельного state.
