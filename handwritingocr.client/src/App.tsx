import { useState, useEffect } from 'react';
import './App.css';

// Слово скана в том виде, в котором его возвращает сервер.
// Координаты — четыре вершины рамки в пикселях исходного изображения
interface Word {
    id: number;
    scanId: number;
    text: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    x3: number;
    y3: number;
    x4: number;
    y4: number;
    orderIndex: number;
    lineIndex: number;
}

type CoordinateField = "x1" | "y1" | "x2" | "y2" | "x3" | "y3" | "x4" | "y4";

const coordinateFields: CoordinateField[] = ["x1", "y1", "x2", "y2", "x3", "y3", "x4", "y4"];

function boxPoints(word: Word) {
    return word.x1 + "," + word.y1 + " " +
        word.x2 + "," + word.y2 + " " +
        word.x3 + "," + word.y3 + " " +
        word.x4 + "," + word.y4;
}

// Слова группируются по lineIndex, внутри строки сортируются по orderIndex
function groupWordsByLine(words: Word[]): Word[][] {
    const byLine = new Map<number, Word[]>();

    for (const word of words) {
        const line = byLine.get(word.lineIndex) ?? [];
        line.push(word);
        byLine.set(word.lineIndex, line);
    }

    return [...byLine.entries()]
        .sort(function (a, b) { return a[0] - b[0]; })
        .map(function (entry) {
            return entry[1].sort(function (a, b) { return a.orderIndex - b.orderIndex; });
        });
}

function buildLayoutFromWords(words: Word[]): Word[][] {
    return groupWordsByLine(words);
}

function cloneLayout(lines: Word[][]): Word[][] {
    return lines.map(function (line) {
        return line.map(function (word) { return { ...word }; });
    });
}

function layoutToLineIds(lines: Word[][]): number[][] {
    return lines
        .filter(function (line) { return line.length > 0; })
        .map(function (line) {
            return line.map(function (word) { return word.id; });
        });
}

function layoutSignature(lines: Word[][]): string {
    return JSON.stringify(layoutToLineIds(lines));
}

function moveWordInLayout(
    lines: Word[][],
    wordId: number,
    targetLineIndex: number,
    targetPositionInLine: number
): Word[][] {
    const next = cloneLayout(lines);
    let moving: Word | null = null;

    for (const line of next) {
        const index = line.findIndex(function (word) { return word.id === wordId; });
        if (index >= 0) {
            moving = line[index];
            line.splice(index, 1);
            break;
        }
    }

    if (!moving) {
        return next;
    }

    while (next.length <= targetLineIndex) {
        next.push([]);
    }

    const targetLine = next[targetLineIndex];
    const insertAt = Math.max(0, Math.min(targetPositionInLine, targetLine.length));
    targetLine.splice(insertAt, 0, moving);

    return next.filter(function (line) { return line.length > 0; });
}

function replaceWordIdInLayout(lines: Word[][], oldId: number, newId: number): Word[][] {
    return lines.map(function (line) {
        return line.map(function (word) {
            return word.id === oldId ? { ...word, id: newId } : word;
        });
    });
}

function insertWordIntoLayout(lines: Word[][], word: Word, afterWordId: number | null): Word[][] {
    const next = cloneLayout(lines);

    if (afterWordId !== null) {
        for (const line of next) {
            const index = line.findIndex(function (item) { return item.id === afterWordId; });
            if (index >= 0) {
                line.splice(index + 1, 0, { ...word });
                return next;
            }
        }
    }

    if (next.length === 0) {
        return [[{ ...word }]];
    }

    next[next.length - 1].push({ ...word });
    return next;
}

function wordContentBody(word: Word) {
    // Сервер перезаписывает все поля контента разом, поэтому отправляем текст и координаты целиком
    return {
        text: word.text,
        x1: word.x1,
        y1: word.y1,
        x2: word.x2,
        y2: word.y2,
        x3: word.x3,
        y3: word.y3,
        x4: word.x4,
        y4: word.y4,
    };
}

