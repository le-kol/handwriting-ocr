import { useEffect, useRef, useState } from "react";
import WordCurveThumbnail from "./WordCurveThumbnail";
import { isWordVectorized } from "./curvePoints";
import { exportAllDataset, exportFilteredDataset } from "./exportWordsDataset";
import {
    fetchScansPage,
    fetchWordsPage,
    type VectorizedFilter,
    type Word,
    WORDS_PAGE_SIZE,
} from "./wordsApi";

type WordsTableScreenProps = {
    onRowClick: (word: Word) => void;
};

const SEARCH_DEBOUNCE_MS = 300;

function WordsTableScreen({ onRowClick }: WordsTableScreenProps) {
    const [page, setPage] = useState(1);
    const [searchInput, setSearchInput] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [vectorizedFilter, setVectorizedFilter] = useState<VectorizedFilter>("all");
    const [scanIdFilter, setScanIdFilter] = useState<number | null>(null);
    const [items, setItems] = useState<Word[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [scanIds, setScanIds] = useState<number[]>([]);
    const [exportAllStatus, setExportAllStatus] = useState<string | null>(null);
    const [exportFilteredStatus, setExportFilteredStatus] = useState<string | null>(null);
    const [isExportingAll, setIsExportingAll] = useState(false);
    const [isExportingFiltered, setIsExportingFiltered] = useState(false);
    const debounceRef = useRef<number | null>(null);

    useEffect(function () {
        if (debounceRef.current !== null) {
            window.clearTimeout(debounceRef.current);
        }

        debounceRef.current = window.setTimeout(function () {
            setDebouncedSearch(searchInput);
            setPage(1);
        }, SEARCH_DEBOUNCE_MS);

        return function () {
            if (debounceRef.current !== null) {
                window.clearTimeout(debounceRef.current);
            }
        };
    }, [searchInput]);

    useEffect(function () {
        fetchScansPage(1).then(function (data) {
            setScanIds(data.items.map(function (item) { return item.id; }));
        }).catch(function () {
            setScanIds([]);
        });
    }, []);

    useEffect(function () {
        setLoading(true);
        setLoadError(null);

        fetchWordsPage({
            page,
            search: debouncedSearch,
            vectorized: vectorizedFilter,
            scanId: scanIdFilter,
        }).then(function (data) {
            setItems(data.items);
            setTotalCount(data.totalCount);
        }).catch(function (error) {
            setLoadError(error instanceof Error ? error.message : String(error));
        }).finally(function () {
            setLoading(false);
        });
    }, [page, debouncedSearch, vectorizedFilter, scanIdFilter]);

    const lastPage = Math.max(1, Math.ceil(totalCount / WORDS_PAGE_SIZE));
    const filteredExportDisabled = totalCount === 0 || vectorizedFilter === "false";

    function handleVectorizedChange(value: VectorizedFilter) {
        setVectorizedFilter(value);
        setPage(1);
    }

    function handleScanFilterChange(value: string) {
        if (value === "all") {
            setScanIdFilter(null);
        } else {
            setScanIdFilter(Number(value));
        }
        setPage(1);
    }

    async function handleExportAllClick() {
        setExportAllStatus(null);
        setIsExportingAll(true);

        try {
            const count = await exportAllDataset();
            setExportAllStatus("Экспортировано слов: " + count);
        } catch (error) {
            setExportAllStatus("Ошибка экспорта: " + (error instanceof Error ? error.message : String(error)));
        } finally {
            setIsExportingAll(false);
        }
    }

    async function handleExportFilteredClick() {
        setExportFilteredStatus(null);
        setIsExportingFiltered(true);

        const snapshot = {
            search: debouncedSearch,
            vectorized: vectorizedFilter,
            scanId: scanIdFilter,
        };

        try {
            const count = await exportFilteredDataset(snapshot);
            setExportFilteredStatus("Экспортировано слов: " + count);
        } catch (error) {
            setExportFilteredStatus("Ошибка экспорта: " + (error instanceof Error ? error.message : String(error)));
        } finally {
            setIsExportingFiltered(false);
        }
    }

    return (
        <section className="words-section">
            <div className="words-filters">
                <label>
                    Поиск{" "}
                    <input
                        type="search"
                        value={searchInput}
                        onChange={function (event) { setSearchInput(event.target.value); }}
                        placeholder="Текст слова"
                    />
                </label>
                <label>
                    Статус{" "}
                    <select
                        value={vectorizedFilter}
                        onChange={function (event) {
                            handleVectorizedChange(event.target.value as VectorizedFilter);
                        }}
                    >
                        <option value="all">Все</option>
                        <option value="true">Векторизовано</option>
                        <option value="false">Не векторизовано</option>
                    </select>
                </label>
                <label>
                    Скан{" "}
                    <select
                        value={scanIdFilter ?? "all"}
                        onChange={function (event) { handleScanFilterChange(event.target.value); }}
                    >
                        <option value="all">Все</option>
                        {scanIds.map(function (id) {
                            return <option key={id} value={id}>{id}</option>;
                        })}
                    </select>
                </label>
            </div>

            <div className="words-export">
                <button type="button" onClick={handleExportAllClick} disabled={isExportingAll}>
                    {isExportingAll ? "Экспорт…" : "Экспортировать всё"}
                </button>
                <button
                    type="button"
                    onClick={handleExportFilteredClick}
                    disabled={isExportingFiltered || filteredExportDisabled}
                >
                    {isExportingFiltered ? "Экспорт…" : "Экспортировать отфильтрованное"}
                </button>
                {filteredExportDisabled ? <span className="words-export-hint">Нет слов для экспорта</span> : null}
            </div>
            {exportAllStatus ? <p>{exportAllStatus}</p> : null}
            {exportFilteredStatus ? <p>{exportFilteredStatus}</p> : null}

            <table className="words-table">
                <thead>
                    <tr>
                        <th>Текст</th>
                        <th>Scan ID</th>
                        <th>Статус</th>
                        <th>Миниатюра</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map(function (word) {
                        const vectorized = isWordVectorized(word);
                        return (
                            <tr
                                key={word.id + "-" + word.scanId}
                                onClick={function () { onRowClick(word); }}
                            >
                                <td>{word.text}</td>
                                <td>{word.scanId}</td>
                                <td>{vectorized ? "Векторизовано" : "Не векторизовано"}</td>
                                <td className="words-table-thumbnail">
                                    {vectorized ? <WordCurveThumbnail curvePoints={word.curvePoints} /> : "—"}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            {!loading && !loadError && items.length === 0 ? (
                <p className="words-empty">Слов не найдено</p>
            ) : null}

            <div className="words-pagination">
                <button
                    type="button"
                    disabled={page <= 1 || loading}
                    onClick={function () { setPage(page - 1); }}
                >
                    Назад
                </button>
                <span>Страница {page} из {lastPage}</span>
                <button
                    type="button"
                    disabled={page >= lastPage || loading}
                    onClick={function () { setPage(page + 1); }}
                >
                    Вперёд
                </button>
            </div>

            {loading ? <p>Загрузка слов…</p> : null}
            {loadError && !loading ? <p className="words-error">{loadError}</p> : null}
        </section>
    );
}

export default WordsTableScreen;
