# Data Model: Редактирование рамки слова на скане через drag-and-drop

**Feature**: `008-dnd-word-frame-edit`  
**Date**: 2026-08-17

Клиент не вводит новых сущностей БД и не меняет серверную модель Word. Изменения — черновик координат, UI state frame drag и client-side helpers.

## Entities (client view)

### Word (без изменений типа)

Зеркало серверного JSON; см. brownfield `App.tsx`.

| Field | Type | Notes |
|-------|------|-------|
| id | number | 0 = несохранённый черновик |
| text | string | Без изменений |
| x1..y4 | number | Пиксели исходного изображения; целые после drag |
| orderIndex, lineIndex | number | **Не меняются** при frame drag |
| curvePoints | optional | Не пересчитываются при сдвиге рамки |

Frame drag меняет только x1–y4 в **`draft`**, не `orderIndex` / `lineIndex`.

---

### Рамка слова (логическая проекция Word)

| Вершина | Поля | Порядок в `boxPoints` |
|---------|------|------------------------|
| 0 | x1, y1 | первая |
| 1 | x2, y2 | вторая |
| 2 | x3, y3 | третья |
| 3 | x4, y4 | четвёртая |

Четырёхугольник может быть произвольным (не обязательно axis-aligned).

---

### Черновик (`draft`)

| Аспект | Правило |
|--------|---------|
| Источник правды для selected UI | `draft` для текста и координат до «Сохранить» |
| Отображение на scan | Selected word polygon + handles из `draft`; остальные — из `words` |
| Новое слово id=0 | Начальная рамка `defaultCenterFrame(imageSize)` |
| Persist | `POST/PUT` через `wordContentBody(draft)` |

---

## UI state (экран App)

| State | Type | Назначение |
|-------|------|------------|
| draft | `Word \| null` | Черновик редактируемого слова (без изменений роли) |
| imageSize | `{ width, height } \| null` | naturalWidth/Height для viewBox и defaultCenterFrame |
| frameDrag | `FrameDrag \| null` | **NEW** — активное перетаскивание рамки/угла |
| draggedWordId, dropTarget, gapDropTarget | — | Text DnD (без изменений) |

### FrameDrag (NEW)

| Field | Type | Описание |
|-------|-----|----------|
| mode | `'move' \| 'corner'` | Перемещение всей рамки или одного угла |
| cornerIndex | `0..3` (optional) | Индекс вершины при `mode === 'corner'` |
| startImageX, startImageY | number | Точка mousedown в image space |
| snapshot | Word | Копия draft на начало drag (база для delta) |

Инвариант: `frameDrag !== null` только когда `draft !== null` и слово было выбрано **до** mousedown.

---

## State transitions

### Select word (без drag)

```text
[mousedown on polygon, word W not selected]
  --> handleWordSelect(W); draft = copy(W); frameDrag = null
  --> coordinates unchanged even if mouse moves before mouseup
```

### Start move drag

```text
[draft selected, mousedown on interior (not handle)]
  --> frameDrag = { mode: 'move', snapshot: draft, startImageX/Y }
  --> window mousemove/mouseup attached
```

### Move drag update

```text
[frameDrag.mode = 'move', mousemove to (x, y)]
  --> dx = x - startImageX, dy = y - startImageY (or incremental)
  --> draft = translateFrame(snapshot, dx, dy) rounded
  --> panel x1–y4 reflect draft (controlled inputs)
```

### Corner drag

```text
[frameDrag.mode = 'corner', cornerIndex = i]
  --> draft.corner i = round(mouse position); other corners from snapshot base
```

### End drag

```text
[mouseup]
  --> frameDrag = null; remove window listeners
  --> no API call (FR-006)
```

### Save / Cancel

```text
[Save] --> POST/PUT wordContentBody(draft) --> fetchWords --> draft = saved
[Cancel] --> draft = null; frameDrag = null; syncLayoutFromWords(words)
```

Frame drag MUST NOT trigger layout save or change `layoutLines` indices.

---

## Client-side helpers (NEW)

| Helper | Назначение |
|--------|------------|
| `defaultCenterFrame(w, h)` | Начальный rect 80×40 по центру |
| `translateFrame(word, dx, dy)` | Сдвиг всех вершин |
| `setCorner(word, i, x, y)` | Одна вершина |
| `clientToImagePoint(svg, cx, cy)` | Screen → viewBox |
| `pointInQuad(px, py, word)` | Hit-test вершин |
| `findWordAtPoint(words, draft, px, py)` | Min orderIndex among hits |

---

## Upstream APIs (без изменений)

| Операция | Endpoint |
|----------|----------|
| Создание слова | `POST /api/Scans/{id}/words` |
| Обновление контента | `PUT /api/Scans/{id}/words/{wordId}` |
| Body | `{ text, x1..y4 }` via `wordContentBody` |

---

## Out of scope

- Новые поля Word / Liquibase.
- `PUT …/words/layout` при frame drag.
- Touch / keyboard frame edit.
- Автопересчёт curvePoints.
