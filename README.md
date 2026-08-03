# handwriting-ocr

Для подключения проекта к БД и настройки хранения сканов необходимо в appsettings.json добавить следующие элементы:
```
"ConnectionStrings": {
  "Default": "строка_для_подключения_к_БД"
},
"Storage": {
  "ScansFolder": "имя_папки_для_хранения_сканов"
}
```

Для настройки liquibase необходимо создать в папке liquibase/ файл liquibase.properties со следующим содержимым:
```
changeLogFile=changelog.sql
liquibase.command.url=jdbc:postgresql://localhost:порт_на_котором_работает_Postgre/имя_БД
liquibase.command.username: имя_пользователя_Postrge
liquibase.command.password: пароль_пользователя_Postgre
```

Для создания необходимых таблиц в БД необходимо выполнить `liquibase update` в папке liquibase/