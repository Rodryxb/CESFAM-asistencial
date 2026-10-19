"""Configuración de la aplicación Core y soporte multi-motor para Índices GIN PostgreSQL."""
from django.apps import AppConfig
from django.contrib.postgres.indexes import GinIndex
from django.db.models import Index


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"
    verbose_name = "Gestión Farmacia Asistencial CESFAM (Estructurado SQL + No Estructurado JSONB/GIN)"

    def ready(self):
        """
        Garantiza que GinIndex genere 'USING gin' nativo sobre motores PostgreSQL
        y sea compatible con entornos de pruebas locales SQLite sin perder la
        definición declarativa de GinIndex en los modelos y migraciones.
        """
        original_create_sql = GinIndex.create_sql

        def compatible_gin_create_sql(self, model, schema_editor, using="", **kwargs):
            if schema_editor.connection.vendor == "postgresql":
                return original_create_sql(self, model, schema_editor, using=using, **kwargs)
            return Index.create_sql(self, model, schema_editor, **kwargs)

        GinIndex.create_sql = compatible_gin_create_sql
