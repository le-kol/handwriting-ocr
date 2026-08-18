# Contract: UI — inline-редактирование текста слова

**Feature**: `009-inline-word-text-edit`  
**Date**: 2026-08-18

Клиент **не** добавляет HTTP-маршрутов. Контракт описывает `.recognized-text` и потребление существующего API сохранения слова.

## Upstream APIs (без изменений)

| Операция | Контракт |
|----------|----------|
| Создание слова | `POST /api/Scans/{id}/words` — body `{ text, x1..y4 }` |
| Обновление слова | `PUT /api/Scans/{id}/words/{wordId}` — body `{ text, x1..y4 }` |
| Ошибки | Plain text, русский; `response.text()` при `!ok` |

Inline autosave MUST использовать те же endpoints и body, что и кнопка «Сохранить».

---

## Word span structure (recognized-text)

| Режим | Рендер | MUST |
|-------|--------|------|
| Normal | `<span class="word …">` + text | `draggable={true}`; click → select |
| Selected, not inline | `<span class="word selected …">` | click/drag gesture resolver |
| Inline editing | `<input class="word word-inline-input selected …">` | `draggable={false}`; controlled `value={draft.text}` |

Пробел между словами (`positionInLine > 0 ? " " : null`) — без изменений.

---

## Selection flow (FR-001, FR-002)

| Аспект | MUST |
|--------|------|
| Первый клик по невыбранному `.word` | `selectWord`; panel open; **не** inline |
| Клик по `.word` когда `draft.id === word.id` | Вход в inline **если** жест — click (см. gesture) |
| Выбор по рамке на scan | `selectWord`; **не** inline до клика по тексту |
| После выбора по рамке | Один клик по `.word` в тексте → inline (если без drag threshold) |
| Клик по другому слову | Select only; **не** inline на первом клике |

---

## Click vs drag gesture (FR-017)

| Аспект | MUST |
|--------|------|
| Preconditions | `draft.id === word.id`, `inlineEditingWordId === null` |
| Threshold | 5px screen movement |
| ≤ threshold + mouseup | Enter inline |
| > threshold | HTML5 text DnD как сейчас; **не** enter inline |
| Inline active | `draggable={false}` на этом слове |

---

## Inline input behavior

| Событие | MUST |
|---------|------|
| Mount | `autoFocus`; caret по горизонтали клика (FR-003) |
| `onChange` | Sync `draft.text` + `layoutLines` + panel field (FR-007) |
| Enter | `preventDefault`; commit inline (FR-004) |
| blur | commit inline (FR-004) |
| Escape | revert text to last saved; exit inline; no API (FR-006) |

---

## Inline commit / autosave

| Аспект | MUST |
|--------|------|
| Dirty check | `draft.text !== lastSavedTextForWord(id, words)` |
| Unchanged text | Exit inline; **0** API calls (FR-005) |
| Changed text | `POST` or `PUT` with `wordContentBody(draft)` incl. coords (FR-009) |
| Success | Exit inline; `saveStatus` «Сохранено»; refresh `words`; update `draft` |
| Error | **Stay inline**; preserve typed text; RU error (FR-015) |
| New word id=0 | POST on dirty commit; replace id=0 in layout (existing flow) |

---

## Editor panel (FR-008, FR-016)

| Аспект | MUST |
|--------|------|
| Field «Текст» | Controlled `draft.text`; **no** autosave on change |
| «Сохранить» | Explicit save only (panel edits) |
| «Отмена» during inline | Full cancel: exit inline + close panel + revert text **and** coords to server |
| Status | Shared `saveStatus` for inline autosave and panel save |

---

## Regression contracts (FR-011, FR-012)

| Область | MUST |
|---------|------|
| Text DnD | drop on word/line/gap — без изменений |
| Frame drag on scan | Mouse events on SVG — без изменений |
| «Сохранить порядок» | Без изменений |
| Recognize / batch vectorize / delete | Без изменений |
| curvePoints | Не редактируются; не auto-revectorize |

---

## CSS classes (NEW)

| Class | Назначение |
|-------|------------|
| `.word-inline-input` | Inline `<input>`; inherit font; selected outline |

Существующие `.word.selected`, `.word.dragging`, `.line-gap-drop` — без семантических изменений.

---

## Out of scope

- REST «text only» endpoint.
- Panel field autosave.
- Multi-word inline.
- Inline on scan frame label.
- contenteditable spans.
