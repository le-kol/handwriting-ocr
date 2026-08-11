/** Кривые слова: [кривая][точка 0..3][x|y] в СК фрагмента. */
export type CurvePoints = number[][][] | null | undefined;

export type CurveBBox = {
    minX: number;
    minY: number;
    width: number;
    height: number;
};

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function isValidPoint(point: unknown): point is [number, number] {
    return Array.isArray(point)
        && point.length >= 2
        && isFiniteNumber(point[0])
        && isFiniteNumber(point[1]);
}

function isValidCurve(curve: unknown): curve is number[][] {
    return Array.isArray(curve)
        && curve.length === 4
        && curve.every(isValidPoint);
}

/** Оставляет только кривые с ровно 4 точками × 2 конечных числа. */
export function filterValidCurves(curvePoints: CurvePoints): number[][][] {
    if (!Array.isArray(curvePoints)) {
        return [];
    }
    return curvePoints.filter(isValidCurve);
}

/** Слово векторизовано, если после фильтрации осталась хотя бы одна валидная кривая. */
export function isWordVectorized(word: { curvePoints?: CurvePoints }): boolean {
    return filterValidCurves(word.curvePoints).length > 0;
}

/**
 * Bounding box по контрольным точкам валидных кривых + padding.
 * При вырождении размера viewBox получает минимальный ненулевой размер.
 */
export function curvesBoundingBox(curves: number[][][], paddingRatio = 0.05): CurveBBox {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const curve of curves) {
        for (const point of curve) {
            const x = point[0];
            const y = point[1];
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
    }

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
        return { minX: 0, minY: 0, width: 1, height: 1 };
    }

    let width = maxX - minX;
    let height = maxY - minY;
    const minSize = 1;

    if (width < minSize) {
        const mid = (minX + maxX) / 2;
        minX = mid - minSize / 2;
        width = minSize;
    }
    if (height < minSize) {
        const mid = (minY + maxY) / 2;
        minY = mid - minSize / 2;
        height = minSize;
    }

    const pad = Math.max(width, height) * paddingRatio;
    return {
        minX: minX - pad,
        minY: minY - pad,
        width: width + pad * 2,
        height: height + pad * 2,
    };
}

/** Одна кубическая Безье: M P0 C P1 P2 P3. */
export function curveToPathD(curve: number[][]): string {
    const p0 = curve[0];
    const p1 = curve[1];
    const p2 = curve[2];
    const p3 = curve[3];
    return "M " + p0[0] + " " + p0[1]
        + " C " + p1[0] + " " + p1[1]
        + ", " + p2[0] + " " + p2[1]
        + ", " + p3[0] + " " + p3[1];
}

export function curvesToPathD(curves: number[][][]): string {
    return curves.map(curveToPathD).join(" ");
}
