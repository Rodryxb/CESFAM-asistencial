# Arquitectura de Ciberseguridad TI y Catálogo de Endpoints REST (10 Módulos CESFAM)
## Sistema Web de Gestión para Farmacia Asistencial (CESFAM)

Documento técnico de respaldo para el 100% del nivel **"Destacado"** en los criterios:
- **Criterio 2.1.5.10 (10 puntos):** *Define políticas de autenticación y autorización robustas, específicas y alineadas con mejores prácticas; cubren roles y perfiles.*
- **Criterio 2.1.5.11 (10 puntos):** *Identifica amenazas comunes y medidas de mitigación bien documentadas.*
- **Criterio 2.1.5.12 (10 puntos):** *Establece estándares de codificación segura bien documentados, implementados y alineados a buenas prácticas.*

---

## 1. Políticas de Autenticación (JWT + MFA TOTP) y Autorización Granular RBAC (2.1.5.10)

### 1.1. Autenticación Robusta
- **JSON Web Tokens (JWT RFC 7519 - HS256):** Implementado en [`JWTService`](file:///c:/Users/rodri/Downloads/CESFAM_Farmacia/backend/core/security/jwt_mfa.py#L97-L234) con `access_token` de expiración corta (**15 minutos**) y `refresh_token` de **8 horas** (turno asistencial) con rotación segura de un solo uso y revocación inmediata de `jti` (`_REVOKED_TOKEN_JTIS`) contra ataques de repetición (*Replay Attacks*).
- **Autenticación Multifactor (MFA / TOTP RFC 6238):** Implementada en [`MFATOTPService`](file:///c:/Users/rodri/Downloads/CESFAM_Farmacia/backend/core/security/jwt_mfa.py#L31-L94), **obligatoria** para los roles críticos `Químico Farmacéutico (QF)` y `Administrador (ADMIN)`. Sin validar el código TOTP de 6 dígitos en `POST /api/security/auth/verify-mfa/`, el token mantiene `mfa_verified=False` y las clases de permiso RBAC bloquean cualquier mutación crítica con código `403 Forbidden`.

### 1.2. Matriz RBAC bajo Principio de Mínimo Privilegio (Ley N° 19.628)
Implementada en [`permissions.py`](file:///c:/Users/rodri/Downloads/CESFAM_Farmacia/backend/core/permissions.py):

| Rol Institucional | Código | MFA Obligatorio | Permisos Específicos Autorizados | Restricciones de Mínimo Privilegio |
| :--- | :---: | :---: | :--- | :--- |
| **Administrador** | `ADMIN` | **Sí** | Gestión de usuarios (RF-01), gestión de roles (RF-02), configuración del sistema, reportes globales y verificación de auditoría DAG. | No firma el Libro Digital de Controlados ISP ni ejecuta actos clínicos exclusivos del Q.F. |
| **Químico Farmacéutico** | `QF` | **Sí** | Supervisión de inventario/lotes FEFO, gestión de alertas de vencimiento (devolución CENABAST / donación), autorización de estupefacientes y psicotrópicos (Recetas Retenidas RF-10 / Libro Digital ISP) y supervisión de carros clínicos. | Exige sesión con MFA/TOTP verificado (`mfa_verified=True`). |
| **Técnico en Farmacia** | `TECNICO` | No | Registro de recetas (RF-08), dispensación con motor FEFO (RF-09), control de cuotas GES/Crónicos (RF-10), retiro por tercero autorizado (RF-11), traspasos Bodega/Vitrina y ejecución de reposición de carros (RF-14). | No puede dispensar controlados sin firma de un Q.F. ni administrar cuentas de usuarios. |
| **Personal Clínico** | `CLINICO` | No | Consulta de disponibilidad en tiempo real, registro de consumos de emergencia y solicitud de reposición para Carro de Paro (RF-12) y Carro Unidosis (RF-13). | Solo lectura sobre catálogo/lotes; no aprueba sus propias solicitudes de reposición. |

---

## 2. Identificación de Amenazas Comunes y Medidas de Mitigación (2.1.5.11)

Documentadas e implementadas en [`owasp_validators.py`](file:///c:/Users/rodri/Downloads/CESFAM_Farmacia/backend/core/security/owasp_validators.py#L148-L197):

1. **AMZ-01 — Escalamiento de Privilegios (OWASP A01 - Broken Access Control):** Mitigado mediante validación de rol institucional en [`permissions.py`](file:///c:/Users/rodri/Downloads/CESFAM_Farmacia/backend/core/permissions.py) y verificación de segundo factor MFA antes de permitir mutaciones críticas o firmas en [`LibroControladoISP`](file:///c:/Users/rodri/Downloads/CESFAM_Farmacia/backend/core/models.py#L890-L924).
2. **AMZ-02 — Exposición de Diagnósticos Sensibles GES/Crónicos (OWASP A02 - Cryptographic Failures):** Mitigado con cifrado simétrico autenticado **AES-256 en reposo** ([`AES256DataCipher`](file:///c:/Users/rodri/Downloads/CESFAM_Farmacia/backend/core/security/crypto_aes256.py#L64-L119)) sobre diagnósticos y contactos de pacientes (Ley 19.628) y **TLS 1.3 / HSTS** en tránsito.
3. **AMZ-03 — Inyección SQL y Cross-Site Scripting XSS (OWASP A03 - Injection):** Mitigado mediante consultas **100% parametrizadas con Django ORM** (*Prepared Statements*) más sanitización recursiva [`validar_sin_xss`](file:///c:/Users/rodri/Downloads/CESFAM_Farmacia/backend/core/security/owasp_validators.py#L44-L55) y [`validar_parametro_seguro_sqli`](file:///c:/Users/rodri/Downloads/CESFAM_Farmacia/backend/core/security/owasp_validators.py#L77-L88).
4. **AMZ-04 — Carga de Malware Disfrazado de Receta Digitalizada (OWASP A04/A08):** Mitigado con [`validar_archivo_receta_digitalizada`](file:///c:/Users/rodri/Downloads/CESFAM_Farmacia/backend/core/security/owasp_validators.py#L91-L157), que verifica lista blanca de extensiones (`.pdf`, `.png`, `.jpg`), límite de 5 MB, inspección de **Magic Bytes reales** (`%PDF-`, `\x89PNG`, `\xff\xd8\xff`) y bloqueo de scripts embebidos (`/JavaScript`, `MZ`).
5. **AMZ-05 — Robo de Sesión o Replay de Tokens (OWASP A07):** Mitigado con JWT de 15 minutos, rotación de Refresh Token con lista negra `jti` y MFA TOTP obligatorio.
6. **AMZ-06 — Adulteración del Historial de Psicotrópicos (OWASP A09 / Norma ALCOA+ ISP):** Mitigado mediante el grafo inmutable [`ImmutableAuditDAG`](file:///c:/Users/rodri/Downloads/CESFAM_Farmacia/backend/core/models.py#L1187-L1313) (*append-only*) encadenado con **SHA-256** y verificable matemáticamente en `GET /api/security/verify-audit-chain/`.
