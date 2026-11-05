"""Бизнес-логика приложения. Ошибки для пользователя — ValueError с готовым текстом."""

from datetime import datetime

from django.db import IntegrityError, transaction

from .models import Department, Employee, HistoryEvent

DEPARTMENT_CAPACITY = 16


# --- Вспомогательное ---

def _now() -> datetime:
    return datetime.now().replace(microsecond=0)


def _collapse(value) -> str:
    """Убирает лишние пробелы: «  Иван   Иванов » -> «Иван Иванов»."""
    return " ".join(str(value or "").split())


def _get_department(name: str) -> Department | None:
    """Задание по названию (без учёта регистра); пустое название — «без задания»."""
    name = _collapse(name)
    if not name:
        return None
    department = Department.objects.filter(name__iexact=name).first()
    return department or Department.objects.create(name=name)


def _free_places(department: Department, exclude_id: int | None = None) -> int:
    taken = department.employees.exclude(pk=exclude_id).count()
    return DEPARTMENT_CAPACITY - taken


def _check_capacity(department: Department, exclude_id: int | None = None) -> None:
    if _free_places(department, exclude_id) <= 0:
        raise ValueError(f"В задании «{department.name}» уже максимум мест ({DEPARTMENT_CAPACITY})")


def _serialize(item) -> dict:
    """Физлицо или событие журнала в формате, который ждёт фронтенд."""
    department = item.department.name if isinstance(item, Employee) and item.department else ""
    if isinstance(item, HistoryEvent):
        department = item.department_name
    return {
        "id": item.pk,
        "date": item.created.date().isoformat(),
        "time": item.created.strftime("%H:%M:%S"),
        "who": item.who,
        "info": item.info,
        "group": department,
    }


def _add_history(employee_like: dict, action: str, when: datetime) -> HistoryEvent:
    return HistoryEvent.objects.create(
        created=when,
        who=employee_like["who"],
        info=employee_like["info"],
        department_name=employee_like["department_name"],
        action=action,
    )


# --- Настройки ---

def get_settings() -> dict:
    return {
        "departments": list(Department.objects.values_list("name", flat=True)),
        "department_capacity": DEPARTMENT_CAPACITY,
    }


# --- Физлица ---

def get_employees() -> list[dict]:
    return [_serialize(e) for e in Employee.objects.select_related("department")]


@transaction.atomic
def add_employee(who, info, department="") -> dict:
    who = _collapse(who)
    info = str(info or "").strip()
    if not who:
        raise ValueError("Укажите ФИО физлица")
    if not info:
        raise ValueError("Опишите должность физлица")

    dept = _get_department(department)
    if dept:
        _check_capacity(dept)
    now = _now()
    employee = Employee.objects.create(created=now, who=who, info=info, department=dept)
    _add_history(
        {"who": who, "info": info, "department_name": dept.name if dept else ""},
        HistoryEvent.ADD,
        now,
    )
    return _serialize(employee)


@transaction.atomic
def remove_employee(employee_id) -> bool:
    """«Отбитие»: физлицо остаётся в базе, в журнал пишется событие."""
    employee = Employee.objects.select_related("department").filter(pk=int(employee_id)).first()
    if employee is None:
        raise ValueError("Физлицо не найдено")
    employee.status = Employee.APPROVED
    employee.save(update_fields=["status"])
    _add_history(
        {
            "who": employee.who,
            "info": employee.info,
            "department_name": employee.department.name if employee.department else "",
        },
        HistoryEvent.REMOVE,
        _now(),
    )
    return True


def update_employee(employee_id, who, info) -> bool:
    """Правка ФИО и должности. В журнал не пишется."""
    who = _collapse(who)
    info = str(info or "").strip()
    if not who:
        raise ValueError("Укажите ФИО физлица")
    if not info:
        raise ValueError("Укажите должность")
    if not Employee.objects.filter(pk=int(employee_id)).update(who=who, info=info):
        raise ValueError("Физлицо не найдено")
    return True


@transaction.atomic
def set_department(employee_id, department) -> str:
    employee = Employee.objects.filter(pk=int(employee_id)).first()
    if employee is None:
        raise ValueError("Физлицо не найдено")
    dept = _get_department(department)
    if dept:
        _check_capacity(dept, exclude_id=employee.pk)
    employee.department = dept
    employee.save(update_fields=["department"])
    return dept.name if dept else ""


# --- Задания ---

def add_department(name) -> str:
    name = _collapse(name)
    if not name:
        raise ValueError("Введите название задания")
    try:
        with transaction.atomic():
            Department.objects.create(name=name)
    except IntegrityError:
        raise ValueError("Такое задание уже есть")
    return name


def delete_department(name) -> bool:
    """Удаляет задание; его физлица остаются, но без задания (on_delete=SET_NULL)."""
    Department.objects.filter(name=_collapse(name)).delete()
    return True


def rename_department(old_name, new_name) -> str:
    old_name, new_name = _collapse(old_name), _collapse(new_name)
    if not old_name:
        raise ValueError("Задание не указано")
    if not new_name:
        raise ValueError("Введите название задания")
    if new_name == old_name:
        return new_name
    try:
        with transaction.atomic():
            updated = Department.objects.filter(name=old_name).update(name=new_name)
    except IntegrityError:
        raise ValueError("Такое задание уже есть")
    if not updated:
        raise ValueError("Задание не найдено")
    return new_name


# --- История ---

def get_history(action, date_from, date_to) -> list[dict]:
    if action not in (HistoryEvent.ADD, HistoryEvent.REMOVE):
        raise ValueError("Неизвестное действие")
    date_from = str(date_from or "").strip() or None
    date_to = str(date_to or "").strip() or None
    if date_from and date_to and date_from > date_to:
        raise ValueError("Начальная дата позже конечной")

    events = HistoryEvent.objects.filter(action=action)
    try:
        if date_from:
            events = events.filter(created__date__gte=date_from)
        if date_to:
            events = events.filter(created__date__lte=date_to)
        return [_serialize(event) for event in events]
    except (ValueError, TypeError):
        raise ValueError("Некорректная дата")


def delete_history_event(event_id) -> bool:
    deleted, _ = HistoryEvent.objects.filter(pk=int(event_id)).delete()
    if not deleted:
        raise ValueError("Запись не найдена — возможно, она уже удалена")
    return True


# --- Импорт ---

@transaction.atomic
def import_employees(rows, department="") -> dict:
    if not isinstance(rows, list) or not rows:
        raise ValueError("Нет данных для импорта")

    clean_rows = []
    for item in rows:
        who = _collapse((item or {}).get("who", ""))
        info = str((item or {}).get("info", "")).strip()
        if who and info:
            clean_rows.append({"who": who, "info": info})
    if not clean_rows:
        raise ValueError("Нет корректных строк для импорта")

    dept = _get_department(department)
    if dept:
        free = _free_places(dept)
        if len(clean_rows) > free:
            raise ValueError(
                f"В задании «{dept.name}» свободно мест: {max(free, 0)} из {DEPARTMENT_CAPACITY}, "
                f"а импортируется {len(clean_rows)}. Уменьшите список или выберите другое задание."
            )

    now = _now()
    department_name = dept.name if dept else ""
    Employee.objects.bulk_create(
        Employee(created=now, who=r["who"], info=r["info"], department=dept) for r in clean_rows
    )
    HistoryEvent.objects.bulk_create(
        HistoryEvent(
            created=now,
            who=r["who"],
            info=r["info"],
            department_name=department_name,
            action=HistoryEvent.ADD,
        )
        for r in clean_rows
    )
    return {"added": len(clean_rows)}
