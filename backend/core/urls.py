"""
Enrutador completo de la API REST para los 10 Módulos del Sistema Web de Gestión
para Farmacia Asistencial CESFAM y su Capa de Ciberseguridad TI.
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AlertasStockYVencimientoAPIView,
    AuthLoginJWTAPIView,
    AuthRefreshJWTAPIView,
    AuthVerifyMFATOTPAPIView,
    CarroClinicoViewSet,
    CarroParoViewSet,
    CarroUnidosisViewSet,
    CategoriaMedicamentoViewSet,
    DashboardOperacionalCESFAMAPIView,
    DispensacionViewSet,
    ExportarReporteExcelAPIView,
    ExportarReportePDFAPIView,
    HL7FHIRValidationLogViewSet,
    ImmutableAuditDAGViewSet,
    InscripcionProgramaSaludViewSet,
    LibroControladoISPViewSet,
    LoteViewSet,
    MedicamentoViewSet,
    MovimientoInventarioViewSet,
    PacienteViewSet,
    PrediccionDemandaCENABASTAPIView,
    ProgramaSaludViewSet,
    RecetaMedicaViewSet,
    ReposicionCarroViewSet,
    RolRBACViewSet,
    SecurityGovernanceOverviewAPIView,
    UsuarioViewSet,
    ValidateSecureFileUploadAPIView,
    VerifyAuditChainDAGAPIView,
)

router = DefaultRouter()
# Módulo 2: Usuarios y Roles RBAC
router.register(r"roles", RolRBACViewSet, basename="rol-rbac")
router.register(r"usuarios", UsuarioViewSet, basename="usuario")

# Módulo 3: Inventario, Bodega/Vitrina y Lotes FEFO
router.register(r"categorias", CategoriaMedicamentoViewSet, basename="categoria")
router.register(r"medicamentos", MedicamentoViewSet, basename="medicamento")
router.register(r"lotes", LoteViewSet, basename="lote")
router.register(r"movimientos-inventario", MovimientoInventarioViewSet, basename="movimiento")

# Módulo 4: Dispensación, Recetas y Controlados ISP
router.register(r"recetas", RecetaMedicaViewSet, basename="receta")
router.register(r"dispensaciones", DispensacionViewSet, basename="dispensacion")
router.register(r"libro-controlados-isp", LibroControladoISPViewSet, basename="libro-isp")

# Módulo 5: Programas de Salud GES/AUGE y Crónicos + HL7 FHIR
router.register(r"pacientes", PacienteViewSet, basename="paciente")
router.register(r"programas-salud", ProgramaSaludViewSet, basename="programa-salud")
router.register(
    r"inscripciones-programas",
    InscripcionProgramaSaludViewSet,
    basename="inscripcion-programa",
)
router.register(r"interoperabilidad-fhir", HL7FHIRValidationLogViewSet, basename="hl7-fhir")

# Módulo 6 y 7: Carros Clínicos (Carro de Paro, Carro Unidosis y Reposiciones)
router.register(r"carros-clinicos", CarroClinicoViewSet, basename="carro-clinico")
router.register(r"carro-paro", CarroParoViewSet, basename="carro-paro")
router.register(r"carro-unidosis", CarroUnidosisViewSet, basename="carro-unidosis")
router.register(r"reposiciones-carros", ReposicionCarroViewSet, basename="reposicion-carro")

# Módulo 10: Auditoría Inmutable y Trazabilidad DAG
router.register(r"auditoria-dag", ImmutableAuditDAGViewSet, basename="auditoria-dag")

urlpatterns = [
    path("", include(router.urls)),
    # Módulo 1: Ciberseguridad TI (JWT + MFA TOTP + Verificador Criptográfico DAG + Validador Archivos)
    path("security/auth/login/", AuthLoginJWTAPIView.as_view(), name="security-auth-login"),
    path("security/auth/verify-mfa/", AuthVerifyMFATOTPAPIView.as_view(), name="security-auth-verify-mfa"),
    path("security/auth/refresh/", AuthRefreshJWTAPIView.as_view(), name="security-auth-refresh"),
    path("security/verify-audit-chain/", VerifyAuditChainDAGAPIView.as_view(), name="security-verify-audit-chain"),
    path("security/validate-upload/", ValidateSecureFileUploadAPIView.as_view(), name="security-validate-upload"),
    path("security/governance/", SecurityGovernanceOverviewAPIView.as_view(), name="security-governance"),
    # Módulo 8: Alertas de Stock/Vencimiento y Predicción de Demanda IA 90 días CENABAST
    path("alertas/", AlertasStockYVencimientoAPIView.as_view(), name="alertas-stock-vencimiento"),
    path(
        "prediccion-demanda-cenabast/",
        PrediccionDemandaCENABASTAPIView.as_view(),
        name="prediccion-demanda-cenabast",
    ),
    # Módulo 9: Dashboard Operacional y Exportación de Reportes PDF / Excel
    path(
        "dashboard-resumen/",
        DashboardOperacionalCESFAMAPIView.as_view(),
        name="dashboard-resumen",
    ),
    path(
        "reportes/exportar-pdf/",
        ExportarReportePDFAPIView.as_view(),
        name="reportes-exportar-pdf",
    ),
    path(
        "reportes/exportar-excel/",
        ExportarReporteExcelAPIView.as_view(),
        name="reportes-exportar-excel",
    ),
]
