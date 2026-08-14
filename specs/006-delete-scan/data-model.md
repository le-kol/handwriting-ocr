# Data Model: Удаление скана

**Feature**: `006-delete-scan`  
**Date**: 2026-08-14

Изменений схемы БД нет. Hard delete существующих сущностей.

## Entities

### Scan (существующая)

| Field | Type | Notes |
|-------|------|-------|
| Id | int | PK |
| Path | text | Абсолютный путь к PNG/JPEG на диске |

**Changes in this feature**: Запись **удаляется** (`DELETE FROM scans WHERE id = @id RETURNING path`); возвращённый `path` передаётся в `FileStorageService` для удаления файла. Soft-delete не используется.

### Word (существующая)

| Field | Type | Notes |
|-------|------|-------|
| Id | int | PK |
| ScanId | int | FK → `scans(id) ON DELETE CASCADE` |

**Changes in this feature**: Все строки с `scan_id = id` удаляются автоматически при DELETE скана. Прикладной код не вызывает DELETE по `words`.

### Scan list page (без изменений модели)

После удаления `totalCount` уменьшается на 1; элемент исчезает из `items` при следующем GET текущей страницы.

## State transitions

### Сервер

```text
[scan exists + file on disk]
  -- DELETE /api/Scans/{id} -->
[no scan row] + [no words for scan] + [file removed or was already missing]
  --> 204 No Content

[no scan row]
  -- DELETE /api/Scans/{id} -->
  --> 404 «Не найдена запись в БД»

[scan row exists, file missing]
  -- DELETE /api/Scans/{id} -->
[no scan row] + (file still missing)
  --> 204 No Content
```

### Клиент — редактор

```text
[scanId = X, words/layout/draft/…]
  -- delete success, id === X -->
clearToEmptyState()  // scanId null, upload cleared, resetEditorState

[scanId = X]
  -- delete success, id !== X (удалён другой скан из таблицы) -->
[scanId = X unchanged]
```

### Клиент — таблица

```text
[listPage = N, items include id]
  -- delete row id, success -->
GET page N → items без id; если items=[] и N>1 → listPage = N-1
```

Удаление из панели редактора **не** обязано перезапрашивать таблицу (spec path 1).

## Schema change (Liquibase)

**Нет.** Используется существующий FK:

```sql
scan_id int not null references scans(id) on delete cascade
```

## API model mapping

**DELETE /api/Scans/{id}**

- Успех: **204**, тело отсутствует.
- Ошибка: **404**, plain text `Не найдена запись в БД`.

Новых DTO нет.

## Client state (дополнение к 005)

| State | При delete текущего скана | При delete другого скана из таблицы |
|-------|---------------------------|--------------------------------------|
| `scanId` | `null` (`clearToEmptyState`) | без изменений |
| `words`, `layoutLines`, `draft`, … | `clearToEmptyState` → `resetEditorState()` | без изменений |
| `selectedFile`, `uploadStatus` | `null` (`clearToEmptyState`) | без изменений |
| `scanItems`, `totalCount` | без авто-refresh | refresh текущей страницы |
| `listPage` | без изменений | −1 если страница пуста и N > 1 |
| `deleteScanStatus` | ошибка при `!ok` | то же |
