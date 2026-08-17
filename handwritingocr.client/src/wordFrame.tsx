import {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
    type Dispatch,
    type MouseEvent,
    type ReactNode,
    type SetStateAction,
} from 'react';

export interface FrameCoords {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    x3: number;
    y3: number;
    x4: number;
    y4: number;
}

export interface WordLike extends FrameCoords {
    id: number;
    orderIndex: number;
}

export type CoordinateField = "x1" | "y1" | "x2" | "y2" | "x3" | "y3" | "x4" | "y4";

export const coordinateFields: CoordinateField[] = ["x1", "y1", "x2", "y2", "x3", "y3", "x4", "y4"];

export type FrameDrag<T extends FrameCoords> = {
    mode: 'move' | 'corner';
    cornerIndex?: number;
    startImageX: number;
    startImageY: number;
    snapshot: T;
};

const cornerFields: [keyof FrameCoords, keyof FrameCoords][] = [
    ["x1", "y1"],
    ["x2", "y2"],
    ["x3", "y3"],
    ["x4", "y4"],
];

const zeroFrame: FrameCoords = {
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    x3: 0,
    y3: 0,
    x4: 0,
    y4: 0,
};

export function boxPoints(word: FrameCoords): string {
    return word.x1 + "," + word.y1 + " " +
        word.x2 + "," + word.y2 + " " +
        word.x3 + "," + word.y3 + " " +
        word.x4 + "," + word.y4;
}

export function frameCoordsPayload(coords: FrameCoords) {
    return {
        x1: coords.x1,
        y1: coords.y1,
        x2: coords.x2,
        y2: coords.y2,
        x3: coords.x3,
        y3: coords.y3,
        x4: coords.x4,
        y4: coords.y4,
    };
}

export function wordFrameContentBody(word: FrameCoords & { text: string }) {
    return {
        text: word.text,
        ...frameCoordsPayload(word),
    };
}

export function defaultCenterFrame(width: number, height: number): FrameCoords {
    const cx = width / 2;
    const cy = height / 2;
    return {
        x1: Math.round(cx - 40),
        y1: Math.round(cy - 20),
        x2: Math.round(cx + 40),
        y2: Math.round(cy - 20),
        x3: Math.round(cx + 40),
        y3: Math.round(cy + 20),
        x4: Math.round(cx - 40),
        y4: Math.round(cy + 20),
    };
}

export function initialFrameCoords(imageSize: { width: number; height: number } | null): FrameCoords {
    return imageSize
        ? defaultCenterFrame(imageSize.width, imageSize.height)
        : zeroFrame;
}

export function isDegenerateFrame(frame: FrameCoords): boolean {
    return frame.x1 === 0 && frame.y1 === 0 &&
        frame.x2 === 0 && frame.y2 === 0 &&
        frame.x3 === 0 && frame.y3 === 0 &&
        frame.x4 === 0 && frame.y4 === 0;
}

export function translateFrame<T extends FrameCoords>(word: T, dx: number, dy: number): T {
    return {
        ...word,
        x1: Math.round(word.x1 + dx),
        y1: Math.round(word.y1 + dy),
        x2: Math.round(word.x2 + dx),
        y2: Math.round(word.y2 + dy),
        x3: Math.round(word.x3 + dx),
        y3: Math.round(word.y3 + dy),
        x4: Math.round(word.x4 + dx),
        y4: Math.round(word.y4 + dy),
    };
}

export function setCorner<T extends FrameCoords>(word: T, index: number, x: number, y: number): T {
    const [xField, yField] = cornerFields[index];
    return {
        ...word,
        [xField]: Math.round(x),
        [yField]: Math.round(y),
    };
}

export function clientToImagePoint(
    svg: SVGSVGElement,
    clientX: number,
    clientY: number
): { x: number; y: number } {
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) {
        return { x: 0, y: 0 };
    }
    const transformed = point.matrixTransform(ctm.inverse());
    return { x: transformed.x, y: transformed.y };
}

function quadVertices(word: FrameCoords): [number, number][] {
    return [
        [word.x1, word.y1],
        [word.x2, word.y2],
        [word.x3, word.y3],
        [word.x4, word.y4],
    ];
}

export function pointInQuad(px: number, py: number, word: FrameCoords): boolean {
    const vertices = quadVertices(word);
    let inside = false;

    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const xi = vertices[i][0];
        const yi = vertices[i][1];
        const xj = vertices[j][0];
        const yj = vertices[j][1];
        const intersects = ((yi > py) !== (yj > py)) &&
            (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
        if (intersects) {
            inside = !inside;
        }
    }

    return inside;
}

