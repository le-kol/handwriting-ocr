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

function App() {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploadStatus, setUploadStatus] = useState<string | null>(null);
    const [scanId, setScanId] = useState<number | null>(null);
    const [words, setWords] = useState<Word[] | null>(null);
    const [recognizeStatus, setRecognizeStatus] = useState<string | null>(null);
    const [isRecognizing, setIsRecognizing] = useState(false);
    const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);

    function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0] ?? null;
        setSelectedFile(file);

        // Результат распознавания относится к прежнему скану, поэтому его нужно сбросить
        setWords(null);
        setRecognizeStatus(null);
        setImageSize(null);

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
                                return (
                                    <polygon
                                        key={word.id}
                                        points={
                                            word.x1 + "," + word.y1 + " " +
                                            word.x2 + "," + word.y2 + " " +
                                            word.x3 + "," + word.y3 + " " +
                                            word.x4 + "," + word.y4
                                        }
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
                                <tr key={word.id}>
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