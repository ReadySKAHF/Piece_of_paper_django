python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python manage.py migrate

.venv\Scripts\python manage.py import_legacy            # основная таблица employees
.venv\Scripts\python manage.py import_legacy --table имя  # если таблица называлась иначе

PowerShell от администратора:
   `New-NetFirewallRule -DisplayName "Personal 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Private`
