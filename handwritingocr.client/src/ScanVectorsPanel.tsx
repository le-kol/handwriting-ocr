import { isWordVectorized } from './curvePoints';
import WordCurveThumbnail from './WordCurveThumbnail';

type VectorWord = {
    id: number;
    curvePoints?: number[][][] | null;
};

type ScanVectorsPanelProps<T extends VectorWord> = {
    lines: T[][];
    selectedWordId: number | null;
    onSelectWord: (word: T) => void;
};

function VectorSlot<T extends VectorWord>({
    word,
    isSelected,
    onSelectWord,
}: {
    word: T;
    isSelected: boolean;
    onSelectWord: (word: T) => void;
}) {
    const vectorized = isWordVectorized(word);

    let className = 'vector-slot';
    if (!vectorized) {
        className += ' empty';
    }
    if (isSelected) {
        className += ' selected';
    }

    return (
        <button
            type="button"
            className={className}
            onClick={function () { onSelectWord(word); }}
        >
            {vectorized ? <WordCurveThumbnail curvePoints={word.curvePoints} /> : null}
        </button>
    );
}

function ScanVectorsPanel<T extends VectorWord>({ lines, selectedWordId, onSelectWord }: ScanVectorsPanelProps<T>) {
    return (
        <section className="scan-vectors-panel">
            <h2 className="scan-vectors-panel-heading">Векторы слов</h2>
            {lines.length === 0 ? (
                <p className="scan-vectors-panel-empty">Нет слов для отображения</p>
            ) : (
                lines.map(function (lineWords, lineIndex) {
                    return (
                        <div className="vector-line" key={'vector-line-' + lineIndex}>
                            {lineWords.map(function (word) {
                                return (
                                    <VectorSlot
                                        key={word.id}
                                        word={word}
                                        isSelected={selectedWordId !== null && word.id === selectedWordId}
                                        onSelectWord={onSelectWord}
                                    />
                                );
                            })}
                        </div>
                    );
                })
            )}
        </section>
    );
}

export default ScanVectorsPanel;
