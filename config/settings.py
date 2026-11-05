"""Настройки проекта «Персонал».

Параметры подключения к БД и режим отладки берутся из переменных окружения
(значения по умолчанию совпадают с прежним config.json).
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"

# Ключ нужен для подписи CSRF-токена. Для работы в закрытой локальной сети
# достаточно значения по умолчанию, но в других условиях задайте свой.
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "personal-local-network-secret-key")

# Приложение открывается с других ПК по IP, поэтому разрешены все адреса.
# При желании сузьте список, например ["192.168.1.50", "localhost"].
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "*").split(",")

INSTALLED_APPS = [
    "django.contrib.staticfiles",
    "staff",
]

MIDDLEWARE = [
    "django.middleware.csrf.CsrfViewMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": []},
    }
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "HOST": os.environ.get("DB_HOST", "localhost"),
        "PORT": os.environ.get("DB_PORT", "5432"),
        "NAME": os.environ.get("DB_NAME", "postgres"),
        "USER": os.environ.get("DB_USER", "postgres"),
        "PASSWORD": os.environ.get("DB_PASSWORD", "root"),
        "OPTIONS": {"connect_timeout": 5},
    }
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LANGUAGE_CODE = "ru"
TIME_ZONE = "Europe/Moscow"
USE_TZ = False  # время хранится локальным, как в прежнем приложении

STATIC_URL = "static/"
