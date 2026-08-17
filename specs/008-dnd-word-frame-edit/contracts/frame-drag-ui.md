# Contract: UI — drag-and-drop редактирование рамки на скане

**Feature**: `008-dnd-word-frame-edit`  
**Date**: 2026-08-17

Клиент **не** добавляет новых HTTP-маршрутов. Контракт описывает SVG overlay на `.scan` и потребление существующего API сохранения слова.

## Upstream APIs (без изменений)

| Операция | Контракт |
|----------|----------|
| Создание слова | `POST /api/Scans/{id}/words` — body `{ text, x1..y4 }` |
| Обновление слова | `PUT /api/Scans/{id}/words/{wordId}` — body `{ text, x1..y4 }` |
| Чтение слов | `GET /api/Scans/{id}/words` |

После frame drag клиент MUST NOT вызывать API до явного «Сохранить».

---

## SVG overlay structure

| Элемент | Условие | MUST |
|---------|---------|------|
| `<svg viewBox="0 0 W H">` | `imageSize` loaded | W/H = naturalWidth/Height |
| `<polygon>` per word | always | `points={boxPoints(word)}`; click/mousedown для выбора |
| `<polygon class="selected">` | `draft` selected | Координаты из `draft`; interior draggable |
| `<circle class="frame-handle">` ×4 | selected draft | На вершинах x1–y4; corner drag |
| `<polygon>` id=0 | `draft.id === 0` | Отдельный render (как сейчас) + handles |

SVG: `pointer-events: none` на root; `pointer-events: all` на polygon/handles.

---

## Selection

| Аспект | MUST |
|--------|------|
| Выбор слова | Клик по polygon на scan **или** по `.word` в recognized-text (без регрессии) |
| mousedown на **невыбранной** рамке | Только выбор; координаты **не** меняются до отпускания и даже при движении мыши |
| Перекрытие рамок | Hit-test всех слов; выбрать **min orderIndex** среди содержащих точку |
| Повторный клик по selected | Не сбрасывать draft (brownfield `handleWordSelect` guard) |

---

## Frame move (FR-001)

| Аспект | MUST |
|--------|------|
| Preconditions | Слово уже selected в момент mousedown |
| Hit zone | Interior polygon (fill enabled for hit, e.g. transparent fill) **минус** corner handle zones |
| Behavior | Все x1–y4 сдвигаются на одинаковый Δx, Δy |
| Live sync | Polygon + inputs x1–y4 обновляются на mousemove |
| Coordinates | Целые пиксели (`Math.round`) |
| End | mouseup → локальный draft; **без** API |

---

## Corner edit (FR-002, FR-001a)

| Аспект | MUST |
|--------|------|
| Handles | 4 visible markers на вершинах selected рамки |
| Priority | mousedown на handle → corner drag, **не** move |
| Behavior | Только соответствующая пара x/i, y/i меняется |
| Live sync | Polygon + поля x1–y4 |

---

## New word initial frame (FR-008)

| Аспект | MUST |
|--------|------|
| Trigger | «Добавить слово» |
| Initial coords | Rect ~80×40 px, центр изображения |
| Handles | Visible immediately for id=0 draft |
| Save | Обычный «Сохранить» → POST с текущими координатами |

---

## Editor panel (без регрессии)

| Аспект | MUST |
|--------|------|
| Numeric x1–y4 | Работают; изменение поля → polygon обновляется |
| Frame drag | Изменение polygon → поля обновляются |
| «Сохранить» | RU: «Сохранение», «Сохранено», «Ошибка сохранения: …» |
| «Отмена» | Сброс draft к server state; abort active frameDrag |
| lineIndex/orderIndex | Не отображаются как editable; frame drag их не меняет |

---

## Text DnD (без регрессии, FR-011)

| Аспект | MUST |
|--------|------|
| Mechanism | HTML5 DnD на `.word` в `.recognized-text` — **без изменений** |
| Frame edit | Mouse events на SVG — **отдельный** pipeline |
| «Сохранить порядок» | Без изменений; frame coords не отправляются |

---

## CSS classes (NEW)

| Class | Назначение |
|-------|------------|
| `.frame-handle` | Угловой маркер (fill/stroke `#1b7ff5`) |
| `.scan polygon.selected` | Существующий; MAY add transparent fill for move hit-area |
| Cursors | `grab`/`grabbing` on move zone; resize-style on handles (optional) |

Существующие `.word.dragging`, `.line-gap-drop` — без изменений.

---

## Drag lifecycle (frame)

| Событие | MUST |
|---------|------|
| mousedown (selected, interior) | Start move drag; capture snapshot |
| mousedown (selected, handle i) | Start corner drag |
| mousemove (window) | Update draft coords |
| mouseup (window) | End frameDrag; detach listeners |
| Cancel / scan change | Abort frameDrag |

---

## Out of scope

- REST endpoints для «только координаты».
- Autosave on mouseup.
- Touch / multi-select frames.
- Clamp coords to image bounds.
- DnD слов между рамками на scan.
- Auto-revectorize on frame move.
