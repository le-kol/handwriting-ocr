# Speckit implementation discussion
_Exported on 8/17/2026 at 22:44:07 GMT+7 from Cursor (3.16.17)_

---

**User**

/speckit-implement 

---

**Cursor**

Запускаю speckit-implement: проверяю хуки и prerequisites, затем загружу контекст реализации.


Чеклист пройден. Изучаю текущую реализацию DnD в `App.tsx` и `App.css`.


Чеклист пройден — приступаю к реализации gap-зон и связанной логики.


Сборка прошла успешно. Отмечаю выполненные задачи в `tasks.md`.


## Статус чеклистов

| Checklist | Total | Completed | Incomplete | Status |
|-----------|-------|-----------|------------|--------|
| requirements.md | 16 | 16 | 0 | ✓ PASS |

## Completion Report

Реализована фича **007-dnd-new-line-gaps** — вставка слова на новую строку через drag-and-drop. Все 16 задач (T001–T016) выполнены.

### Что сделано

**`handwritingocr.client/src/App.tsx`**
- **`moveWordToNewLine`** — pure helper: удаляет слово, корректирует `insertAtLineIndex`, вставляет строку `[word]`, фильтрует пустые строки
- **`gapDropTarget`** — state для подсветки активной gap-зоны
- **`handleGapDragOver` / `handleGapDrop`** — с `preventDefault` + `stopPropagation`, вызов `moveWordToNewLine`, сброс drag state
- **Взаимоисключение** — `handleDragOverWord`, `handleDragOverLine`, `handleDragEnd`, `handleCancelClick`, `handleDrop` сбрасывают `gapDropTarget`; gap handlers сбрасывают `dropTarget`
- **Render** — `N+1` gap-зон: `renderLineGap(0)` перед первой строкой, `renderLineGap(i+1)` после каждой `<p>` (начало / между / конец; при одной строке — только индексы 0 и 1)

**`handwritingocr.client/src/App.css`**
- **`.line-gap-drop`** — min-height 10px, margin 2px
- **`.line-gap-drop.active`** — горизонтальная линия `#1b7ff5` (как у `.word.drop-target`)

### Регрессии (US4)

- Drop на слово → `moveWordInLayout` (без изменений)
- Drop на `<p>` → append в конец строки (без изменений)
- `handleSaveLayoutClick` → `layoutToLineIds` с однословными строками; backend не менялся

### Валидация

- `npm run build` — успешно (TypeScript + Vite)
- Linter — ошибок нет
- Полные сценарии из `quickstart.md` §§1–9 требуют ручной проверки в браузере со запущенным SPA+API

### Изменённые файлы

- `handwritingocr.client/src/App.tsx`
- `handwritingocr.client/src/App.css`
- `specs/007-dnd-new-line-gaps/tasks.md` (все задачи `[X]`)

---

**User**

Зачем есть область not-allowed?

---

**Cursor**

Ищу в коде, где задаётся курсор или зона `not-allowed` при drag-and-drop.


Область с курсором **not-allowed** (перечёркнутый круг) — это не отдельная фича, которую мы добавляли. Так браузер ведёт себя при **HTML5 drag-and-drop** по умолчанию.

## Как это работает

При перетаскивании слова браузер на каждом `dragover` решает: можно ли сюда бросить объект.

- Если на элементе вызван `event.preventDefault()` и задан `dropEffect = 'move'` — зона **принимает** drop, курсор обычно «move».
- Если `preventDefault()` **нет** — зона **не принимает** drop, и браузер показывает **not-allowed**.

В коде drop разрешён только в трёх местах:

| Зона | Handler | Что происходит |
|------|---------|----------------|
| `.word` | `handleDragOverWord` | вставка перед словом |
| `<p>` (строка) | `handleDragOverLine` | вставка в конец строки |
| `.line-gap-drop` | `handleGapDragOver` | новая строка |

Везде вызывается `preventDefault()`.

## Где появляется not-allowed

На всём остальном UI, где handlers нет:

- SVG/изображение скана  
- редактор слова (поля, кнопки)  
- кнопки «Сохранить порядок», «Распознать» и т.д.  
- отключённые кнопки (у них ещё и `cursor: not-allowed` в CSS для `.scans-table-delete:disabled`)  
- пустое пространство вне `.recognized-text`

Туда **нельзя** (и **не задумано**) бросать слово — поэтому браузер и показывает запрет.

## Зачем так сделано

Это стандартное поведение нативного DnD: явно помечены только зоны, куда drop имеет смысл. Остальное — «сюда нельзя», чтобы случайно не бросить слово на скан или в форму редактирования.

Если **not-allowed** видите прямо **на gap-зонах** или **на словах** — это уже баг (маленькая hit-area, событие перехватывает родитель и т.п.). Напишите, где именно это происходит — можно будет точечно поправить.

---

**User**

