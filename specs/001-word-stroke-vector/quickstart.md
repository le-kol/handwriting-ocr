# Quickstart: Векторизация штрихов слова

**Feature**: `001-word-stroke-vector`  
**Date**: 2026-08-11

Ручная проверка end-to-end после реализации. Детали полей — в [data-model.md](./data-model.md), HTTP — в [contracts/vectorize-word.md](./contracts/vectorize-word.md).

## Prerequisites

1. PostgreSQL доступна; в `appsettings.Development.json` задан `ConnectionStrings:Default`.
2. Применены Liquibase-миграции, включая changeset с `words.curve_points`.
3. В конфигурации есть секция:

```json
"WordVectorization": {
  "PaddingPx": 4,
  "ApproximationTolerance": 1.5
}
```

4. Приложение запущено (Kestrel + при необходимости SpaProxy).
5. Есть скан с файлом на диске и хотя бы одним словом с валидной рамкой (через upload + recognize или ручное создание слова).

## Setup commands

```bash
# из корня репозитория — применить changelog (пример; используйте ваш обычный способ запуска Liquibase)
# liquibase --changeLogFile=liquibase/changelog.sql update

dotnet run --project handwritingOCR.Server
```

Базовый URL API (см. `launchSettings.json`): обычно `https://localhost:<port>/api`.

## Validation scenarios

### 1. Успешная векторизация (P1)

1. `POST /api/Scans/upload` — загрузить рукописное изображение.
2. `POST /api/Scans/{id}/recognize` — получить слова (нужен Yandex OCR) **или** создать слово с рамкой через `POST /api/Scans/{id}/words`.
3. Запомнить `wordId` из `GET /api/Scans/{id}/words`.
4. Вызвать:

```http
POST /api/Scans/{id}/words/{wordId}/vectorize
```

**Ожидание**: `200 OK`; в JSON `curvePoints` — непустой массив кривых, каждая из 4 точек `[x,y]`.  
`GET /api/Scans/{id}/words` для того же слова возвращает тот же `curvePoints`.  
В БД: `SELECT curve_points FROM words WHERE id = {wordId}` — NOT NULL.

### 2. Повторная векторизация (P2)

1. Повторить `POST …/vectorize` для того же слова.
2. **Ожидание**: снова `200`; одно представление у записи (не две строки); значение могло измениться при смене конфига, но колонка по-прежнему одна.

### 3. Слово не найдено

```http
POST /api/Scans/{id}/words/999999/vectorize
```

**Ожидание**: `404`, тело-текст (напр. «Слово не найдено»); `curve_points` у существующих слов не затронуты.

### 4. Файл скана недоступен

1. В БД оставить запись скана, удалить/переименовать файл по `scans.path`.
2. Вызвать vectorize для слова этого скана.

**Ожидание**: `404` «Не найден файл» (или эквивалент по карте ошибок); `curve_points` слова остаётся прежним (NULL или старое значение).

### 5. Нет штрихов / пустой фрагмент

1. Слово с рамкой на заведомо пустой (белой) области изображения.
2. Vectorize.

**Ожидание**: `400` с понятным русским текстом; `curve_points` не записывается как пустой массив.

### 6. Повреждённая конфигурация

1. Выставить `ApproximationTolerance: 0` или убрать секцию `WordVectorization`.
2. Vectorize валидное слово.

**Ожидание**: `503`; данные слова без частичного UPDATE вектора.

## Done when

- Сценарии 1–5 проходят на тестовом скане.
- Миграция накатывается и откатывается через Liquibase `--rollback`.
- Контроллер не содержит SQL; запись идёт через сервис с транзакцией.