// После сохранения контента список перечитывается, но layoutLines не сбрасывается:
// порядок на экране сохраняется до отдельного «Сохранить порядок»
function fetchWords(scanId: number): Promise<Word[]> {
    return fetch("/api/Scans/" + scanId + "/words").then(function (response) {
        if (!response.ok) {
            throw new Error("не удалось получить слова: " + response.status);
        }
        return response.json();
    });
}

function readError(response: Response): Promise<never> {
    return response.text().then(function (message) {
        throw new Error(message || String(response.status));
    });
}

function App() {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploadStatus, setUploadStatus] = useState<string | null>(null);
    const [scanId, setScanId] = useState<number | null>(null);
    const [words, setWords] = useState<Word[] | null>(null);
    // Локальная раскладка для drag-and-drop; может расходиться с words до сохранения порядка
    const [layoutLines, setLayoutLines] = useState<Word[][] | null>(null);
    // Подпись раскладки с сервера — эталон для кнопки «Сохранить порядок»
    const [savedLayoutSignature, setSavedLayoutSignature] = useState<string | null>(null);
    const [recognizeStatus, setRecognizeStatus] = useState<string | null>(null);
    const [isRecognizing, setIsRecognizing] = useState(false);
    const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
    // Правки выбранного слова. id внутри черновика заодно говорит, какое слово выбрано,
    // поэтому отдельного состояния для выбора нет и разойтись им негде
    const [draft, setDraft] = useState<Word | null>(null);
    const [saveStatus, setSaveStatus] = useState<string | null>(null);
    const [layoutSaveStatus, setLayoutSaveStatus] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isSavingLayout, setIsSavingLayout] = useState(false);
    const [draggedWordId, setDraggedWordId] = useState<number | null>(null);
    const [dropTarget, setDropTarget] = useState<{ lineIndex: number; positionInLine: number } | null>(null);

    function syncLayoutFromWords(list: Word[]) {
        const layout = buildLayoutFromWords(list);
        setLayoutLines(layout);
        setSavedLayoutSignature(layoutSignature(layout));
    }

    // Если words уже есть, а layoutLines ещё не инициализирован — восстановить из сервера
    useEffect(function () {
        if (words && words.length > 0 && layoutLines === null && savedLayoutSignature === null) {
            syncLayoutFromWords(words);
        }
    }, [words, layoutLines, savedLayoutSignature]);

    function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0] ?? null;
        setSelectedFile(file);
        // Результат распознавания относится к прежнему скану, поэтому его нужно сбросить
        setWords(null);
        setLayoutLines(null);
        setSavedLayoutSignature(null);
        setRecognizeStatus(null);
        setImageSize(null);
        setDraft(null);
        setSaveStatus(null);
        setLayoutSaveStatus(null);
        setDraggedWordId(null);
        setDropTarget(null);

        if (file) {
            // Запрос для отправки файла на сервер
            const formData = new FormData();
            formData.append("file", file);
            setUploadStatus("Загрузка");

            fetch("/api/Scans/upload", {
                method: "POST",
                body: formData,
            }).then(function (response) {
                return response.json();
            }).then(function (data) {
                setScanId(data.id);
                setUploadStatus("Загрузка завершена");
            }).catch(function (error) {
                setUploadStatus("Ошибка загрузки: " + error.message);
            });
        }
    }

    // Запрос на распознавание текста загруженного скана
    function handleRecognizeClick() {
        if (scanId === null) return;

        setIsRecognizing(true);
        setRecognizeStatus("Распознавание");

        fetch("/api/Scans/" + scanId + "/recognize", {
            method: "POST",
        }).then(function (response) {
            if (!response.ok) {
                // Об ошибках сервер сообщает текстом, а не JSON
                return readError(response);
            }
            return response.json();
        }).then(function (data: Word[]) {
            setWords(data);
            syncLayoutFromWords(data);
            // Распознавание удаляет прежние слова и вставляет новые, поэтому старые id
            // больше не существуют и черновик указывал бы на удалённое слово
            setDraft(null);
            setSaveStatus(null);
            setLayoutSaveStatus(null);
            setRecognizeStatus("Распознавание завершено, слов: " + data.length);
        }).catch(function (error) {
            setRecognizeStatus("Ошибка распознавания: " + error.message);
        }).finally(function () {
            setIsRecognizing(false);
        });
    }

    // Размеры скана в БД не хранятся, поэтому берём их у загруженного изображения:
    // координаты рамок заданы именно в этих пикселях
    function handleImageLoad(event: React.SyntheticEvent<HTMLImageElement>) {
        setImageSize({
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight,
        });
    }

    function handleWordSelect(word: Word) {
        // Повторный клик по уже выбранному слову не должен отбрасывать начатые правки
        if (draft && draft.id === word.id) return;
        setDraft({ ...word });
        setSaveStatus(null);
    }

    // Слово создаётся не сразу: кнопка только открывает пустую форму, а запись
    // в БД появляется при сохранении
    function handleAddClick() {
        if (scanId === null) return;

        const baseLayout = layoutLines ?? (words ? buildLayoutFromWords(words) : []);
        // Новое слово встаёт сразу после выбранного, иначе в конец последней строки
        const afterWordId = draft && draft.id !== 0 ? draft.id : null;
        const newWord: Word = {
            // Ноль означает, что записи в БД ещё нет: настоящий id выдаёт сама БД
            id: 0,
            // Скан сервер берёт из адреса запроса, значение из тела он игнорирует
            scanId,
            text: "",
            x1: 0, y1: 0,
            x2: 0, y2: 0,
            x3: 0, y3: 0,
            x4: 0, y4: 0,
            orderIndex: 0,
            lineIndex: 0,
        };

        setLayoutLines(insertWordIntoLayout(baseLayout, newWord, afterWordId));
        setDraft(newWord);
        setSaveStatus(null);
    }

    function handleTextChange(event: React.ChangeEvent<HTMLInputElement>) {
        const text = event.target.value;
        setDraft(function (current) {
            if (!current) return current;
            const next = { ...current, text };
            setLayoutLines(function (lines) {
                if (!lines) return lines;
                return lines.map(function (line) {
                    return line.map(function (word) {
                        return word.id === current.id ? { ...word, text } : word;
                    });
                });
            });
            return next;
        });
    }

    function handleCoordinateChange(field: CoordinateField, value: string) {
        setDraft(function (current) {
            return current ? { ...current, [field]: Number(value) } : current;
        });
    }

    function handleCancelClick() {
        setDraft(null);
        setSaveStatus(null);
        setDraggedWordId(null);
        setDropTarget(null);
        if (words) {
            syncLayoutFromWords(words);
            setLayoutSaveStatus(null);
        }
    }

    function handleDragStart(event: React.DragEvent, word: Word) {
        event.dataTransfer.setData("text/plain", String(word.id));
        event.dataTransfer.effectAllowed = "move";
        setDraggedWordId(word.id);
        setDraft({ ...word });
        setSaveStatus(null);
        setLayoutSaveStatus(null);
    }

    function handleDragEnd() {
        setDraggedWordId(null);
        setDropTarget(null);
    }

    function handleDragOverLine(event: React.DragEvent, lineIndex: number) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (draggedWordId === null) return;
        setDropTarget(function (current) {
            const lineLength = layoutLines?.[lineIndex]?.length ?? 0;
            if (current?.lineIndex === lineIndex && current.positionInLine === lineLength) {
                return current;
            }
            return { lineIndex, positionInLine: lineLength };
        });
    }

    function handleDragOverWord(event: React.DragEvent, lineIndex: number, positionInLine: number) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (draggedWordId === null) return;
        setDropTarget(function (current) {
            if (current?.lineIndex === lineIndex && current.positionInLine === positionInLine) {
                return current;
            }
            return { lineIndex, positionInLine };
        });
    }

    function handleDrop(event: React.DragEvent, lineIndex: number, positionInLine: number) {
        event.preventDefault();
        if (draggedWordId === null) return;

        setLayoutLines(function (current) {
            const base = current ?? (words ? buildLayoutFromWords(words) : null);
            if (!base) return current;
            return moveWordInLayout(base, draggedWordId, lineIndex, positionInLine);
        });
        setDraft(function (current) {
            if (!current || current.id !== draggedWordId) return current;
            return { ...current };
        });
        setDraggedWordId(null);
        setDropTarget(null);
    }

    // Сохраняется только текст и координаты; порядок слов — отдельной кнопкой
    function handleSaveClick() {
        if (scanId === null || draft === null) return;

        setIsSaving(true);
        setSaveStatus("Сохранение");

        const isNew = draft.id === 0;
        // У слова без id записи в БД ещё нет, поэтому его создают, а не обновляют
        const url = isNew
            ? "/api/Scans/" + scanId + "/words"
            : "/api/Scans/" + scanId + "/words/" + draft.id;

        fetch(url, {
            method: isNew ? "POST" : "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(wordContentBody(draft)),
        }).then(function (response) {
            if (!response.ok) {
                // Об ошибках сервер сообщает текстом, а не JSON
                return readError(response);
            }
            return response.json() as Promise<Word>;
        }).then(function (saved) {
            if (isNew && layoutLines) {
                // БД выдала id; в локальной раскладке временный id=0 заменяется на настоящий
                setLayoutLines(replaceWordIdInLayout(layoutLines, 0, saved.id));
            }
            return fetchWords(scanId).then(function (list) {
                setWords(list);
                setDraft(saved);
                setSaveStatus("Сохранено");
            });
        }).catch(function (error) {
            setSaveStatus("Ошибка сохранения: " + error.message);
        }).finally(function () {
            setIsSaving(false);
        });
    }

    // Отправляет локальную раскладку на сервер; words и эталон обновляются из ответа
    function handleSaveLayoutClick() {
        if (scanId === null) return;

        const layoutToSave = layoutLines ?? (words ? buildLayoutFromWords(words) : null);
        if (!layoutToSave) return;

        if (layoutToSave.some(function (line) {
            return line.some(function (word) { return word.id === 0; });
        })) {
            setLayoutSaveStatus("Сначала сохраните новое слово");
            return;
        }

        if (savedLayoutSignature === null ||
            layoutSignature(layoutToSave) === savedLayoutSignature) {
            setLayoutSaveStatus("Порядок не менялся");
            return;
        }

        setIsSavingLayout(true);
        setLayoutSaveStatus("Сохранение порядка");

        fetch("/api/Scans/" + scanId + "/words/layout", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lines: layoutToLineIds(layoutToSave) }),
        }).then(function (response) {
            if (!response.ok) {
                return readError(response);
            }
            return response.json() as Promise<Word[]>;
        }).then(function (list) {
            setWords(list);
            syncLayoutFromWords(list);
            setDraft(function (current) {
                if (!current) return current;
                const updated = list.find(function (word) { return word.id === current.id; });
                return updated ? { ...updated } : current;
            });
            setLayoutSaveStatus("Порядок сохранён");
        }).catch(function (error) {
            setLayoutSaveStatus("Ошибка: " + error.message);
        }).finally(function () {
            setIsSavingLayout(false);
        });
    }

    const effectiveLayout = layoutLines ?? (words ? buildLayoutFromWords(words) : null);
    const displayLines = effectiveLayout;
    const layoutDirty = savedLayoutSignature !== null &&
        effectiveLayout !== null &&
        layoutSignature(effectiveLayout) !== savedLayoutSignature;

    return (
        <div>
            <input type="file" accept=".jpeg, .jpg, .png" onChange={handleFileChange} />
            <p>Выбранный файл: {selectedFile ? selectedFile.name : "Не выбран"}</p>
            <p>Статус: {uploadStatus}</p>
            {scanId ? (
                // При изменении scanId запросятся данные изображения с сервера для этого id
                <div className="scan">
                    <img src={"/api/scans/" + scanId + "/image"} onLoad={handleImageLoad} />
                    {imageSize ? (
                        // viewBox переводит пиксели исходного изображения в текущий размер картинки,
                        // поэтому масштаб рамок не нужно считать вручную
                        <svg viewBox={"0 0 " + imageSize.width + " " + imageSize.height}>
                            {words ? words.map(function (word) {
                                const isSelected = draft !== null && draft.id === word.id;
                                // У выбранного слова рамка рисуется по черновику,
                                // чтобы правка координат была видна до сохранения
                                const shown = isSelected ? draft : word;

                                return (
                                    <polygon
                                        key={word.id}
                                        className={isSelected ? "selected" : undefined}
                                        points={boxPoints(shown)}
                                        onClick={function () { handleWordSelect(word); }}
                                    />
                                );
                            }) : null}
                            {/* Несохранённого слова в списке ещё нет, поэтому его рамка
                                рисуется отдельно: иначе вводить координаты пришлось бы наугад */}
                            {draft && draft.id === 0 ? (
                                <polygon className="selected" points={boxPoints(draft)} />
                            ) : null}
                        </svg>
                    ) : null}
                </div>
            ) : null}
            {scanId ? (
                // Распознавать можно только уже загруженный скан
                <div>
                    <button type="button" onClick={handleRecognizeClick} disabled={isRecognizing}>
                        {isRecognizing ? "Распознавание..." : "Распознать текст"}
                    </button>
                    <button type="button" onClick={handleAddClick} disabled={isSaving}>
                        Добавить слово
                    </button>
                    <p>Статус распознавания: {recognizeStatus}</p>
                </div>
            ) : null}
            {words && words.length > 0 && draft === null ? (
                <p>Выберите слово в тексте или рамку на скане, чтобы отредактировать</p>
            ) : null}
            {draft ? (
                <div className="editor">
                    <p>
                        {draft.id === 0
                            ? "Новое слово на позицию " + draft.orderIndex
                            : "Слово на позиции " + draft.orderIndex}
                    </p>
                    <label>
                        Текст <input value={draft.text} onChange={handleTextChange} />
                    </label>
                    <div className="coordinates">
                        {coordinateFields.map(function (field) {
                            return (
                                <label key={field}>
                                    {field}
                                    <input
                                        type="number"
                                        value={draft[field]}
                                        onChange={function (event) {
                                            handleCoordinateChange(field, event.target.value);
                                        }}
                                    />
                                </label>
                            );
                        })}
                    </div>
                    <button type="button" onClick={handleSaveClick} disabled={isSaving}>
                        {isSaving ? "Сохранение..." : "Сохранить"}
                    </button>
                    <button type="button" onClick={handleCancelClick}>Отмена</button>
                    <p>{saveStatus}</p>
                </div>
            ) : null}
            {displayLines && displayLines.length > 0 ? (
                <div className="recognized-text-block">
                    <div className="layout-toolbar">
                        <button
                            type="button"
                            onClick={handleSaveLayoutClick}
                            disabled={isSavingLayout || !layoutDirty}
                        >
                            {isSavingLayout ? "Сохранение..." : "Сохранить порядок"}
                        </button>
                        <p>{layoutSaveStatus}</p>
                    </div>
                    <div className="recognized-text">
                    {displayLines.map(function (lineWords, lineIndex) {
                        return (
                            <p
                                key={"line-" + lineIndex}
                                onDragOver={function (event) { handleDragOverLine(event, lineIndex); }}
                                onDrop={function (event) {
                                    handleDrop(event, lineIndex, lineWords.length);
                                }}
                            >
                                {lineWords.map(function (word, positionInLine) {
                                    const isSelected = draft !== null && draft.id === word.id;
                                    const shown = isSelected ? draft : word;
                                    const isDragging = draggedWordId === word.id;
                                    const isDropTarget = dropTarget !== null &&
                                        dropTarget.lineIndex === lineIndex &&
                                        dropTarget.positionInLine === positionInLine;

                                    return (
                                        <span key={word.id}>
                                            {positionInLine > 0 ? " " : null}
                                            <span
                                                className={
                                                    "word" +
                                                    (isSelected ? " selected" : "") +
                                                    (isDragging ? " dragging" : "") +
                                                    (isDropTarget ? " drop-target" : "")
                                                }
                                                draggable={true}
                                                onDragStart={function (event) { handleDragStart(event, word); }}
                                                onDragEnd={handleDragEnd}
                                                onDragOver={function (event) {
                                                    handleDragOverWord(event, lineIndex, positionInLine);
                                                }}
                                                onDrop={function (event) {
                                                    handleDrop(event, lineIndex, positionInLine);
                                                }}
                                                onClick={function () { handleWordSelect(word); }}
                                            >
                                                {shown.text || (word.id === 0 ? "…" : "")}
                                            </span>
                                        </span>
                                    );
                                })}
                            </p>
                        );
                    })}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export default App;
