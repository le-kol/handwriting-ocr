# Speckit implementation discussion
_Exported on 8/18/2026 at 01:23:38 GMT+7 from Cursor (3.16.17)_

---

**User**

/speckit-implement 

---

**Cursor**

Запускаю speckit-implement: сначала проверю хуки и prerequisites.


Чеклист пройден (16/16). Читаю `App.tsx` и `App.css` для реализации.


Приступаю к реализации: создаю `frameEdit.ts` и обновляю `App.tsx` и `App.css`.


Сборка прошла успешно. Отмечаю выполненные задачи в `tasks.md`.


Проверяю возможность ручной валидации по quickstart.


## Статус чеклиста

| Checklist | Total | Completed | Incomplete | Status |
|-----------|-------|-----------|------------|--------|
| requirements.md | 16 | 16 | 0 | ✓ PASS |

## Отчёт о реализации

Реализовано редактирование рамки слова на скане через drag-and-drop (фича `008-dnd-word-frame-edit`).

### Новые файлы

**`handwritingocr.client/src/frameEdit.ts`** — чистые хелперы:
- `defaultCenterFrame` — начальная рамка 80×40 по центру
- `translateFrame` / `setCorner` — сдвиг и правка углов с `Math.round`
- `clientToImagePoint` — screen → image space через SVG CTM
- `pointInQuad` / `findWordAtPoint` — hit-test с выбором min `orderIndex`
- `getHandleRadius` / `cornerPoints` — для отрисовки маркеров

### Изменённые файлы

**`App.tsx`**
- Состояние `frameDrag` и `scanSvgRef`
- `onMouseDown` на полигонах вместо `onClick` — выбор без случайного сдвига (FR-003)
- Window `mousemove`/`mouseup` во время drag
- 4 угловых маркера `<circle class="frame-handle">` для выбранного `draft`
- Move drag (interior) и corner drag (handles с `stopPropagation`)
- `handleAddClick` + `useEffect` — центральная рамка для нового слова (id=0)
- `handleCancelClick` / `resetEditorState` — сброс активного drag

**`App.css`**
- Полупрозрачная заливка selected polygon, `grab`/`grabbing`
- Стили `.frame-handle`

### Проверка

- `npm run build` — **успешно** (TypeScript + Vite)
- **T001–T021** — выполнены и отмечены в `tasks.md`
- **T022** — не выполнена: нужна ручная проверка по [quickstart.md](specs/008-dnd-word-frame-edit/quickstart.md) §§1–10 при запущенных PostgreSQL + API + Vite

### Как проверить вручную

1. Запустите backend и frontend (см. README).
2. Откройте скан с несколькими словами.
3. Пройдите сценарии из quickstart: выбор без сдвига, move/corner drag, новое слово, отмена, регрессии text DnD и «Сохранить порядок».

Код готов к приёмке; остаётся только браузерная проверка по quickstart.

---

**User**

Зачем сделан отьдельный frameEdit.ts? Мы раньше так обосабливали?

---

**Cursor**

Проверю, как в проекте обычно выносят вспомогательную логику и что именно лежит в `frameEdit.ts`.


**Коротко:** `frameEdit.ts` сделали не потому, что в проекте всё всегда выносят в отдельные файлы, а потому что так было заложено в плане фичи — и это похоже на уже существующий `curvePoints.ts`, но не на общий стиль всего клиента.

## Зачем отдельный `frameEdit.ts`

В `plan.md` для фичи это описано явно:

- файл **опциональный, но рекомендуемый**;
- туда выносят **чистые функции** без React-состояния: `translateFrame`, `setCorner`, `clientToImagePoint`, `defaultCenterFrame`, `findWordAtPoint`, `pointInQuad`;
- цель — **не раздувать `App.tsx` ещё сильнее** и оставить геометрию/hit-test **тестируемыми отдельно** от UI и `frameDrag`-state.

То есть в `frameEdit.ts` лежит «математика рамки», а в `App.tsx` — React: `draft`, `frameDrag`, обработчики `mousedown`/`mousemove`, рендер SVG и маркеров.

## Вы раньше так обособляли?

**Частично да, но не системно.**

В `handwritingocr.client/src/` до этой фичи уже был похожий преcedent:

| Файл | Что вынесено |
|------|----------------|
| `curvePoints.ts` | чистая логика кривых Безье, bbox, `isWordVectorized` |
| `WordCurveThumbnail.tsx` | отдельный UI-компонент для миниатюры |

При этом **большая часть логики по-прежнему живёт прямо в `App.tsx`**:

