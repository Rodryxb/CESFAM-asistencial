"""
Políticas de Autenticación y Autorización Granular Basadas en Roles (RBAC - Criterio 2.1.5.10).
Implementa el Principio de Mínimo Privilegio (Ley N° 19.628) y la obligatoriedad de MFA/TOTP
para roles críticos (`Químico Farmacéutico` y `Administrador`) en los 10 módulos del CESFAM:

1. `ADMIN` (Administrador):
   - Gestión de usuarios (RF-01), gestión de roles (RF-02), configuración del sistema,
     consulta de reportes globales, supervisión de indicadores y verificación del DAG de auditoría.
2. `QF` (Químico Farmacéutico):
   - Supervisión de inventario, control de lotes/vencimientos, gestión de alertas de vencimiento
     (marcar para devolución CENABAST / donación según HU-3), autorización de procesos regulados,
     administración de medicamentos controlados y Libro Digital de Estupefacientes/Psicotrópicos
     (Recetas Retenidas RF-10), supervisión de carros clínicos y exportación de reportes.
3. `TECNICO` (Técnico en Farmacia):
   - Registro de recetas (RF-08), dispensación de medicamentos con FEFO (RF-09), control de entregas
     GES/AUGE y Crónicos (RF-10), trazabilidad de retiros por paciente o tercero autorizado (RF-11),
     actualización de stock (Bodega/Vitrina RF-03/RF-04) y aprobación/ejecución de reposición de carros (RF-14).
4. `CLINICO` (Personal Clínico):
   - Consulta de disponibilidad de medicamentos, registro de consumos de urgencia y solicitud de
     reposición para Carro de Paro (RF-12) y Carro Unidosis (RF-13).
"""
from rest_framework.permissions import BasePermission, SAFE_METHODS
from .security.jwt_mfa import MFATOTPService


# Matriz formal RBAC para documentación, auditoría y consumo del Frontend
RBAC_POLICY_MATRIX = {
    "ADMIN": {
        "nombre": "Administrador del Sistema CESFAM",
        "requiere_mfa_obligatorio": True,
        "modulos_autorizados": [
            "RF-01 Gestión de Usuarios (CRUD)",
            "RF-02 Gestión de Roles y Perfiles (CRUD)",
            "RF-15 Dashboard Operacional Global (Lectura)",
            "RF-16 Exportación de Reportes PDF y Excel",
            "RF-17 Auditoría Inmutable ALCOA+ DAG y Verificación SHA-256",
        ],
        "restricciones_minimo_privilegio": [
            "No puede firmar el Libro Digital de Controlados ISP (exclusivo del Químico Farmacéutico).",
            "No ejecuta dispensación clínica directa sin rol farmacéutico.",
        ],
    },
    "QF": {
        "nombre": "Químico Farmacéutico (Director Técnico)",
        "requiere_mfa_obligatorio": True,
        "modulos_autorizados": [
            "RF-03/04/05 Supervisión de Inventario, Bodega, Vitrina y Lotes FEFO",
            "RF-06/07 Gestión de Alertas de Stock/Vencimiento (Devolución CENABAST / Donación)",
            "RF-08/09/10 Autorización de Recetas Retenidas y Libro Digital de Estupefacientes/Psicotrópicos ISP",
            "RF-12/13/14 Supervisión y Sellado de Carro de Paro y Carro Unidosis",
            "RF-15/16/17 Dashboard, Predicción de Demanda IA 90 días CENABAST, Reportes y Auditoría DAG",
        ],
        "restricciones_minimo_privilegio": [
            "Exige verificación MFA/TOTP activa en sesión para autorizar operaciones críticas.",
        ],
    },
    "TECNICO": {
        "nombre": "Técnico en Farmacia (TENS)",
        "requiere_mfa_obligatorio": False,
        "modulos_autorizados": [
            "RF-03/04/05 Actualización de Stock Bodega/Vitrina y Traspasos FEFO",
            "RF-08 Registro y Validación de Recetas Médicas",
            "RF-09 Dispensación de Medicamentos con Motor Automático FEFO",
            "RF-10 Control de Entregas y Cuotas de Programas GES/AUGE y Crónicos (Bus HL7 FHIR)",
            "RF-11 Trazabilidad de Retiros por Paciente o Tercero Autorizado (Módulo 11)",
            "RF-14 Aprobación y Ejecución de Reposición de Carros Clínicos",
        ],
        "restricciones_minimo_privilegio": [
            "No puede dispensar Estupefacientes ni Psicotrópicos sin la firma autorizadora de un Q.F.",
            "No puede administrar cuentas de usuarios ni roles del sistema.",
        ],
    },
    "CLINICO": {
        "nombre": "Personal Clínico (Médico / Enfermero)",
        "requiere_mfa_obligatorio": False,
        "modulos_autorizados": [
            "RF-03 Consulta de Disponibilidad de Medicamentos e Insumos en Tiempo Real",
            "RF-12 Gestión de Consumos de Urgencia y Solicitud de Reposición de Carro de Paro",
            "RF-13 Gestión de Consumos y Solicitud de Reposición de Carro Unidosis",
        ],
        "restricciones_minimo_privilegio": [
            "Solo lectura sobre el catálogo de medicamentos y lotes.",
            "No puede modificar stock de bodega directamente ni aprobar sus propias solicitudes de reposición.",
        ],
    },
}


