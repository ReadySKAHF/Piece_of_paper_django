import json

from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST

from . import services
from .importers import parse_import_file


API_METHODS = {
    "get_settings": services.get_settings,
    "get_employees": services.get_employees,
    "add_employee": services.add_employee,
    "remove_employee": services.remove_employee,
    "update_employee": services.update_employee,
    "set_department": services.set_department,
    "add_department": services.add_department,
    "delete_department": services.delete_department,
    "rename_department": services.rename_department,
    "get_history": services.get_history,
    "delete_history_event": services.delete_history_event,
    "import_employees": services.import_employees,
}


def _respond(action):
    """Выполняет action() и упаковывает результат в {ok, data} или {ok: false, error}."""
    try:
        return JsonResponse({"ok": True, "data": action()})
    except ValueError as error:
        return JsonResponse({"ok": False, "error": str(error)})
    except Exception as error:
        text = str(error).strip()
        message = text.splitlines()[0] if text else error.__class__.__name__
        return JsonResponse({"ok": False, "error": message})


@ensure_csrf_cookie
def index(request):
    return render(request, "staff/index.html")


@require_POST
def api_call(request, method):
    function = API_METHODS.get(method)
    if function is None:
        return JsonResponse({"ok": False, "error": "Неизвестный метод"}, status=404)

    def action():
        try:
            args = json.loads(request.body or b"{}").get("args", [])
        except (json.JSONDecodeError, AttributeError):
            raise ValueError("Некорректный запрос")
        return function(*args)

    return _respond(action)


@require_POST
def api_parse_import(request):
    """Принимает файл (multipart) и возвращает предпросмотр строк для импорта."""

    def action():
        upload = request.FILES.get("file")
        if upload is None:
            raise ValueError("Файл не получен")
        return parse_import_file(upload.name, upload.read())

    return _respond(action)
