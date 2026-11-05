from django.urls import path

from . import views

urlpatterns = [
    path("", views.index, name="index"),
    path("api/parse_import_file/", views.api_parse_import, name="api_parse_import"),
    path("api/<str:method>/", views.api_call, name="api_call"),
]
