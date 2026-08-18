# Research: Inline-редактирование текста слова

**Feature**: `009-inline-word-text-edit`  
**Date**: 2026-08-18

## 1. Жест «клик vs drag» на выбранном слове (FR-017)

**Decision**: На `.word`, когда `draft.id === word.id` и слово **не** в inline-режиме, различать жесты через **mousedown → mousemove → mouseup** с порогом **`DRAG_CLICK_THRESHOLD_PX = 5`** (screen pixels). Если суммарное смещение ≤ порога до mouseup — **вход в inline**; если > порога — **не** входить в inline, позволить HTML5 DnD (`draggable={true}`) стартовать как сейчас.

**Rationale**: Clarification 2026-08-18 Q3; brownfield уже использует HTML5 DnD на `.word`; полное отключение `draggable` для selected word ломало бы drag без дополнительного UX. Порог 5px — общепринятая эвристика click vs drag (Windows/macOS UI guidelines, react-dnd).

**Alternatives considered**:
- **`onClick` + `draggable={false}` для selected** — drag порядка для выбранного слова требовал бы «клик вне» перед drag; отклонено.
- **Double-click для inline** — против spec (второй клик / клик по уже выбранному).
- **Отдельная иконка edit** — out of scope.

## 2. Вход в inline при выборе по рамке (FR-002)

**Decision**: Условие входа — **`draft !== null && draft.id === word.id`**, не «второй клик по тексту» буквально. Первый клик по `.word` после выбора по `ScanFrameOverlay` сразу открывает inline (clarification Q4).

**Rationale**: «Уже выбранным» = любой способ выбора; `handleWordSelect` сейчас no-op при повторном клике — заменить на `enterInlineEdit(word, clickX)`.

## 3. Компонент inline-поля

**Decision**: В рендере `.recognized-text` при `inlineEditingWordId === word.id` заменить текстовый `<span>` на **`<input type="text" class="word word-inline-input">`** (или отдельный класс), `value={draft.text}`, `autoFocus`, `size` по длине текста или `min-width` через CSS. Логику клавиш и blur — в `App.tsx` или вынести **`InlineWordInput.tsx`** (controlled input + onCommit/onCancel props).

**Rationale**: Нативный `<input>` даёт caret, selection, Enter/Escape без contenteditable-сложностей; согласован с однострочным Assumption.

**Alternatives considered**:
- **`contenteditable span`** — сложнее caret-from-click и Enter/blur; отклонено.
- **Overlay input поверх span** — лишняя геометрия; отклонено.

## 4. Позиция курсора от клика (FR-003)

**Decision**: После mount/focus inline-input:
1. Попытка **`document.caretRangeFromPoint(x, y)`** / **`document.caretPositionFromPoint(x, y)`** (с fallback для Firefox).
2. Если API недоступно или точка вне input — **`setSelectionRange(text.length, text.length)`** (конец).
3. Если доступно — установить selection на полученный offset.

**Rationale**: Браузерный API соответствует «горизонтальному положению клика»; fallback безопасен.

**Alternatives considered**:
- **Canvas measureText по offsetX** — дублирует метрики шрифта; запасной путь в helper `caretIndexFromClick(input, clientX)`.

## 5. Baseline «текст изменился» (FR-004, FR-005)

**Decision**: При commit inline сравнивать `draft.text` с **`lastSavedTextForWord(draft, words)`**:
- `id > 0`: `words.find(w => w.id === id)?.text ?? ''`
- `id === 0`: `''` (несохранённое слово)

Не сравнивать с текстом на момент **входа** в inline — только с последним **серверным** snapshot в `words`.

**Rationale**: FR-004 явно; Escape (FR-006) откатывает к тому же baseline.

## 6. Автосохранение — переиспользование save pipeline

**Decision**: Вынести из `handleSaveClick` **`persistWordContent(draft): Promise<Word>`** (fetch POST/PUT, layout id replace, fetchWords, setWords, setDraft). Inline commit вызывает его при dirty text; **`handleSaveClick`** делегирует туда же. Флаги inline-commit:
- success → `setInlineEditingWordId(null)`; `setSaveStatus('Сохранено')`
- error → **остаться в inline** (FR-015); `setSaveStatus('Ошибка сохранения: …')`; текст в draft/input не откатывать

**Rationale**: FR-009, FR-014; DRY с panel Save; constitution Client–API Contract (`wordContentBody`).

**Alternatives considered**:
- **Отдельный PUT только text** — нет такого API; отклонено.
- **Autosave только text без coords** — против FR-009 / User Story 2 #4.

## 7. Escape vs Отмена

**Decision**:
- **Escape**: revert `draft.text` (+ sync `layoutLines` text for word id) к `lastSavedTextForWord`; `setInlineEditingWordId(null)`; **draft и panel остаются открытыми**; coords черновика не трогать (FR-006, edge case).
- **Отмена**: `setInlineEditingWordId(null)`; существующий `handleCancelClick` (full draft reset) — FR-016.

**Rationale**: Clarifications Q2; различие partial vs full cancel.

## 8. Blur и переключение слова

**Decision**: `onBlur` inline-input → **`commitInlineEdit({ reason: 'blur' })`**. Если blur из-за клика по другому `.word`, порядок: blur commit текущего → затем `handleWordSelect` нового (стандартный bubbling; при гонке использовать **`requestAnimationFrame`** или флаг `isCommittingInline` чтобы не терять save). Клик по другому слову **не** открывает inline сразу (первый клик = select only).

**Rationale**: Edge case «переключение на другое слово»; Assumption blur-before-select.

## 9. Синхронизация с панелью (FR-007, FR-008)

**Decision**: Inline `onChange` вызывает тот же **`handleTextChange`** (или общий `updateDraftText(text)`), обновляющий `draft` и `layoutLines`. Panel field остаётся controlled от `draft.text`. Panel **Save** без изменений — без autosave.

**Rationale**: FR-007/FR-008; brownfield `handleTextChange` уже sync layout.

## 10. Inline во время text DnD и frame drag

**Decision**:
- Слово в inline: **`draggable={false}`** для этого span/input; DnD других слов без изменений.
- **`abortFrameDragRef`** при enter inline — optional, не конфликтует.
- **`handleDragStart`**: не вызывается для inline word (draggable false).

**Rationale**: User Story 3 #7; FR-011.

## 11. CSS

**Decision**: Класс **`.word-inline-input`**: `font: inherit`, `border: none`, `outline: 1px solid #1b7ff5`, `background: var(--accent-bg)`, `padding: 0`, `margin: 0`, `min-width: 2ch`, `width: auto` (или `size={Math.max(text.length, 1)}`).

**Rationale**: Визуальная непрерывность с `.word.selected`; без новых npm-пакетов.

## Resolved clarifications

Все Technical Context пункты закрыты без `NEEDS CLARIFICATION`. Session 2026-08-18 интегрирована в decisions 1–2, 7.
