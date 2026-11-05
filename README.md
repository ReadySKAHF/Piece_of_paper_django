# Персонал (Django)

Веб-версия приложения «Персонал»: учёт сотрудников, отделы с доской drag-and-drop,
журнал добавлений и отбитий, импорт из CSV и XLSX. Зависимости: Django, psycopg, openpyxl.

## Установка

```powershell
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python manage.py migrate
```

## База данных

PostgreSQL. Параметры задаются переменными окружения (значения по умолчанию в скобках):
`DB_HOST` (localhost), `DB_PORT` (5432), `DB_NAME` (postgres), `DB_USER` (postgres), `DB_PASSWORD` (root).

Перенос данных из старого десктопного приложения (старые таблицы не изменяются):

```powershell
.venv\Scripts\python manage.py import_legacy            # основная таблица employees
.venv\Scripts\python manage.py import_legacy --table имя  # если таблица называлась иначе
```

## Запуск в локальной сети

```powershell
.venv\Scripts\python manage.py runserver 0.0.0.0:8000
```

1. Узнайте IPv4-адрес этого ПК командой `ipconfig` (например, `192.168.1.50`).
2. Откройте порт в брандмауэре (PowerShell от администратора):
   `New-NetFirewallRule -DisplayName "Personal 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Private`
3. С другого ПК откройте `http://192.168.1.50:8000`.

Сеть должна быть «Частной». Чтобы адрес не менялся, закрепите IP за ПК в настройках роутера.
Авторизации нет: любой в сети, кто знает адрес, получит доступ к данным.

## Прочее

- Тесты: `.venv\Scripts\python manage.py test`
- Тема оформления хранится в браузере (localStorage), у каждого пользователя своя.
- Для постоянной работы вместо `runserver` можно использовать `waitress` (работает на Windows),
  статику тогда отдавать через `whitenoise`; в зависимости проекта они не входят.
