# Data Model: Inline-редактирование текста слова

**Feature**: `009-inline-word-text-edit`  
**Date**: 2026-08-18

Backend и таблица `words` **не меняются**. Новые сущности — только клиентский UI state и helpers для inline-режима.

## Entities (client view)

### Word (без изменений типа)

| Field | Type | Notes |
|-------|------|-------|
| id | number | 0 = несохранённый черновик |
| text | string | Редактируется inline или в панели |
| x1..y4 | number | При inline-autosave уходят вместе с text |
| orderIndex, lineIndex | number | **Не меняются** при inline text edit |
| curvePoints | optional | Не пересчитываются при inline save |

**Last saved text baseline** (derived, не отдельное поле state):

```text
lastSavedText(wordId, words):
  id === 0  → ''
  id > 0    → words.find(w => w.id === wordId)?.text ?? ''
```

---

### Черновик (`draft`)

| Аспект | Правило |
|--------|---------|
| Роль | Единый источник правды для selected word (text + coords) |
| Inline + panel | Оба редактируют `draft.text` |
| Persist | Panel «Сохранить» или inline autosave → `POST/PUT` + `wordContentBody(draft)` |
| Escape inline | Только `draft.text` → `lastSavedText`; coords без изменений |

---

## UI state (экран App)

| State | Type | Назначение |
|-------|------|------------|
| draft | `Word \| null` | Черновик (без изменений роли) |
| inlineEditingWordId | `number \| null` | **NEW** — id слова в inline-режиме (`0` допустим для нового слова); `null` = нет inline |
| pendingWordGesture | `PendingWordGesture \| null` | **NEW** — отслеживание mousedown для click vs drag |
| isSaving | boolean | Блокировка повторного save (shared panel + inline) |
| saveStatus | string \| null | RU статусы («Сохранение», «Сохранено», ошибка) |
| draggedWordId, dropTarget, gapDropTarget | — | Text DnD (без изменений) |

### PendingWordGesture (NEW)

| Field | Type | Описание |
|-------|-----|----------|
| wordId | number | Слово под курсором |
| startClientX | number | mousedown X |
| startClientY | number | mousedown Y |
| clickClientX | number | Для caret (обычно = mousedown X) |
| exceededThreshold | boolean | true после смещения > 5px |

Инвариант: активен только когда `draft?.id === wordId && inlineEditingWordId === null`.

---

## State transitions

### Select word (first click / frame)

```text
[click word W, W not selected]
  --> selectWord(W); inlineEditingWordId = null; pendingGesture = null
```

### Enter inline (click on already selected)

```text
[mousedown on W, draft.id === W.id, not inline]
  --> pendingGesture = { wordId: W.id, startX/Y, clickX }
[mousemove, distance > 5px]
  --> pendingGesture.exceededThreshold = true
[mouseup, !exceededThreshold, draft.id === W.id]
  --> inlineEditingWordId = W.id; pendingGesture = null
  --> focus input; set caret from clickClientX/Y
```

### Inline edit (typing)

```text
[input onChange]
  --> updateDraftText(text)  // draft + layoutLines sync (FR-007)
```

### Commit inline (Enter / blur, text dirty)

```text
[commitInlineEdit]
  --> if draft.text === lastSavedText(draft.id, words): exit inline, no API
  --> else persistWordContent(draft)
        success: inlineEditingWordId = null; words/draft updated; saveStatus
        error: stay inline (FR-015); saveStatus error; draft.text preserved
```

### Commit inline (Enter / blur, text unchanged)

```text
  --> inlineEditingWordId = null; no API (FR-005, SC-005)
```

### Escape inline

```text
[Escape]
  --> draft.text = lastSavedText; sync layoutLines text
  --> inlineEditingWordId = null; no API (FR-006)
```

### Cancel panel (during inline)

```text
[Отмена]
  --> inlineEditingWordId = null
  --> handleCancelClick (full reset draft, layout sync) (FR-016)
```

### Switch word during inline

```text
[blur inline because click other word]
  --> commitInlineEdit(current) first
  --> then selectWord(newWord); inlineEditingWordId = null
```

---

## Client-side helpers (NEW)

| Helper | Назначение |
|--------|------------|
| `lastSavedTextForWord(id, words)` | Baseline для dirty check и Escape |
| `DRAG_CLICK_THRESHOLD_PX` | 5 |
| `distanceExceeded(gesture, x, y)` | click vs drag |
| `caretIndexFromClick(input, clientX, clientY)` | FR-003 |
| `persistWordContent(draft)` | Shared POST/PUT + refresh words/layout |
| `updateDraftText(text)` | draft + layoutLines (extract from handleTextChange) |

---

## Upstream APIs (без изменений)

| Операция | Endpoint |
|----------|----------|
| Создание слова | `POST /api/Scans/{id}/words` |
| Обновление контента | `PUT /api/Scans/{id}/words/{wordId}` |
| Body | `{ text, x1..y4 }` via `wordContentBody` |

Inline autosave MUST NOT вызывать `PUT …/words/layout`.

---

## Out of scope

- Новые поля Word / Liquibase.
- PUT только text без coords.
- Multi-word inline.
- Touch gestures.
- Autosave panel «Текст» field.
- Auto-revectorize on text save.