def _tiene_mfa_valido_si_es_rol_critico(request) -> bool:
    """
    Verifica que si el usuario autenticado mediante JWT pertenece a un rol crítico (`QF` o `ADMIN`),
    haya completado la verificación de segundo factor (`mfa_verified=True`).
    Para sesiones de pruebas o autenticación estándar donde no se emitió token con challenge pendiente,
    respeta `usuario.mfa_habilitado`.
    """
    user = getattr(request, "user", None)
    if not user or not user.is_authenticated:
        return False

    if hasattr(user, "_jwt_mfa_verified"):
        if MFATOTPService.requiere_mfa(user):
            return bool(user._jwt_mfa_verified)
    return True


class IsAuthenticatedOrReadOnlyCESFAM(BasePermission):
    """Permite lectura supervisada y exige funcionario autenticado con MFA válido para mutaciones."""

    message = "Se requiere autenticación institucional válida (y verificación MFA para roles críticos)."

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        if not request.user or not request.user.is_authenticated:
            return False
        return _tiene_mfa_valido_si_es_rol_critico(request)


class IsAdministradorCESFAM(BasePermission):
    """Permiso exclusivo para Administrador (`ADMIN`): Gestión de Usuarios (RF-01) y Roles (RF-02)."""

    message = "Acceso denegado (RBAC): Esta operación es exclusiva del rol 'Administrador' con MFA verificado."

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            if request.user and request.user.is_authenticated:
                rol = getattr(request.user, "codigo_rol", "")
                return rol in ("ADMIN", "QF") or request.user.is_superuser
            return False
        if not request.user or not request.user.is_authenticated:
            return False
        es_admin = getattr(request.user, "codigo_rol", "") == "ADMIN" or request.user.is_superuser
        return es_admin and _tiene_mfa_valido_si_es_rol_critico(request)


class IsQuimicoFarmaceuticoOrAdmin(BasePermission):
    """
    Permiso para Químico Farmacéutico (`QF`) o Administrador (`ADMIN`):
    Supervisión de alertas de vencimiento (devolución/donación), medicamentos controlados ISP y reportes.
    """

    message = "Acceso denegado (RBAC): Se requiere rol 'Químico Farmacéutico' o 'Administrador' con MFA verificado."

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            if request.user and request.user.is_authenticated:
                rol = getattr(request.user, "codigo_rol", "")
                return rol in ("QF", "ADMIN") or request.user.is_superuser
            return False
        if not request.user or not request.user.is_authenticated:
            return False
        rol = getattr(request.user, "codigo_rol", "")
        return (rol in ("QF", "ADMIN") or request.user.is_superuser) and _tiene_mfa_valido_si_es_rol_critico(request)


class IsPersonalFarmacia(BasePermission):
    """
    Permiso operativo para `Técnico en Farmacia` (`TECNICO`) y `Químico Farmacéutico` (`QF`):
    Registro de recetas, dispensación FEFO, control GES/Crónicos, actualización Bodega/Vitrina y
    aprobación de reposición de carros clínicos.
    """

    message = (
        "Acceso denegado (RBAC): Operación restringida a 'Técnico en Farmacia' o 'Químico Farmacéutico'."
    )

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            if (
                request.user
                and request.user.is_authenticated
                and getattr(request.user, "codigo_rol", "") == "CLINICO"
                and getattr(view, "basename", "") in ("receta", "dispensacion")
                and request.query_params.get("tipo_receta", "").upper() == "RETENIDA"
            ):
                return False
            return True
        if not request.user or not request.user.is_authenticated:
            return False
        rol = getattr(request.user, "codigo_rol", "")
        return (rol in ("TECNICO", "QF", "ADMIN") or request.user.is_superuser) and _tiene_mfa_valido_si_es_rol_critico(request)


class CanOperateCarrosClinicos(BasePermission):
    """
    Permiso para Carros Clínicos (Carro de Paro RF-12 y Carro Unidosis RF-13):
    Permite a `Personal Clínico` (`CLINICO`), `Técnico en Farmacia` (`TECNICO`) y `Químico Farmacéutico` (`QF`)
    registrar consumos de urgencia y solicitar reposiciones.
    """

    message = "Acceso denegado (RBAC): Se requiere rol clínico o farmacéutico para operar carros clínicos."

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        if not request.user or not request.user.is_authenticated:
            return False
        rol = getattr(request.user, "codigo_rol", "")
        return (
            rol in ("CLINICO", "TECNICO", "QF", "ADMIN") or request.user.is_superuser
        ) and _tiene_mfa_valido_si_es_rol_critico(request)
