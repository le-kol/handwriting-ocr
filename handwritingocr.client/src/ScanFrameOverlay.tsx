import {
    boxPoints,
    useWordFrameContext,
    type FrameCoords,
    type WordLike,
} from './wordFrame';

type ScanFrameOverlayProps<T extends WordLike> = {
    words: T[] | null;
    draft: T | null;
    imageSize: { width: number; height: number } | null;
};

export default function ScanFrameOverlay<T extends WordLike & FrameCoords>({
    words,
    draft,
    imageSize,
}: ScanFrameOverlayProps<T>) {
    const {
        scanSvgRef,
        handleScanMouseDown,
        renderFrameHandles,
        isFrameDragging,
        overlayDraft,
    } = useWordFrameContext<T>();

    if (!imageSize || !words) {
        return null;
    }

    const displayDraft = overlayDraft as T | null;

    return (
        <svg
            ref={scanSvgRef}
            viewBox={"0 0 " + imageSize.width + " " + imageSize.height}
        >
            {words.map(function (word) {
                const isSelected = draft !== null && draft.id === word.id;
                const shown = isSelected && displayDraft ? displayDraft : word;
                const polygonClassName = isSelected
                    ? "selected" + (isFrameDragging ? " frame-dragging" : "")
                    : undefined;

                return (
                    <polygon
                        key={word.id}
                        className={polygonClassName}
                        points={boxPoints(shown)}
                        onMouseDown={handleScanMouseDown}
                    />
                );
            })}
            {draft && draft.id === 0 && displayDraft ? (
                <polygon
                    className={"selected" + (isFrameDragging ? " frame-dragging" : "")}
                    points={boxPoints(displayDraft)}
                    onMouseDown={handleScanMouseDown}
                />
            ) : null}
            {displayDraft ? renderFrameHandles(displayDraft) : null}
        </svg>
    );
}
