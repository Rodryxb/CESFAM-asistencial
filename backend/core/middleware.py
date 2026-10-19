"""
Middleware Institucional de Cabeceras Seguras (TLS 1.3 / HSTS / OWASP) y
Auditoría Automática Inmutable ALCOA+ sobre `ImmutableAuditDAG`.
"""
import json
from django.utils import timezone
from .services.audit_dag_service import AuditDAGService


class CESFAMSecurityAndAuditDAGMiddleware:
    """
    1. Inyecta cabeceras de endurecimiento HTTP (HSTS TLS 1.3, CSP, X-Frame-Options,
       X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
    2. Intercepta automáticamente mutaciones críticas HTTP (`POST`, `PUT`, `PATCH`, `DELETE`)
       sobre módulos sensibles (Usuarios, Roles, Recetas, Inventario, Carros Clínicos)
       garantizando que toda operación quede encadenada con SHA-256 en `ImmutableAuditDAG`.
    """

    MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
    RUTAS_AUDITABLES = (
        "/api/usuarios/",
        "/api/v1/usuarios/",
        "/api/roles/",
        "/api/v1/roles/",
        "/api/recetas/",
        "/api/v1/recetas/",
        "/api/lotes/",
        "/api/v1/lotes/",
        "/api/carro-paro/",
        "/api/v1/carro-paro/",
        "/api/carro-unidosis/",
        "/api/v1/carro-unidosis/",
    )

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Capturar copia segura del body en mutaciones auditables antes de procesar la vista
        body_snapshot = {}
        if request.method in self.MUTATING_METHODS and any(
            request.path.startswith(pref) for pref in self.RUTAS_AUDITABLES
        ):
            try:
                if request.content_type and "application/json" in request.content_type and request.body:
                    raw_data = json.loads(request.body.decode("utf-8"))
                    if isinstance(raw_data, dict):
                        body_snapshot = {
                            k: ("***REDACTED***" if "password" in k.lower() else v)
                            for k, v in raw_data.items()
                        }
            except Exception:
                body_snapshot = {}

        response = self.get_response(request)

        # 1. Cabeceras Seguras Forzadas (TLS 1.3 / HSTS y Mitigación OWASP Top 10)
        response["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
        response["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none';"
        )
        response["X-Content-Type-Options"] = "nosniff"
        response["X-Frame-Options"] = "DENY"
        response["X-XSS-Protection"] = "1; mode=block"
        response["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        response["X-CESFAM-Security-Standard"] = "MINSAL-ISP-ALCOA-PLUS-AES256"

        # 2. Intercepción Automática de Operaciones Críticas hacia ImmutableAuditDAG
        if (
            request.method in self.MUTATING_METHODS
            and 200 <= response.status_code < 300
            and not getattr(request, "_audit_dag_recorded", False)
            and any(request.path.startswith(pref) for pref in self.RUTAS_AUDITABLES)
        ):
            user = getattr(request, "user", None)
            actor = user if (user and user.is_authenticated) else None
            ip_addr = request.META.get("REMOTE_ADDR") or "127.0.0.1"

            AuditDAGService.registrar_evento(
                action_type=f"HTTP_{request.method}_MUTACION_AUDITADA",
                entity_type=request.path.strip("/").replace("/", "_").upper(),
                entity_id=str(body_snapshot.get("id") or body_snapshot.get("rut") or "API-OP"),
                actor_user=actor,
                ip_address=ip_addr,
                payload={
                    "http_method": request.method,
                    "endpoint_path": request.path,
                    "status_code": response.status_code,
                    "datos_afectados": body_snapshot,
                    "timestamp_intercepcion": timezone.now().isoformat(),
                },
            )
            request._audit_dag_recorded = True

        return response
