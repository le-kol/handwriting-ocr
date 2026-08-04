# handwriting-ocr

Для подключения проекта к БД, настройки хранения сканов и использования OCR необходимо в appsettings.json добавить следующие элементы:
```
"ConnectionStrings": {
  "Default": "строка_для_подключения_к_БД"
},
"Storage": {
  "ScansFolder": "имя_папки_для_хранения_сканов"
},
"YandexOcr": {
  "ApiKey": "",
  "FolderId": "",
  "Endpoint": "https://ocr.api.cloud.yandex.net/ocr/v1/recognizeText",
  "Model": "handwritten",
  "LanguageCodes": [ "ru", "en" ]
}
```

API-ключ и `FolderId` необходимо получить в Yandex Cloud

Для настройки liquibase необходимо создать в папке liquibase/ файл liquibase.properties со следующим содержимым:
```
changeLogFile=changelog.sql
liquibase.command.url=jdbc:postgresql://localhost:порт_на_котором_работает_Postgre/имя_БД
liquibase.command.username: имя_пользователя_Postrge
liquibase.command.password: пароль_пользователя_Postgre
```

Для создания необходимых таблиц в БД необходимо выполнить `liquibase update` в папке liquibase/

- Backend: `https://localhost:7216`
- Swagger: `http://localhost:5272/swagger`
- Frontend: `https://localhost:62406`