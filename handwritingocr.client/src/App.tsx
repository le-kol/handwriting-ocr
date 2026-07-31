import { useState } from 'react';
import './App.css';

function App() {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploadStatus, setUploadStatus] = useState<string | null>(null);
    const [scanId, setScanId] = useState<number | null>(null);

    function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0] ?? null;
        setSelectedFile(file);

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

    return (
        <div>
            <input type="file" accept=".jpeg, .jpg, .png" onChange={handleFileChange} />
            <p>Выбранный файл: {selectedFile ? selectedFile.name : "Не выбран"}</p>
            <p>Статус: {uploadStatus}</p>
            {/* При изменении scanID запросятся данные изображения с сервера для этого id */}
            {scanId ? <img src={"/api/scans/" + scanId + "/image"} style={{ maxWidth: "100%" }} /> : null}
        </div>
    )
}

export default App;