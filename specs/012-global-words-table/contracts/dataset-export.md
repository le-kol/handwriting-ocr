# Contract: Dataset export (JSONL)

**Feature**: `012-global-words-table`  
**Date**: 2026-08-21

## Overview

Экспорт выполняется **только на клиенте**: последовательные `GET /api/Words`, фильтрация, формирование файла, скачивание через браузер. Данные никуда, кроме локального файла, не отправляются.

## Files

| Export kind | Filename |
|-------------|----------|
| Все векторизованные слова | `words-dataset-all.jsonl` |
| Отфильтрованный набор | `words-dataset-filtered.jsonl` |

## Line format

Одна строка файла — один JSON-объект (UTF-8), без pretty-print:

```json
{"wordId":101,"scanId":5,"lineIndex":0,"text":"пример","curves":[[[0,0],[1,1],[2,2],[3,3]]]}
```

| Field | Type | Rules |
|-------|------|-------|
| wordId | number | `word.id` |
| scanId | number | `word.scanId` |
| lineIndex | number | `word.lineIndex` |
| text | string | `word.text` |
| curves | array | `filterValidCurves(word.curvePoints)` — только валидные кривые (4 точки × [x,y]) |

**Excluded** from export line: `orderIndex`, frame coordinates, `paddingPx`, `approximationTolerance`, stroke order, stroke grouping.

## Inclusion rules

1. После `filterValidCurves`, если `curves.length === 0` — строка **пропускается** (не ошибка экспорта).
2. «Экспортировать всё»: игнорировать текущие фильтры UI; загрузить все страницы `GET /api/Words` без `search`/`scanId`; на клиенте оставить только строки с непустым `curves`.
3. «Экспортировать отфильтрованное»: snapshot параметров таблицы на момент клика; все страницы с этими параметрами; на клиенте — только строки с непустым `curves`.

## Completion UX

- Success: показать `Экспортировано слов: {count}` где `count` — число записанных строк (не пропущенных).
- Fetch failure: `Ошибка экспорта: …`; **не** скачивать частичный файл как успех.
- `count === 0`: успешное завершение с сообщением «0», не HTTP-ошибка.

## Validation (manual)

```bash
# каждая строка — валидный JSON
while IFS= read -r line; do echo "$line" | jq -e '.wordId,.scanId,.lineIndex,.text,.curves' >/dev/null; done < words-dataset-all.jsonl
```

Ожидание: все строки проходят; у каждой `curves` — непустой массив массивов из 4 точек.

## Out of scope

- Server endpoint для export
- CSV, Parquet, бинарные форматы
- Upload в облако
