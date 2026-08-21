import { filterValidCurves } from "./curvePoints";
import {
    fetchWordsPage,
    type FetchWordsPageParams,
    type VectorizedFilter,
    type Word,
    WORDS_PAGE_SIZE,
} from "./wordsApi";

export type DatasetLine = {
    wordId: number;
    scanId: number;
    lineIndex: number;
    text: string;
    curves: number[][][];
};

export type ExportFilterSnapshot = {
    search: string;
    vectorized: VectorizedFilter;
    scanId: number | null;
};

export function wordToDatasetLine(word: Word): DatasetLine | null {
    const curves = filterValidCurves(word.curvePoints);
    if (curves.length === 0) {
        return null;
    }

    return {
        wordId: word.id,
        scanId: word.scanId,
        lineIndex: word.lineIndex,
        text: word.text,
        curves,
    };
}

export async function fetchAllWordsPages(query: Omit<FetchWordsPageParams, "page">): Promise<Word[]> {
    const all: Word[] = [];
    let page = 1;

    while (true) {
        const data = await fetchWordsPage({ ...query, page });
        all.push(...data.items);

        if (data.items.length === 0 || page * WORDS_PAGE_SIZE >= data.totalCount) {
            break;
        }

        page += 1;
    }

    return all;
}

export function wordsToDatasetLines(words: Word[]): DatasetLine[] {
    const lines: DatasetLine[] = [];

    for (const word of words) {
        const line = wordToDatasetLine(word);
        if (line) {
            lines.push(line);
        }
    }

    return lines;
}

export function downloadJsonl(filename: string, lines: DatasetLine[]): void {
    const content = lines.map(function (line) {
        return JSON.stringify(line);
    }).join("\n");

    const blob = new Blob([content ? content + "\n" : ""], { type: "application/jsonl;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}

export async function exportAllDataset(): Promise<number> {
    const words = await fetchAllWordsPages({ vectorized: "all" });
    const lines = wordsToDatasetLines(words);
    downloadJsonl("words-dataset-all.jsonl", lines);
    return lines.length;
}

export async function exportFilteredDataset(snapshot: ExportFilterSnapshot): Promise<number> {
    const words = await fetchAllWordsPages({
        search: snapshot.search,
        vectorized: snapshot.vectorized,
        scanId: snapshot.scanId,
    });
    const lines = wordsToDatasetLines(words);
    downloadJsonl("words-dataset-filtered.jsonl", lines);
    return lines.length;
}