- `boxPoints`
- `groupWordsByLine`, `moveWordInLayout`, `layoutSignature` и т.д.
- `wordContentBody`
- fetch/API-хелперы

То есть `frameEdit.ts` — это скорее **продолжение паттерна `curvePoints.ts`**, а не новая архитектурная норма «всё выносим из App».

## Можно ли было без него?

Да. В плане это даже помечено как optional. Всё можно было оставить в `App.tsx`, как сделано с `boxPoints` и layout-хелперами. Отдельный файл — это сознательный компромисс:

- **плюс:** `App.tsx` уже ~1300+ строк, геометрия drag отделена от UI;
- **минус:** появляется ещё один маленький модуль, хотя `boxPoints` рядом с ним всё ещё inline — получается не идеально последовательно.

Если хочется единообразия, логичнее либо **оставить как есть** (как `curvePoints.ts`), либо **свести всё про рамку в один модуль** (`boxPoints` + `frameEdit`), либо наоборот **вернуть хелперы в `App.tsx`**, если отдельный файл кажется лишним. В Ask mode я могу только посоветовать; если нужно перенести/объединить — переключитесь в Agent mode.

---

**User**

Перенеси всю логику рамки в отдельный модуль

---

**Cursor**

Сначала найду всю логику рамки в `App.tsx` и `frameEdit.ts`, чтобы собрать её в одном модуле.


Собираю всё в `frameEdit.ts`: чистые функции, типы и хук `useFrameEdit`.


Обновляю `App.tsx`: подключаю хук и убираю дублирующую логику.


Переименовываю `frameEdit.ts` в `frameEdit.tsx` — в модуле есть JSX.


Вся логика рамки теперь в одном модуле `frameEdit.tsx`.

### Что в модуле

**Чистые функции и типы:**
- `boxPoints`, `frameCoordsPayload`, `wordFrameContentBody`
- `defaultCenterFrame`, `initialFrameCoords`, `isDegenerateFrame`
- `translateFrame`, `setCorner`, `clientToImagePoint`
- `pointInQuad`, `findWordAtPoint`, `resolveTargetWord`
- `getHandleRadius`, `cornerPoints`
- типы `FrameCoords`, `WordLike`, `CoordinateField`, `FrameDrag`
- константа `coordinateFields`

**React-хук `useFrameEdit`:**
- состояние `frameDrag` и `scanSvgRef`
- эффекты: центрирование рамки id=0, window listeners при drag
- обработчики: `handleScanMouseDown`, `handleCoordinateChange`
- рендер угловых маркеров `renderFrameHandles`
- `abortFrameDrag`, `isFrameMoving`

### Что осталось в `App.tsx`

Только интеграция:
- вызов `useFrameEdit`
- `selectWord` / `handleWordSelect` (выбор слова + сброс drag)
- тонкая обёртка `wordContentBody` → `wordFrameContentBody`
- JSX overlay с `boxPoints`, `handleScanMouseDown`, `renderFrameHandles`

`App.tsx` стал короче примерно на 150 строк; сборка проходит успешно.

---

**User**

Модуль должен иначе называться

---

**Cursor**

Подберу имя в стиле проекта (как `curvePoints.ts`) и переименую модуль.


Переименую в `wordFrame.tsx` — по аналогии с `curvePoints.ts`: имя сущности, а не действия.


Модуль переименован в **`wordFrame.tsx`** — по тому же принципу, что и `curvePoints.ts`: имя доменной сущности, а не действия.

- `frameEdit.tsx` → `wordFrame.tsx`
- `useFrameEdit` → `useWordFrame`
- импорт в `App.tsx` обновлён

Сборка проходит успешно. Если нужно другое имя (например, `scanFrame` или `wordBox`) — напишите.

---

**User**

При DnD выделяется изображение (синим, как для копирования)

---

**Cursor**

Разбираюсь с синим выделением при DnD: сначала посмотрю обработчики drag и стили скана.


Формулирую гипотезы и добавляю инструментирование, чтобы понять, какой DnD вызывает синее выделение.


**Гипотезы:**

| ID | Гипотеза |
|----|----------|
| **A** | При frame drag (`mousedown` на рамке/угле) не вызывается `preventDefault()` → браузер включает нативное выделение |
| **B** | При HTML5 DnD слова в тексте selection «перетекает» на область скана |
| **C** | `<img>` по умолчанию draggable → срабатывает native `dragstart` на изображении |
| **D** | Нет `user-select: none` на `.scan` / `img` → синяя подсветка при любом перетаскивании |
| **E** | Выделение только при move drag (не при простом выборе рамки) |

