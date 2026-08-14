# Research: Пакетная векторизация слов скана

**Feature**: `003-batch-vectorize-scan`  
**Date**: 2026-08-12

Все пункты Technical Context закрыты; NEEDS CLARIFICATION не осталось.

## 1. Оркестрация batch поверх одиночной векторизации

**Decision**: Добавить `VectorizeBatchAsync(int scanId)` в `WordVectorizationService`. Алгоритм:

1. `EnsureOptionsValid()` — при невалидной конфигурации `InvalidOperationException` → контроллер 503, слова не обрабатываются.
2. `GetScanPathAsync(scanId)` — `null` → `ResourceNotFoundException` → 404.
3. Загрузить байты файла скана один раз (`FileStorageService.GetFileAsync`).
4. Выбрать слова с `curve_points IS NULL` для данного `scan_id`, упорядочить по `order_index`.
5. Для каждого слова вызвать общую внутреннюю логику векторизации (extract → fit → `UpdateCurvePointsAsync`), обёрнутую в `try/catch` для ожидаемых сбоев слова.
6. Вернуть `GetWordsByScanIdAsync(scanId)` — полный список всех слов скана.

**Rationale**: Spec FR-007 требует ту же логику, что одиночный endpoint; рефакторинг `VectorizeAsync` в `VectorizeWordInternalAsync(..., byte[] fileBytes)` устраняет дублирование и позволяет загрузить файл скана один раз на batch (SC-005).

**Alternatives considered**:
- **N вызовов публичного `VectorizeAsync`** — проще, но N раз читает файл с диска; отвергнуто из‑за лишнего I/O без выигрыша в простоте контракта.
- **Отдельный `BatchVectorizationService`** — лишний слой; отвергнуто (принцип II: оркестрация рядом с одиночной векторизацией).
- **Параллельная обработка слов** — вне scope spec; последовательность проще и предсказуемее для CPU-bound pipeline.

## 2. Обработка ошибок отдельного слова в batch

**Decision**: Ошибки per-word **не пробрасываются** наружу; слово остаётся с `curve_points = NULL`. Перехватываются:

| Исключение | Поведение в batch |
|------------|-------------------|
| `ArgumentException` (вырожденная рамка, нет штрихов, битое изображение) | проглотить, следующее слово |
| `ResourceNotFoundException` (файл не найден — если bytes null после загрузки) | проглотить для всех слов *или* не начинать цикл, если bytes null на шаге 3 — см. §2a |
| Любой сбой до успешного `UpdateCurvePointsAsync` | без UPDATE, `curve_points` не меняется |

Причины не логируются в HTTP-ответ batch (FR-012). Опционально — `ILogger` на уровне сервера (не в контракте).

**Rationale**: Spec FR-008, FR-009, FR-012; одиночный endpoint остаётся для диагностики.

**Alternatives considered**:
- **Массив `{ wordId, error }` в JSON** — явно запрещено spec.
- **207 Multi-Status** — не используется в проекте; spec фиксирует 200.

## 2a. Отсутствие файла скана в batch

**Decision**: Если `GetFileAsync` вернул `null` после того как скан найден в БД, цикл по словам **не выполняется** (нет байтов для extract); метод возвращает `GetWordsByScanIdAsync` — все слова с прежними `curvePoints` (в т.ч. null). HTTP **200**, не 404.

**Rationale**: Spec edge case: «недоступный файл скана … трактуются как неудача векторизации этого слова внутри batch; запрос в целом остаётся 200». Для batch отсутствие файла эквивалентно неудаче всех невекторизованных слов без top-level 404 (404 зарезервирован только для «скан не найден» в БД).

**Alternatives considered**:
- **404 как в одиночном vectorize** — противоречит spec batch (top-level 404 только для отсутствия скана в БД).

## 3. Выборка невекторизованных слов

**Decision**: Новый метод `WordDbService.GetUnvectorizedWordsByScanIdAsync(int scanId)`:

```sql
SELECT … FROM words
WHERE scan_id = @scanId AND curve_points IS NULL
ORDER BY order_index
```

**Rationale**: Явный критерий FR-006 на уровне SQL; не тащит уже векторизованные слова в память; порядок обработки детерминирован (`order_index`).

**Alternatives considered**:
- **Фильтр в памяти после `GetWordsByScanIdAsync`** — проще diff, но лишняя нагрузка при большом числе уже векторизованных слов; отвергнуто для ясности контракта с БД.

## 4. Форма HTTP API

**Decision**: `POST /api/Scans/{id}/vectorize-batch` без тела. Успех: `200 OK` + JSON-массив `Word[]` (идентично `GET /api/Scans/{id}/words`). Ошибки top-level — plain text.

**Rationale**: Spec FR-001, FR-005; конституция — пути сканов и plain-text ошибки.

**Alternatives considered**:
- **`POST …/words/vectorize-batch`** — менее симметрично с `{id}/recognize`; текущий путь согласован с описанием пользователя.
- **202 Accepted + polling** — избыточно для дипломного объёма и последовательной обработки.

## 5. Карта ошибок batch (маппинг контроллера)

**Decision**:

| Ситуация | HTTP | Тело |
|----------|------|------|
| Скан не найден в БД | 404 | «Не найдена запись в БД» |
| Невалидна `WordVectorization` | 503 | текст из `InvalidOperationException` |
| Успех (скан найден, конфиг OK) | 200 | JSON-массив всех слов скана |
| Per-word сбои внутри 200 | — | у слова `curvePoints: null` |

Одиночный endpoint без изменений для диагностики per-word (404 файл, 400 рамка/штрихи и т.д.).

**Rationale**: Spec FR-002, FR-003, FR-004, FR-012; принцип III.

## 6. Рефакторинг `VectorizeAsync`

**Decision**: Выделить приватный метод, например `VectorizeWordCoreAsync(Word word, byte[] fileBytes)`, содержащий шаги extract → fit → update. Публичный `VectorizeAsync(scanId, wordId)` сохраняет текущее поведение (валидация, загрузка path/word/file, throw on error). `VectorizeBatchAsync` использует тот же core с try/catch.

**Rationale**: DRY; гарантия «та же логика» (FR-007); одиночный контракт не ломается.

## 7. Клиент (React)

**Decision**: Вне обязательного объёма. Существующий UI может позже вызвать batch и обновить список через тот же парсинг `Word[]`, что и `GET …/words`.

**Rationale**: Spec FR-015; аналогично 001/002.

## 8. Тестирование

**Decision**: Ручная приёмка по [quickstart.md](./quickstart.md). Новый test-проект не создаётся.

**Rationale**: Соответствует brownfield; конституция не требует xUnit.
