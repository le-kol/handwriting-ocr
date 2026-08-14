# Contract: UI — удаление скана

**Feature**: `006-delete-scan`  
**Date**: 2026-08-14

Клиент вызывает [delete-scan.md](./delete-scan.md). Список сканов — [scans-list.md](../../005-scans-table-thumbnails/contracts/scans-list.md) (без изменений контракта GET).

## Точки вызова

| Место | Подпись | Аргумент `id` | Confirm |
|-------|---------|---------------|---------|
| Панель редактора | «Удалить скан» | текущий `scanId` | нет |
| Строка таблицы | «Удалить» | `item.id` строки | нет |

Обе кнопки вызывают **один** обработчик `handleDeleteScan(id: number)`.

- Кнопка в редакторе: только если `scanId !== null` (иначе скрыта или disabled).
- Кнопка в строке: `event.stopPropagation()` — клик **не** открывает скан (`handleScanRowClick`).

## Fetch

```text
DELETE /api/Scans/{id}
```

- Успех: `response.status === 204`
- Ошибка: `throw new Error(await response.text())`

Хелпер `deleteScan(id)` — единственная точка HTTP для удаления скана.

## После успеха

### Общее

- Сброс UI только после **204**; при ошибке — текст на русском, данные не «притворяются» удалёнными.

### Если `id === scanId` (удалён текущий открытый скан)

**Полный сброс** до состояния «до выбора/загрузки скана» (FR-008) — одна функция-хелпер, без дублирования setter'ов в `handleDeleteScan`:

1. `clearToEmptyState()` в `App.tsx`, которая последовательно:
   - `setScanId(null)`
   - `setSelectedFile(null)`
   - `setUploadStatus(null)`
   - `resetEditorState()` (расширенный, см. ниже)
   - сброс `<input type="file">` через ref (`input.value = ""`), чтобы повторно можно было выбрать тот же файл

2. `resetEditorState()` MUST дополнительно сбрасывать in-flight и статусы редактора: `isRecognizing`, `isSaving`, `isSavingLayout`, `wordsOpenError`, `recognizeStatus` (уже в reset), `deleteScanStatus` (при успехе — `null`).

3. **Не** включать `setScanId` / upload-поля **внутрь** `resetEditorState()` — переключение строки таблицы и загрузка файла по-прежнему вызывают только `resetEditorState()` + свой `setScanId` / `setSelectedFile`.

`handleDeleteScan` при успехе и `id === scanId` вызывает **только** `clearToEmptyState()`, не отдельный блок `setWords(null)` и т.п.

### Если удаление инициировано из строки таблицы

1. Перезапрос текущей страницы: `loadScansPage(listPage)` (или эквивалент через `fetchScansPageWithRetry`).
2. Если после ответа `items.length === 0` и `listPage > 1` → `setListPage(listPage - 1)`.

Если `id !== scanId`, состояние редактора **не** менять.

### Удаление из панели редактора (не из таблицы)

Перезапрос таблицы **не** обязателен (строка может оставаться до ручного листания/refresh — по spec path 1).

## In-flight / disabled

| Условие | Поведение |
|---------|-----------|
| `isDeletingScan` | обе кнопки удаления disabled |
| `isRecognizing` / `isBatchVectorizing` / `vectorizingWordId` | рекомендуется disabled (как у vectorize) |
| Повторный DELETE → 404 | показать ошибку; не сбрасывать редактор «как успех» |

## Ошибки

| Событие | Поведение |
|---------|-----------|
| `!ok` или сеть | `deleteScanStatus` (или аналог) — текст RU; `scanId` и строки таблицы без изменений |
| 404 на повторном клике | сообщение «Не найдена запись в БД»; UI стабилен |

## CSS / разметка

- Колонка или ячейка с кнопкой «Удалить» в `<tr>` таблицы `.scans-table`.
- Кнопка «Удалить скан» в `.workspace-side` рядом с «Распознать текст» и «Добавить слово».

## Вне scope UI

- Confirm-диалог
- Массовое выделение и удаление
- Undo
- Авто-refresh таблицы после delete только из панели редактора
