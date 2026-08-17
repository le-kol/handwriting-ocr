# Implementation Plan: Редактирование рамки слова на скане через drag-and-drop

**Branch**: `008-dnd-word-frame-edit` | **Date**: 2026-08-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-dnd-word-frame-edit/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Добавить **интерактивное редактирование координат рамки** на SVG-наложении скана: перетаскивание **внутренней заливки** выбранного полигона (сдвиг всех четырёх вершин) и **угловых маркеров** (независимое изменение x1–y4). Синхронизация с числовыми полями через существующий `draft`; сохранение — только `POST`/`PUT …/words` по кнопке «Сохранить». Использовать **mouse events** (mousedown/move/up), **не** HTML5 DnD, чтобы не конфликтовать с DnD порядка в `recognized-text`. Backend, Liquibase и API **не меняются**.

## Technical Context

**Language/Version**: TypeScript + React 19 (Vite); backend C# / .NET 8 — **не меняется**

**Primary Dependencies**: Существующий SPA (`handwritingocr.client`); SVG overlay в `App.tsx` (`viewBox` = `naturalWidth` × `naturalHeight`); helpers `boxPoints`, `wordContentBody`, `handleCoordinateChange`

**Storage**: N/A (клиент); PostgreSQL без изменений

**Testing**: Автотестов нет; валидация — [quickstart.md](./quickstart.md)

**Target Platform**: Браузер + локальный Kestrel / Vite proxy `/api`

**Project Type**: Web application (ASP.NET Core + React); объём — **frontend-only**

**Performance Goals**: Live preview координат во время drag без заметной задержки (SC-004); типичный скан — десятки слов, один активный drag

**Constraints**: Конституция I, IV, Client–API Contract; FR-011 — frame drag отделён от HTML5 text DnD; FR-003/003a — выбор vs drag, hit-test по min `orderIndex`; целочисленные пиксельные координаты (`Math.round`); RU UX без изменений текстов save

**Scale/Scope**: `App.tsx` (SVG render, frame drag state/handlers, `handleAddClick` initial frame), опционально `frameEdit.ts` (pure helpers), `App.css` (corner handles, cursors); без новых npm-зависимостей

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Статус | Как соблюдается |
|---------|--------|-----------------|
| I. Стек и монолит SPA+API | PASS | Только React/TS в существующем Vite SPA |
| II. Тонкие контроллеры, SQL | PASS (N/A) | Backend не трогаем |
| III. Карта ошибок HTTP | PASS (N/A) | Сохранение слова — существующие POST/PUT; plain-text ошибки |
| IV. Целостность домена | PASS | Координаты сохраняются через `PUT/POST …/words`; `lineIndex`/`orderIndex` не меняются при frame drag; layout — отдельная операция |
| V. Liquibase | PASS (N/A) | Миграций нет |
| Client–API Contract | PASS | `draft` зеркалит Word; `wordContentBody`; размеры из `naturalWidth`/`naturalHeight`; id=0 черновик до POST |

**Post-design re-check**: PASS — UI contract описывает только клиентское поведение SVG; новых endpoint'ов и изменений Word JSON нет.

## Project Structure

### Documentation (this feature)

```text
specs/008-dnd-word-frame-edit/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── frame-drag-ui.md
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
handwritingocr.client/
├── src/
│   ├── App.tsx          # frame drag state; SVG corner handles;
│   │                    # mousedown/move/up; hit-test select;
│   │                    # handleAddClick → defaultCenterFrame
│   ├── frameEdit.ts     # NEW (optional but recommended): pure helpers
│   └── App.css          # + .frame-handle, cursors move/ grab

handwritingOCR.Server/   # без изменений
```

**Structure Decision**: Логика frame drag — mouse events на SVG, отдельно от HTML5 DnD в `.recognized-text`. Pure helpers (`translateFrame`, `moveCorner`, `clientToImagePoint`, `defaultCenterFrame`, `findWordAtPoint`) выносить в `frameEdit.ts` для тестируемости без нового state-менеджера.

## Complexity Tracking

> Нет нарушений конституции, требующих обоснования.

## Phase 0 & 1 Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Research | [research.md](./research.md) | Complete |
| Data model | [data-model.md](./data-model.md) | Complete |
| UI contract | [contracts/frame-drag-ui.md](./contracts/frame-drag-ui.md) | Complete |
| Quickstart | [quickstart.md](./quickstart.md) | Complete |

## Implementation Notes (for /speckit-tasks)

1. **NEW** `frameEdit.ts`: `defaultCenterFrame(w, h)`, `translateFrame(word, dx, dy)`, `setCorner(word, index, x, y)`, `clientToImagePoint(svg, clientX, clientY)`, `findWordAtPoint(words, x, y) → Word | null` (min `orderIndex` among containing quads).
2. **NEW** state `frameDrag: { mode: 'move' | 'corner'; cornerIndex?: number; startX: number; startY: number; snapshot: Word } | null`.
3. **Selection (FR-003)**: `onMouseDown` на polygon — если слово **не** выбрано → `handleWordSelect` only; если **уже** выбрано → начать `frameDrag` (corner если hit handle, иначе move).
4. **Overlap (FR-003a)**: при mousedown на scan — `findWordAtPoint` по всем `words` + draft id=0; не полагаться только на SVG z-order.
5. **Render**: для `draft` с selection — `<polygon class="selected">` + 4× `<circle class="frame-handle">` поверх; handles `pointer-events: all`, radius ~8px screen (`vector-effect: non-scaling-stroke` или фиксированный r в user units через scale).
6. **Listeners**: `window` mousemove/mouseup во время `frameDrag`; cleanup on unmount / drag end.
7. **Coordinates**: обновлять `draft` через `setDraft`; `Math.round` на x/y; **не** трогать `layoutLines` при frame drag (только координаты черновика).
8. **handleAddClick**: при `imageSize` — `defaultCenterFrame`; иначе fallback при первом `onLoad` или defer до imageSize (если add до load — обновить draft когда imageSize появится).
9. **Regression**: HTML5 `draggable` на `.word` в тексте — без изменений; SVG `pointer-events` не блокирует текст DnD.
10. **Cancel**: `handleCancelClick` — сброс `frameDrag`; `draft = null` + sync layout — без изменений семантики FR-007 для сохранённых слов (отмена всего черновика).
11. **CSS**: `.frame-handle` fill `#1b7ff5`; cursor `grab`/`grabbing` на move zone; `crosshair` или `nwse-resize` на corners — по taste, согласовано с `.scan polygon.selected`.