Сейчас присутствует область not allowed, судя по поведению на фронтенде, между строками, вокруг полосы для вставки на новую строку.

---

**Cursor**

Разбираюсь с not-allowed вокруг gap-зон: сначала посмотрю разметку и обработчики dragover, затем добавлю логирование.


Гипотезы:
- H1: нижний margin у `<p>` (0.75rem) не принимает события — dragover попадает на родителя без `preventDefault`.
- H2: обёртка `line-block` без обработчика — мёртвая зона между `<p>` и gap.
- H3: hit-area gap (~14px) меньше визуального промежутка между строками.
- H4: dragover на пустой области `<p>` (min-height) вызывает line-drop вместо gap.
- H5: события на `.recognized-text` без дочернего handler → not-allowed.

Добавляю инструментацию для проверки.


Похоже, **not-allowed** появляется в «мёртвых» зонах вокруг gap — там dragover не вызывает `preventDefault()`. Чтобы это подтвердить, добавлено логирование (без правок поведения).

**Гипотезы:**
1. **H1** — нижний `margin` у `<p>` (0.75rem) не принимает события; курсор попадает на родителя без handler.
2. **H2** — обёртка `line-block` без `preventDefault` — мёртвая зона между `<p>` и gap.
3. **H3** — hit-area gap (~14px) меньше визуального промежутка между строками.
4. **H4** — dragover на пустой области `<p>` (min-height) даёт line-drop, а не gap.
5. **H5** — события на `.recognized-text` без дочернего handler → not-allowed.

Логи пишутся при dragover на gap (H3), line (H4), wrapper (H2) и «мёртвых» зонах (H1/H2/H5).

<reproduction_steps>
1. Перезапустите dev-сервер клиента (`npm run dev` в `handwritingocr.client`), если он уже был запущен — нужна свежая сборка с логами.
2. Откройте скан с несколькими строками текста в блоке «Распознанный текст».
3. Перетащите слово и медленно проведите курсором по промежутку между двумя строками — особенно над и под синей полосой gap, где виден курсор not-allowed.
4. Попробуйте отпустить слово в зоне not-allowed и в зоне с синей полосой (move).
5. Press Proceed/Mark as fixed when done.
</reproduction_steps>

---

**User**

Issue reproduced, please proceed.

---

**Cursor**

Логи подтверждают H1/H2: dragover на `DIV` без класса (`line-block`) с `defaultPrevented: false` — мёртвая зона. H3 срабатывает только на узкой полосе gap. Убираю обёртку и переношу межстрочный отступ в padding gap-зоны.


## Анализ логов

| Гипотеза | Статус | Доказательство |
|----------|--------|----------------|
| **H1** — margin у `<p>` не принимает события | **CONFIRMED** | Строки 2–14, 32–50: `dead-zone dragOver`, `tag: "DIV"`, `defaultPrevented: false` |
| **H2** — обёртка `line-block` без handler | **CONFIRMED** | Те же записи: `className: ""` — это wrapper без класса |
| **H3** — gap слишком узкий | **CONFIRMED** | Строки 20–31: gap работает (`defaultPrevented: true`), но только на узкой полосе |
| **H4** — line dragover на `<p>` | **REJECTED** | Строки 1, 15–16, 19, 24: `defaultPrevented: true` — line-drop работает |
| **H5** — `.recognized-text` без handler | **PARTIAL** | Строки 27–28: редкие попадания на контейнер |

**Причина:** между строками были «мёртвые» зоны — `margin` у `<p>` и обёртка `line-block` не вызывали `preventDefault()`, поэтому браузер показывал not-allowed вокруг узкой gap-полосы.

## Исправление (инструментация сохранена)

1. У `<p>` убран `margin-bottom` — отступ перенесён в gap.
2. У `.line-gap-drop` `margin` заменён на `padding` (padding участвует в hit-testing).
3. Обёртка `line-block` заменена на `Fragment` — лишний `DIV` без handler убран.

<reproduction_steps>
1. Перезапустите dev-сервер клиента (`npm run dev` в `handwritingocr.client`), если он уже был запущен.
2. Откройте скан с несколькими строками текста.
3. Перетащите слово и проведите курсором по промежутку между строками — весь промежуток должен показывать move, без not-allowed вокруг полосы.
4. Отпустите слово в промежутке — слово должно перейти на новую строку.
5. Press Proceed/Mark as fixed when done.
</reproduction_steps>

---

**User**

The issue has been fixed. Please clean up the instrumentation.

---

**Cursor**

Инструментация удалена из `App.tsx`: функции `debugDragLog` / `dragTargetInfo`, `debugDragLogRef`, `handleRecognizedTextDragOverCapture`, логи в handlers и `onDragOverCapture`.

Исправление сохранено:
- у `<p>` убран `margin-bottom`, межстрочный отступ перенесён в `padding` gap-зоны;
- обёртка `line-block` заменена на `Fragment`.

