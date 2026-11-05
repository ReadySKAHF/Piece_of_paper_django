"""Перенос данных из таблиц старого десктопного приложения в таблицы Django.

Старые таблицы только читаются и не изменяются. Команда безопасна для повторного
запуска только на пустых таблицах: если в новых таблицах уже есть данные, она остановится.
"""

from datetime import datetime

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from staff.models import Department, Employee, HistoryEvent


class Command(BaseCommand):
    help = "Переносит физлиц, задания и историю из старых таблиц (employees, employees_history, employees_departments)."

    def add_arguments(self, parser):
        parser.add_argument("--table", default="employees", help="Имя основной таблицы старого приложения")

    def handle(self, *args, table, **options):
        if Employee.objects.exists() or Department.objects.exists() or HistoryEvent.objects.exists():
            raise CommandError("В новых таблицах уже есть данные — перенос отменён.")

        history_table = f"{table}_history"
        departments_table = f"{table}_departments"
        existing = set(connection.introspection.table_names())
        missing = [name for name in (table, history_table, departments_table) if name not in existing]
        if missing:
            raise CommandError(f"Не найдены старые таблицы: {', '.join(missing)}")

        with transaction.atomic(), connection.cursor() as cursor:
            cursor.execute(f'SELECT name FROM "{departments_table}" ORDER BY id')
            for (name,) in cursor.fetchall():
                Department.objects.get_or_create(name=name)
            departments = {d.name: d for d in Department.objects.all()}

            cursor.execute(f'SELECT date, time, who, info, "group", status FROM "{table}" ORDER BY id')
            employees = []
            for day, moment, who, info, group, status in cursor.fetchall():
                if group and group not in departments:
                    departments[group] = Department.objects.create(name=group)
                employees.append(
                    Employee(
                        created=_combine(day, moment),
                        who=who,
                        info=info or "",
                        department=departments.get(group) if group else None,
                        status=Employee.APPROVED if status in ("approved", "remove") else Employee.ADDED,
                    )
                )
            Employee.objects.bulk_create(employees)

            cursor.execute(f'SELECT date, time, who, info, "group", action FROM "{history_table}" ORDER BY id')
            events = [
                HistoryEvent(
                    created=_combine(day, moment),
                    who=who,
                    info=info or "",
                    department_name=group or "",
                    action=action,
                )
                for day, moment, who, info, group, action in cursor.fetchall()
            ]
            HistoryEvent.objects.bulk_create(events)

        self.stdout.write(
            self.style.SUCCESS(
                f"Перенесено: физлиц — {len(employees)}, заданий — {len(departments)}, событий — {len(events)}"
            )
        )


def _combine(day, moment):
    return datetime.combine(day, moment)
