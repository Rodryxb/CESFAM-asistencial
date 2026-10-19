"""
Motor de Autenticación Robusta JWT (JSON Web Tokens RFC 7519) con Expiración Corta,
Rotación Segura de Refresh Tokens y Autenticación Multifactor (MFA / TOTP RFC 6238)
Obligatoria para Roles Críticos (`Químico Farmacéutico` y `Administrador`).

Cumple con el Criterio 2.1.5.10 de la Rúbrica y RNF-01 de la Evaluación 1.
"""
import base64
import hashlib
import hmac
import json
import struct
import time
import uuid
from typing import Any, Dict, Optional, Tuple

from django.conf import settings
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed

from ..models import Usuario

# Lista en memoria/caché de JTI revocados para rotación segura de Refresh Tokens (Anti-Replay)
_REVOKED_TOKEN_JTIS: set[str] = set()


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode((data + padding).encode("ascii"))


class MFATOTPService:
    """
    Implementación del algoritmo TOTP (Time-Based One-Time Password - RFC 6238 / RFC 4226)
    para verificación de segundo factor (MFA) en roles críticos (`QF` y `ADMIN`).
    """

    ROLES_CRITICOS_MFA_OBLIGATORIO = {"QF", "ADMIN"}
    STEP_SECONDS = 30
    DIGITS = 6

    @classmethod
    def requiere_mfa(cls, usuario: Usuario) -> bool:
        """Determina si el usuario pertenece a un rol crítico que exige MFA obligatorio."""
        return (
            usuario.codigo_rol in cls.ROLES_CRITICOS_MFA_OBLIGATORIO
            or bool(usuario.mfa_habilitado)
            or bool(usuario.rol and usuario.rol.requiere_mfa_obligatorio)
        )

    @classmethod
    def obtener_secreto_usuario(cls, usuario: Usuario) -> bytes:
        """Deriva la semilla criptográfica TOTP única del funcionario."""
        material = f"CESFAM-TOTP-MFA::{settings.SECRET_KEY}::{usuario.rut}::{usuario.username}"
        return hashlib.sha256(material.encode("utf-8")).digest()

    @classmethod
    def generar_codigo_totp(
        cls,
        usuario: Usuario,
        timestamp: Optional[ float ] = None,
        offset_steps: int = 0,
    ) -> str:
        """Genera el código numérico TOTP de 6 dígitos según RFC 6238 para la ventana de 30s."""
        ts = int(timestamp if timestamp is not None else time.time())
        counter = (ts // cls.STEP_SECONDS) + offset_steps
        secret = cls.obtener_secreto_usuario(usuario)

        msg = struct.pack(">Q", counter)
        digest = hmac.new(secret, msg, hashlib.sha1).digest()
        offset = digest[-1] & 0x0F
        truncated = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
        code = truncated % (10**cls.DIGITS)
        return str(code).zfill(cls.DIGITS)

    @classmethod
    def verificar_codigo_totp(
        cls,
        usuario: Usuario,
        codigo_ingresado: str,
        timestamp: Optional[float] = None,
    ) -> bool:
        """
        Valida el código TOTP de 6 dígitos con tolerancia de +/- 1 ventana de 30 segundos
        utilizando comparación en tiempo constante contra ataques de temporización.
        """
        if not codigo_ingresado or not str(codigo_ingresado).strip().isdigit():
            return False
        limpio = str(codigo_ingresado).strip().zfill(cls.DIGITS)
        for step_offset in (-1, 0, 1):
            esperado = cls.generar_codigo_totp(
                usuario,
                timestamp=timestamp,
                offset_steps=step_offset,
            )
            if hmac.compare_digest(limpio, esperado):
                return True
        return False


class JWTService:
    """
    Servicio de emisión, validación y rotación segura de JSON Web Tokens (JWT HS256).
    - Access Token: Expiración corta (15 minutos = 900 segundos).
    - Refresh Token: Expiración de turno asistencial (8 horas = 28.800 segundos) con rotación de un solo uso.
    """

    ACCESS_TOKEN_LIFETIME_SECONDS = 900       # 15 minutos (Expiración corta según RNF-01)
    REFRESH_TOKEN_LIFETIME_SECONDS = 28800    # 8 horas (Turno clínico asistencial)

    @classmethod
    def _firmar_hs256(cls, signing_input: bytes) -> str:
        key = settings.SECRET_KEY.encode("utf-8")
        signature = hmac.new(key, signing_input, hashlib.sha256).digest()
        return _b64url_encode(signature)

    @classmethod
    def codificar_jwt(cls, payload: Dict[str, Any]) -> str:
        header = {"alg": "HS256", "typ": "JWT"}
        header_b64 = _b64url_encode(
            json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8")
        )
        payload_b64 = _b64url_encode(
            json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
        )
        signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
        signature_b64 = cls._firmar_hs256(signing_input)
        return f"{header_b64}.{payload_b64}.{signature_b64}"

    @classmethod
    def decodificar_y_validar_jwt(
        cls,
        token: str,
        expected_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not token or token.count(".") != 2:
            raise AuthenticationFailed("Formato de token JWT inválido.")

        header_b64, payload_b64, sig_recibida = token.split(".")
        signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
        sig_esperada = cls._firmar_hs256(signing_input)

        if not hmac.compare_digest(sig_recibida, sig_esperada):
            raise AuthenticationFailed("Firma criptográfica del token JWT inválida.")

        try:
            payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
        except Exception as exc:
            raise AuthenticationFailed("Payload JWT malformado.") from exc

        ahora = int(time.time())
        if payload.get("exp", 0) < ahora:
            raise AuthenticationFailed("El token JWT ha expirado. Inicie sesión o rote su token.")

        jti = payload.get("jti")
        if jti and jti in _REVOKED_TOKEN_JTIS:
            raise AuthenticationFailed(
                "ALERTA DE SEGURIDAD: El token JWT ya fue rotado o revocado (Prevención de Replay Attack)."
            )

        if expected_type and payload.get("token_type") != expected_type:
            raise AuthenticationFailed(
                f"Se esperaba un token de tipo '{expected_type}', pero se recibió '{payload.get('token_type')}'."
            )

        return payload

    @classmethod
    def emitir_par_tokens(
        cls,
        usuario: Usuario,
        *,
        mfa_verified: bool = False,
    ) -> Dict[str, Any]:
        """
        Emite un par (`access_token`, `refresh_token`) incluyendo metadatos RBAC y estado MFA.
        Si el usuario no pertenece a un rol crítico con MFA obligatorio, `mfa_verified` es True por defecto.
        """
        ahora = int(time.time())
        requiere_mfa = MFATOTPService.requiere_mfa(usuario)
        mfa_efectivo = mfa_verified if requiere_mfa else True

        access_jti = str(uuid.uuid4())
        refresh_jti = str(uuid.uuid4())

        base_claims = {
            "sub": str(usuario.id),
            "user_id": usuario.id,
            "username": usuario.username,
            "rut": usuario.rut,
            "rol": usuario.codigo_rol,
            "mfa_required": requiere_mfa,
            "mfa_verified": mfa_efectivo,
            "iss": "cesfam-farmacia-asistencial-minsal",
            "iat": ahora,
        }

        access_payload = {
            **base_claims,
            "jti": access_jti,
            "token_type": "access",
            "exp": ahora + cls.ACCESS_TOKEN_LIFETIME_SECONDS,
        }
        refresh_payload = {
            **base_claims,
            "jti": refresh_jti,
            "token_type": "refresh",
            "exp": ahora + cls.REFRESH_TOKEN_LIFETIME_SECONDS,
        }

        return {
            "access_token": cls.codificar_jwt(access_payload),
            "refresh_token": cls.codificar_jwt(refresh_payload),
            "token_type": "Bearer",
            "expires_in": cls.ACCESS_TOKEN_LIFETIME_SECONDS,
            "mfa_required": requiere_mfa,
            "mfa_verified": mfa_efectivo,
            "rol_rbac": usuario.codigo_rol,
            "usuario": {
                "id": usuario.id,
                "username": usuario.username,
                "rut": usuario.rut,
                "nombre_completo": f"{usuario.first_name} {usuario.last_name}".strip(),
                "rol": usuario.codigo_rol,
            },
        }

    @classmethod
    def rotar_refresh_token(cls, refresh_token: str) -> Dict[str, Any]:
        """
        Invalida el `refresh_token` utilizado añadiendo su `jti` a la lista de revocación
        y emite un nuevo par de tokens preservando el estado de verificación MFA.
        """
        payload = cls.decodificar_y_validar_jwt(refresh_token, expected_type="refresh")
        _REVOKED_TOKEN_JTIS.add(payload["jti"])

        usuario = Usuario.objects.select_related("rol").filter(
            pk=payload["user_id"], is_active=True
        ).first()
        if not usuario:
            raise AuthenticationFailed("Usuario funcionario inactivo o inexistente.")

        return cls.emitir_par_tokens(
            usuario,
            mfa_verified=bool(payload.get("mfa_verified", False)),
        )

    @classmethod
    def revocar_token(cls, token: str) -> None:
        payload = cls.decodificar_y_validar_jwt(token)
        if "jti" in payload:
            _REVOKED_TOKEN_JTIS.add(payload["jti"])


class CESFAMJWTAuthentication(BaseAuthentication):
    """
    Clase de autenticación DRF para tokens Bearer JWT (`Authorization: Bearer <access_token>`).
    """

    keyword = "Bearer"

    def authenticate(self, request) -> Optional[Tuple[Usuario, Dict[str, Any]]]:
        auth_header = get_authorization_header(request).split()
        if not auth_header or auth_header[0].lower() != self.keyword.lower().encode():
            return None

        if len(auth_header) == 1:
            raise AuthenticationFailed("Cabecera Authorization Bearer sin token JWT.")
        if len(auth_header) > 2:
            raise AuthenticationFailed("Cabecera Authorization Bearer contiene espacios inválidos.")

        token = auth_header[1].decode("utf-8")
        payload = JWTService.decodificar_y_validar_jwt(token, expected_type="access")

        usuario = (
            Usuario.objects.select_related("rol")
            .filter(pk=payload.get("user_id"), is_active=True)
            .first()
        )
        if not usuario:
            raise AuthenticationFailed("El usuario asociado al token JWT no está activo.")

        # Adjuntar bandera MFA al objeto usuario en tiempo de petición para consulta rápida en permisos RBAC
        usuario._jwt_mfa_verified = bool(payload.get("mfa_verified", False))
        usuario._jwt_payload = payload
        return (usuario, payload)
