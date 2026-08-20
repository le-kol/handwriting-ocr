# Contract: UI — панель векторов скана

**Feature**: `010-scan-vectors-panel`  
**Date**: 2026-08-20

Клиент **не** добавляет новых HTTP-маршрутов. Контракт описывает новую UI-секцию и потребление существующих данных слов.

## Upstream APIs

| Операция | Контракт |
|----------|----------|
| Чтение слов | `GET /api/Scans/{id}/words` — [002 words-list-ui](../../002-words-vector-ui/contracts/words-list-ui.md) |
| Одиночная векторизация | `POST /api/Scans/{id}/words/{wordId}/vectorize` — [001](../../001-word-stroke-vector/contracts/vectorize-word.md) |
| Пакетная векторизация | `POST /api/Scans/{id}/vectorize-batch` — [003](../../003-batch-vectorize-scan/contracts/vectorize-batch.md) |

Панель векторов **не** вызывает API напрямую; обновляется из state после существующих handlers.

## New UI surface

| Элемент | Описание |
|---------|----------|
| `<section class="scan-vectors-panel">` | **NEW** — нижняя часть правой колонки workspace |
| `ScanVectorsPanel` | **NEW** React component |
| Слот `.vector-slot` | Контейнер одной позиции слова в строке |

## Layout (desktop, width > breakpoint)

```text
.workspace (flex row)
├── .scan (image + ScanFrameOverlay)     — без кривых на изображении
└── .workspace-side (flex column, min-height 0)
    ├── .workspace-side-main (flex column, flex 1)
    │   ├── .recognized-text-block (flex 1, overflow auto)
    │   └── .scan-vectors-panel (flex 1, overflow auto)
    ├── buttons (recognize, add, delete scan)
    └── status messages
.editor (draft panel) — без изменений поведения
```

**Breakpoint** (`@media max-width: 900px`): `.workspace` → column; порядок: scan, workspace-side (text block, vectors panel).

## ScanVectorsPanel

### Props

| Prop | Type | MUST |
|------|------|------|
| `lines` | `Word[][]` | Текущий `displayLines` |
| `selectedWordId` | `number \| null` | `draft?.id` |
| `onSelectWord` | `(word: Word) => void` | Существующий select handler |

### Row / slot structure

| Аспект | MUST |
|--------|------|
| Строки | Одна `.vector-line` на каждый элемент `lines` |
| Слоты | Один `.vector-slot` на каждое слово в строке (позиция = index в line) |
| Line gaps | **NOT** рендерить `line-gap-drop` из текстового блока |
| Пустой `lines` | Минимальное empty состояние секции |

### Slot content

| Условие | MUST |
|---------|------|
| `isWordVectorized(word)` && valid curves | `WordCurveThumbnail` в `.word-curve-thumb` |
| `!isWordVectorized(word)` | Пустой слот или `.vector-slot.empty` (dashed, без path) |
| Invalid curves при vectorized | Нейтральный/пустой слот; **no throw** |

### Slot interaction

| Аспект | MUST |
|--------|------|
| `onClick` | `onSelectWord(word)` для **любого** слота |
| Selected | `.vector-slot.selected` при `word.id === selectedWordId` |
| Selected style | Эквивалент `.word.selected` (accent bg + outline) |
| Keyboard | Не требуется в v1 (клик мышью как текст) |

## Синхронизация с текстом и сканом

| Событие | MUST |
|---------|------|
| Select из панели | То же `draft`, выделение `.word.selected`, рамка на скане |
| Vectorize / batch success | Слоты обновляются без page reload |
| Delete word | Слот удаляется с layout |
| DnD reorder | Слоты следуют `lines` |
| Смена scan | Панель только для текущего скана |

## Unchanged surfaces

| Элемент | Статус |
|---------|--------|
| `ScanFrameOverlay` | Без наложенных кривых |
| `.editor` + `WordCurveThumbnail` в editor | Без регрессии |
| `.word.vectorized` / `.not-vectorized` в тексте | Без регрессии |
| Layout toolbar, DnD, save layout | Без регрессии |

## CSS classes (new)

| Class | Purpose |
|-------|---------|
| `.scan-vectors-panel` | Секция панели |
| `.vector-line` | Строка слотов |
| `.vector-slot` | Кликабельный слот |
| `.vector-slot.empty` | Нейтральный/пустой слот невекторизованного слова |
| `.vector-slot.selected` | Выбранный слот |
| `.workspace-side-main` | Flex-обёртка текста + панели векторов |

Размер миниатюры в слоте: reuse `.word-curve-thumb` (9rem × 4.5rem).
