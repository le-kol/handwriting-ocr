# Data Model: Единое представление слов скана

**Feature**: `004-unified-words-view`  
**Date**: 2026-08-12

Клиент не вводит новых таблиц БД и не меняет серверную модель Word. Изменения — UI-представление, локальное состояние экрана и client-side helpers.

## Entities (client view)

### Word (без изменений типа)

Зеркало серверного JSON; поле `curvePoints` уже добавлено в фиче `002`.

| Field | Type | Notes |
|-------|------|-------|
| id | number | 0 = несохранённый черновик |
| scanId | number | Владелец-скан |
| text | string | Отображается в текстовой раскладке без модификации |
| x1..y4 | number × 8 | Рамка на скане (SVG overlay) |
| orderIndex, lineIndex | number | Порядок / строка |
| curvePoints | `number[][][] \| null \| undefined` | Векторное представление в СК фрагмента |

#### Правила статуса векторизации (UI)

| Условие | Индикатор в тексте | Миниатюра в draft |
|---------|-------------------|-------------------|
| `!isWordVectorized(word)` | «Не векторизовано» (CSS) | Нет |
| `isWordVectorized(word)` | «Векторизовано» (CSS) | `WordCurveThumbnail` |

Функция `isWordVectorized` — из `curvePoints.ts` (фича 002).

---

### Текстовая раскладка (`layoutLines`)

| Аспект | Правило |
|--------|---------|
| Структура | `Word[][]` — строки слов в порядке чтения |
| Единственный list view | После фичи 004 таблица `words-table` не используется |
| Индикатор | Каждый span `.word` получает класс статуса векторизации |
| Drag-and-drop | Без изменений; индикатор на том же span, что draggable |

---

### Панель редактирования (`draft`)

| Элемент | Условие видимости | Действие |
|---------|-------------------|----------|
| Поля text, x1..y4 | `draft !== null` | Как сейчас |
| Сохранить / Отмена | `draft !== null` | Как сейчас |
| `WordCurveThumbnail` | `draft` векторизован | Только просмотр |
| «Векторизовать» | `draft.id > 0` && !векторизован | POST vectorize |
| «Удалить слово» | `draft.id > 0` | DELETE word; без confirm |

Черновик `id === 0`: «Векторизовать» и «Удалить слово» **недоступны** (нет server id).

---

## UI state (экран App)

| State | Type | Назначение |
|-------|------|------------|
| words | `Word[] \| null` | Список слов скана |
| layoutLines | `Word[][] \| null` | Локальная раскладка для текста + DnD |
| draft | `Word \| null` | Выбранное слово + форма редактирования |
| vectorizingWordId | `number \| null` | Активная одиночная векторизация |
| isBatchVectorizing | `boolean` | **NEW** — активная пакетная векторизация |
| vectorizeStatus | `string \| null` | Сообщения одиночной / пакетной векторизации |
| deleteStatus | `string \| null` | **NEW (рекомендуется)** — сообщения удаления |

Удаляемые / неиспользуемые после фичи: разметка и state, связанные только с `words-section` / `words-table` (сами `words` и `vectorizingWordId` остаются).

---

## State transitions

### Одиночная векторизация (из draft)

```text
[draft выбран, !vectorized, idle]
  --(«Векторизовать»)--> [vectorizingWordId = id]
  --(200 Word)-----------> [words/layout/draft обновлены; vectorized CSS; миниатюра в draft]
  --(!ok)----------------> [idle; vectorizeStatus = ошибка; данные без изменений]
```

Guard: `scanId`, `word.id > 0`, `vectorizingWordId === null`, `!isBatchVectorizing`.

### Пакетная векторизация

```text
[idle, scanId set]
  --(«Векторизовать все слова»)--> [isBatchVectorizing = true]
  --(200 Word[])-----------------> [setWords; syncLayoutFromWords; merge draft if same id]
  --(!ok top-level)---------------> [isBatchVectorizing = false; сообщение; words/layout без замены]
```

### Удаление слова

```text
[draft с id > 0]
  --(«Удалить слово»)--> [isDeleting = true опционально]
  --(204)---------------> [words без id; removeWordFromLayout; draft = null если id совпал]
  --(404/…)-------------> [сообщение; words/layout/draft без изменений]
```

### Смена скана / recognize

Без изменений: сброс draft, vectorize state; `syncLayoutFromWords` при новом наборе слов.

---

## Client-side helpers (NEW)

| Helper | Signature (логически) | Назначение |
|--------|----------------------|------------|
| removeWordFromLayout | `(lines, wordId) => Word[][] \| null` | Убрать слово из всех строк layout |
| deleteWord | `(scanId, wordId) => Promise<void>` | DELETE; throw Error(text) при !ok |
| vectorizeBatch | `(scanId) => Promise<Word[]>` | POST vectorize-batch; parse JSON |

Существующие: `applyWordUpdateInLayout`, `syncLayoutFromWords`, `isWordVectorized`, `handleVectorizeClick` (расширить guards).

---

## Out of scope

- Новые поля Word на сервере.
- Liquibase / PostgreSQL.
- Confirm/undo удаления.
- Overlay вектора на скан.
- Редактирование curvePoints.
