# Quickstart: Таблица сканов с пагинацией и миниатюрами

**Feature**: `005-scans-table-thumbnails`  
**Date**: 2026-08-14

Ручная проверка end-to-end после реализации. Модель — [data-model.md](./data-model.md). HTTP — [contracts/scans-list.md](./contracts/scans-list.md), [contracts/scan-thumbnail.md](./contracts/scan-thumbnail.md). UI — [contracts/scans-table-ui.md](./contracts/scans-table-ui.md).

## Prerequisites

1. PostgreSQL доступна; таблица `scans` без новых миграций.
2. В конфигурации секция `"ScanList": { "PageSize": 30 }` (как `WordVectorization` в `appsettings.json`).
3. Приложение запущено (`dotnet run --project handwritingOCR.Server`).
4. Есть несколько загруженных сканов (через `POST /api/Scans/upload`). Для пагинации — больше 30 записей (можно загрузить повторно).

## Setup commands

```bash
dotnet run --project handwritingOCR.Server
```

Базовый URL API: `https://localhost:<port>/api` (см. `launchSettings.json`).

## Validation scenarios

### 1. Страница списка (P1)

```http
GET /api/Scans?page=1
```

**Ожидание**: `200`; JSON `{ items: [ { id } ], totalCount }`; `items` по `id` убыванию; не больше 30 элементов. Без `page` — то же, что `page=1`.

SQL выполняется в `ScanDbService`, не в контроллере.

### 2. Границы страниц (P1)

```http
GET /api/Scans?page=0
GET /api/Scans?page=99999
```

**Ожидание**: `page=0` → `400` plain text RU. Большой `page` → `200`, `items: []`, тот же `totalCount`, что у page=1.

### 3. Миниатюра (P1)

```http
GET /api/Scans/{id}/thumbnail
```

**Ожидание**: `200`, картинка, большая сторона ≈ 200px; `Cache-Control: public, max-age=86400`. Файл миниатюры в `Storage:ScansFolder` **не** появляется.

Несуществующий id → `404` «Не найдена запись в БД».  
Скан без файла на диске → `404` «Не найден файл».

### 4. Таблица в UI (P1)

Открыть SPA. **Ожидание**: таблица с миниатюрами (URL thumbnail, не `/image`) и id; не больше 30 строк; «Назад» на первой странице недоступно.

### 5. Открытие скана из строки (P1)

На скане A распознать слова / открыть черновик. Кликнуть строку B.

**Ожидание**: редактор показывает B; слова A исчезли; слова B загружены (или пусто, если не распознавали); recognize сам не стартовал; строка B выделена.

### 6. Upload не с первой страницы (P1)

Уйти на страницу 2+, загрузить новый файл.

**Ожидание**: таблица на странице 1; новый скан сверху и выделен; редактор на новом id.

### 7. Сбой списка не затирает строки (P1)

При уже показанной таблице оборвать API / отдать 500 на `GET /api/Scans`.

**Ожидание**: текстовая ошибка; прежние строки на месте.

### 8. Миниатюра в строке при битом файле (P2)

Строка с отсутствующим файлом: id виден, ячейка картинки пустая/битая, остальные миниатюры на месте.

## Done when

- Сценарии 1–8 проходят.
- `PageSize` задан в `ScanListOptions` / `appsettings.json`, не query.
- Список — метод `ScanDbService`; контроллер без SQL.
- Liquibase не менялся.
- Клиент не использует `/image` в ячейках таблицы.
