# Research: Вставка слова на новую строку через drag-and-drop

**Feature**: `007-dnd-new-line-gaps`  
**Date**: 2026-08-17

## 1. Почему существующий `moveWordInLayout` недостаточен

**Decision**: Для gap-drop ввести отдельный helper **`moveWordToNewLine(lines, wordId, insertAtLineIndex)`**, не расширять семантику `moveWordInLayout` для «магического» создания строки.

**Rationale**: `moveWordInLayout` вставляет слово **внутрь существующей строки** по `(targetLineIndex, targetPositionInLine)`. Drop «между строками 0 и 1» с `(1, 0)` поместит слово в **начало бывшей строки 1**, а не на отдельную строку между ними. Spec FR-002–FR-004 требуют именно новую строку.

**Alternatives considered**:
- **Пустая строка-заглушка в layout** — усложняет render и конфликтует с `layoutToLineIds`, который фильтрует пустые строки при save.
- **Специальное значение positionInLine = -1** — неявная магия, хуже для чтения и тестирования.

## 2. Семантика `insertAtLineIndex`

**Decision**: После удаления перетаскиваемого слова из layout:

| Gap-зона | `insertAtLineIndex` |
|----------|---------------------|
| Над первой строкой | `0` |
| Между строкой `i` и `i+1` (0-based) | `i + 1` |
| Под последней строкой (всего `N` строк) | `N` |

Алгоритм `moveWordToNewLine`:
1. Клонировать layout.
2. Найти и удалить слово; запомнить `removedFromLineIndex` (или `-1` если не найден).
3. Если `removedFromLineIndex >= 0` и `removedFromLineIndex < insertAtLineIndex`, уменьшить `insertAtLineIndex` на 1.
4. `next.splice(insertAtLineIndex, 0, [moving])`.
5. Вернуть `next.filter(line => line.length > 0)`.

**Rationale**: Коррекция индекса после удаления предотвращает off-by-one, когда слово перетаскивают из верхней строки в gap ниже.

**Alternatives considered**:
- **Insert до удаления** — требует отдельной логики сдвига индекса источника; порядок «сначала удалить» проще.

## 3. Разметка gap-зон в DOM

**Decision**: Между `<p>` строками рендерить sibling `<div class="line-gap-drop">` (или `<div role="separator">` без ARIA-обязательств). Структура:

```text
.recognized-text
  .line-gap-drop[data-insert="0"]     ← перед первой строкой
  p (line 0)
  .line-gap-drop[data-insert="1"]     ← между 0 и 1
  p (line 1)
  ...
  .line-gap-drop[data-insert="N"]     ← после последней
```

Gap **не** вкладывать внутрь `<p>`, чтобы `onDragOver` строки не перехватывал hover над gap.

**Rationale**: FR-006 — gap не конфликтует с drop на слова/строки; sibling + `stopPropagation` на gap handlers изолирует события.

**Alternatives considered**:
- **Padding/margin на `<p>` как drop zone** — drag-over строки срабатывает одновременно; сложнее развести «конец строки» vs «новая строка».
- **Отдельная библиотека DnD (dnd-kit)** — против scope и конституции (расширяем нативный API).

## 4. Состояние подсветки drop-цели

**Decision**: Отдельный state **`gapDropTarget: number | null`** (insertAtLineIndex активной gap). Существующий **`dropTarget: { lineIndex, positionInLine } | null`** — только для word/line. При drag-over gap: `setGapDropTarget(i)`, `setDropTarget(null)`; при drag-over word: наоборот.

**Rationale**: FR-007 — одна активная подсветка; разные типы целей не должны подсвечиваться одновременно.

**Alternatives considered**:
- **Discriminated union в одном dropTarget** — чище типически, но больше refactor существующих сравнений в JSX; допустимо в implement, research фиксирует оба варианта — implementer MAY объединить в union `{ kind: 'word' | 'gap', ... }`.

## 5. Hit-area и визуальная подсветка

**Decision**:
- CSS: `.line-gap-drop { min-height: 10px; margin: 2px 0; }` (итого ~14px вертикали — достаточно для SC-003).
- Active: `.line-gap-drop.active { border-top: 2px solid #1b7ff5; }` или `box-shadow` — горизонтальная линия, цвет как у `.word.drop-target` outline.

**Rationale**: FR-008, SC-003, SC-004; согласованность с существующим `#1b7ff5`.

**Alternatives considered**:
- **Только 2px без min-height** — плохая hit-area.
- **Пунктир на всю ширину блока через ::after** — допустимо; implementer выбирает border vs pseudo-element.

## 6. Обработка событий

**Decision**:
- `handleGapDragOver(e, insertAtLineIndex)`: `preventDefault()`, `stopPropagation()`, `dropEffect = 'move'`, обновить `gapDropTarget` если drag активен.
- `handleGapDrop(e, insertAtLineIndex)`: `preventDefault()`, `stopPropagation()`, `moveWordToNewLine`, сброс drag state.
- `handleDragOverLine` / `handleDragOverWord`: при срабатывании сбрасывать `gapDropTarget`.

**Rationale**: FR-006; без stopPropagation drop на gap может всплыть на `<p>` и выполнить append-to-line вместо new line.

## 7. Сохранение и регрессии

**Decision**: После gap-drop только `setLayoutLines(...)`; `layoutDirty` через существующий `layoutSignature`. `layoutToLineIds` уже отбрасывает пустые строки — строка из одного слова сохраняется как `[wordId]`. Backend **не менять**.

**Rationale**: Spec FR-009, FR-011; brownfield `ApplyLayoutAsync` принимает произвольное число строк.

**Alternatives considered**:
- **Автосохранение после drop** — out of scope.

## 8. Edge cases

**Decision**:
- Drop gap adjacent to source line: алгорим с коррекцией индекса даёт стабильный результат; no-op (слово на той же логической позиции) допустим.
- Одна строка в документе: gaps at 0 и 1 (before + after); между — нет.
- Черновик `id === 0`: DnD как у остальных; save layout guard без изменений.

**Rationale**: Spec edge cases §76–84.

## Resolved clarifications

Все пункты Technical Context закрыты без `NEEDS CLARIFICATION`: стек определён brownfield; gap DOM + `moveWordToNewLine` + отдельный highlight state — достаточный дизайн для Phase 1.
