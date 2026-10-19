"""
Configuración de Django para el Sistema Web de Gestión para Farmacia Asistencial (CESFAM).

Arquitectura Limpia de 3 Capas:
- Backend API: Python + Django REST Framework
- Base de Datos Híbrida: PostgreSQL Relacional (PK/FK estrictas) + No Estructurada (JSONB con Índices GIN)
- Cumplimiento Normativo: Código Sanitario, Ley 21.198 (CENABAST), Decreto 404/405 ISP,
  Norma ALCOA+ (Auditoría Inmutable DAG) y Ley 19.628 (Protección de Datos Sensibles).
- Exclusión Estricta Sector Público: CERO ventas comerciales, POS, boletas/facturas, Isapres o precios comerciales.
"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get(
    "SECRET_KEY",
    "django-insecure-cesfam-minsal-alcoa-plus-sha256-aes256-aps-chile-2026",
)

DEBUG = os.environ.get("DEBUG", "True").lower() in ("true", "1", "yes")

ALLOWED_HOSTS = ["localhost", "127.0.0.1", "testserver", "*"]

# Application definition
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # API RESTful
    "rest_framework",
    # Núcleo Arquitectónico Farmacia Asistencial CESFAM
    "core.apps.CoreConfig",
]

SILENCED_SYSTEM_CHECKS = []
try:
    import psycopg  # noqa: F401
    INSTALLED_APPS.insert(6, "django.contrib.postgres")
except ImportError:
    try:
        import psycopg2  # noqa: F401
        INSTALLED_APPS.insert(6, "django.contrib.postgres")
    except ImportError:
        SILENCED_SYSTEM_CHECKS.append("postgres.E005")

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "core.middleware.CESFAMSecurityAndAuditDAGMiddleware",
]

ROOT_URLCONF = "cesfam_project.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "cesfam_project.wsgi.application"
ASGI_APPLICATION = "cesfam_project.asgi.application"

# Configuración de Base de Datos Híbrida (PostgreSQL Primario + Soporte Local)
DB_ENGINE = os.environ.get("DB_ENGINE", "sqlite").lower()

if DB_ENGINE in ("postgresql", "postgres", "pgsql"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ.get("POSTGRES_DB", "cesfam_farmacia_db"),
            "USER": os.environ.get("POSTGRES_USER", "postgres"),
            "PASSWORD": os.environ.get("POSTGRES_PASSWORD", "postgres"),
            "HOST": os.environ.get("POSTGRES_HOST", "localhost"),
            "PORT": os.environ.get("POSTGRES_PORT", "5432"),
            "ATOMIC_REQUESTS": True,
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "cesfam_farmacia.sqlite3",
            "ATOMIC_REQUESTS": True,
        }
    }

# Modelo de Usuario Institucional RBAC (Administrador, Q.F., Técnico en Farmacia, Personal Clínico)
AUTH_USER_MODEL = "core.Usuario"

# Validadores de contraseña robustos (Seguridad TI - Sección 3.4.3 Evaluación 1)
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Configuración Regional Chilena (MINSAL / ISP)
LANGUAGE_CODE = "es-cl"
TIME_ZONE = "America/Santiago"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Configuración Django REST Framework con Autenticación JWT + MFA y Sesiones
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "core.security.jwt_mfa.CESFAMJWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework.authentication.BasicAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "core.permissions.IsAuthenticatedOrReadOnlyCESFAM",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ],
}

# Parámetros de Seguridad Forzados OWASP Top 10 / TLS 1.3 / Ley 19.628 (Sección 3.4.3 Evaluación 1)
SESSION_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Strict"
CSRF_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SAMESITE = "Strict"
SECURE_HSTS_SECONDS = 63072000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

# Parámetros Normativos Farmacia Asistencial CESFAM
CESFAM_CONFIG = {
    "ESTABLECIMIENTO_NOMBRE": "CESFAM Dr. Salvador Allende Gossens - Red APS MINSAL",
    "CODIGO_DEIS_MINSAL": "112304",
    "SERVICIO_SALUD": "Servicio de Salud Metropolitano Occidente",
    "HORIZONTE_PREDICCION_DIAS": 90,
    "FACTOR_SEGURIDAD_CENABAST": 0.15,  # +15% stock de seguridad asistencial
    "UMBRAL_VENCIMIENTO_CRITICO_DIAS": 30,  # Semáforo ROJO
    "UMBRAL_VENCIMIENTO_ALERTA_DIAS": 90,   # Semáforo AMARILLO (< 3 meses según HU-3)
}