export function findWordAtPoint(
    words: WordLike[],
    draft: WordLike | null,
    px: number,
    py: number
): WordLike | null {
    const hits: WordLike[] = [];

    for (const word of words) {
        const coords = draft !== null && draft.id === word.id ? draft : word;
        if (pointInQuad(px, py, coords)) {
            hits.push({ ...word, ...coords });
        }
    }

    if (draft !== null && draft.id === 0 && pointInQuad(px, py, draft)) {
        hits.push(draft);
    }

    if (hits.length === 0) {
        return null;
    }

    return hits.reduce(function (best, word) {
        return word.orderIndex < best.orderIndex ? word : best;
    });
}

export function resolveTargetWord<T extends WordLike>(
    words: T[],
    draft: T | null,
    hitWord: WordLike
): T | null {
    if (hitWord.id === 0 && draft !== null && draft.id === 0) {
        return draft;
    }
    return words.find(function (word) { return word.id === hitWord.id; }) ?? null;
}

export function getHandleRadius(svg: SVGSVGElement, viewBoxWidth: number): number {
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) {
        return 8;
    }
    return 8 * (viewBoxWidth / rect.width);
}

export function cornerPoints(word: FrameCoords): [number, number][] {
    return quadVertices(word);
}

const FramePreviewContext = createContext<WordLike | null>(null);

type WordFrameApi<T extends WordLike> = ReturnType<typeof useWordFrame<T>>;

const WordFrameContext = createContext<WordFrameApi<WordLike> | null>(null);

export function useFramePreviewWord<T extends WordLike>(draft: T | null): T | null {
    const preview = useContext(FramePreviewContext);
    if (preview !== null && draft !== null && preview.id === draft.id) {
        return preview as T;
    }
    return draft;
}

function useWordFrameContext<T extends WordLike>(): WordFrameApi<T> {
    const frame = useContext(WordFrameContext);
    if (!frame) {
        throw new Error("useWordFrameContext requires FramePreviewScope");
    }
    return frame as WordFrameApi<T>;
}

type FramePreviewScopeProps<T extends WordLike> = UseWordFrameOptions<T> & {
    children: ReactNode;
    abortRef?: React.MutableRefObject<(() => void) | null>;
    commitRef?: React.MutableRefObject<(() => T | null) | null>;
};

export function FramePreviewScope<T extends WordLike>({
    children,
    abortRef,
    commitRef,
    ...options
}: FramePreviewScopeProps<T>) {
    const frame = useWordFrame(options);

    useEffect(function () {
        if (abortRef) {
            abortRef.current = frame.abortFrameDrag;
        }
        return function () {
            if (abortRef) {
                abortRef.current = null;
            }
        };
    }, [abortRef, frame.abortFrameDrag]);

    useEffect(function () {
        if (commitRef) {
            commitRef.current = frame.commitPreviewToDraft;
        }
        return function () {
            if (commitRef) {
                commitRef.current = null;
            }
        };
    }, [commitRef, frame.commitPreviewToDraft]);

    return (
        <FramePreviewContext.Provider value={frame.previewDraft}>
            <WordFrameContext.Provider value={frame as WordFrameApi<WordLike>}>
                {children}
            </WordFrameContext.Provider>
        </FramePreviewContext.Provider>
    );
}

export { useWordFrameContext };

type UseWordFrameOptions<T extends WordLike> = {
    words: T[] | null;
    draft: T | null;
    setDraft: Dispatch<SetStateAction<T | null>>;
    imageSize: { width: number; height: number } | null;
    onSelectWord: (word: T) => void;
};

