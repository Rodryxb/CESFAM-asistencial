"""
Rutas principales del Sistema Web de Gestión para Farmacia Asistencial (CESFAM).
Expone todos los endpoints tanto bajo `/api/` como bajo `/api/v1/` para máxima compatibilidad.
"""
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("core.urls")),
    path("api/v1/", include("core.urls")),
]
