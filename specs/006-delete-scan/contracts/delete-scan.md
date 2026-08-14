# Contract: DELETE scan

**Feature**: `006-delete-scan`  
**Date**: 2026-08-14

## Endpoint

```http
DELETE /api/Scans/{id}
```

| Parameter | In | Type | Description |
|-----------|----|------|-------------|
| `id` | path | int | Идентификатор скана |

**Body**: none.

**Content-Type ответа (ошибка)**: `text/plain` (строка на русском), без ProblemDetails.

## Success

**204 No Content**

- Тело отсутствует.
- Запись `scans` с `id` удалена.
- Все связанные `words` удалены каскадом (`ON DELETE CASCADE`).
- Файл изображения по сохранённому `path` удалён с диска, **если** существовал.
- Если файл уже отсутствовал — ответ всё равно **204** (не 500).

## Error responses

| Status | Когда | Тело |
|--------|-------|------|
| 404 | Нет строки `scans` с данным `id` (в т.ч. повторный DELETE) | `Не найдена запись в БД` |

Другие коды (503 и т.д.) — только при реальных сбоях инфраструктуры, не при отсутствии файла после успешного DELETE в БД.

## Server layering

| Шаг | Слой | Действие |
|-----|------|----------|
| 1 | `ScanDbService.DeleteScanAsync(id)` | `DELETE … RETURNING path`; `null` → 404 |
| 2 | `FileStorageService.DeleteFileIfExistsAsync(path)` | no-op если файла нет |
| 3 | Controller | `NoContent()` |

SQL `DELETE FROM scans WHERE id = @id RETURNING path` — **только** в `ScanDbService`. Контроллер SQL не содержит.

## Out of scope

- Soft-delete, флаг `deleted`
- Массовое удаление
- Удаление слов отдельным запросом
- Undo / восстановление
