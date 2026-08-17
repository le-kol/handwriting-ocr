# Implementation Plan: Вставка слова на новую строку через drag-and-drop

**Branch**: `007-dnd-new-line-gaps` | **Date**: 2026-08-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-dnd-new-line-gaps/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Расширить существующий HTML5 drag-and-drop в блоке `recognized-text` (`App.tsx`): добавить **межстрочные gap-зоны** (над первой строкой, между строками, под последней) для переноса слова на **отдельную новую строку**. Новый pure helper `moveWordToNewLine` вставляет строку в `layoutLines`; состояние `gapDropTarget` и CSS-класс `.line-gap-drop` дают подсветку горизонтальной линией при drag-over. Drop на слово и на строку **без изменений**. Backend, Liquibase и контракт `PUT …/words/layout` **не меняются**.

## Technical Context

**Language/Version**: TypeScript + React 19 (Vite); backend C# / .NET 8 — **не меняется**

**Primary Dependencies**: Существующий SPA (`handwritingocr.client`); нативный HTML5 DnD в `App.tsx`; helpers `moveWordInLayout`, `layoutToLineIds`, `layoutSignature`

**Storage**: N/A (клиент); PostgreSQL без изменений

**Testing**: Автотестов нет; валидация — [quickstart.md](./quickstart.md)

**Target Platform**: Браузер + локальный Kestrel / Vite proxy `/api`

**Project Type**: Web application (ASP.NET Core + React); объём — **frontend-only**

**Performance Goals**: Мгновенная локальная перестановка без запросов к серверу; gap-зоны не должны заметно ухудшать отзывчивость drag-over на типичном скане (десятки слов)

**Constraints**: Конституция I, IV, Client–API Contract (`layoutLines` локально до «Сохранить порядок»); FR-011 — без backend; RU UX; `stopPropagation` на gap, чтобы не ломать drop на слова/строки

**Scale/Scope**: `App.tsx` (render gap-зон, handlers, helper), `App.css` (`.line-gap-drop`); без новых компонентов/страниц/state-менеджера (опционально inline JSX gap, без отдельного файла)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Статус | Как соблюдается |
|---------|--------|-----------------|
| I. Стек и монолит SPA+API | PASS | Только React/TS в существующем Vite SPA |
| II. Тонкие контроллеры, SQL | PASS (N/A) | Backend не трогаем |
| III. Карта ошибок HTTP | PASS (N/A) | Новых запросов нет; сохранение порядка — существующий PUT layout |
| IV. Целостность домена | PASS | Раскладка по-прежнему сохраняется отдельно через `PUT …/words/layout`; локальные изменения до явного save |
| V. Liquibase | PASS (N/A) | Миграций нет |
| Client–API Contract | PASS | `layoutLines` MAY расходиться до save; `layoutToLineIds` фильтрует пустые строки; черновик id=0 — прежние guards на save layout |

**Post-design re-check**: PASS — UI contract фиксирует только клиентское поведение; новых endpoint'ов и изменений Word JSON нет.

## Project Structure

### Documentation (this feature)

```text
specs/007-dnd-new-line-gaps/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── dnd-line-gap-ui.md
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
handwritingocr.client/
├── src/
│   ├── App.tsx          # + moveWordToNewLine; gapDropTarget state;
│   │                    # + LineGapDropZone JSX; handleGapDragOver/Drop;
│   │                    # render gaps before/between/after <p> lines
│   └── App.css          # + .line-gap-drop, .line-gap-drop.active (horizontal line)

handwritingOCR.Server/   # без изменений
```

**Structure Decision**: Вся логика остаётся в монолитном `App.tsx` рядом с существующими `moveWordInLayout`, `handleDragOverWord`, `handleDragOverLine`. Gap-зоны — sibling-элементы между `<p>` внутри `.recognized-text`, не вложенные в слова.

## Complexity Tracking

> Нет нарушений конституции, требующих обоснования.

## Phase 0 & 1 Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Research | [research.md](./research.md) | Complete |
| Data model | [data-model.md](./data-model.md) | Complete |
| UI contract | [contracts/dnd-line-gap-ui.md](./contracts/dnd-line-gap-ui.md) | Complete |
| Quickstart | [quickstart.md](./quickstart.md) | Complete |

## Implementation Notes (for /speckit-tasks)

1. **NEW** `moveWordToNewLine(lines, wordId, insertAtLineIndex): Word[][]` — удалить слово, вставить новую строку `[word]` на `insertAtLineIndex` с коррекцией индекса после удаления; отфильтровать пустые строки.
2. **NEW** state `gapDropTarget: number | null` — индекс вставки новой строки (0 = перед первой, `i+1` = между строками `i` и `i+1`, `lineCount` = после последней).
3. **Render** для `displayLines.length === N`: `N+1` gap-зон (before line 0, between each pair, after line N-1) — всего `N+1` gaps: indices 0..N.
4. **Handlers** `handleGapDragOver(insertAtLineIndex)`, `handleGapDrop(insertAtLineIndex)` — `preventDefault`, `stopPropagation`, `setGapDropTarget`, вызов `moveWordToNewLine`.
5. **handleDragEnd** — сброс `gapDropTarget` вместе с `dropTarget`.
6. **CSS** `.line-gap-drop` — min-height ~8–12px, width 100%; `.line-gap-drop.active` — горизонтальная линия (border-top или ::before), цвет согласован с `#1b7ff5` у `.word.drop-target`.
7. **Regression**: не менять сигнатуры `handleDrop` / `moveWordInLayout` для word и line targets.
8. **Save layout**: после gap-drop `layoutSignature` меняется → кнопка «Сохранить порядок» активируется; PUT `{ lines: number[][] }` без изменений.
