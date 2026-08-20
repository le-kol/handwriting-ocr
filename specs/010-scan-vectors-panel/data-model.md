# Data Model: Панель просмотра всех векторизованных слов скана

**Feature**: `010-scan-vectors-panel`  
**Date**: 2026-08-20

Клиент не вводит новых таблиц БД и не меняет серверную модель Word. Изменения — UI-представление, локальное состояние экрана и новый компонент панели векторов.

## Entities (client view)

### Word (без изменений типа)

Зеркало серверного JSON; `curvePoints` — источник миниатюры в слоте.

| Field | Type | Notes |
|-------|------|-------|
| id | number | 0 = несохранённый черновик |
| curvePoints | `number[][][] \| null \| undefined` | Миниатюра в слоте при `isWordVectorized` |

---

### Текстовая раскладка (`layoutLines` / `displayLines`)

| Аспект | Правило |
|--------|---------|
| Структура | `Word[][]` — строки слов в порядке чтения |
| Источник для панели векторов | **Тот же** `displayLines`, что для `recognized-text` |
| При DnD | Панель следует локальному `layoutLines` до и после «Сохранить порядок» |

---

### Слот панели векторов (`VectorWordSlot` — UI, не серверная сущность)

| Поле / аспект | Тип / правило |
|---------------|---------------|
| lineIndex | number | Индекс строки в `displayLines` |
| positionInLine | number | Позиция слова в строке |
| word | Word | Слово на этой позиции |
| slotKind | enum | `thumbnail` \| `empty` \| `neutral` |
| isSelected | boolean | `draft !== null && draft.id === word.id` |

#### Правила отображения слота

| Условие | slotKind | Содержимое |
|---------|----------|------------|
| `isWordVectorized(word)` && valid curves | `thumbnail` | `WordCurveThumbnail` |
| `isWordVectorized(word)` && invalid/empty curves | `neutral` | Без path; UI не падает |
| `!isWordVectorized(word)` | `empty` или `neutral` | Пустая область или dashed маркер без штрихов |

#### Правила взаимодействия

| Действие | MUST |
|----------|------|
| click | `onSelectWord(word)` — для любого slotKind |
| selected styling | Класс `.selected` на контейнере слота при `isSelected` |

---

### Панель векторов (`ScanVectorsPanel`)

| Prop / state | Тип | Описание |
|------------|-----|----------|
| lines | `Word[][]` | `displayLines` |
| selectedWordId | `number \| null` | `draft?.id` |
| onSelectWord | `(word: Word) => void` | `handleWordSelect` |

Структура DOM: секция с заголовком; для каждой строки `lines[i]` — row с N слотов; **без** line-gap-drop из текстового блока.

---

### Панель векторов — пустые сценарии

| Сценарий | Отображение |
|----------|-------------|
| `lines.length === 0` | Минимальное пустое состояние секции (без строк слотов) |
| Все слова невекторизованы | Зеркало всех строк; все слоты empty/neutral |
| Смена `scanId` | Панель пересобирается из новых `words`/`displayLines` |

---

## UI state (экран App) — дополнения

| State | Изменение |
|-------|-----------|
| `words`, `layoutLines`, `draft` | Без новых полей; панель читает существующие |
| `vectorizingWordId`, `isBatchVectorizing` | Без изменений; панель обновляется после success handlers |

### Переходы влияющие на панель

| Событие | Эффект на панель |
|---------|------------------|
| Одиночная векторизация success | Слот слова → thumbnail в той же позиции |
| Batch vectorize success | Все успешные слоты → thumbnail; порядок из `displayLines` |
| Delete word | Слот исчезает (строка/позиция удалены из layout) |
| DnD reorder | Слоты перемещаются с словами |
| Save layout | Порядок слотов = сохранённый layout |
| Select word (текст/рамка/слот) | Подсветка слота синхронизирована |

---

## Validation rules (UI)

1. Слот MUST NOT рисовать SVG path для невекторизованного слова.
2. Порядок слотов MUST совпадать с `displayLines` (строка × позиция).
3. Клик по слоту MUST NOT открывать отдельную логику — только общий select.
4. Панель MUST NOT накладываться на `.scan` / `ScanFrameOverlay`.
