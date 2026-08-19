import { useState, useEffect, useRef, Fragment } from 'react';
import './App.css';
import { isWordVectorized } from './curvePoints';
import WordCurveThumbnail from './WordCurveThumbnail';
import {
    coordinateFields,
    FramePreviewScope,
    initialFrameCoords,
    useFramePreviewWord,
    useWordFrameContext,
    wordFrameContentBody,
} from './wordFrame';
import ScanFrameOverlay from './ScanFrameOverlay';
import InlineWordInput from './InlineWordInput';
import {
    caretIndexFromClick,
    distanceExceeded,
    isUnsavedWordId,
    lastSavedTextForWord,
    type PendingWordGesture,
} from './inlineWordEdit';

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
    /** Кривые Безье в СК фрагмента; отсутствует / null / [] — не векторизовано */
    curvePoints?: number[][][] | null;
}

interface ScanListItem {
    id: number;
}

const SCAN_PAGE_SIZE = 30;
const SCANS_LIST_RETRY_ATTEMPTS = 5;
const SCANS_LIST_RETRY_DELAY_MS = 1000;

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

function moveWordToNewLine(
    lines: Word[][],
    wordId: number,
    insertAtLineIndex: number
): Word[][] {
    const next = cloneLayout(lines);
    let moving: Word | null = null;
    let removedFromLineIndex = -1;

    for (let lineIndex = 0; lineIndex < next.length; lineIndex++) {
        const index = next[lineIndex].findIndex(function (word) { return word.id === wordId; });
        if (index >= 0) {
            moving = next[lineIndex][index];
            next[lineIndex].splice(index, 1);
            removedFromLineIndex = lineIndex;
            break;
        }
    }

    if (!moving) {
        return next.filter(function (line) { return line.length > 0; });
    }

    let insertAt = insertAtLineIndex;
    if (removedFromLineIndex >= 0 && removedFromLineIndex < insertAt) {
        insertAt -= 1;
    }

    next.splice(insertAt, 0, [moving]);

    return next.filter(function (line) { return line.length > 0; });
}

function replaceWordIdInLayout(lines: Word[][], oldId: number, newId: number): Word[][] {
    return lines.map(function (line) {
        return line.map(function (word) {
            return word.id === oldId ? { ...word, id: newId } : word;
        });
    });
}

function applySavedWordToLayout(lines: Word[][], saved: Word): Word[][] {
    return lines.map(function (line) {
        return line.map(function (word) {
            return word.id === saved.id ? { ...word, ...saved } : word;
        });
    });
}

function findWordInLayout(lines: Word[][] | null, wordId: number): Word | null {
    if (!lines) {
        return null;
    }
    for (const line of lines) {
        const found = line.find(function (word) { return word.id === wordId; });
        if (found) {
            return found;
        }
    }
    return null;
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
    return wordFrameContentBody(word);
}

// После сохранения контента список перечитывается, но layoutLines не сбрасывается:
// порядок на экране сохраняется до отдельного «Сохранить порядок».
// JSON.parse через response.json() сохраняет все поля Word, включая curvePoints.
function fetchWords(scanId: number): Promise<Word[]> {
    return fetch("/api/Scans/" + scanId + "/words").then(function (response) {
        if (!response.ok) {
            return response.text().then(function (message) {
                throw new Error(message || String(response.status));
            });
        }
        return response.json() as Promise<Word[]>;
    });
}

function delay(ms: number): Promise<void> {
    return new Promise(function (resolve) {
        setTimeout(resolve, ms);
    });
}

async function fetchScansPageWithRetry(
    page: number
): Promise<{ items: ScanListItem[]; totalCount: number }> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < SCANS_LIST_RETRY_ATTEMPTS; attempt++) {
        if (attempt > 0) {
            await delay(SCANS_LIST_RETRY_DELAY_MS);
        }

        let response: Response;
        try {
            response = await fetch("/api/Scans?page=" + page);
        } catch {
            lastError = new Error("Сервер недоступен");
            continue;
        }

        if (response.ok) {
            return await response.json() as { items: ScanListItem[]; totalCount: number };
        }

        const message = await response.text();
        lastError = new Error(message || String(response.status));
        if (response.status !== 502 && response.status !== 503) {
            throw lastError;
        }
    }

    throw lastError ?? new Error("Не удалось загрузить список сканов");
}

function vectorizeWord(scanId: number, wordId: number): Promise<Word> {
    return fetch("/api/Scans/" + scanId + "/words/" + wordId + "/vectorize", {
        method: "POST",
    }).then(function (response) {
        if (!response.ok) {
            return response.text().then(function (message) {
                throw new Error(message || String(response.status));
            });
        }
        return response.json() as Promise<Word>;
    });
}

