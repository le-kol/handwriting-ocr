# Contract: Words table screen (UI)

**Feature**: `012-global-words-table`  
**Date**: 2026-08-21

## Navigation

| Element | Behavior |
|---------|----------|
| Кнопка «Сканы» | `appView = 'scans'`; при загрузке приложения активна по умолчанию |
| Кнопка «Слова» | `appView = 'words'`; показывается только `WordsTableScreen` |
| Клик строки таблицы слов | `appView = 'scans'` → открыть скан `scanId` → выбрать слово `wordId` |

## WordsTableScreen layout

| Region | Content |
|--------|---------|
| Фильтры | Поле поиска (debounce ~300 ms); select статуса: все / векторизовано / не векторизовано; select скана: все + id из `GET /api/Scans?page=…` |
| Таблица | Колонки: текст, scanId, статус векторизации, миниатюра (`WordCurveThumbnail` если `isWordVectorized`) |
| Пагинация | «Назад» / «Страница N из M» / «Вперёд»; данные из `GET /api/Words` |
| Экспорт | «Экспортировать всё»; «Экспортировать отфильтрованное» |

## Data loading

- Список слов: `GET /api/Words` с текущими `page`, `search`, `vectorized`, `scanId`
- Список сканов для фильтра: существующий `GET /api/Scans?page=…` (при необходимости несколько страниц или только первая — достаточно id)
- Константа `WORDS_PAGE_SIZE = 30` (совпадает с `ScanList:PageSize`)

## Row click

```text
onRowClick(word):
  setAppView('scans')
  await openScan(word.scanId)   // существующий handleScanRowClick
  selectWord by word.id         // после загрузки words
```

Если слово/скан не найден после перехода — текстовое сообщение (plain error from API).

## Export buttons

| Button | Fetch params | Output file | Disabled when |
|--------|--------------|-------------|---------------|
| Экспортировать всё | все страницы без search/scanId/vectorized (или vectorized=all) | `words-dataset-all.jsonl` | опционально never (0 записей → сообщение «0») |
| Экспортировать отфильтрованное | snapshot search/vectorized/scanId на момент клика, все страницы | `words-dataset-filtered.jsonl` | `totalCount === 0` OR `vectorized === 'false'` |

During export: только нажатая кнопка disabled; поиск/фильтры/пагинация таблицы активны.

## Status display

- «Векторизовано» / «Не векторизовано» — по `isWordVectorized(word)` (клиент)
- Миниатюра только для векторизованных; иначе пустая ячейка или «—»

## Messages (RU)

- Успех экспорта: `Экспортировано слов: {N}`
- Ошибка загрузки: `Ошибка экспорта: {message}`
- Пустая таблица: нейтральный текст без ошибки
- Нет слов для отфильтрованного экспорта: кнопка disabled или подпись «Нет слов для экспорта»

## Out of scope

- Сортировка по клику на заголовок колонки
- Inline-редактирование в таблице
- Массовые операции над словами

## Files (implementation hint)

- `handwritingocr.client/src/WordsTableScreen.tsx` — экран таблицы
- `handwritingocr.client/src/exportWordsDataset.ts` — JSONL + download
- `handwritingocr.client/src/App.tsx` — `appView`, навигация, переход в редактор
