# Data Model: Вставка слова на новую строку через drag-and-drop

**Feature**: `007-dnd-new-line-gaps`  
**Date**: 2026-08-17

Клиент не вводит новых сущностей БД и не меняет серверную модель Word. Изменения — локальная раскладка, UI state drag-and-drop и client-side helper.

## Entities (client view)

### Word (без изменений типа)

Зеркало серверного JSON; см. фичи `002`–`004`.

| Field | Type | Notes |
|-------|------|-------|
| id | number | 0 = несохранённый черновик |
| text, x1..y4, orderIndex, lineIndex, curvePoints | — | Без изменений |

DnD: слово остаётся draggable; метаданные не меняются при локальном переносе до save layout.

---

### Локальная раскладка (`layoutLines`)

| Аспект | Правило |
|--------|---------|
| Структура | `Word[][]` — упорядоченные строки слов |
| Пустые строки | Не отображаются; фильтруются в helpers и при `layoutToLineIds` |
| Новая строка через gap | Строка `[word]` вставляется на `insertAtLineIndex` |
| Dirty flag | `layoutSignature(layoutLines) !== savedLayoutSignature` |

#### Инварианты после gap-drop

- Каждое слово скана встречается в layout **ровно один раз** (если было до drag).
- Все строки в layout **непустые** (`length > 0`).
- Порядок слов внутри нетронутых строк **не меняется**.

---

### Gap-зона (UI, не персистируется)

| Поле | Тип | Описание |
|------|-----|----------|
| insertAtLineIndex | number | Индекс новой строки в layout **после** удаления перетаскиваемого слова |
| isActive | boolean (derived) | `gapDropTarget === insertAtLineIndex && draggedWordId !== null` |

Количество gap-зон для `N` строк: **`N + 1`** (индексы `0..N`).

---

## UI state (экран App)

| State | Type | Назначение |
|-------|------|------------|
| layoutLines | `Word[][] \| null` | Локальная раскладка (без изменений роли) |
| draggedWordId | `number \| null` | Id перетаскиваемого слова |
| dropTarget | `{ lineIndex, positionInLine } \| null` | Цель drop **на слово** или **в конец строки** |
| gapDropTarget | `number \| null` | **NEW** — `insertAtLineIndex` активной gap-зоны |
| savedLayoutSignature | `string \| null` | Эталон для «Сохранить порядок» |
| layoutSaveStatus | `string \| null` | RU-сообщения save layout (без изменений текста) |

Взаимоисключение при drag-over: активен **либо** `dropTarget`, **либо** `gapDropTarget`, не оба.

---

## State transitions

### Gap drop (новая строка)

```text
[draggedWordId = W, layoutLines = L]
  --(dragOver gap insertAt = I)--> [gapDropTarget = I, dropTarget = null]
  --(drop on gap I)---------------> [layoutLines = moveWordToNewLine(L, W, I);
                                      draggedWordId = null; gapDropTarget = null]
```

Side effects: `layoutDirty = true`; сервер **не** вызывается.

### Word / line drop (без изменений)

```text
[draggedWordId = W]
  --(dragOver word/line)--> [dropTarget = {…}, gapDropTarget = null]
  --(drop)----------------> [layoutLines = moveWordInLayout(…); reset drag state]
```

### Save layout после gap-drop

```text
[layoutDirty, нет id === 0 в layout]
  --(«Сохранить порядок»)--> PUT { lines: layoutToLineIds(layoutLines) }
  --(200 Word[])-----------> syncLayoutFromWords; «Порядок сохранён»
```

`layoutToLineIds` для раскладки с новыми однословными строками: `[[id1], [id2, id3], …]`.

### Cancel / drag end

```text
handleDragEnd / handleCancelClick
  --> draggedWordId = null; dropTarget = null; gapDropTarget = null
  (Cancel additionally syncLayoutFromWords from server)
```

---

## Client-side helpers

| Helper | Signature (логически) | Назначение |
|--------|----------------------|------------|
| moveWordToNewLine | `(lines, wordId, insertAtLineIndex) => Word[][]` | **NEW** — перенос на отдельную новую строку |
| moveWordInLayout | `(lines, wordId, lineIndex, positionInLine) => Word[][]` | Без изменений — word/line drop |
| layoutToLineIds | `(lines) => number[][]` | Без изменений — подготовка PUT body |
| layoutSignature | `(lines) => string` | Без изменений — dirty detection |

---

## Out of scope

- Новые поля Word / words table.
- Изменение `lineIndex` / `orderIndex` на клиенте до save (как сейчас — только при ответе PUT layout).
- Persist gap-зон на сервере.
- Touch / keyboard DnD.