function deleteWord(scanId: number, wordId: number): Promise<void> {
    return fetch("/api/Scans/" + scanId + "/words/" + wordId, {
        method: "DELETE",
    }).then(function (response) {
        if (!response.ok) {
            return response.text().then(function (message) {
                throw new Error(message || String(response.status));
            });
        }
    });
}

function deleteScan(id: number): Promise<void> {
    return fetch("/api/Scans/" + id, {
        method: "DELETE",
    }).then(function (response) {
        if (response.status !== 204) {
            return response.text().then(function (message) {
                throw new Error(message || String(response.status));
            });
        }
    });
}

function vectorizeBatch(scanId: number): Promise<Word[]> {
    return fetch("/api/Scans/" + scanId + "/vectorize-batch", {
        method: "POST",
    }).then(function (response) {
        if (!response.ok) {
            return response.text().then(function (message) {
                throw new Error(message || String(response.status));
            });
        }
        return response.json() as Promise<Word[]>;
    });
}

function removeWordFromLayout(lines: Word[][] | null, wordId: number): Word[][] | null {
    if (!lines) {
        return lines;
    }
    return lines
        .map(function (line) {
            return line.filter(function (word) { return word.id !== wordId; });
        })
        .filter(function (line) { return line.length > 0; });
}

function revertLayoutWordText(lines: Word[][], wordId: number, text: string): Word[][] {
    return lines.map(function (line) {
        return line.map(function (word) {
            return word.id === wordId ? { ...word, text } : word;
        });
    });
}

function readError(response: Response): Promise<never> {
    return response.text().then(function (message) {
        throw new Error(message || String(response.status));
    });
}