В код добавлены debug-логи по всем путям. Нужно воспроизвести баг.

<reproduction_steps>
1. Перезапустите Vite dev server (или обновите страницу с hot reload), если клиент уже был открыт.
2. Откройте скан с распознанными словами.
3. Воспроизведите синее выделение: (a) выберите слово и перетащите рамку на скане; (b) перетащите слово в блоке recognized-text.
4. Press Proceed/Mark as fixed when done.
</reproduction_steps>

---

**User**

Issue reproduced, please proceed.

---

**Cursor**

Анализ логов:

- H-A — подтверждена: `defaultPrevented: false` при mousedown (стр. 4–5); при move drag `selectionType` переходит в `Range` (стр. 10–13).
- H-C — отклонена: `img.onDragStart` не срабатывал.
- H-D — подтверждена: во время drag selection становится `Range`.
- H-E — подтверждена: только при `willStartMoveDrag: true`.

Вношу правку: `preventDefault` на mousedown и `user-select: none` для `.scan`.


**Исправление по логам:** при frame drag браузер создавал selection (`selectionType: "Range"`, стр. 10–13), потому что `mousedown` не блокировал нативное поведение (`defaultPrevented: false`, стр. 4).

**Что изменено:**
- `event.preventDefault()` на `mousedown` по рамке и угловым маркерам
- `user-select: none` и `-webkit-user-drag: none` для `.scan` / `img`
- `draggable={false}` на `<img>`

Нужна проверка: синее выделение не должно появляться, в логах при drag — `selectionType: "None"`, не `"Range"`.

<reproduction_steps>
1. Обновите страницу (или перезапустите Vite, если HMR не подхватил CSS).
2. Откройте скан, выберите слово и перетащите рамку (move и corner drag).
3. Перетащите слово в recognized-text — убедитесь, что скан не подсвечивается синим.
4. Press Proceed/Mark as fixed when done.
</reproduction_steps>

---

**User**

The issue has been fixed. Please clean up the instrumentation.

---

**Cursor**

Инструментирование удалено. Исправление сохранено:

- `preventDefault()` на `mousedown` по рамке и углам (`wordFrame.tsx`)
- `user-select: none` и `-webkit-user-drag: none` для `.scan` / `img` (`App.css`)
- `draggable={false}` на `<img>`

Сборка проходит успешно.

---

**User**

Рамки перемещаютсяс подлагиваниями

---

**Cursor**

Изучаю реализацию drag рамки — ищу причину подлагиваний.


Подлагивания при перетаскивании рамки — ожидаемое следствие текущей архитектуры, а не баг в математике координат.

## Что происходит сейчас

На **каждый** `mousemove` во время drag вызывается `setDraft`:

```270:288:handwritingocr.client/src/wordFrame.tsx
            setDraft(function (current) {
                if (!current || current.id !== activeDrag.snapshot.id) {
                    return current;
                }

                const point = clientToImagePoint(svg, event.clientX, event.clientY);

                if (activeDrag.mode === 'move') {
                    const dx = point.x - activeDrag.startImageX;
                    const dy = point.y - activeDrag.startImageY;
                    return translateFrame(activeDrag.snapshot, dx, dy);
                }
                // ...
            });
```

Это перерисовывает **весь** `App.tsx` (~1200 строк), а не только SVG-рамку.

## Основные причины лагов

### 1. Полный re-render `App` на каждое движение мыши
При обновлении `draft` заново рендерятся:
- все `<polygon>` всех слов на скане;
- 4 угловых `<circle>`;
- блок **recognized-text** со всеми словами;
- панель редактора с **8 controlled `<input type="number">`**, значения которых меняются на каждом кадре;
- при векторизации — `WordCurveThumbnail`.

`mousemove` может приходить 60–120 раз в секунду — React не успевает без рывков.

### 2. Controlled inputs x1–y4 во время drag
Поля координат привязаны к `draft[field]`:

```1104:1109:handwritingocr.client/src/App.tsx
                                    <input
                                        type="number"
                                        value={draft[field]}
                                        onChange={function (event) {
                                            handleCoordinateChange(field, event.target.value);
                                        }}
```

Обновление 8 числовых инпутов на каждый кадр — дорогая операция для DOM.

### 3. `getBoundingClientRect` при каждом рендере
В `renderFrameHandles` на каждый кадр вызывается `getHandleRadius` → `svg.getBoundingClientRect()` — принудительный layout/reflow.

### 4. Нет throttling
Обновления идут на **каждый** event, без `requestAnimationFrame` — несколько `setDraft` за один кадр экрана.

---

## Что обычно помогает (по эффективности)

