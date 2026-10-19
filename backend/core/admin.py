"""Registro administrativo institucional de modelos para Farmacia Asistencial CESFAM."""
from django.contrib import admin
from .models import (
    CarroClinico,
    CategoriaMedicamento,
    DetalleReceta,
    DetalleReposicionCarro,
    Dispensacion,
    HL7FHIRValidationLog,
    ImmutableAuditDAG,
    InscripcionProgramaSalud,
    LibroControladoISP,
    Lote,
    Medicamento,
    MovimientoInventario,
    Paciente,
    ProgramaSalud,
    RecetaMedica,
    ReposicionCarro,
    RolRBAC,
    StockCarroClinico,
    Usuario,
)

admin.site.site_header = "Administración Farmacia Asistencial CESFAM - Red Pública MINSAL"
admin.site.site_title = "CESFAM Farmacia Asistencial"


@admin.register(ImmutableAuditDAG)
class ImmutableAuditDAGAdmin(admin.ModelAdmin):
    list_display = ("id", "timestamp", "action_type", "entity_type", "entity_id", "actor_rut", "current_hash")
    readonly_fields = [f.name for f in ImmutableAuditDAG._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


admin.site.register(RolRBAC)
admin.site.register(Usuario)
admin.site.register(Paciente)
admin.site.register(ProgramaSalud)
admin.site.register(InscripcionProgramaSalud)
admin.site.register(CategoriaMedicamento)
admin.site.register(Medicamento)
admin.site.register(Lote)
admin.site.register(RecetaMedica)
admin.site.register(DetalleReceta)
admin.site.register(Dispensacion)
admin.site.register(LibroControladoISP)
admin.site.register(CarroClinico)
admin.site.register(StockCarroClinico)
admin.site.register(ReposicionCarro)
admin.site.register(DetalleReposicionCarro)
admin.site.register(MovimientoInventario)
admin.site.register(HL7FHIRValidationLog)
