# Batch vectorization endpoint
_Exported on 8/12/2026 at 15:05:11 GMT+7 from Cursor (3.15.6)_

---

**User**

/speckit-specify 
Добавить endpoint пакетной векторизации всех невекторизованных слов 
скана: POST /api/Scans/{id}/vectorize-batch

Выполняет векторизацию для всех слов скана с curve_points IS NULL, 
вызывая существующую логику одиночной векторизации независимо для 
каждого. Неудача одного слова не прерывает обработку остальных.

Ответ при успешном выполнении запроса (скан найден, конфигурация 
валидна) — 200 OK, тело — актуальный список всех слов скана в том 
же формате, что у GET /api/Scans/{id}/words (включая curvePoints: 
массив для успешно векторизованных, null для слов без вектора — как 
до вызова, так и при неудаче текущей попытки).

Причина неудачи конкретного слова в ответе batch не возвращается; 
для диагностики конкретного слова используется существующий 
одиночный endpoint POST .../words/{wordId}/vectorize.

Top-level ошибки (скан не найден, невалидна конфигурация 
WordVectorization) — по существующей карте конституции (404/503, 
plain text).

Слова, уже имеющие curve_points, повторно batch не обрабатывает.

---

**Cursor**

Запускаю `/speckit-specify`: проверяю хуки и структуру проекта, затем создам спецификацию для batch-векторизации.


Создаю директорию фичи и пишу спецификацию.


## Спецификация создана

**Каталог фичи:** `specs/003-batch-vectorize-scan`  
**Файл спецификации:** `specs/003-batch-vectorize-scan/spec.md`  
**Чеклист качества:** `specs/003-batch-vectorize-scan/checklists/requirements.md`

### Краткое содержание

Спецификация описывает endpoint `POST /api/Scans/{id}/vectorize-batch` для пакетной векторизации всех слов скана без `curve_points`:

| Аспект | Поведение |
|--------|-----------|
| Обработка | Только слова с `curve_points IS NULL`; уже векторизованные пропускаются |
| Логика | Та же, что у одиночного `POST …/words/{wordId}/vectorize` |
| Отказоустойчивость | Неудача одного слова не останавливает остальные |
| Успех (200) | Полный список всех слов скана в формате `GET …/words` |
| `curvePoints` | Массив при успехе, `null` при отсутствии вектора (до и после неудачной попытки) |
| Диагностика | Причины по словам в batch не возвращаются — только через одиночный endpoint |
| Top-level ошибки | 404 (скан не найден), 503 (невалидная `WordVectorization`), plain text |

### Чеклист качества

Все 16 пунктов пройдены. Маркеров `[NEEDS CLARIFICATION]` нет — требования однозначны на основе вашего описания и существующих спек `001-word-stroke-vector` / `002-words-vector-ui`.

### Следующий шаг

Спецификация готова к **`/speckit-plan`** (или `/speckit-clarify`, если захотите что-то уточнить до планирования).

---

**User**

/speckit-plan 

---

**Cursor**

Запускаю `/speckit-plan`: выполню setup-скрипт и загружу контекст фичи.


Пишу артефакты планирования на основе существующей реализации векторизации.


## План готов

**Ветка:** `003-batch-vectorize-scan`  
**План:** [specs/003-batch-vectorize-scan/plan.md](specs/003-batch-vectorize-scan/plan.md)

### Сгенерированные артефакты

| Файл | Назначение |
|------|------------|
| [research.md](specs/003-batch-vectorize-scan/research.md) | Оркестрация batch, обработка per-word ошибок, SQL-выборка, рефакторинг сервиса |
| [data-model.md](specs/003-batch-vectorize-scan/data-model.md) | Без изменений схемы; критерий `curve_points IS NULL` |
| [contracts/vectorize-batch.md](specs/003-batch-vectorize-scan/contracts/vectorize-batch.md) | HTTP-контракт `POST /api/Scans/{id}/vectorize-batch` |
| [quickstart.md](specs/003-batch-vectorize-scan/quickstart.md) | 8 ручных сценариев приёмки |

### Ключевые решения

1. **`WordVectorizationService.VectorizeBatchAsync`** — валидация конфига → проверка скана → однократная загрузка файла → цикл по словам с `curve_points IS NULL` → `GetWordsByScanIdAsync`.
2. **Рефакторинг** — общая логика в `VectorizeWordCoreAsync`; одиночный endpoint сохраняет текущее поведение.
3. **Per-word ошибки** — проглатываются, HTTP остаётся **200**; у слова `curvePoints: null`.
4. **Top-level** — **404** (скан не найден), **503** (конфиг); без Liquibase-миграций.

### Constitution Check

Все 5 принципов — **PASS** (до и после дизайна).

### Следующий шаг

Запустите **`/speckit-tasks`** для генерации `tasks.md` и перехода к реализации.

---

**User**

/speckit-tasks 

---

**Cursor**

Запускаю `/speckit-tasks`: выполню setup-скрипт и загружу артефакты дизайна.


Генерирую `tasks.md` по шаблону и артефактам фичи.


## tasks.md создан

**Путь:** [specs/003-batch-vectorize-scan/tasks.md](specs/003-batch-vectorize-scan/tasks.md)

### Сводка

| Метрика | Значение |
|--------|----------|
| **Всего задач** | 14 (T001–T014) |
| **US1** (batch MVP) | 2 задачи |
| **US2** (пропуск векторизованных) | 2 задачи |
| **US3** (top-level 404/503) | 2 задачи |
| **US4** (диагностика через single) | 1 задача |
| Setup + Foundational + Polish | 7 задач |

### MVP

**User Story 1** — после Phase 1–2: `VectorizeBatchAsync` + `POST {id}/vectorize-batch` (T005–T006). Проверка: quickstart §1–2.

### Параллельные возможности

- После T006: **US2** (T007–T008) и **US3** (T009–T010) можно вести параллельно.
- В Polish: **T012** и **T013** — разные файлы, помечены `[P]`.

### Формат

Все 14 задач соответствуют формату `- [ ] T00N [P?] [USn?] Description with file path`.

### Следующий шаг

Запустите **`/speckit-implement`** для выполнения задач по порядку.