| Подход | Суть |
|--------|------|
| **Preview через ref, commit в draft на mouseup** | Во время drag менять только SVG (ref/DOM), `setDraft` — один раз при отпускании. Live preview в полях — опционально через rAF. |
| **Вынести overlay в отдельный `React.memo` компонент** | Чтобы при drag не перерисовывались текст, таблица сканов, кнопки. |
| **Не обновлять inputs во время drag** | Показывать coords только после mouseup или throttled раз в кадр. |
| **rAF-throttle для `setDraft`** | Не чаще 1 раза за кадр (~60 fps). |
| **Кэшировать `getHandleRadius`** | Считать при mousedown/resize, не на каждом render. |

---

## Что маловероятно является причиной

- `clientToImagePoint` / `translateFrame` — лёгкие pure-функции;
- размер скана как `<img>` — картинка не перерисовывается, только SVG поверх;
- `preventDefault` / `user-select` — на производительность drag не влияют.

---

## Практическая рекомендация

Самый заметный выигрыш — **разделить «preview во время drag» и «состояние draft»**:
- во время drag обновлять только polygon + handles (ref или локальный state overlay);
- `draft` и поля x1–y4 — на `mouseup` (или throttled).

Если нужно, могу реализовать это в Agent mode — например, rAF-throttle как быстрый fix или ref-preview как более плавное решение.

---

**User**

нужно проверить на практике причины и попытаться исправить

---

**Cursor**

Проверяю причины подлагиваний на практике: добавлю инструментирование для измерения частоты `setDraft`, re-render и `mousemove`.


Добавляю замеры: частота `mousemove`, re-render `App` и вызовы `getHandleRadius`.


**Гипотезы:**

| ID | Гипотеза |
|----|----------|
| **A** | `setDraft` на каждый `mousemove` → сотни re-render за один drag |
| **B** | Перерисовывается весь `App`, а не только SVG |
| **C** | `getHandleRadius` / `getBoundingClientRect` на каждый кадр |
| **D** | Несколько `mousemove` за один кадр без throttling |
| **E** | Чем больше слов на скане, тем сильнее лаг |

Добавлены замеры: при отпускании мыши в лог уходит сводка (`mousemove`, `setDraftCalls`, `appRenders`, `handleRadiusCalls`, `wordCount`).

<reproduction_steps>
1. Обновите страницу (HMR), откройте скан с несколькими словами.
2. Выберите слово и перетащите рамку 2–3 секунды (move и corner drag).
3. Press Proceed/Mark as fixed when done.
</reproduction_steps>

---

**User**

Issue reproduced, please proceed.

---

**Cursor**

Анализ логов:

- H-A — подтверждена: 52 mousemove → 104 setDraftCalls (~2× из‑за Strict Mode).
- H-B — подтверждена: 80 appRenders при 80 словах — полный re-render App.
- H-C — подтверждена: handleRadiusCalls = 80 (= appRenders).
- H-D — отклонена: maxEventsPerFrame = 1.
- H-E — подтверждена: wordCount = 80.

Причина: каждый setDraft перерисовывает весь App (~80 полигонов + текст). Вынесу preview в отдельный overlay и буду коммитить draft только на mouseup.


Реализую preview через rAF без setDraft во время drag и изолирую re-render через context + memo.


Исправляю архитектуру: один экземпляр `useWordFrame` в `FramePreviewScope`, overlay через context.


**До фикса (лог):** 52 `mousemove` → 104 `setDraftCalls` → **80 re-render App** при 80 словах.

**Исправление:**
- Во время drag обновляется локальный `previewDraft` (throttle через rAF), `setDraft` — **только на mouseup**
- SVG вынесен в `ScanFrameOverlay` — re-render изолирован от всего `App`
- Кэш `getHandleRadius` на время drag
- Поля координат читают preview через context (live sync сохранён)

Ожидаемые метрики после фикса: `appRenders ≈ 0`, `setDraftCalls = 1`, `overlayRenders ≈ 50`.

<reproduction_steps>
1. Обновите страницу (HMR).
2. Откройте скан с множеством слов, перетащите рамку 2–3 секунды (move и corner).
3. Оцените плавность; Press Proceed/Mark as fixed when done.
</reproduction_steps>

---

**User**

The issue has been fixed. Please clean up the instrumentation.

---

**Cursor**

Инструментирование удалено. Исправление производительности сохранено:

- **`previewDraft`** обновляется через rAF во время drag, **`setDraft`** — только на mouseup
- **`ScanFrameOverlay`** изолирует перерисовку SVG от всего `App`
- **Кэш радиуса маркеров** на время drag
- **Context** для live-синхронизации полей координат

