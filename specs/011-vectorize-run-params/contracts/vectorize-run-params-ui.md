# Contract: UI — параметры запуска векторизации

**Feature**: `011-vectorize-run-params`  
**Date**: 2026-08-20

## Upstream APIs

| Операция | Контракт |
|----------|----------|
| Чтение defaults | [vectorization-defaults-api.md](./vectorization-defaults-api.md) |
| Одиночная векторизация | [vectorize-word-run-params.md](./vectorize-word-run-params.md) |
| Пакетная векторизация | [vectorize-batch-run-params.md](./vectorize-batch-run-params.md) |

## New / changed UI surfaces

| Элемент | Расположение | Описание |
|---------|--------------|----------|
| `.vectorize-run-params` | `.editor-actions` (single) | **NEW** — два number input + label рядом с «Векторизовать» |
| `.vectorize-run-params` | `.layout-toolbar` (batch) | **NEW** — отдельный набор полей рядом с «Векторизовать все слова» |
| `.vectorize-defaults-error` | на месте каждого блока | **NEW** — текст ошибки вместо полей+кнопки при FR-015 |

## Field labels (RU)

| Input | Label (рекомендуемый) |
|-------|----------------------|
| paddingPx | «Отступ, px» |
| approximationTolerance | «Погрешность, px» |

## Single-word block (`.editor-actions`)

| Аспект | MUST |
|--------|------|
| Видимость | Только если `draft.id > 0 && !isWordVectorized(draft)` (как кнопка сегодня) |
| Defaults | Заполнить из `GET …/vectorization-defaults` при открытии скана |
| Независимость | State `singleRunParams` не синхронизируется с batch |
| Click «Векторизовать» | Клиентская валидация → `POST …/vectorize` с JSON body |
| Invalid input | Не вызывать POST; `vectorizeStatus` = объединённое сообщение |
| In progress | Кнопка disabled (как сегодня) |
| FR-015 | При ошибке defaults — `<p class="vectorize-defaults-error">` вместо полей и кнопки |

## Batch block (`.layout-toolbar`)

| Аспект | MUST |
|--------|------|
| Defaults | Отдельный `batchRunParams`, та же GET defaults как старт |
| Click «Векторизовать все слова» | Клиентская валидация → `POST …/vectorize-batch` с JSON body |
| Invalid input | Не вызывать POST; статус в `vectorizeStatus` |
| FR-015 | Аналогично single — error text вместо полей и кнопки |

## Client validation messages (examples)

| Условие | Текст (plain RU) |
|---------|------------------|
| paddingPx < 0 | «Отступ не может быть отрицательным.» |
| tolerance ≤ 0 or NaN | «Допустимая погрешность должна быть больше 0.» |
| Оба невалидны | Объединить через пробел или перенос строки в одном `<p>` |

## Reset behavior (FR-012)

| Событие | MUST |
|---------|------|
| Смена `scanId` | Refetch defaults; reset оба набора полей |
| После успешной/неуспешной vectorize (single) | При следующем показе блока — снова defaults (не последний ввод) |
| Уход со скана без запуска | Введённые значения не сохраняются |

## fetch helpers (App.tsx)

| Function | Signature (target) |
|----------|-------------------|
| `fetchVectorizationDefaults` | `(): Promise<{ paddingPx: number; approximationTolerance: number }>` |
| `vectorizeWord` | `(scanId, wordId, params: { paddingPx: number; approximationTolerance: number })` |
| `vectorizeBatch` | `(scanId, params: { paddingPx: number; approximationTolerance: number })` |

Body MUST отправляться как `JSON.stringify(params)` с `Content-Type: application/json`.

## Out of scope

- Persist в localStorage / URL query.
- Отдельная страница настроек.
- OCR / preprocessing params.
