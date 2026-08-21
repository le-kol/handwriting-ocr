# Quickstart: Глобальная таблица слов и экспорт датасета

**Feature**: `012-global-words-table`  
**Date**: 2026-08-21

## Prerequisites

- PostgreSQL с данными: минимум **2 скана**, в каждом несколько слов; часть слов **векторизована** (`curve_points` не null).
- Backend + frontend запущены (SpaProxy / Vite dev).
- Конфиг: `"ScanList": { "PageSize": 30 }` в `appsettings.json`.

## 1. API: кросс-скановый список

```bash
curl -s "http://localhost:5000/api/Words?page=1" | jq '.totalCount, (.items | length)'
```

Ожидание: `totalCount` ≥ числа слов в БД; `items.length` ≤ 30.

```bash
curl -s "http://localhost:5000/api/Words?page=1&search=текст&vectorized=true&scanId=1" | jq
```

Ожидание: все `items[].scanId === 1`; у всех `curvePoints != null`; текст содержит подстроку (без учёта регистра).

```bash
curl -s "http://localhost:5000/api/Words?page=0"
```

Ожидание: **400**, plain text на русском.

## 2. UI: навигация и таблица

1. Открыть приложение в браузере.
2. Убедиться: по умолчанию экран **«Сканы»** (таблица сканов видна).
3. Нажать **«Слова»** → таблица слов из всех сканов; колонки: текст, scanId, статус, миниатюра у векторизованных.
4. Ввести поиск → список сужается; сменить фильтр «векторизовано» / скан → корректное подмножество.
5. Переключить страницу пагинации → другая порция записей.

## 3. UI: переход в редактор

1. На экране «Слова» кликнуть строку известного слова.
2. Ожидание: экран **«Сканы»**, открыт скан, панель редактирования выбранного слова.
3. Нажать **«Слова»** → снова таблица слов.

## 4. Экспорт «всё»

1. На экране «Слова» нажать **«Экспортировать всё»** (игнорируя фильтры).
2. Скачивается `words-dataset-all.jsonl`.
3. Сообщение: `Экспортировано слов: N`, N > 0 если есть векторизованные слова.
4. Проверить первую строку:

```bash
head -1 ~/Downloads/words-dataset-all.jsonl | jq 'keys'
```

Ожидание: `["curves","lineIndex","scanId","text","wordId"]`.

## 5. Экспорт «отфильтрованное»

1. Задать фильтр по одному скану + поиск.
2. **«Экспортировать отфильтрованное»** → `words-dataset-filtered.jsonl`.
3. Все строки файла: `scanId` совпадает; `text` содержит подстроку; `curves` непустой.
4. Установить фильтр «не векторизовано» → кнопка disabled или «Нет слов для экспорта».

## 6. Регрессия

- `GET /api/Scans/{id}/words` — без изменений.
- Создание/редактирование/удаление/векторизация слова в редакторе — работает как до фичи.
- Таблица сканов, upload, recognize — без регрессии.

## Troubleshooting

| Симптом | Проверка |
|---------|----------|
| 503 на `/api/Words` | `ScanList:PageSize > 0` |
| Пустая таблица при данных | SQL `SELECT COUNT(*) FROM words` |
| Экспорт 0 при векторизованных | `isWordVectorized` на клиенте; `curve_points` валидный N×4×2 |
| После клика слово не выбрано | `selectWord` после `fetchWords` завершился |

## Related artifacts

- [words-list-api.md](./contracts/words-list-api.md)
- [words-table-ui.md](./contracts/words-table-ui.md)
- [dataset-export.md](./contracts/dataset-export.md)
- [data-model.md](./data-model.md)
