# Quickstart: Пакетная векторизация слов скана

**Feature**: `003-batch-vectorize-scan`  
**Date**: 2026-08-12

Ручная проверка end-to-end после реализации. Детали полей — в [data-model.md](./data-model.md), HTTP — в [contracts/vectorize-batch.md](./contracts/vectorize-batch.md). Одиночная векторизация — [001 quickstart](../001-word-stroke-vector/quickstart.md).

## Prerequisites

1. PostgreSQL доступна; миграция с `words.curve_points` применена (фича `001-word-stroke-vector`).
2. В конфигурации валидная секция `WordVectorization` (см. 001 quickstart).
3. Приложение запущено (`dotnet run --project handwritingOCR.Server`).
4. Есть скан с несколькими словами; часть без `curvePoints` (после recognize или ручного создания).

## Setup commands

```bash
dotnet run --project handwritingOCR.Server
```

Базовый URL API: `https://localhost:<port>/api` (см. `launchSettings.json`).

## Validation scenarios

### 1. Успешный batch на невекторизованных словах (P1)

1. `POST /api/Scans/upload` + `POST /api/Scans/{id}/recognize` (или создать слова вручную).
2. Убедиться через `GET /api/Scans/{id}/words`, что у нескольких слов `curvePoints: null`.
3. Вызвать:

```http
POST /api/Scans/{id}/vectorize-batch
```

**Ожидание**: `200 OK`; тело — массив **всех** слов скана; у слов с читаемыми штрихами `curvePoints` — непустой массив; формат элементов совпадает с `GET …/words`.

### 2. Смешанный результат (P1)

1. Создать скан с двумя словами: одно с валидной рамкой на тексте, второе — на пустой (белой) области.
2. `POST …/vectorize-batch`.

**Ожидание**: `200 OK`; у первого слова `curvePoints` заполнен; у второго — `null`; HTTP-статус не 400/404 для всего запроса.

3. Для второго слова вызвать одиночный `POST …/words/{wordId}/vectorize`.

**Ожидание**: `400` с текстом причины (напр. отсутствие штрихов).

### 3. Пропуск уже векторизованных (P1)

1. Векторизовать одно слово одиночным `POST …/words/{wordId}/vectorize`; запомнить `curvePoints`.
2. `POST …/vectorize-batch`.

**Ожидание**: `200 OK`; у ранее векторизованного слова тот же `curvePoints` (не пересчитан); обработаны только слова с `curvePoints: null`.

### 4. Все слова уже векторизованы (P1)

1. Векторизовать все слова по одному или повторным batch.
2. `POST …/vectorize-batch` ещё раз.

**Ожидание**: `200 OK`; все `curvePoints` без изменений; быстрое завершение (нет лишней CV-работы).

### 5. Пустой скан (edge)

1. Скан без слов (если возможно в вашем сценарии).
2. `POST …/vectorize-batch`.

**Ожидание**: `200 OK`; тело `[]`.

### 6. Скан не найден (P1 top-level)

```http
POST /api/Scans/999999/vectorize-batch
```

**Ожидание**: `404`, plain text «Не найдена запись в БД»; не JSON-массив.

### 7. Невалидная конфигурация (P1 top-level)

1. Выставить `ApproximationTolerance: 0` или убрать секцию `WordVectorization`.
2. `POST …/vectorize-batch` для существующего скана.

**Ожидание**: `503`, plain text; слова не изменены (`GET …/words` — прежние `curvePoints`).

### 8. Сравнение с GET words (контракт)

После успешного batch:

```http
GET /api/Scans/{id}/words
```

**Ожидание**: JSON-массив побайтно/по смыслу совпадает с телом ответа batch (те же id, тексты, `curvePoints`).

## Done when

- Сценарии 1–8 проходят на тестовом скане.
- Контроллер не содержит SQL; batch-логика в `WordVectorizationService`.
- Новых Liquibase changeset'ов нет.
- Per-word ошибки не ломают HTTP 200 batch; диагностика через одиночный vectorize работает.
