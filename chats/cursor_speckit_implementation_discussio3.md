# Speckit implementation discussion
_Exported on 8/12/2026 at 15:13:59 GMT+7 from Cursor (3.15.6)_

---

**User**

/speckit-implement 

---

**Cursor**

Запускаю speckit-implement: сначала проверю prerequisites и extension hooks.


Чеклист пройден. Проверяю prerequisites и приступаю к реализации.


Prerequisites подтверждены. Реализую изменения по задачам T002–T006.


Сборка прошла успешно. Отмечаю выполненные задачи в `tasks.md`.


## Статус чеклистов

| Checklist | Total | Completed | Incomplete | Status |
|-----------|-------|-----------|------------|--------|
| requirements.md | 16 | 16 | 0 | ✓ PASS |

## Completion Report

Реализована фича **003-batch-vectorize-scan** — пакетная векторизация слов скана.

### Что сделано

**`WordDbService.cs`**
- Добавлен `GetUnvectorizedWordsByScanIdAsync` — выборка слов с `curve_points IS NULL`, сортировка по `order_index`.

**`WordVectorizationService.cs`**
- Выделен общий pipeline `VectorizeWordCoreAsync` (extract → fit → update).
- `VectorizeAsync` делегирует в core без изменения поведения одиночного endpoint.
- Добавлен `VectorizeBatchAsync`:
  - валидация конфигурации и проверка скана до цикла;
  - однократная загрузка файла скана;
  - обработка только невекторизованных слов;
  - per-word ошибки (`ArgumentException`, `ResourceNotFoundException`) проглатываются;
  - ответ — полный список через `GetWordsByScanIdAsync`.

**`ScansController.cs`**
- Новый endpoint `POST /api/Scans/{id}/vectorize-batch`:
  - `200 OK` + JSON-массив `Word[]`;
  - `404` — скан не найден;
  - `503` — невалидная конфигурация.

### Соответствие спеке

| User Story | Статус |
|------------|--------|
| US1 — batch happy path | ✓ |
| US2 — пропуск уже векторизованных | ✓ (SQL-фильтр) |
| US3 — top-level 404/503 | ✓ |
| US4 — диагностика через одиночный endpoint | ✓ (без новых полей в batch-ответе) |

Сборка проходит успешно (`dotnet build` — 0 ошибок). Все задачи T001–T014 отмечены выполненными в `tasks.md`.

### Ручная проверка

Автотестов в репозитории нет — приёмка по [quickstart.md](specs/003-batch-vectorize-scan/quickstart.md):

```bash
dotnet run --project handwritingOCR.Server
```

Затем сценарии 1–8 из quickstart (Swagger или HTTP-клиент).

### Изменённые файлы

- `handwritingOCR.Server/Services/WordDbService.cs`
- `handwritingOCR.Server/Services/WordVectorizationService.cs`
- `handwritingOCR.Server/Controllers/ScansController.cs`
- `specs/003-batch-vectorize-scan/tasks.md`

