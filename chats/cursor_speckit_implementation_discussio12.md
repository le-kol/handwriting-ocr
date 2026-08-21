# Speckit implementation discussion
_Exported on 8/21/2026 at 08:55:16 GMT+7 from Cursor (3.16.29)_

---

**User**

/speckit-implement 

---

**Cursor**

Запускаю speckit-implement: сначала проверю хуки, prerequisites и чеклисты.


Чеклист пройден (16/16). Изучаю контракты и существующий код.


Чеклист пройден. Начинаю реализацию по фазам.


Исправляю переиспользование параметров Npgsql между двумя командами.


Сборка прошла успешно. Отмечаю задачи выполненными.


## Чеклист

| Checklist | Total | Completed | Incomplete | Status |
|-----------|-------|-----------|------------|--------|
| requirements.md | 16 | 16 | 0 | ✓ PASS |

## Реализация завершена

Фича **012-global-words-table** реализована полностью (18/18 задач).

### Backend
- **`WordListPage.cs`** — модель ответа `{ items, totalCount }`
- **`WordDbService.GetWordsPageAsync`** — кросс-скановый список с фильтрами (поиск ILIKE с экранированием, векторизация, scanId), сортировка `scan_id ASC, order_index ASC`, пагинация
- **`WordsController`** — `GET /api/Words` с валидацией query и plain-text ошибками на русском

### Frontend
- **`wordsApi.ts`** — `fetchWordsPage`, типы, `WORDS_PAGE_SIZE = 30`
- **`WordsTableScreen.tsx`** — таблица слов с поиском (debounce 300 ms), фильтрами, пагинацией, миниатюрами и кнопками экспорта
- **`exportWordsDataset.ts`** — загрузка всех страниц, формирование JSONL, скачивание через Blob
- **`App.tsx`** — навигация «Сканы» / «Слова» (по умолчанию «Сканы»), переход в редактор по клику на строку (`openWordFromTable`)
- **`App.css`** — стили навигации и таблицы слов

### Проверка
- `dotnet build` — успешно
- `npm run build` (TypeScript + Vite) — успешно
- Существующие API и редактор сканов не изменялись

### Ручная приёмка
Запустите приложение и пройдите сценарии из [`specs/012-global-words-table/quickstart.md`](specs/012-global-words-table/quickstart.md):
1. `curl GET /api/Words?page=1` и `page=0` → 400
2. Экран «Слова» с фильтрами и пагинацией
3. Клик по строке → редактор с выбранным словом
4. Экспорт `words-dataset-all.jsonl` и `words-dataset-filtered.jsonl`