function applyWordUpdateInLayout(lines: Word[][] | null, updated: Word): Word[][] | null {
    if (!lines) {
        return lines;
    }
    return lines.map(function (line) {
        return line.map(function (word) {
            return word.id === updated.id ? { ...word, ...updated } : word;
        });
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
    const [inlineEditingWordId, setInlineEditingWordId] = useState<number | null>(null);
    const [pendingWordGesture, setPendingWordGesture] = useState<PendingWordGesture | null>(null);
    const [saveStatus, setSaveStatus] = useState<string | null>(null);
    const [layoutSaveStatus, setLayoutSaveStatus] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isSavingLayout, setIsSavingLayout] = useState(false);
    const [draggedWordId, setDraggedWordId] = useState<number | null>(null);
    const [dropTarget, setDropTarget] = useState<{ lineIndex: number; positionInLine: number } | null>(null);
    const [gapDropTarget, setGapDropTarget] = useState<number | null>(null);
    const [vectorizingWordId, setVectorizingWordId] = useState<number | null>(null);
    const [isBatchVectorizing, setIsBatchVectorizing] = useState(false);
    const [vectorizeStatus, setVectorizeStatus] = useState<string | null>(null);
    const [deleteStatus, setDeleteStatus] = useState<string | null>(null);
    const [scanItems, setScanItems] = useState<ScanListItem[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [listPage, setListPage] = useState(1);
    const [listLoading, setListLoading] = useState(false);
    const [listError, setListError] = useState<string | null>(null);
    const [wordsOpenError, setWordsOpenError] = useState<string | null>(null);
    const [isDeletingScan, setIsDeletingScan] = useState(false);
    const [deleteScanStatus, setDeleteScanStatus] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const scanIdRef = useRef<number | null>(scanId);
    scanIdRef.current = scanId;
    /** Инкремент при смене скана/сбросе — отменяет устаревшие async-колбэки */
    const editorGenerationRef = useRef(0);
    const [brokenThumbnails, setBrokenThumbnails] = useState<Set<number>>(function () {
        return new Set();
    });

    const abortFrameDragRef = useRef<(() => void) | null>(null);
    const commitPreviewRef = useRef<(() => Word | null) | null>(null);
    const inlineInputRef = useRef<HTMLInputElement | null>(null);
    const pendingCaretRef = useRef<{ x: number; y: number } | null>(null);
    const isCommittingInlineRef = useRef(false);
    const nextTempWordIdRef = useRef(-1);
    const draftRef = useRef(draft);
    draftRef.current = draft;
    const wordsRef = useRef(words);
    wordsRef.current = words;
    const layoutLinesRef = useRef(layoutLines);
    layoutLinesRef.current = layoutLines;
    const inlineEditingWordIdRef = useRef(inlineEditingWordId);
    inlineEditingWordIdRef.current = inlineEditingWordId;

    function selectWord(word: Word) {
        const canonical = words?.find(function (item) { return item.id === word.id; });
        const next = canonical ? { ...canonical, text: word.text } : { ...word };
        setDraft(next);
        setSaveStatus(null);
        setDeleteStatus(null);
    }

    function resetEditorState() {
        editorGenerationRef.current += 1;
        nextTempWordIdRef.current = -1;
        abortFrameDragRef.current?.();
        setWords(null);
        setLayoutLines(null);
        setSavedLayoutSignature(null);
        setRecognizeStatus(null);
        setImageSize(null);
        setDraft(null);
        setInlineEditingWordId(null);
        setPendingWordGesture(null);
        setSaveStatus(null);
        setLayoutSaveStatus(null);
        setDraggedWordId(null);
        setDropTarget(null);
        setVectorizingWordId(null);
        setIsBatchVectorizing(false);
        setVectorizeStatus(null);
        setDeleteStatus(null);
        setIsRecognizing(false);
        setIsSaving(false);
        setIsSavingLayout(false);
        setWordsOpenError(null);
        setDeleteScanStatus(null);
    }

    function clearToEmptyState() {
        setScanId(null);
        setSelectedFile(null);
        setUploadStatus(null);
        resetEditorState();
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    }

    function loadScansPage(page: number) {
        setListLoading(true);
        setListError(null);
        fetchScansPageWithRetry(page).then(function (data) {
            setScanItems(data.items);
            setTotalCount(data.totalCount);
            setListError(null);
        }).catch(function (error) {
            setListError(error instanceof Error ? error.message : String(error));
        }).finally(function () {
            setListLoading(false);
        });
    }

    useEffect(function () {
        loadScansPage(listPage);
    }, [listPage]);

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
        resetEditorState();

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
                setListPage(1);
                loadScansPage(1);
            }).catch(function (error) {
                setUploadStatus("Ошибка загрузки: " + error.message);
            });
        }
    }

    function handleScanRowClick(id: number) {
        resetEditorState();
        setWordsOpenError(null);
        setScanId(id);
        const generation = editorGenerationRef.current;
        fetchWords(id).then(function (list) {
            if (editorGenerationRef.current !== generation || scanIdRef.current !== id) {
                return;
            }
            setWords(list);
            syncLayoutFromWords(list);
        }).catch(function (error) {
            if (editorGenerationRef.current !== generation) {
                return;
            }
            setWordsOpenError("Не удалось загрузить слова: " + error.message);
        });
    }

    function handleDeleteScan(id: number, options?: { refreshList?: boolean }) {
        if (isDeletingScan || isRecognizing || isBatchVectorizing || vectorizingWordId !== null) {
            return;
        }

        setIsDeletingScan(true);
        setDeleteScanStatus(null);

        deleteScan(id).then(function () {
            if (id === scanId) {
                clearToEmptyState();
            }

            if (options?.refreshList) {
                return fetchScansPageWithRetry(listPage).then(function (data) {
                    setScanItems(data.items);
                    setTotalCount(data.totalCount);
                    setListError(null);
                    if (data.items.length === 0 && listPage > 1) {
                        setListPage(listPage - 1);
                    }
                }).catch(function (error) {
                    setDeleteScanStatus(error instanceof Error ? error.message : String(error));
                });
            }
        }).catch(function (error) {
            setDeleteScanStatus(error instanceof Error ? error.message : String(error));
        }).finally(function () {
            setIsDeletingScan(false);
        });
    }

    function handleThumbnailError(id: number) {
        setBrokenThumbnails(function (current) {
            const next = new Set(current);
            next.add(id);
            return next;
        });
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
            abortFrameDragRef.current?.();
            setSaveStatus(null);
            setLayoutSaveStatus(null);
            setVectorizingWordId(null);
            setIsBatchVectorizing(false);
            setVectorizeStatus(null);
            setDeleteStatus(null);
            setRecognizeStatus("Распознавание завершено, слов: " + data.length);
        }).catch(function (error) {
            setRecognizeStatus("Ошибка распознавания: " + error.message);
        }).finally(function () {
            setIsRecognizing(false);
        });
    }

    function handleVectorizeClick(word: Word) {
        if (scanId === null || isUnsavedWordId(word.id) || vectorizingWordId !== null || isBatchVectorizing) {
            return;
        }

        const requestScanId = scanId;
        const generation = editorGenerationRef.current;
        setVectorizingWordId(word.id);
        setVectorizeStatus("Векторизация слова…");

        vectorizeWord(requestScanId, word.id).then(function (updated) {
            if (editorGenerationRef.current !== generation || scanIdRef.current !== requestScanId) {
                return;
            }
            setWords(function (current) {
                if (!current) {
                    return current;
                }
                return current.map(function (item) {
                    return item.id === updated.id ? updated : item;
                });
            });
            setLayoutLines(function (lines) {
                return applyWordUpdateInLayout(lines, updated);
            });
            setDraft(function (current) {
                if (!current || current.id !== updated.id) {
                    return current;
                }
                return { ...current, ...updated };
            });
            setVectorizeStatus("Векторизация завершена");
        }).catch(function (error) {
            if (editorGenerationRef.current !== generation || scanIdRef.current !== requestScanId) {
                return;
            }
            // Ошибка не очищает curvePoints / миниатюру уже векторизованного слова
            setVectorizeStatus("Ошибка векторизации: " + error.message);
        }).finally(function () {
            if (editorGenerationRef.current === generation) {
                setVectorizingWordId(null);
            }
        });
    }

    function handleDeleteClick() {
        if (scanId === null || draft === null || isUnsavedWordId(draft.id)) {
            return;
        }

        const wordId = draft.id;
        setDeleteStatus(null);

        deleteWord(scanId, wordId).then(function () {
            setWords(function (current) {
                if (!current) {
                    return current;
                }
                return current.filter(function (item) { return item.id !== wordId; });
            });
            setLayoutLines(function (lines) {
                return removeWordFromLayout(lines, wordId);
            });
            setDraft(null);
            setDraggedWordId(null);
            setDropTarget(null);
            setDeleteStatus(null);
        }).catch(function (error) {
            setDeleteStatus(error.message);
        });
    }

    function handleBatchVectorizeClick() {
        if (scanId === null || isBatchVectorizing || vectorizingWordId !== null) {
            return;
        }

        const requestScanId = scanId;
        const generation = editorGenerationRef.current;
        setIsBatchVectorizing(true);
        setVectorizeStatus("Пакетная векторизация…");

        vectorizeBatch(requestScanId).then(function (data) {
            if (editorGenerationRef.current !== generation || scanIdRef.current !== requestScanId) {
                return;
            }
            setWords(data);
            syncLayoutFromWords(data);
            setDraft(function (current) {
                if (!current) {
                    return current;
                }
                const updated = data.find(function (item) { return item.id === current.id; });
                return updated ? { ...current, ...updated } : current;
            });
            setVectorizeStatus("Пакетная векторизация завершена");
        }).catch(function (error) {
            if (editorGenerationRef.current !== generation || scanIdRef.current !== requestScanId) {
                return;
            }
            setVectorizeStatus("Ошибка пакетной векторизации: " + error.message);
        }).finally(function () {
            if (editorGenerationRef.current === generation) {
                setIsBatchVectorizing(false);
            }
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

    function clearInlineEditing() {
        inlineEditingWordIdRef.current = null;
        setInlineEditingWordId(null);
    }

    function revertInlineWordText(wordId: number, text: string) {
        setLayoutLines(function (lines) {
            if (!lines) return lines;
            return revertLayoutWordText(lines, wordId, text);
        });
        setDraft(function (current) {
            if (current !== null && current.id === wordId) {
                return { ...current, text };
            }
            return current;
        });
    }

    function updateDraftText(text: string) {
        setDraft(function (current) {
            if (!current) return current;
            const inlineId = inlineEditingWordIdRef.current;
            if (inlineId !== null && current.id !== inlineId) {
                return current;
            }
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

    function enterInlineEdit(wordId: number, clickClientX: number, clickClientY: number) {
        abortFrameDragRef.current?.();
        pendingCaretRef.current = { x: clickClientX, y: clickClientY };
        setInlineEditingWordId(wordId);
        setPendingWordGesture(null);
    }

    function cancelInlineEdit() {
        const currentDraft = draftRef.current;
        if (currentDraft === null || inlineEditingWordIdRef.current === null) {
            return;
        }
        updateDraftText(lastSavedTextForWord(currentDraft.id, wordsRef.current));
        clearInlineEditing();
    }

    function commitInlineEdit() {
        if (isCommittingInlineRef.current) {
            return;
        }
        const inlineWordId = inlineEditingWordIdRef.current;
        if (inlineWordId === null) {
            return;
        }

        const currentDraft = draftRef.current;
        let toSave: Word | null = null;
        if (currentDraft !== null && currentDraft.id === inlineWordId) {
            toSave = currentDraft;
        } else {
            const fromLayout = findWordInLayout(layoutLinesRef.current, inlineWordId);
            if (fromLayout) {
                toSave = fromLayout;
            }
        }
        if (toSave === null) {
            clearInlineEditing();
            return;
        }

        const baseline = lastSavedTextForWord(inlineWordId, wordsRef.current);
        clearInlineEditing();

        if (toSave.text.trim() === '') {
            if (isUnsavedWordId(inlineWordId)) {
                setLayoutLines(function (lines) { return removeWordFromLayout(lines, inlineWordId); });
            } else {
                revertInlineWordText(inlineWordId, baseline);
            }
            return;
        }

        if (toSave.text === baseline) {
            return;
        }

        isCommittingInlineRef.current = true;
        const committingWordId = inlineWordId;
        persistWordContent(toSave).catch(function () {
            if (draftRef.current?.id === committingWordId) {
                inlineEditingWordIdRef.current = committingWordId;
                setInlineEditingWordId(committingWordId);
            }
        }).finally(function () {
            isCommittingInlineRef.current = false;
        });
    }

    function persistWordContent(toSave: Word): Promise<Word> {
        if (scanId === null) {
            return Promise.reject(new Error('Скан не выбран'));
        }

        setIsSaving(true);
        setSaveStatus("Сохранение");

        const isNew = isUnsavedWordId(toSave.id);
        const url = isNew
            ? "/api/Scans/" + scanId + "/words"
            : "/api/Scans/" + scanId + "/words/" + toSave.id;

        return fetch(url, {
            method: isNew ? "POST" : "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(wordContentBody(toSave)),
        }).then(function (response) {
            if (!response.ok) {
                return readError(response);
            }
            return response.json() as Promise<Word>;
        }).then(function (saved) {
            if (isNew && layoutLines) {
                setLayoutLines(replaceWordIdInLayout(layoutLines, toSave.id, saved.id));
            } else if (layoutLines) {
                setLayoutLines(applySavedWordToLayout(layoutLines, saved));
            }
            return fetchWords(scanId).then(function (list) {
                setWords(list);
                setDraft(function (current) {
                    if (current !== null && current.id !== saved.id) {
                        return current;
                    }
                    return saved;
                });
                setSaveStatus("Сохранено");
                return saved;
            });
        }).catch(function (error) {
            setSaveStatus("Ошибка сохранения: " + error.message);
            throw error;
        }).finally(function () {
            setIsSaving(false);
        });
    }

    useEffect(function () {
        if (!pendingWordGesture) {
            return;
        }

        function onMouseMove(event: MouseEvent) {
            setPendingWordGesture(function (current) {
                if (!current || current.exceededThreshold) {
                    return current;
                }
                if (distanceExceeded(current, event.clientX, event.clientY)) {
                    return { ...current, exceededThreshold: true };
                }
                return current;
            });
        }

        function onMouseUp() {
            const gesture = pendingWordGesture;
            setPendingWordGesture(null);
            const willEnter = gesture !== null &&
                !gesture.exceededThreshold &&
                draftRef.current?.id === gesture.wordId &&
                inlineEditingWordIdRef.current === null;
            if (willEnter && gesture) {
                enterInlineEdit(gesture.wordId, gesture.clickClientX, gesture.clickClientY);
            }
        }

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return function () {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, [pendingWordGesture]);

    useEffect(function () {
        if (inlineEditingWordId === null) {
            return;
        }
        const input = inlineInputRef.current;
        if (!input) {
            return;
        }
        input.focus();
        const caret = pendingCaretRef.current;
        if (caret) {
            const index = caretIndexFromClick(input, caret.x, caret.y);
            input.setSelectionRange(index, index);
            pendingCaretRef.current = null;
        }
    }, [inlineEditingWordId]);

    function handleWordSelect(word: Word) {
        if (draft && draft.id === word.id) {
            return;
        }
        if (inlineEditingWordId !== null) {
            commitInlineEdit();
        }
        abortFrameDragRef.current?.();
        selectWord(word);
    }

    function handleWordMouseDown(event: React.MouseEvent, word: Word) {
        if (draft?.id !== word.id || inlineEditingWordId !== null) {
            return;
        }
        setPendingWordGesture({
            wordId: word.id,
            startClientX: event.clientX,
            startClientY: event.clientY,
            clickClientX: event.clientX,
            clickClientY: event.clientY,
            exceededThreshold: false,
        });
    }

    function DraftCoordinateFields({ draftWord }: { draftWord: Word }) {
        const shownDraft = useFramePreviewWord(draftWord)!;
        const { handleCoordinateChange } = useWordFrameContext<Word>();

        return (
            <div className="coordinates">
                {coordinateFields.map(function (field) {
                    return (
                        <label key={field}>
                            {field}
                            <input
                                type="number"
                                value={shownDraft[field]}
                                onChange={function (event) {
                                    handleCoordinateChange(field, event.target.value);
                                }}
                            />
                        </label>
                    );
                })}
            </div>
        );
    }

    function handleAddClick() {
        if (scanId === null) return;

        if (inlineEditingWordId !== null) {
            commitInlineEdit();
        }

        const baseLayout = layoutLines ?? (words ? buildLayoutFromWords(words) : []);
        const afterWordId = draft ? draft.id : null;
        const tempId = nextTempWordIdRef.current;
        nextTempWordIdRef.current -= 1;
        const newWord: Word = {
            // Отрицательный id — локальный черновик до POST; каждое новое слово уникально
            id: tempId,
            // Скан сервер берёт из адреса запроса, значение из тела он игнорирует
            scanId,
            text: "",
            ...initialFrameCoords(imageSize),
            orderIndex: 0,
            lineIndex: 0,
        };

        setLayoutLines(insertWordIntoLayout(baseLayout, newWord, afterWordId));
        setDraft(newWord);
        setSaveStatus(null);
    }

    function handleTextChange(event: React.ChangeEvent<HTMLInputElement>) {
        updateDraftText(event.target.value);
    }

    function handleCancelClick() {
        setInlineEditingWordId(null);
        setPendingWordGesture(null);
        abortFrameDragRef.current?.();
        setDraft(null);
        setSaveStatus(null);
        setDraggedWordId(null);
        setDropTarget(null);
        setGapDropTarget(null);
        if (words) {
            syncLayoutFromWords(words);
            setLayoutSaveStatus(null);
        }
    }

    function handleDragStart(event: React.DragEvent, word: Word) {
        if (inlineEditingWordId === word.id) {
            event.preventDefault();
            return;
        }
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
        setGapDropTarget(null);
    }

    function handleGapDragOver(event: React.DragEvent, insertAtLineIndex: number) {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        if (draggedWordId === null) return;
        setDropTarget(null);
        setGapDropTarget(function (current) {
            if (current === insertAtLineIndex) return current;
            return insertAtLineIndex;
        });
    }

    function handleGapDrop(event: React.DragEvent, insertAtLineIndex: number) {
        event.preventDefault();
        event.stopPropagation();
        if (draggedWordId === null) return;

        setLayoutLines(function (current) {
            const base = current ?? (words ? buildLayoutFromWords(words) : null);
            if (!base) return current;
            return moveWordToNewLine(base, draggedWordId, insertAtLineIndex);
        });
        setDraft(function (current) {
            if (!current || current.id !== draggedWordId) return current;
            return { ...current };
        });
        setDraggedWordId(null);
        setDropTarget(null);
        setGapDropTarget(null);
    }

    function handleDragOverLine(event: React.DragEvent, lineIndex: number) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (draggedWordId === null) return;
        setGapDropTarget(null);
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
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        if (draggedWordId === null) return;
        setGapDropTarget(null);
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
        setGapDropTarget(null);
    }

    function handleSaveClick() {
        const toSave = commitPreviewRef.current?.() ?? draft;
        if (toSave === null) return;
        persistWordContent(toSave).catch(function () {
            // saveStatus уже установлен в persistWordContent
        });
    }

    // Отправляет локальную раскладку на сервер; words и эталон обновляются из ответа
    function handleSaveLayoutClick() {
        if (scanId === null) return;

        const layoutToSave = layoutLines ?? (words ? buildLayoutFromWords(words) : null);
        if (!layoutToSave) return;

        if (layoutToSave.some(function (line) {
            return line.some(function (word) { return isUnsavedWordId(word.id); });
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
    const lastPage = Math.max(1, Math.ceil(totalCount / SCAN_PAGE_SIZE));
    const isDeleteDisabled = isDeletingScan || isRecognizing || isBatchVectorizing || vectorizingWordId !== null;

    function renderLineGap(insertAtLineIndex: number) {
        const isActive = gapDropTarget === insertAtLineIndex && draggedWordId !== null;
        return (
            <div
                key={"gap-" + insertAtLineIndex}
                className={"line-gap-drop" + (isActive ? " active" : "")}
                data-insert={insertAtLineIndex}
                onDragOver={function (event) { handleGapDragOver(event, insertAtLineIndex); }}
                onDrop={function (event) { handleGapDrop(event, insertAtLineIndex); }}
            />
        );
    }

    return (
        <div>
            {scanId ? (
                <FramePreviewScope
                    words={words}
                    draft={draft}
                    setDraft={setDraft}
                    imageSize={imageSize}
                    onSelectWord={selectWord}
                    abortRef={abortFrameDragRef}
                    commitRef={commitPreviewRef}
                >
                {/* При изменении scanId запросятся данные изображения с сервера для этого id */}
                <div className="workspace">
                    <div className="scan">
                        <img
                            src={"/api/scans/" + scanId + "/image"}
                            onLoad={handleImageLoad}
                            draggable={false}
                        />
                        <ScanFrameOverlay words={words} draft={draft} imageSize={imageSize} />
                    </div>
                    <div className="workspace-side">
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
                                    <button
                                        type="button"
                                        onClick={handleBatchVectorizeClick}
                                        disabled={isBatchVectorizing || vectorizingWordId !== null}
                                    >
                                        {isBatchVectorizing ? "Пакетная векторизация…" : "Векторизовать все слова"}
                                    </button>
                                    <p>{layoutSaveStatus}</p>
                                    {vectorizeStatus ? <p>{vectorizeStatus}</p> : null}
                                </div>
                                <div className="recognized-text">
                                {renderLineGap(0)}
                                {displayLines.map(function (lineWords, lineIndex) {
                                    return (
                                        <Fragment key={"line-block-" + lineIndex}>
                                        <p
                                            onDragOver={function (event) { handleDragOverLine(event, lineIndex); }}
                                            onDrop={function (event) {
                                                handleDrop(event, lineIndex, lineWords.length);
                                            }}
                                        >
                                            {lineWords.map(function (word, positionInLine) {
                                                const isSelected = draft !== null && draft.id === word.id;
                                                const shown = isSelected ? draft : word;
                                                const isInline = inlineEditingWordId === word.id;
                                                const isDragging = draggedWordId === word.id;
                                                const isDropTarget = dropTarget !== null &&
                                                    dropTarget.lineIndex === lineIndex &&
                                                    dropTarget.positionInLine === positionInLine;
                                                const vectorizationClass = isWordVectorized(word)
                                                    ? " vectorized"
                                                    : " not-vectorized";

                                                return (
                                                    <span key={word.id}>
                                                        {positionInLine > 0 ? " " : null}
                                                        {isInline ? (
                                                            <InlineWordInput
                                                                value={shown.text}
                                                                onChange={updateDraftText}
                                                                onKeyDown={function (event) {
                                                                    if (event.key === "Enter") {
                                                                        event.preventDefault();
                                                                        commitInlineEdit();
                                                                    } else if (event.key === "Escape") {
                                                                        event.preventDefault();
                                                                        cancelInlineEdit();
                                                                    }
                                                                }}
                                                                onBlur={commitInlineEdit}
                                                                inputRef={inlineInputRef}
                                                                placeholder={isUnsavedWordId(word.id) ? "…" : undefined}
                                                            />
                                                        ) : (
                                                            <span
                                                                className={
                                                                    "word" +
                                                                    vectorizationClass +
                                                                    (isSelected ? " selected" : "") +
                                                                    (isDragging ? " dragging" : "") +
                                                                    (isDropTarget ? " drop-target" : "")
                                                                }
                                                                draggable={!isInline}
                                                                onMouseDown={function (event) {
                                                                    handleWordMouseDown(event, word);
                                                                }}
                                                                onDragStart={function (event) {
                                                                    handleDragStart(event, word);
                                                                }}
                                                                onDragEnd={handleDragEnd}
                                                                onDragOver={function (event) {
                                                                    handleDragOverWord(event, lineIndex, positionInLine);
                                                                }}
                                                                onDrop={function (event) {
                                                                    event.stopPropagation();
                                                                    handleDrop(event, lineIndex, positionInLine);
                                                                }}
                                                                onClick={function () {
                                                                    handleWordSelect(word);
                                                                }}
                                                            >
                                                                {shown.text || (isUnsavedWordId(word.id) ? "…" : "")}
                                                            </span>
                                                        )}
                                                    </span>
                                                );
                                            })}
                                        </p>
                                        {renderLineGap(lineIndex + 1)}
                                        </Fragment>
                                    );
                                })}
                                </div>
                            </div>
                        ) : null}

                        <button type="button" onClick={handleRecognizeClick} disabled={isRecognizing || isDeleteDisabled}>
                            {isRecognizing ? "Распознавание..." : "Распознать текст"}
                        </button>
                        <button type="button" onClick={handleAddClick} disabled={isSaving || isDeleteDisabled}>
                            Добавить слово
                        </button>
                        <button
                            type="button"
                            onClick={function () { handleDeleteScan(scanId!); }}
                            disabled={isDeleteDisabled}
                        >
                            {isDeletingScan ? "Удаление..." : "Удалить скан"}
                        </button>
                        <p>Статус распознавания: {recognizeStatus}</p>
                        {deleteScanStatus ? <p>{deleteScanStatus}</p> : null}
                    </div>
                </div>
                {draft ? (
                    <div className="editor">
                        <p>
                            {isUnsavedWordId(draft.id)
                                ? "Новое слово на позицию " + draft.orderIndex
                                : "Слово на позиции " + draft.orderIndex}
                        </p>
                        <label>
                            Текст <input value={draft.text} onChange={handleTextChange} />
                        </label>
                        <DraftCoordinateFields draftWord={draft} />
                        {isWordVectorized(draft) ? (
                            <WordCurveThumbnail curvePoints={draft.curvePoints} />
                        ) : null}
                        <div className="editor-actions">
                            {draft.id > 0 && !isWordVectorized(draft) ? (
                                <button
                                    type="button"
                                    onClick={function () { handleVectorizeClick(draft); }}
                                    disabled={vectorizingWordId === draft.id || isBatchVectorizing}
                                >
                                    {vectorizingWordId === draft.id ? "Векторизация…" : "Векторизовать"}
                                </button>
                            ) : null}
                            {draft.id > 0 ? (
                                <button type="button" onClick={handleDeleteClick}>
                                    Удалить слово
                                </button>
                            ) : null}
                        </div>
                        <button type="button" onClick={handleSaveClick} disabled={isSaving}>
                            {isSaving ? "Сохранение..." : "Сохранить"}
                        </button>
                        <button type="button" onClick={handleCancelClick}>Отмена</button>
                        <p>{saveStatus}</p>
                        {deleteStatus ? <p>{deleteStatus}</p> : null}
                    </div>
                ) : null}
                </FramePreviewScope>
            ) : null}
            {words && words.length > 0 && draft === null ? (
                <p>Выберите слово в тексте или рамку на скане, чтобы отредактировать</p>
            ) : null}
            <section className="scans-section">
                <table className="scans-table">
                    <thead>
                        <tr>
                            <th>Миниатюра</th>
                            <th>Id</th>
                            <th className="scans-table-actions">Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        {scanItems.map(function (item) {
                            return (
                                <tr
                                    key={item.id}
                                    className={item.id === scanId ? "current" : undefined}
                                    onClick={function () { handleScanRowClick(item.id); }}
                                >
                                    <td className="scans-table-thumbnail">
                                        {brokenThumbnails.has(item.id) ? null : (
                                            <img
                                                src={"/api/Scans/" + item.id + "/thumbnail"}
                                                alt=""
                                                onError={function () { handleThumbnailError(item.id); }}
                                            />
                                        )}
                                    </td>
                                    <td>{item.id}</td>
                                    <td className="scans-table-actions">
                                        <button
                                            type="button"
                                            className="scans-table-delete"
                                            disabled={isDeleteDisabled}
                                            onClick={function (event) {
                                                event.stopPropagation();
                                                handleDeleteScan(item.id, { refreshList: true });
                                            }}
                                        >
                                            Удалить
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <div className="scans-pagination">
                    <button
                        type="button"
                        disabled={listPage <= 1 || listLoading}
                        onClick={function () { setListPage(listPage - 1); }}
                    >
                        Назад
                    </button>
                    <span>Страница {listPage} из {lastPage}</span>
                    <button
                        type="button"
                        disabled={listPage >= lastPage || listLoading}
                        onClick={function () { setListPage(listPage + 1); }}
                    >
                        Вперёд
                    </button>
                </div>
                {listLoading ? <p>Загрузка списка…</p> : null}
                {listError && !listLoading ? (
                    <div className="scans-list-error">
                        <p>{listError}</p>
                        <button
                            type="button"
                            onClick={function () { loadScansPage(listPage); }}
                        >
                            Повторить
                        </button>
                    </div>
                ) : null}
                {wordsOpenError ? <p>{wordsOpenError}</p> : null}
                {deleteScanStatus && !scanId ? <p>{deleteScanStatus}</p> : null}
            </section>
            <input type="file" ref={fileInputRef} accept=".jpeg, .jpg, .png" onChange={handleFileChange} />
            <p>Выбранный файл: {selectedFile ? selectedFile.name : "Не выбран"}</p>
            <p>Статус: {uploadStatus}</p>
        </div>
    );
}

export default App;
