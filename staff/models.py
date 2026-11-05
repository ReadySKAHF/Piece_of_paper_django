from django.db import models
from django.db.models.functions import Lower


class Department(models.Model):
    """Отдел. Название уникально без учёта регистра."""

    name = models.TextField()

    class Meta:
        constraints = [models.UniqueConstraint(Lower("name"), name="department_name_ci_unique")]
        ordering = ["id"]

    def __str__(self):
        return self.name


class Employee(models.Model):
    """Сотрудник. «Отбитый» не удаляется, а получает статус approved."""

    ADDED = "add"
    APPROVED = "approved"

    created = models.DateTimeField()  # дата и время добавления
    who = models.TextField()  # ФИО
    info = models.TextField()  # должность
    department = models.ForeignKey(
        Department, null=True, blank=True, on_delete=models.SET_NULL, related_name="employees"
    )
    status = models.CharField(max_length=16, default=ADDED)

    class Meta:
        ordering = ["who", "id"]

    def __str__(self):
        return self.who


class HistoryEvent(models.Model):
    """Журнал добавлений и отбитий: снимок данных без связей, записи не зависят от сотрудника."""

    ADD = "add"
    REMOVE = "remove"

    created = models.DateTimeField()
    who = models.TextField()
    info = models.TextField()
    department_name = models.TextField(blank=True, default="")
    action = models.CharField(max_length=8, choices=[(ADD, "add"), (REMOVE, "remove")])

    class Meta:
        ordering = ["-created", "-id"]
        indexes = [models.Index(fields=["action", "-created"], name="history_action_created_idx")]
