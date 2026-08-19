import { useLayoutEffect } from 'react';

interface InlineWordInputProps {
    value: string;
    onChange: (text: string) => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
    onBlur: () => void;
    inputRef?: React.RefObject<HTMLInputElement | null>;
    placeholder?: string;
}

function measureTextWidth(text: string, font: string): number {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
        return 0;
    }
    context.font = font;
    return context.measureText(text || ' ').width;
}

function syncInputWidth(input: HTMLInputElement, value: string, placeholder?: string) {
    const style = window.getComputedStyle(input);
    const sample = value.length > 0 ? value : (placeholder || ' ');
    const textWidth = measureTextWidth(sample, style.font);
    input.style.width = Math.ceil(textWidth) + 'px';
}

export default function InlineWordInput({
    value,
    onChange,
    onKeyDown,
    onBlur,
    inputRef,
    placeholder,
}: InlineWordInputProps) {
    function handleRef(node: HTMLInputElement | null) {
        if (inputRef) {
            inputRef.current = node;
        }
        if (node) {
            syncInputWidth(node, value, placeholder);
        }
    }

    useLayoutEffect(function () {
        const input = inputRef?.current;
        if (!input) {
            return;
        }
        syncInputWidth(input, value, placeholder);
    }, [value, placeholder, inputRef]);

    return (
        <input
            ref={handleRef}
            type="text"
            className="word word-inline-input selected"
            value={value}
            onChange={function (event) {
                onChange(event.target.value);
                syncInputWidth(event.target, event.target.value, placeholder);
            }}
            onKeyDown={onKeyDown}
            onBlur={onBlur}
            autoFocus
            placeholder={placeholder}
        />
    );
}
