import { useState } from 'react';
import './App.css';

// Слово скана в том виде, в котором его возвращает сервер.
// Координаты — четыре вершины рамки в пикселях исходного изображения
interface Word {
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
}

type CoordinateField = "x1" | "y1" | "x2" | "y2" | "x3" | "y3" | "x4" | "y4";

const coordinateFields: CoordinateField[] = ["x1", "y1", "x2", "y2", "x3", "y3", "x4", "y4"];

function App() {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploadStatus, setUploadStatus] = useState<string | null>(null);
    const [scanId, setScanId] = useState<number | null>(null);
    const [words, setWords] = useState<Word[] | null>(null);
    const [recognizeStatus, setRecognizeStatus] = useState<string | null>(null);
    const [isRecognizing, setIsRecognizing] = useState(false);
    const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
    // Правки выбранного слова. id внутри черновика заодно говорит, какое слово выбрано,
    // поэтому отдельного состояния для выбора нет и разойтись им негде
    const [draft, setDraft] = useState<Word | null>(null);
    const [saveStatus, setSaveStatus] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0] ?? null;
        setSelectedFile(file);

        // Результат распознавания относится к прежнему скану, поэтому его нужно сбросить
        setWords(null);
        setRecognizeStatus(null);
        setImageSize(null);
        setDraft(null);
        setSaveStatus(null);

        // Запрос для отправки файла на сервер
        if (file) {
            const formData = new FormData();
            formData.append("file", file);

            setUploadStatus("Загрузка")

            fetch("/api/Scans/upload", {
                method: "POST",
                body: formData,
            }).then(function (response) {
                return response.json()
            }).then(function (data) {
                setScanId(data.id);
                setUploadStatus("Загрузка завершена");
            }).catch(function (error) {
                setUploadStatus("Ошибка загрузки: " + error.message);
            });
        }
    }

    // Запрос на распознавание текста загруженного скана
    function handleRecognizeClick() {
        if (scanId === null) return;

        setIsRecognizing(true);
        setRecognizeStatus("Распознавание");

        fetch("/api/Scans/" + scanId + "/recognize", {
            method: "POST",
        }).then(function (response) {
            // Об ошибках сервер сообщает текстом, а не JSON
            if (!response.ok) {
                return response.text().then(function (message) {
                    throw new Error(message || String(response.status));
                });
            }
            return response.json();
        }).then(function (data: Word[]) {
            setWords(data);
            // Распознавание удаляет прежние слова и вставляет новые, поэтому старые id
            // больше не существуют и черновик указывал бы на удалённое слово
            setDraft(null);
            setSaveStatus(null);
            setRecognizeStatus("Распознавание завершено, слов: " + data.length);
        }).catch(function (error) {
            setRecognizeStatus("Ошибка распознавания: " + error.message);
        }).finally(function () {
            setIsRecognizing(false);
        });
    }

    // Размеры скана в БД не хранятся, поэтому берём их у загруженного изображения:
    // координаты рамок заданы именно в этих пикселях
    function handleImageLoad(event: React.SyntheticEvent<HTMLImageElement>) {
        setImageSize({
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight,
        });
    }

    function handleWordSelect(word: Word) {
        // Повторный клик по уже выбранному слову не должен отбрасывать начатые правки
        if (draft && draft.id === word.id) return;

        setDraft({ ...word });
        setSaveStatus(null);
    }

    function handleTextChange(event: React.ChangeEvent<HTMLInputElement>) {
        const text = event.target.value;
        setDraft(function (current) {
            return current ? { ...current, text } : current;
        });
    }

    function handleCoordinateChange(field: CoordinateField, value: string) {
        setDraft(function (current) {
            return current ? { ...current, [field]: Number(value) } : current;
        });
    }

    function handleCancelClick() {
        setDraft(null);
        setSaveStatus(null);
    }

    // Слово отправляется целиком: сервер перезаписывает все поля разом, поэтому
    // отправить только текст нельзя — координаты обнулились бы
    function handleSaveClick() {
        if (scanId === null || draft === null) return;

        setIsSaving(true);
        setSaveStatus("Сохранение");

        fetch("/api/Scans/" + scanId + "/words/" + draft.id, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(draft),
        }).then(function (response) {
            // Об ошибках сервер сообщает текстом, а не JSON
            if (!response.ok) {
                return response.text().then(function (message) {
                    throw new Error(message || String(response.status));
                });
            }
            return response.json();
        }).then(function (saved: Word) {
            // Сервер мог поправить позицию слова, поэтому его версия считается истинной
            setWords(function (current) {
                return current
                    ? current.map(function (word) {
                        return word.id === saved.id ? saved : word;
                    })
                    : current;
            });
            setDraft(saved);
            setSaveStatus("Сохранено");
        }).catch(function (error) {
            setSaveStatus("Ошибка сохранения: " + error.message);
        }).finally(function () {
            setIsSaving(false);
        });
    }

    return (
        <div>
            <input type="file" accept=".jpeg, .jpg, .png" onChange={handleFileChange} />
            <p>Выбранный файл: {selectedFile ? selectedFile.name : "Не выбран"}</p>
            <p>Статус: {uploadStatus}</p>
            {/* При изменении scanID запросятся данные изображения с сервера для этого id */}
            {scanId ? (
                <div className="scan">
                    <img src={"/api/scans/" + scanId + "/image"} onLoad={handleImageLoad} />
                    {/* viewBox переводит пиксели исходного изображения в текущий размер картинки,
                        поэтому масштаб рамок не нужно считать вручную */}
                    {imageSize && words ? (
                        <svg viewBox={"0 0 " + imageSize.width + " " + imageSize.height}>
                            {words.map(function (word) {
                                const isSelected = draft !== null && draft.id === word.id;
                                // У выбранного слова рамка рисуется по черновику,
                                // чтобы правка координат была видна до сохранения
                                const shown = isSelected ? draft : word;

                                return (
                                    <polygon
                                        key={word.id}
                                        className={isSelected ? "selected" : undefined}
                                        points={
                                            shown.x1 + "," + shown.y1 + " " +
                                            shown.x2 + "," + shown.y2 + " " +
                                            shown.x3 + "," + shown.y3 + " " +
                                            shown.x4 + "," + shown.y4
                                        }
                                        onClick={function () { handleWordSelect(word); }}
                                    />
                                );
                            })}
                        </svg>
                    ) : null}
                </div>
            ) : null}
            {/* Распознавать можно только уже загруженный скан */}
            {scanId ? (
                <div>
                    <button type="button" onClick={handleRecognizeClick} disabled={isRecognizing}>
                        {isRecognizing ? "Распознавание..." : "Распознать текст"}
                    </button>
                    <p>Статус распознавания: {recognizeStatus}</p>
                </div>
            ) : null}
            {words && words.length > 0 && draft === null ? (
                <p>Выберите слово в таблице или рамку на скане, чтобы отредактировать</p>
            ) : null}
            {draft ? (
                <div className="editor">
                    <label>
                        Текст <input value={draft.text} onChange={handleTextChange} />
                    </label>
                    <div className="coordinates">
                        {coordinateFields.map(function (field) {
                            return (
                                <label key={field}>
                                    {field}
                                    <input
                                        type="number"
                                        value={draft[field]}
                                        onChange={function (event) {
                                            handleCoordinateChange(field, event.target.value);
                                        }}
                                    />
                                </label>
                            );
                        })}
                    </div>
                    <button type="button" onClick={handleSaveClick} disabled={isSaving}>
                        {isSaving ? "Сохранение..." : "Сохранить"}
                    </button>
                    <button type="button" onClick={handleCancelClick}>Отмена</button>
                    <p>{saveStatus}</p>
                </div>
            ) : null}
            {words && words.length > 0 ? (
                <table>
                    <thead>
                        <tr>
                            <th>№</th>
                            <th>Слово</th>
                        </tr>
                    </thead>
                    <tbody>
                        {words.map(function (word) {
                            return (
                                <tr
                                    key={word.id}
                                    className={draft !== null && draft.id === word.id ? "selected" : undefined}
                                    onClick={function () { handleWordSelect(word); }}
                                >
                                    <td>{word.orderIndex}</td>
                                    <td>{word.text}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            ) : null}
        </div>
    )
}

export default App;