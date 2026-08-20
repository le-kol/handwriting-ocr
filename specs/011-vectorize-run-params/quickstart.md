# Quickstart: Параметры запуска векторизации слов

**Feature**: `011-vectorize-run-params`  
**Date**: 2026-08-20

Ручная проверка end-to-end после реализации. Детали полей — [data-model.md](./data-model.md); HTTP — [contracts/](./contracts/); UI — [vectorize-run-params-ui.md](./contracts/vectorize-run-params-ui.md).

## Prerequisites

1. PostgreSQL и миграции с `words.curve_points` применены (фича `001`).
2. В `appsettings.json` (или Development override) валидная секция:

```json
"WordVectorization": {
  "PaddingPx": 4,
  "ApproximationTolerance": 1.5
}
```

3. Приложение запущено: `dotnet run --project handwritingOCR.Server`
4. Клиент доступен через SPA (Vite proxy `/api`).
5. Есть скан с распознанными словами; хотя бы одно слово без `curvePoints`.

## Setup

```bash
dotnet run --project handwritingOCR.Server
```

Базовый URL API: `https://localhost:<port>/api` (см. `launchSettings.json`).

## Validation scenarios

### 1. GET defaults (P1 / FR-003)

```http
GET /api/Scans/vectorization-defaults
```

**Ожидание**: `200 OK`, JSON `{ "paddingPx": 4, "approximationTolerance": 1.5 }` (или ваши значения из конфига).

### 2. UI: поля предзаполнены defaults (P1)

1. Открыть скан с невекторизованным словом в UI.
2. Выбрать слово → в блоке редактора рядом с «Векторизовать» видны поля «Отступ, px» и «Погрешность, px» с 4 и 1.5.
3. В toolbar видны **отдельные** поля рядом с «Векторизовать все слова» с теми же стартовыми значениями.

### 3. Одиночная векторизация с изменёнными params (P1)

1. Изменить отступ на `8`, погрешность на `2.5`.
2. Нажать «Векторизовать».

**Ожидание**: `200`; слово векторизовано; `curvePoints` отличается от результата с defaults 4/1.5 на том же слове (повторить на другом слове для сравнения).

Swagger/curl:

```http
POST /api/Scans/{id}/words/{wordId}/vectorize
Content-Type: application/json

{"paddingPx": 8, "approximationTolerance": 2.5}
```

### 4. Обратная совместимость / FR-005

1. Векторизовать слово A без body (или через старый curl без Content-Type).
2. Удалить вектор (или использовать другое слово B с теми же рамками — если возможно).
3. Векторизовать слово B с body `{ "paddingPx": 4, "approximationTolerance": 1.5 }`.

**Ожидание**: При одинаковых входных данных рамки/изображения `curvePoints` эквивалентны (или визуально идентичны в миниатюре).

### 5. Пакетная векторизация с params (P2)

1. Скан с 2+ невекторизованными словами.
2. В batch-полях задать `paddingPx: 6`, `approximationTolerance: 2`.
3. «Векторизовать все слова».

**Ожидание**: `200`; все успешно обработанные слова векторизованы с одними и теми же run params.

### 6. Клиентская валидация — отрицательный отступ (P2 / FR-006)

1. В single-полях ввести отступ `-1`.
2. Нажать «Векторизовать».

**Ожидание**: POST **не** отправляется; текст ошибки в UI; `curvePoints` слова без изменений.

### 7. Клиентская валидация — обе ошибки сразу (clarify Q2)

1. Отступ `-1`, погрешность `0`.
2. Нажать «Векторизовать» или «Векторизовать все слова».

**Ожидание**: Одно сообщение упоминает **обе** проблемы; операция не запускается.

### 8. Серверная валидация — 400 (API)

```http
POST /api/Scans/{id}/words/{wordId}/vectorize
Content-Type: application/json

{"paddingPx": -5, "approximationTolerance": -1}
```

**Ожидание**: `400`, plain text с обеими причинами; `curve_points` в БД не изменён.

### 9. Независимость single vs batch полей (FR-004)

1. В single-полях изменить отступ на `10` (не запускать).
2. Проверить batch-поля.

**Ожидание**: Batch-поля по-прежнему показывают defaults (4/1.5), не `10`.

### 10. Сброс после смены скана (FR-012)

1. В single-полях ввести нестандартные значения, не запускать.
2. Переключиться на другой скан и обратно (или только другой).

**Ожидание**: Поля снова defaults сервера.

### 11. Недоступные defaults — UI error state (FR-015)

1. В конфиге убрать `WordVectorization` или `ApproximationTolerance: 0`.
2. Перезапустить сервер; открыть скан в UI.

**Ожидание**: Вместо полей и кнопок «Векторизовать» / «Векторизовать все слова» — текст ошибки; запуск невозможен.

3. `GET /api/Scans/vectorization-defaults` → `503`.

### 12. Недоступные defaults — POST с явными params (edge)

При невалидном конфиге:

```http
POST /api/Scans/{id}/words/{wordId}/vectorize
Content-Type: application/json

{"paddingPx": 4, "approximationTolerance": 1.5}
```

**Ожидание (рекомендуемое поведение plan)**: `200` если оба params явно валидны и переданы — операция не зависит от broken config для fallback. *(Если реализация выберет 503 при любой broken config — зафиксировать в tasks и обновить quickstart.)*

> **Note**: Research §3 допускает успех при полностью указанном body; `EnsureOptionsValid` вызывается только когда нужен fallback из config.

## Regression checks

- Пакетная векторизация без body — как до фичи (003 quickstart сценарии 1–4).
- Одиночная без body — как 001.
- `vectorizeStatus` при серверных ошибках vectorize — plain text из `response.text()`.
- Одновременный запуск single+batch — кнопки disabled как сегодня.
