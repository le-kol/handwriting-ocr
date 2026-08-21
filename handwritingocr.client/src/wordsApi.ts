export interface Word {
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
    curvePoints?: number[][][] | null;
}

export interface WordListPage {
    items: Word[];
    totalCount: number;
}

export type VectorizedFilter = "all" | "true" | "false";

export type FetchWordsPageParams = {
    page: number;
    search?: string;
    vectorized?: VectorizedFilter;
    scanId?: number | null;
};

export const WORDS_PAGE_SIZE = 30;

function readError(response: Response): Promise<never> {
    return response.text().then(function (message) {
        throw new Error(message || String(response.status));
    });
}

export function fetchWordsPage(params: FetchWordsPageParams): Promise<WordListPage> {
    const query = new URLSearchParams();
    query.set("page", String(params.page));

    if (params.search && params.search.trim().length > 0) {
        query.set("search", params.search.trim());
    }

    if (params.vectorized && params.vectorized !== "all") {
        query.set("vectorized", params.vectorized);
    }

    if (params.scanId != null && params.scanId > 0) {
        query.set("scanId", String(params.scanId));
    }

    return fetch("/api/Words?" + query.toString()).then(function (response) {
        if (!response.ok) {
            return readError(response);
        }
        return response.json() as Promise<WordListPage>;
    });
}

export function fetchScansPage(page: number): Promise<{ items: { id: number }[]; totalCount: number }> {
    return fetch("/api/Scans?page=" + page).then(function (response) {
        if (!response.ok) {
            return readError(response);
        }
        return response.json();
    });
}