Сборка проходит успешно.

---

**User**

Когда коробка изменена и сохранена, если переключусь на другое слово и вернусь обратно, то коробка остается без изменений

---

**Cursor**

Разбираюсь с рассинхронизацией координат после сохранения — смотрю, откуда при повторном выборе слова берутся данные рамки.


Добавляю логи, чтобы проверить, не берутся ли устаревшие координаты из `layoutLines` при повторном выборе слова.


**Гипотезы:**

| ID | Гипотеза |
|----|----------|
| **A** | После сохранения `layoutLines` не обновляется — при выборе из текста берутся старые координаты |
| **B** | `fetchWords` после save возвращает актуальные данные, но `selectWord` их не использует |
| **C** | В логе `layoutX1 !== wordsX1` при повторном выборе |
| **D** | Сразу после save `draft` корректен, но переключение затирает его |

<reproduction_steps>
1. Обновите страницу, откройте скан с несколькими словами.
2. Выберите слово, сдвиньте рамку, нажмите «Сохранить».
3. Выберите другое слово, затем вернитесь к первому (клик по тексту или рамке).
4. Press Proceed/Mark as fixed when done.
</reproduction_steps>

---

**User**

Issue reproduced, please proceed.

---

**Cursor**

Логи показывают: при save `draftX1` совпадает со старым значением (365) — preview при drag, вероятно, не попадает в `draft` к моменту сохранения. Проверяю код и исправлю.


Логи: при save `draftX1` остаётся 365 — preview не попадает в `draft` (async `setDraft` после mouseup). Добавляю синхронный `commitPreviewToDraft` и синхронизацию `layoutLines`.


Часть правок не применилась — проверяю текущее состояние файлов.


Проверяю race между `mouseup` и «Сохранить» — возможная дыра в фиксе.


Добавляю синхронный `draftRef`, чтобы «Сохранить» сразу после drag не читало устаревший `draft`.


По логам предыдущего прогона (файл уже очищен для новой проверки):

| Гипотеза | Вердикт | Доказательство |
|----------|---------|----------------|
| **A** — `layoutLines` не обновляется после save | Частично | При повторном выборе `layoutX1` мог отличаться от сохранённого |
| **B** — `fetchWords` возвращает старые данные | **Отклонена** | `savedX1 === listX1` после save |
| **C** — `selectWord` берёт слово из `layoutLines` | **Подтверждена** | Координаты из раскладки, а не из `words[]` |
| **F** — save отправляет устаревший `draft` | **Подтверждена** | `draftX1` оставался старым, т.к. после drag координаты жили в `previewDraft`, а `setDraft` на mouseup — асинхронный |

**Корневая причина:** после перетаскивания рамки актуальные координаты были в preview-состоянии, но «Сохранить» читало старый `draft`. При переключении слова `selectWord` брал объект из `layoutLines`, который тоже не синхронизировался.

**Применённые исправления:**
1. **`commitPreviewToDraft()`** перед save — сбрасывает preview в draft и возвращает актуальные координаты
2. **`draftRef`** — синхронное обновление на mouseup, чтобы save сразу после drag не попадал в race с React state
3. **`selectWord`** — берёт канонические координаты из `words[]`, текст — из раскладки
4. **`applySavedWordToLayout`** — обновляет `layoutLines` после успешного save

Инструментирование сохранено для проверки (`runId: 'post-fix'`). Ожидаем в логах: `toSaveX1 !== draftX1` при save после drag, `nextX1 === wordsX1` при повторном выборе.

<reproduction_steps>
1. Обновите страницу (перезапустите dev-сервер, если он не подхватил изменения через HMR).
2. Откройте скан с несколькими словами.
3. Выберите слово, перетащите рамку (move или corner), нажмите «Сохранить».
4. Выберите другое слово, затем вернитесь к первому (клик по тексту или рамке).
5. Убедитесь, что рамка на новом месте и координаты совпадают с сохранёнными.
6. Press Proceed/Mark as fixed when done.
</reproduction_steps>

---

**User**

The issue has been fixed. Please clean up the instrumentation.

---

**Cursor**

Ищу и удаляю всю отладочную инструментализацию.


Инструментирование удалено из `App.tsx` — три блока `fetch` в `selectWord` и `handleSaveClick`. Сборка проходит успешно.

Исправления сохранены:
- `commitPreviewToDraft()` перед save
- `selectWord` берёт координаты из `words[]`
- `applySavedWordToLayout` синхронизирует раскладку после save
- `draftRef` для корректного commit сразу после drag

