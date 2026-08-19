export const DRAG_CLICK_THRESHOLD_PX = 5;

export interface PendingWordGesture {
    wordId: number;
    startClientX: number;
    startClientY: number;
    clickClientX: number;
    clickClientY: number;
    exceededThreshold: boolean;
}

interface WordLike {
    id: number;
    text: string;
}

export function isUnsavedWordId(id: number): boolean {
    return id <= 0;
}

export function lastSavedTextForWord(id: number, words: WordLike[] | null): string {
    if (isUnsavedWordId(id)) {
        return '';
    }
    if (!words) {
        return '';
    }
    const found = words.find(function (word) { return word.id === id; });
    return found?.text ?? '';
}

export function distanceExceeded(gesture: PendingWordGesture, x: number, y: number): boolean {
    const dx = x - gesture.startClientX;
    const dy = y - gesture.startClientY;
    return Math.sqrt(dx * dx + dy * dy) > DRAG_CLICK_THRESHOLD_PX;
}

function caretOffsetInInput(input: HTMLInputElement, range: Range): number | null {
    if (!input.contains(range.startContainer)) {
        return null;
    }
    const preRange = range.cloneRange();
    preRange.selectNodeContents(input);
    preRange.setEnd(range.startContainer, range.startOffset);
    return preRange.toString().length;
}

function caretFromPoint(input: HTMLInputElement, clientX: number, clientY: number): number | null {
    const doc = document as Document & {
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    };

    if (typeof doc.caretRangeFromPoint === 'function') {
        const range = doc.caretRangeFromPoint(clientX, clientY);
        if (range) {
            const offset = caretOffsetInInput(input, range);
            if (offset !== null) {
                return offset;
            }
        }
    }

    if (typeof doc.caretPositionFromPoint === 'function') {
        const position = doc.caretPositionFromPoint(clientX, clientY);
        if (position && input.contains(position.offsetNode)) {
            const range = document.createRange();
            range.setStart(position.offsetNode, position.offset);
            const offset = caretOffsetInInput(input, range);
            if (offset !== null) {
                return offset;
            }
        }
    }

    return null;
}

function caretFromMeasureText(input: HTMLInputElement, clientX: number): number {
    const text = input.value;
    const style = window.getComputedStyle(input);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
        return text.length;
    }

    context.font = style.font;
    const rect = input.getBoundingClientRect();
    const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
    const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0;
    const relativeX = clientX - rect.left - paddingLeft - borderLeft;

    let low = 0;
    let high = text.length;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (context.measureText(text.slice(0, mid)).width > relativeX) {
            high = mid - 1;
        } else {
            low = mid;
        }
    }
    return low;
}

export function caretIndexFromClick(input: HTMLInputElement, clientX: number, clientY: number): number {
    try {
        const fromPoint = caretFromPoint(input, clientX, clientY);
        if (fromPoint !== null) {
            return Math.max(0, Math.min(fromPoint, input.value.length));
        }
    } catch {
        // Range/caretPositionFromPoint не работают надёжно на <input> — fallback ниже
    }
    return caretFromMeasureText(input, clientX);
}
