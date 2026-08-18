# Implementation Plan: Inline-редактирование текста слова в блоке результатов OCR

**Branch**: `009-inline-word-text-edit` | **Date**: 2026-08-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-inline-word-text-edit/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Добавить **inline-редактирование текста** в `.recognized-text`: клик по уже выбранному слову (жест без drag > 5px) заменяет span на `<input>`; **Enter/blur** — autosave через существующий `POST`/`PUT …/words` при изменении текста; **Escape** — откат текста к server snapshot; **«Отмена»** — полный сброс черновика. Синхронизация с полем «Текст» панели через общий `draft`. Backend, Liquibase и API **не меняются**.

## Technical Context

**Language/Version**: TypeScript + React 19 (Vite); backend C# / .NET 8 — **не меняется**

**Primary Dependencies**: `handwritingocr.client` — `App.tsx` (word render, draft, save); `wordFrame.tsx` (`wordFrameContentBody`); `ScanFrameOverlay.tsx` (выбор по рамке); существующий HTML5 text DnD

**Storage**: N/A (клиент); PostgreSQL без изменений

**Testing**: Автотестов нет; валидация — [quickstart.md](./quickstart.md)

**Target Platform**: Браузер + Kestrel / Vite proxy `/api`

**Project Type**: Web application (ASP.NET Core + React); объём — **frontend-only**

**Performance Goals**: Enter → save perceived instant; inline focus/caret без заметной задержки; типичный скан — десятки слов, одно inline-поле

**Constraints**: Конституция I, IV, Client–API Contract; FR-011 — inline gesture отделён от HTML5 DnD (5px threshold); FR-015 — stay inline on save error; panel «Текст» без autosave; RU `saveStatus` без изменений формулировок

**Scale/Scope**: `App.tsx` (state, gesture handlers, inline render, `persistWordContent`); опционально `inlineWordEdit.ts` + `InlineWordInput.tsx`; `App.css` (`.word-inline-input`); без новых npm-зависимостей

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Принцип | Статус | Как соблюдается |
|---------|--------|-----------------|
| I. Стек и монолит SPA+API | PASS | Только React/TS в Vite SPA |
| II. Тонкие контроллеры, SQL | PASS (N/A) | Backend не трогаем |
| III. Карта ошибок HTTP | PASS | Inline autosave — те же POST/PUT; plain-text ошибки через `readError` |
| IV. Целостность домена | PASS | Text save через `PUT/POST …/words`; layout — отдельно; `order_index`/`line_index` не меняются при inline text |
| V. Liquibase | PASS (N/A) | Миграций нет |
| Client–API Contract | PASS | `draft` + `wordContentBody`; id=0 POST flow; layoutLines sync text; save не сбрасывает layout order |

**Post-design re-check**: PASS — UI contract только для `.recognized-text`; новых endpoint'ов нет.

## Project Structure

### Documentation (this feature)

```text
specs/009-inline-word-text-edit/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── inline-word-text-ui.md
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
handwritingocr.client/
├── src/
│   ├── App.tsx              # inlineEditingWordId; gesture handlers;
│   │                        # inline input render; persistWordContent;
│   │                        # handleWordSelect → enter inline when selected
│   ├── inlineWordEdit.ts    # NEW (recommended): lastSavedText, threshold,
│   │                        # caretIndexFromClick, gesture helpers
│   ├── InlineWordInput.tsx  # NEW (optional): controlled input + key handlers
│   └── App.css              # + .word-inline-input

handwritingOCR.Server/       # без изменений
```

**Structure Decision**: Inline-логика в `App.tsx` с выносом pure helpers в `inlineWordEdit.ts` (как `frameEdit.ts` в 008). Компонент `InlineWordInput` — по желанию для читаемости `App.tsx`.

## Complexity Tracking

> Нет нарушений конституции, требующих обоснования.

## Phase 0 & 1 Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Research | [research.md](./research.md) | Complete |
| Data model | [data-model.md](./data-model.md) | Complete |
| UI contract | [contracts/inline-word-text-ui.md](./contracts/inline-word-text-ui.md) | Complete |
| Quickstart | [quickstart.md](./quickstart.md) | Complete |

## Implementation Notes (for /speckit-tasks)

1. **NEW state**: `inlineEditingWordId: number | null`; `pendingWordGesture: PendingWordGesture | null`.
2. **Refactor save**: `persistWordContent(draft): Promise<Word>` — extract from `handleSaveClick`; shared POST/PUT, layout id replace, `fetchWords`, `setDraft(saved)`.
3. **`handleWordSelect`**: if `draft?.id === word.id && inlineEditingWordId === null` — **не** return early; delegate to gesture end OR if called from frame/other — keep select-only. Replace early-return with inline entry only via gesture mouseup (not onClick alone) to support threshold.
4. **Gesture on `.word` (selected, not inline)**: `onMouseDown` → start pending; `onMouseMove` (window) → threshold; `onMouseUp` (window) → enter inline + caret OR discard if threshold exceeded.
5. **Render**: if `inlineEditingWordId === word.id` → `<InlineWordInput>` / `<input class="word word-inline-input selected">` else existing span; `draggable={inlineEditingWordId !== word.id}`.
6. **`commitInlineEdit`**: compare `draft.text` vs `lastSavedTextForWord`; if dirty → `persistWordContent` (stay inline on error); else clear inline id.
7. **`cancelInlineEdit` (Escape)**: revert text in draft + layoutLines; clear inline id; keep draft/panel open.
8. **`handleCancelClick`**: `setInlineEditingWordId(null)` before existing reset.
9. **`handleTextChange`**: rename/extract `updateDraftText` — reuse from inline onChange.
10. **Blur ordering**: inline `onBlur` → commit; guard double-commit with ref if switching words.
11. **CSS**: `.word-inline-input` — inherit font, minimal padding, selected outline.
12. **Regression**: Do not change `handleDragStart`/`handleDrop`/gap handlers; frame drag in `ScanFrameOverlay` untouched.
