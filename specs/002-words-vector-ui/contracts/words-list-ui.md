# Contract: UI — список слов и векторизация

**Feature**: `002-words-vector-ui`  
**Date**: 2026-08-11

Клиент **не** добавляет новых HTTP-маршрутов. Контракт описывает потребление существующих API и ожидаемое поведение UI.

## Upstream APIs (уже существуют, 001)

### GET words

```http
GET /api/Scans/{id}/words
```

**Success**: `200` + JSON-массив Word (camelCase), каждый элемент MAY содержать:

```json
"curvePoints": null
```

или

```json
"curvePoints": [
  [
    [1.0, 2.0],
    [3.5, 2.2],
    [6.0, 8.0],
    [9.0, 8.1]
  ]
]
```

Инварианты при непустом массиве: `N ≥ 1` кривых; у каждой 4 точки × `(x,y)`; координаты в СК выровненного фрагмента (не скана).

**Error**: клиент показывает статус загрузки/ошибки; не оставляет слова предыдущего скана как актуальные для нового `id`.

Полный серверный контракт vectorize: [`specs/001-word-stroke-vector/contracts/vectorize-word.md`](../../001-word-stroke-vector/contracts/vectorize-word.md).

### POST vectorize

```http
POST /api/Scans/{id}/words/{wordId}/vectorize
```

| | |
|--|--|
| Body | none |
| Success | `200` + JSON одного Word с непустым `curvePoints` |
| Error | plain text RU (`response.text()`), статусы по карте 001 (400/404/503) |

## Client Word type (обязательное расширение)

```ts
interface Word {
  id: number;
  scanId: number;
  text: string;
  x1: number; y1: number; x2: number; y2: number;
  x3: number; y3: number; x4: number; y4: number;
  orderIndex: number;
  lineIndex: number;
  curvePoints?: number[][][] | null;
}
```

## UI surface contract

### Words table / list (секция «Слова скана»)

| Колонка / элемент | Обязательность | Поведение |
|-------------------|----------------|-----------|
| Текст | MUST | `word.text` |
| Статус | MUST | «Векторизовано» / «Не векторизовано» (RU) по правилам data-model |
| Миниатюра | MUST если векторизовано | SVG в собственной СК (bbox); MUST NOT поверх `<img>` скана |
| Кнопка «Векторизовать» | MUST для `id > 0` | POST vectorize; disabled при `vectorizingWordId === word.id` |
| Черновик `id === 0` | MUST | Без успешного vectorize (кнопка скрыта или disabled) |

### Миниатюра

- Вход: валидные кривые из `curvePoints`.
- Path: кубические сегменты Безье (P0→P1→P2→P3 на кривую).
- `viewBox` = bounding box контрольных точек (+ padding).
- Размер на экране: компактная ячейка (фиксированная высота/ширина CSS), не привязана к `naturalWidth` скана.

### Обновление после успеха

1. Разобрать JSON Word из `200`.
2. Заменить в `words` запись с тем же `id` (сохранить остальные слова).
3. Если то же слово есть в `layoutLines` — обновить у него `curvePoints` (и text/рамку, если пришли), не сбрасывая локальный порядок строк.
4. Сбросить `vectorizingWordId`; показать краткий успех (опционально).

### Обновление после ошибки

1. Прочитать тело как текст.
2. Показать оператору сообщение.
3. Не изменять `curvePoints` / статус миниатюры этого слова в state.

## Out of scope

- Новые query/body параметры vectorize.
- Batch endpoint / кнопка «векторизовать все».
- Drag-edit контрольных точек.
- SVG-path поверх изображения скана в координатах рамки.
