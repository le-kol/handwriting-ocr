# Contract: UI — межстрочные gap-зоны drag-and-drop

**Feature**: `007-dnd-new-line-gaps`  
**Date**: 2026-08-17

Клиент **не** добавляет новых HTTP-маршрутов. Контракт описывает расширение DnD в `.recognized-text` и потребление существующего API сохранения раскладки.

## Upstream APIs (без изменений)

| Операция | Контракт |
|----------|----------|
| Сохранение раскладки | `PUT /api/Scans/{id}/words/layout` — body `{ lines: number[][] }`; см. brownfield `ApplyLayoutAsync` |
| Чтение слов | `GET /api/Scans/{id}/words` |

После gap-drop клиент MUST NOT вызывать API до явного «Сохранить порядок».

---

## DOM structure (recognized-text)

Для `displayLines` длины `N` (N ≥ 1):

| Порядок | Элемент | Атрибут / data |
|---------|---------|----------------|
| 1 | `.line-gap-drop` | `insertAtLineIndex = 0` |
| 2 | `<p>` line 0 | существующие word/line handlers |
| 3 | `.line-gap-drop` | `insertAtLineIndex = 1` |
| … | … | … |
| 2N | `<p>` line N-1 | |
| 2N+1 | `.line-gap-drop` | `insertAtLineIndex = N` |

Gap MUST быть **sibling** `<p>`, не child слова или строки.

---

## Line gap drop zone

| Аспект | MUST |
|--------|------|
| Hit-area | Вертикальная зона достаточная для попадания мышью (min-height ≥ 8px + margin) |
| dragOver | `preventDefault()`; `stopPropagation()`; `dropEffect = 'move'` |
| drop | `preventDefault()`; `stopPropagation()`; вызов `moveWordToNewLine` |
| Подсветка | Класс `.active` когда `gapDropTarget === insertAtLineIndex` и идёт drag |
| Визуал active | Горизонтальная линия (border/shadow), цвет согласован с `.word.drop-target` |
| Конфликт | При dragOver gap — `dropTarget = null`; при dragOver word/line — `gapDropTarget = null` |

---

## Drop semantics by zone

| Zone | `insertAtLineIndex` | Результат в `layoutLines` |
|------|----------------------|---------------------------|
| Над первой строкой | `0` | Новая строка `[word]` перед всеми строками |
| Между строкой `i` и `i+1` | `i + 1` | Новая строка `[word]` между ними |
| Под последней строкой | `N` | Новая строка `[word]` после всех строк |

После drop: `draggedWordId = null`, `gapDropTarget = null`, `dropTarget = null`.

---

## Word drop (без регрессии)

| Аспект | MUST |
|--------|------|
| drop на `.word` | Вставка **перед** этим словом в той же строке (`moveWordInLayout`) |
| drop на первое слово строки | Вставка в **начало** строки |
| dragOver / drop на word | `stopPropagation()` на word (как сейчас) |
| Подсветка | Класс `.word.drop-target` по `dropTarget` |

---

## Line drop (без регрессии)

| Аспект | MUST |
|--------|------|
| drop на `<p>` (область строки) | Вставка в **конец** строки (`positionInLine = lineWords.length`) |
| dragOver line | Обновляет `dropTarget` на конец строки; сбрасывает `gapDropTarget` |

---

## Layout toolbar (без регрессии)

| Элемент | MUST |
|---------|------|
| «Сохранить порядок» | Активна при `layoutDirty`; отправляет `layoutToLineIds(layoutLines)` |
| Guard id=0 | «Сначала сохраните новое слово» — без изменений |
| Сообщения | RU: «Сохранение порядка», «Порядок сохранён», «Порядок не менялся», ошибки через `response.text()` |

Раскладка с однословными строками после gap-drop MUST сериализоваться как отдельные элементы `lines[]` (например `[[5], [1,2], [3]]`).

---

## Drag lifecycle

| Событие | MUST |
|---------|------|
| dragStart (word) | `draggedWordId`, draft sync — без регрессии |
| dragEnd | Сброс `draggedWordId`, `dropTarget`, **`gapDropTarget`** |
| Cancel editing | Сброс drag state + `syncLayoutFromWords` — без регрессии |

---

## CSS classes (NEW)

| Class | Назначение |
|-------|------------|
| `.line-gap-drop` | Базовая gap-зона |
| `.line-gap-drop.active` | Подсветка при drag-over |

Существующие `.word.dragging`, `.word.drop-target` — без изменений семантики.

---

## Out of scope

- Новые REST endpoints.
- DnD на SVG-рамках скана.
- Автосохранение layout после drop.
- Изменение текста RU-сообщений save layout (если не требуется новое сообщение для gap).