export function useWordFrame<T extends WordLike>({
    words,
    draft,
    setDraft,
    imageSize,
    onSelectWord,
}: UseWordFrameOptions<T>) {
    const scanSvgRef = useRef<SVGSVGElement>(null);
    const [frameDrag, setFrameDrag] = useState<FrameDrag<T> | null>(null);
    const [previewDraft, setPreviewDraft] = useState<T | null>(null);
    const previewDraftRef = useRef<T | null>(null);
    const draftRef = useRef<T | null>(draft);
    const handleRadiusRef = useRef(8);
    const rafRef = useRef<number | null>(null);
    const pendingPointRef = useRef<{ x: number; y: number } | null>(null);

    const overlayDraft = previewDraft ?? draft;

    useEffect(function () {
        draftRef.current = draft;
    }, [draft]);

    function commitPreviewToDraft(): T | null {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        pendingPointRef.current = null;

        const preview = previewDraftRef.current;
        const result = preview ?? draftRef.current ?? draft;
        if (preview) {
            draftRef.current = preview;
            setDraft(preview);
            previewDraftRef.current = null;
            setPreviewDraft(null);
        }
        setFrameDrag(null);
        return result;
    }

    function abortFrameDrag() {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        pendingPointRef.current = null;
        previewDraftRef.current = null;
        setPreviewDraft(null);
        setFrameDrag(null);
    }

    function updatePreviewDraft(next: T | null) {
        previewDraftRef.current = next;
        setPreviewDraft(next);
    }

    function applyDragPoint(activeDrag: FrameDrag<T>, point: { x: number; y: number }) {
        if (activeDrag.mode === 'move') {
            const dx = point.x - activeDrag.startImageX;
            const dy = point.y - activeDrag.startImageY;
            return translateFrame(activeDrag.snapshot, dx, dy);
        }

        if (activeDrag.mode === 'corner' && activeDrag.cornerIndex !== undefined) {
            return setCorner(activeDrag.snapshot, activeDrag.cornerIndex, point.x, point.y);
        }

        return activeDrag.snapshot;
    }

    function schedulePreviewUpdate(activeDrag: FrameDrag<T>, point: { x: number; y: number }) {
        pendingPointRef.current = point;
        if (rafRef.current !== null) {
            return;
        }

        rafRef.current = requestAnimationFrame(function () {
            rafRef.current = null;
            const latestPoint = pendingPointRef.current;
            if (!latestPoint) {
                return;
            }
            updatePreviewDraft(applyDragPoint(activeDrag, latestPoint));
        });
    }

    useEffect(function () {
        if (!draft || draft.id !== 0 || !imageSize || !isDegenerateFrame(draft)) {
            return;
        }

        setDraft(function (current) {
            if (!current || current.id !== 0) {
                return current;
            }
            return { ...current, ...defaultCenterFrame(imageSize.width, imageSize.height) };
        });
    }, [draft?.id, imageSize, setDraft]);

    useEffect(function () {
        if (!frameDrag) {
            return;
        }

        const activeDrag = frameDrag;

        function onMouseMove(event: globalThis.MouseEvent) {
            const svg = scanSvgRef.current;
            if (!svg) {
                return;
            }

            const point = clientToImagePoint(svg, event.clientX, event.clientY);
            schedulePreviewUpdate(activeDrag, point);
        }

        function onMouseUp() {
            if (previewDraftRef.current) {
                draftRef.current = previewDraftRef.current;
                setDraft(previewDraftRef.current);
            }
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            pendingPointRef.current = null;
            previewDraftRef.current = null;
            setPreviewDraft(null);
            setFrameDrag(null);
        }

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return function () {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [frameDrag, setDraft]);

    function handleScanMouseDown(event: MouseEvent) {
        const svg = scanSvgRef.current;
        if (!svg || !words) {
            return;
        }

        const point = clientToImagePoint(svg, event.clientX, event.clientY);
        const hitWord = findWordAtPoint(words, previewDraftRef.current ?? draft, point.x, point.y);
        if (!hitWord) {
            return;
        }

        const targetWord = resolveTargetWord(words, draft, hitWord);
        if (!targetWord) {
            return;
        }

        event.preventDefault();

        if (!draft || draft.id !== targetWord.id) {
            onSelectWord(targetWord);
            return;
        }

        setFrameDrag({
            mode: 'move',
            startImageX: point.x,
            startImageY: point.y,
            snapshot: { ...draft },
        });
        updatePreviewDraft({ ...draft });
        const svgEl = scanSvgRef.current;
        if (svgEl && imageSize) {
            handleRadiusRef.current = getHandleRadius(svgEl, imageSize.width);
        }
    }

    function handleFrameHandleMouseDown(event: MouseEvent, cornerIndex: number) {
        event.preventDefault();
        event.stopPropagation();
        const svg = scanSvgRef.current;
        if (!svg || !draft) {
            return;
        }

        const point = clientToImagePoint(svg, event.clientX, event.clientY);
        setFrameDrag({
            mode: 'corner',
            cornerIndex,
            startImageX: point.x,
            startImageY: point.y,
            snapshot: { ...draft },
        });
        updatePreviewDraft({ ...draft });
        handleRadiusRef.current = getHandleRadius(svg, imageSize!.width);
    }

    function handleCoordinateChange(field: CoordinateField, value: string) {
        setDraft(function (current) {
            return current ? { ...current, [field]: Number(value) } : current;
        });
    }

    function renderFrameHandles(word: T) {
        const radius = frameDrag ? handleRadiusRef.current : (
            scanSvgRef.current && imageSize
                ? getHandleRadius(scanSvgRef.current, imageSize.width)
                : 8
        );

        return cornerPoints(word).map(function (corner, index) {
            return (
                <circle
                    key={"handle-" + word.id + "-" + index}
                    className="frame-handle"
                    cx={corner[0]}
                    cy={corner[1]}
                    r={radius}
                    onMouseDown={function (handleEvent) {
                        handleFrameHandleMouseDown(handleEvent, index);
                    }}
                />
            );
        });
    }

    return {
        scanSvgRef,
        frameDrag,
        previewDraft,
        overlayDraft,
        abortFrameDrag,
        commitPreviewToDraft,
        handleScanMouseDown,
        handleCoordinateChange,
        renderFrameHandles,
        isFrameMoving: frameDrag?.mode === 'move',
        isFrameDragging: frameDrag !== null,
    };
}
