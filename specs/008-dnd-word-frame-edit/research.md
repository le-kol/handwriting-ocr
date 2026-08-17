# Research: Редактирование рамки слова на скане через drag-and-drop

**Feature**: `008-dnd-word-frame-edit`  
**Date**: 2026-08-17

## 1. Mouse events vs HTML5 Drag-and-Drop

**Decision**: Редактирование рамки на SVG реализовать через **`mousedown` / `mousemove` / `mouseup`** (с `window`-listeners на время drag), **не** через HTML5 `draggable` / `dataTransfer`.

**Rationale**: FR-011 — DnD порядка слов в `.recognized-text` уже использует HTML5 DnD (`handleDragStart`, `draggedWordId`). Смешение двух DnD-моделей на одном экране повышает риск регрессии и случайного старта text-drag при правке рамки.

**Alternatives considered**:
- **HTML5 DnD на polygon** — конфликт с text DnD; `dragStart` на рамке может мешать выбору.
- **Pointer Events unified API** — допустимо, но mouse events достаточны для scope (мышь only).

## 2. Преобразование координат клиент → image space

**Decision**: Использовать **`SVGSVGElement.createSVGPoint()`** + **`getScreenCTM().inverse()`** для перевода `(clientX, clientY)` в координаты viewBox (пиксели исходного изображения).

**Rationale**: Brownfield уже задаёт `viewBox={"0 0 " + naturalWidth + " " + naturalHeight}`; ручной масштаб через `getBoundingClientRect` дублирует логику браузера и хуже при CSS-масштабировании.

**Alternatives considered**:
- **Linear scale от bounding rect img** — работает, но дублирует viewBox; отклонено.
- **offsetX/offsetY на img** — не применимо к overlay SVG.

## 3. Зона перемещения vs угловые маркеры

**Decision** (из clarifications):
- **Move**: внутренняя заливка `<polygon>` выбранного слова (`fill` может быть `transparent` или `rgba` для hit-test; сейчас `fill: none` — **добавить** `fill: transparent` или небольшую opacity только для selected polygon).
- **Corner**: отдельные `<circle class="frame-handle">` на вершинах, рендер **поверх** polygon; handles имеют **приоритет** (проверка hit handle до move на mousedown).

**Rationale**: FR-001, FR-001a; SVG `fill: none` даёт hit только по stroke — недостаточно для «внутренней заливки»; selected polygon needs fill for interior grab.

**Alternatives considered**:
- **Stroke-only hit area** — против spec clarification Q1.
- **Центральная move-handle** — отклонено на clarify.

## 4. Выбор слова vs начало drag (FR-003)

**Decision**: На `mousedown` по рамке:
- если `draft?.id !== word.id` (слово не выбрано) → только `handleWordSelect(word)`; **не** начинать `frameDrag`;
- если слово уже выбрано → определить target (handle vs interior) и начать `frameDrag`.

**Rationale**: Clarification Q2 (Option C); предотвращает случайный сдвиг при выборе.

**Alternatives considered**:
- **Select + move в одном жесте** — отклонено.
- **Drag threshold на невыбранной** — отклонено.

## 5. Перекрывающиеся рамки (FR-003a)

**Decision**: На `mousedown` выполнять **явный hit-test** по всем словам: точка внутри четырёхугольника (ray-casting или winding); среди попаданий выбрать слово с **минимальным `orderIndex`**. Не полагаться только на порядок отрисовки SVG.

**Rationale**: Clarification Q4; z-order по массиву `words` не гарантирует min orderIndex on top.

**Alternatives considered**:
- **Render lower orderIndex last** — хрупко при неупорядоченном массиве.
- **Smallest area** — отклонено.

## 6. Алгоритмы изменения координат

**Decision**:
- **Move**: `translateFrame(word, dx, dy)` — прибавить `dx`/`dy` ко всем x1–x4/y1–y4 от snapshot на каждом move event (или delta от предыдущей позиции).
- **Corner**: `setCorner(word, cornerIndex, x, y)` — менять только пару координат вершины (0→x1,y1; 1→x2,y2; …).
- **Rounding**: `Math.round` на все координаты при записи в draft.

**Rationale**: FR-001, FR-002, FR-005; согласованность с `<input type="number">` целых значений.

**Alternatives considered**:
- **Float до save** — риск расхождения preview vs saved.
- **Snap to grid** — out of scope.

## 7. Начальная рамка нового слова (FR-008)

**Decision**: Helper **`defaultCenterFrame(imageWidth, imageHeight)`** — axis-aligned rectangle **80×40 px**, центр в `(width/2, height/2)`:

```text
x1,y1 = cx - 40, cy - 20   (top-left)
x2,y2 = cx + 40, cy - 20   (top-right)
x3,y3 = cx + 40, cy + 20   (bottom-right)
x4,y4 = cx - 40, cy + 20   (bottom-left)
```

Порядок вершин — как у Yandex / `boxPoints` (согласован с существующим OCR).

**Rationale**: Clarification Q3; 80×40 достаточно для захвата handles; не привязано к конкретному слову на скане.

**Alternatives considered**:
- **(0,0) degenerate** — текущий код; заменяется.
- **Процент от размера изображения** — избыточно; фиксированный размер проще.

## 8. Синхронизация draft и layoutLines

**Decision**: Frame drag обновляет **только `draft`** (и отображение selected polygon). **`layoutLines` не менять** — координаты в layout-копиях слов синхронизируются при save/refetch или остаются stale до save (как при числовом edit: draft — источник правды для selected word display).

**Rationale**: FR-010; brownfield `handleCoordinateChange` уже меняет только draft. При save `fetchWords` обновит `words`; layout sync через `syncLayoutFromWords` на cancel.

**Note**: Если в layoutLines хранятся копии Word с координатами — при save слова список words обновляется; layout может содержать старые coords до перезагрузки layout — **проверить** `replaceWordIdInLayout` / post-save refresh; для display на scan используется `words` + `draft` overlay, не layout.

## 9. Угловые маркеры — размер hit-area

**Decision**: `<circle r="8">` в **screen pixels** через `vector-effect: non-scaling-stroke` на handle или вычисление r в user units как `8 * (viewBoxWidth / svgClientWidth)`.

**Rationale**: SC-004, SC-005 — достаточная hit-area на уменьшенном скане.

**Alternatives considered**:
- **r=4 user units** — слишком мало на больших сканах.

## 10. Регрессии и lifecycle

**Decision**:
- `handleCancelClick` / unmount: abort `frameDrag`, remove window listeners.
- `handleDragStart` (text): без изменений; frame drag не активен одновременно (разные pointer targets).
- Selected polygon: `fill: rgba(27, 127, 245, 0.08)` optional для UX; stroke остаётся `#1b7ff5`.

**Rationale**: Edge cases spec; FR-011.

## Resolved clarifications

Все пункты Technical Context закрыты без `NEEDS CLARIFICATION`. Clarifications session 2026-08-17 интегрированы в research decisions 3–5, 7.
