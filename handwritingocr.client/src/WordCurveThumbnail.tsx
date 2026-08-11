import {
    curvesBoundingBox,
    curvesToPathD,
    filterValidCurves,
    type CurvePoints,
} from "./curvePoints";

type WordCurveThumbnailProps = {
    curvePoints?: CurvePoints;
};

/** SVG-миниатюра curvePoints в собственной СК (bbox фрагмента), не поверх скана. */
function WordCurveThumbnail({ curvePoints }: WordCurveThumbnailProps) {
    const valid = filterValidCurves(curvePoints);
    if (valid.length === 0) {
        return null;
    }

    const bbox = curvesBoundingBox(valid);
    const d = curvesToPathD(valid);

    return (
        <svg
            className="word-curve-thumb"
            viewBox={bbox.minX + " " + bbox.minY + " " + bbox.width + " " + bbox.height}
            role="img"
            aria-label="Миниатюра вектора слова"
        >
            <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
    );
}

export default WordCurveThumbnail;
