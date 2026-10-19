# Reporte de Certificación QA y Ejecución de Pruebas — Sistema Web de Gestión para Farmacia Asistencial CESFAM

**Establecimiento:** CESFAM Dr. Salvador Allende (Red Pública de Salud MINSAL)  
**Naturaleza del Sistema:** Farmacia Pública Asistencial (Dispensación 100% Gratuita, Control de Cuotas GES/AUGE y Crónicos, Carros Clínicos y Trazabilidad ISP — *Cero Ventas Comerciales / Cero POS*)  
**Criterios de Rúbrica Certificados (Nivel Destacado):**
- **2.1.6.13 (10 pts):** Plan de pruebas completo y ejecutado, con resultados bien documentados (pruebas unitarias, de integración, de seguridad RBAC/ALCOA+ y de rendimiento RNF-03).
- **2.1.6.14 (5 pts):** Uso balanceado y efectivo de herramientas automatizadas y manuales.

---

## 1. Estrategia QA y Uso Balanceado de Herramientas Automatizadas y Manuales (Criterio 2.1.6.14)

Para garantizar cobertura funcional, matemática, sanitaria y de experiencia de usuario ("Cero Fricción"), el plan de aseguramiento de calidad combina estratégicamente **herramientas automatizadas** (para invariantes algorítmicas, seguridad criptográfica y carga concurrente) con **pruebas manuales estructuradas** (para usabilidad asistencial, accesibilidad visual e inspección clínica):

| Dimensión de Calidad | Enfoque (Automatizado vs. Manual) | Herramienta / Entorno Utilizado | Justificación Técnica (Criterio 2.1.6.14) |
| :--- | :--- | :--- | :--- |
| **Algoritmos Críticos y Reglas Sanitarias** (FEFO, Módulo 11, Cuotas GES/Crónicos) | **Automatizado (Unitario)** | `Django TestRunner` / `unittest` (`test_cesfam_core.py`) | Verifica de forma determinista el ordenamiento matemático de fechas de vencimiento (`fecha_vencimiento ASC`), bloqueo de lotes expirados y cálculo del dígito verificador Módulo 11 sin margen de error humano. |
| **Integración Transaccional y Seguridad RBAC / JWT / MFA** | **Automatizado (Integración API)** | `rest_framework.test.APIClient` (`test_cesfam_core.py` y `core/tests.py`) | Comprueba transacciones atómicas (`select_for_update`) en reposición de Carros de Paro/Unidosis, firmas SHA-256 en el Libro Digital ISP y respuestas estrictas `HTTP 403 Forbidden` ante accesos no autorizados por rol. |
| **Integridad Criptográfica ALCOA+ (ISP)** | **Automatizado (Seguridad de Datos)** | `AuditDAGService` + Inyección SQL controlada en test (`test_e1`) | Recalcula los hashes SHA-256 eslabón por eslabón sobre el grafo `ImmutableAuditDAG` y simula un intento de adulteración en base de datos para certificar la detección de anomalías. |
| **Rendimiento y Tiempo de Respuesta (RNF-03 < 3,0 s)** | **Automatizado (Carga y Estrés Concurrente)** | Python `ThreadPoolExecutor` (`benchmark_rnf03_cesfam.py`) | Ejecuta 60 operaciones simultáneas con 12 hilos concurrentes midiendo latencias mínimas, medias, P50, P95, P99 y máximas bajo contención real. |
| **Tipado Estricto y Empaquetado Frontend** | **Automatizado (Análisis Estático)** | `TypeScript 5.6 (tsc)` + `Vite 5.4 Build` | Certifica ausencia de errores de tipos en los contratos de datos (`src/types/cesfam.ts`) y compilación limpia del bundle de producción. |
| **Usabilidad "Cero Fricción", Accesibilidad MINSAL y Flujos Clínicos** | **Manual Estructurado (Caja Negra / UX)** | Inspección interactiva en navegador + Matriz de Casos Manuales (`CP-MAN-01` a `CP-MAN-06`) | Evalúa aspectos perceptuales y ergonómicos que requieren juicio humano: modo Alto Contraste, escalado tipográfico (16px/20px), claridad del `HelpBanner` de 3 pasos, semáforos textuales y comprobante de entrega digital. |

---

## 2. Matriz Completa de Casos de Prueba Ejecutados (Criterio 2.1.6.13)

### 2.1. Matriz de Pruebas Automatizadas (Unitarias, Integración, Seguridad y Rendimiento)

| ID Caso | Categoría / Nivel | Descripción del Caso de Prueba | Datos de Entrada | Resultado Esperado | Resultado Obtenido | Estado |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **CP-AUTO-01** | Unitaria / Integración (`test_a1`) | **Algoritmo FEFO y bloqueo automático de vencidos:** Preselección del lote hábil con vencimiento más cercano y bloqueo de lotes expirados. | Medicamento: `Losartán 50 mg` (`CEN-100101`). Lotes: `LOT-LOS-2024-VENC` (-12d), `LOT-LOS-EXP-HOY` (0d), `LOT-LOS-2026-AMAR` (+45d), `LOT-LOS-2027-VERD` (+270d). Cantidad: `25` en `VITRINA`. | Lotes con vencimiento $\le$ hoy cambian a `VENCIDO` (`es_habil_fefo=False`). El motor selecciona `LOT-LOS-2026-AMAR` (+45d, semáforo `AMARILLO`) antes que el lote verde (+270d). | Lotes vencidos bloqueados automáticamente; `LOT-LOS-2026-AMAR` preseleccionado con 25 unidades. | **APROBADO** |
| **CP-AUTO-02** | Unitaria / Integración (`test_a2`) | **Partición multi-lote FEFO y rechazo por stock insuficiente:** Asignación combinada agotando primero el lote más próximo a vencer sin tocar lotes vencidos. | `Losartán 50 mg` en `VITRINA`: solicitud de `80` unidades (60 en `LOT-LOS-2026-AMAR` + 20 en `LOT-LOS-2027-VERD`); luego solicitud de `160` unidades (> stock hábil total). | 1° llamada: asigna 60 de `LOT-LOS-2026-AMAR` y 20 de `LOT-LOS-2027-VERD`. 2° llamada: lanza `ValidationError` sin utilizar las 40 unidades del lote vencido. | Partición exacta `[60, 20]` y bloqueo con `ValidationError` ante exceso sobre stock hábil. | **APROBADO** |
| **CP-AUTO-03** | Unitaria (`test_b1`) | **Validación matemática de RUT chileno (Módulo 11):** Verificación de serie `[2,3,4,5,6,7]`, casos DV `'0'`, `'K'` y rechazo de RUTs inválidos. | Válidos: `11.111.111-1`, `12.345.678-5`, `7.654.321-6`, `10000013-K`, `10000004-0`. Inválidos: `12.345.678-9`, `11.111.111-K`, `123-4`, `AB.CDE.FGH-1`, `""`. | Acepta y normaliza todos los RUTs válidos al formato `XXXXXXXX-DV`; lanza `ValidationError` en el 100% de los casos inválidos. | 5/5 válidos normalizados (`DV` exacto) y 5/5 inválidos rechazados con `ValidationError`. | **APROBADO** |
| **CP-AUTO-04** | Integración Transaccional (`test_b2`) | **Control de cuotas de entrega para pacientes Crónicos y GES/AUGE:** Imputación de cuota, reprogramación a +30 días y bloqueo al agotar cuotas. | Paciente `9123456-9`, Programa `FOFAR-PSCV-CRON`, `Paracetamol 500 mg`, `cuotas_totales=2`, `cuotas_consumidas=1`, Receta `REC-CRON-QA-2026-01` (30 u.). | Al dispensar: `cuotas_consumidas=2`, `cuotas_pendientes=0`, `estado=FINALIZADA`, `fecha_proximo_retiro = hoy + 30d`. Un retiro adicional lanza `ValidationError`. | Cuota #2 imputada, inscripción pasa a `FINALIZADA` y el retiro extra es bloqueado. | **APROBADO** |
| **CP-AUTO-05** | Seguridad RBAC (`test_c1`) | **Control de acceso basado en roles (RBAC):** Bloqueo HTTP 403 para rol `Personal Clínico` en recetas retenidas y gestión de usuarios. | Usuario autenticado: `enf.matias.herrera` (`rol=CLINICO`). Peticiones a: `GET /api/libro-controlados-isp/`, `GET /api/recetas/?tipo_receta=RETENIDA`, `POST /api/recetas/`, `POST /api/dispensaciones/ejecutar-fefo/`, `GET/POST /api/usuarios/`, `GET /api/roles/`. | Todas las peticiones deben ser rechazadas con código **HTTP 403 Forbidden** conforme al Principio de Mínimo Privilegio (Ley 19.628). | 100% de los endpoints restringidos respondieron `HTTP 403 Forbidden`. | **APROBADO** |
| **CP-AUTO-06** | Integración Transaccional (`test_d1`) | **Flujo transaccional de reposición de Carro de Paro y Carro Unidosis:** Descuento automático en Bodega (FEFO) y aumento en el carro clínico. | 1) Carro de Paro `CP-SAPU-01`: reponer `4` ampollas de `Adrenalina 1 mg/mL` (`LOT-ADR-2026-AMAR`). 2) Carro Unidosis `CU-PROC-01`: reponer `25` comp. de `Paracetamol 500 mg` (`LOT-PAR-2027-VERD`). | Bodega Adrenalina: $35 \to 31$; Carro Paro: $14 \to 18$. Bodega Paracetamol: $1200 \to 1175$; Carro Unidosis: $90 \to 115$. Estado carros: `SELLADO_OPERATIVO`. | Descuento exacto en Bodega, incremento exacto en ambos carros, asiento `REPOSICION_CARRO` y sellos actualizados. | **APROBADO** |
| **CP-AUTO-07** | Seguridad Criptográfica (`test_e1`) | **Integridad matemática del log inmutable (`ImmutableAuditDAG`):** Verificación de cadena SHA-256 ALCOA+, bloqueo append-only y detección de corrupción SQL. | Cadena de nodos en `immutable_audit_dag`; intento de `.save()`, `.delete()`, `QuerySet.update()`; inyección de hash corrupto `'f'*64` vía cursor SQL directo. | ORM lanza `PermissionDenied` en edición/borrado. Ante alteración SQL, `verificar_integridad_cadena()` retorna `cadena_integra=False` e identifica el nodo adulterado. | Bloqueo `PermissionDenied` activo; adulteración SQL detectada al 100% y restaurada. | **APROBADO** |
| **CP-AUTO-08** | Seguridad JWT + MFA (`test_07`) | **Autenticación JWT de corta duración, MFA TOTP obligatorio (QF/Admin) y rotación Anti-Replay.** | Login `qf.nataly.caamano` sin TOTP $\to$ `POST /api/alertas/` $\to$ `POST /api/security/auth/verify-mfa/` con TOTP RFC 6238 $\to$ `POST /api/security/auth/refresh/` reutilizando token. | Sin MFA verificado recibe `403`. Con TOTP válido obtiene `mfa_verified=True`. Al reutilizar un `refresh_token` ya rotado recibe `401/403`. | Challenge MFA exigido, TOTP validado y ataque de Replay bloqueado. | **APROBADO** |
| **CP-AUTO-09** | Seguridad OWASP y Ley 19.628 (`test_09`, `test_10`) | **Cifrado AES-256-CTR+HMAC en reposo, sanitización XSS/SQLi y validación de archivos por Magic Bytes.** | Ficha sensible de paciente (`datos_sensibles_cifrados`), payload `<script>alert(1)</script>`, payload `' UNION SELECT--`, archivo `.exe` renombrado a `.pdf` (`MZ\x90...`). | Criptograma adulterado lanza `ValueError` (HMAC). Payloads XSS/SQLi y ejecutable disfrazado lanzan `ValidationError`. PDF legítimo `%PDF-1.4` es aceptado. | 100% de vectores maliciosos bloqueados y cifrado AEAD verificado. | **APROBADO** |
| **CP-AUTO-10** | Rendimiento y Estrés (`benchmark_rnf03`) | **Cumplimiento RNF-03 (Tiempo de respuesta < 3,0 segundos bajo carga concurrente).** | `60` peticiones HTTP simultáneas distribuidas en `12` hilos concurrentes (`ThreadPoolExecutor`) sobre catálogo FEFO, cálculo de lote FEFO, dashboard IA, auditoría DAG y traspasos de stock. | 100% de respuestas con código `200/201` y latencia máxima estrictamente $< 3.000\text{ ms}$ ($3,0\text{ s}$). | `60/60` exitosas (`100%`). Latencia promedio: `195,86 ms`, P95: `606,96 ms`, P99: `637,91 ms`, Máxima: `772,62 ms` ($< 3.000\text{ ms}$). | **APROBADO** |

---

### 2.2. Matriz de Pruebas Manuales de Interfaz UX/UI y Flujos Asistenciales (Criterio 2.1.6.14)

| ID Caso | Vista / Componente | Descripción del Caso de Prueba Manual | Datos de Entrada / Acción del Usuario | Resultado Esperado | Resultado Obtenido | Estado |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **CP-MAN-01** | `Layout.tsx` (Barra de Accesibilidad y RBAC) | **Verificación de Alto Contraste, Tamaño de Letra y Selector Rápido de Rol RBAC.** | 1) Clic en `Alto Contraste`. 2) Clic en letra `Grande`. 3) Cambiar selector de rol entre `Técnico en Farmacia`, `Q.F.`, `Personal Clínico` y `Admin`. | 1) Fondo negro `#000` con textos/bordes en blanco y amarillo `#FFE600`. 2) Raíz HTML escala de `16px` a `20px`. 3) El menú lateral filtra en tiempo real las vistas permitidas según el rol seleccionado. | Conmutación instantánea de clases `alto-contraste` y `fuente-grande`; menú lateral sincronizado por RBAC. | **APROBADO** |
| **CP-MAN-02** | `Dispensacion.tsx` (Wizard Paso 1) | **Validación interactiva de RUT Módulo 11 y botón "Simular Escaneo de Cédula QR".** | 1) Ingresar RUT inválido `12345678-9` y presionar Buscar. 2) Presionar el botón `"Simular Escaneo de Cédula QR"`. | 1) Muestra alerta clara indicando dígito verificador esperado (`-5`). 2) Autocompleta a la beneficiaria `María González Pérez (12345678-5, FONASA A)` y avanza al Paso 2. | Alerta Módulo 11 visible con `role="alert"`; autocompletado QR inmediato hacia el Paso 2. | **APROBADO** |
| **CP-MAN-03** | `Dispensacion.tsx` (Wizard Pasos 2 y 3) | **Selección de receta con etiqueta FEFO y emisión de Comprobante de Entrega Digital.** | Seleccionar receta `RX-10231 (Crónicos)`, verificar lote resaltado y presionar el botón gigante `"Entregar Medicamentos"`. | Muestra etiqueta `"Prioridad Próximo a Vencer"` sobre el lote FEFO (`MET-2401`) junto al semáforo textual `"Próximo a Vencer"`. En Paso 3 genera comprobante digital sin costo con folio único y botón de impresión. | Lote FEFO resaltado con icono + etiqueta textual; comprobante gratuito generado con opción de imprimir. | **APROBADO** |
| **CP-MAN-04** | `CarrosClinicos.tsx` y `PanelQF.tsx` | **Solicitud de reposición de Carros Clínicos y acceso al Libro Digital de Controlados.** | 1) En `Carros Clínicos`, presionar `"Solicitar Reposición Inmediata"` en `CP-01`. 2) Con rol `Q.F.`, abrir `Panel Q.F.` y cambiar a la pestaña `"Libro Digital de Controlados"`. | 1) El carro registra la hora exacta de solicitud y notifica a Farmacia. 2) El Panel Q.F. muestra existencias separadas (`Bodega` vs `Vitrina`) y despliega los folios de recetas retenidas (Psicotrópicos y Estupefacientes). | Estado de solicitud actualizado en tiempo real y pestaña de controlados ISP visible con saldos por folio. | **APROBADO** |
| **CP-MAN-05** | `Dashboard.tsx` y `Administracion.tsx` | **KPIs con semáforos textuales, exportación PDF/Excel y verificación ALCOA+ (ISP).** | 1) Revisar KPIs en `Inicio` y pulsar `"Exportar Reporte a PDF"` / `"Exportar a Excel"`. 2) Con rol `Admin`, ir a `Administración` y pulsar `"Verificar Cadena ALCOA+ (ISP)"`. | 1) KPIs muestran `Alertas de Vencimiento`, `Quiebres de Stock` y `Dispensaciones de Hoy` con etiquetas textuales (`Próximo a Vencer`, `Stock Crítico`, `Stock Seguro`). 2) El verificador recorre los eslabones SHA-256 y confirma `"✔ Íntegro"`. | KPIs y botones de exportación operativos; animación y verificación de eslabones SHA-256 completada con éxito. | **APROBADO** |
| **CP-MAN-06** | Auditoría Global de Negocio | **Exclusión estricta de elementos comerciales (Regla de Negocio CESFAM).** | Inspección completa de las 5 vistas del Frontend y de los modelos/endpoints del Backend (`test_02_exclusion_estricta_sector_publico`). | Cero precios, cero carritos de compra, cero boletas/facturas, cero POS y cero Isapres en toda la aplicación. | Cumplimiento 100% institucional de salud pública gratuita APS/MINSAL. | **APROBADO** |

---

## 3. Análisis Detallado de la Prueba de Rendimiento y Estrés (RNF-03)

El requerimiento no funcional **RNF-03** exige que las operaciones críticas de consulta de stock, cálculo FEFO y dispensación respondan en **menos de 3,0 segundos ($3.000\text{ ms}$)**. Mediante el script automatizado [`benchmark_rnf03_cesfam.py`](file:///c:/Users/rodri/Downloads/CESFAM_Farmacia/benchmark_rnf03_cesfam.py), se ejecutó una ráfaga concurrente de **60 transacciones distribuidas en 12 hilos simultáneos**:

| Endpoint / Operación Evaluada bajo Concurrencia (12 Hilos) | Peticiones ($n$) | Latencia Promedio | Latencia Máxima | Límite RNF-03 | Cumplimiento |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `GET /api/medicamentos/` (Catálogo Arsenal + Lotes FEFO) | 12 | `101,59 ms` | `215,95 ms` | `< 3.000,00 ms` | **OK (7,2% del límite)** |
| `GET /api/medicamentos/{id}/proximo-lote-fefo/` (Cálculo FEFO en vivo) | 12 | `91,36 ms` | `202,15 ms` | `< 3.000,00 ms` | **OK (6,7% del límite)** |
| `GET /api/dashboard-resumen/` (KPIs + Predicción Demanda IA 90 días) | 12 | `187,46 ms` | `346,84 ms` | `< 3.000,00 ms` | **OK (11,6% del límite)** |
| `GET /api/security/verify-audit-chain/` (Verificación SHA-256 ALCOA+) | 12 | `66,70 ms` | `176,12 ms` | `< 3.000,00 ms` | **OK (5,9% del límite)** |
| `POST /api/lotes/traspasar-bodega-vitrina/` (Escritura Transaccional FEFO + DAG) | 12 | `532,18 ms` | `772,62 ms` | `< 3.000,00 ms` | **OK (25,8% del límite)** |
| **GLOBAL CONSOLIDADO (60 Operaciones Concurrentes)** | **60** | **`195,86 ms`** | **`772,62 ms`** | **`< 3.000,00 ms`** | **100% APROBADO** |

- **Mediana (P50):** `126,99 ms`
- **Percentil 95 (P95):** `606,96 ms`
- **Percentil 99 (P99):** `637,91 ms`
- **Throughput sostenido:** `33,87 req/seg`

---

## 4. Evidencias de Ejecución de Consola (Listas para Informe Final)

### 4.1. Evidencia de Pruebas Unitarias, Integrales y de Seguridad (`python test_cesfam_core.py`)

```text
$ python test_cesfam_core.py
Creating test database for alias 'default' ('file:memorydb_default?mode=memory&cache=shared')...
Found 18 test(s).
Operations to perform:
  Synchronize unmigrated apps: messages, rest_framework, staticfiles
  Apply all migrations: admin, auth, contenttypes, core, sessions
Running migrations:
  Applying core.0001_initial... OK
  Applying core.0002_alter_paciente_datos_sensibles_cifrados... OK
  Applying sessions.0001_initial... OK

test_a1_fefo_preselecciona_lote_habil_mas_proximo_y_bloquea_vencidos (core.test_cesfam_core.CesfamCoreQATestSuite.test_a1_fefo_preselecciona_lote_habil_mas_proximo_y_bloquea_vencidos)
[CP-AUTO-01] Verifica matemáticamente que el motor FEFO: ... ok
test_a2_fefo_particion_multilote_y_rechazo_cuando_solo_hay_vencidos (core.test_cesfam_core.CesfamCoreQATestSuite.test_a2_fefo_particion_multilote_y_rechazo_cuando_solo_hay_vencidos)
[CP-AUTO-02] Verifica que si la cantidad solicitada supera el stock del primer lote FEFO, ... ok
test_b1_validacion_matematica_rut_chileno_modulo_11 (core.test_cesfam_core.CesfamCoreQATestSuite.test_b1_validacion_matematica_rut_chileno_modulo_11)
[CP-AUTO-03] Verifica matemáticamente el algoritmo Módulo 11 para RUT chileno: ... ok
test_b2_control_cuotas_entrega_pacientes_cronicos_y_ges_auge (core.test_cesfam_core.CesfamCoreQATestSuite.test_b2_control_cuotas_entrega_pacientes_cronicos_y_ges_auge)
[CP-AUTO-04] Verifica el control transaccional de cuotas para pacientes Crónicos y GES/AUGE: ... ok
test_c1_rbac_personal_clinico_recibe_403_en_recetas_retenidas_y_usuarios (core.test_cesfam_core.CesfamCoreQATestSuite.test_c1_rbac_personal_clinico_recibe_403_en_recetas_retenidas_y_usuarios)
[CP-AUTO-05] Verifica que un usuario autenticado con rol "Personal Clínico" (`CLINICO`) ... ok
test_d1_flujo_transaccional_reposicion_carro_paro_y_carro_unidosis (core.test_cesfam_core.CesfamCoreQATestSuite.test_d1_flujo_transaccional_reposicion_carro_paro_y_carro_unidosis)
[CP-AUTO-06] Verifica el flujo transaccional extremo a extremo para: ... ok
test_e1_integridad_matematica_log_inmutable_sha256_alcoa_plus (core.test_cesfam_core.CesfamCoreQATestSuite.test_e1_integridad_matematica_log_inmutable_sha256_alcoa_plus)
[CP-AUTO-07] Verifica matemáticamente la cadena criptográfica de `ImmutableAuditDAG`: ... ok
test_01_validador_modulo_11_rut_chileno (core.tests.CesfamArquitecturaYSeguridadTests.test_01_validador_modulo_11_rut_chileno)
Verifica que el validador Módulo 11 acepte RUTs válidos y rechace dígitos verificadores erróneos. ... ok
test_02_exclusion_estricta_sector_publico (core.tests.CesfamArquitecturaYSeguridadTests.test_02_exclusion_estricta_sector_publico)
Verifica que no existan roles de venta ni atributos comerciales (precios, boletas, Isapres). ... ok
test_03_motor_fefo_bloquea_vencidos_y_prioriza_proximo_a_vencer (core.tests.CesfamArquitecturaYSeguridadTests.test_03_motor_fefo_bloquea_vencidos_y_prioriza_proximo_a_vencer)
Verifica bloqueo automático de lotes vencidos y selección FEFO del más próximo a vencer. ... ok
test_04_prediccion_demanda_90_dias_cenabast (core.tests.CesfamArquitecturaYSeguridadTests.test_04_prediccion_demanda_90_dias_cenabast)
Verifica el algoritmo de Predicción de Demanda a 90 días y sugerencia CENABAST. ... ok
test_05_immutable_audit_dag_alcoa_plus_y_cadena_sha256 (core.tests.CesfamArquitecturaYSeguridadTests.test_05_immutable_audit_dag_alcoa_plus_y_cadena_sha256)
Verifica inmutabilidad append-only y verificación criptográfica SHA-256 de ImmutableAuditDAG. ... ok
test_06_hl7_fhir_validation_log_recursos_no_estructurados (core.tests.CesfamArquitecturaYSeguridadTests.test_06_hl7_fhir_validation_log_recursos_no_estructurados)
Verifica persistencia JSONB de Patient, Coverage y MedicationRequest en HL7FHIRValidationLog. ... ok
test_07_autenticacion_jwt_mfa_totp_y_rotacion_segura (core.tests.CesfamArquitecturaYSeguridadTests.test_07_autenticacion_jwt_mfa_totp_y_rotacion_segura)
Verifica el flujo completo de autenticación JWT + MFA obligatorio para rol crítico (`QF`): ... ok
test_08_matriz_rbac_principio_minimo_privilegio (core.tests.CesfamArquitecturaYSeguridadTests.test_08_matriz_rbac_principio_minimo_privilegio)
Verifica el cumplimiento del principio de mínimo privilegio (Criterio 2.1.5.10): ... ok
test_09_cifrado_simetrico_aes256_en_reposo_ley_19628 (core.tests.CesfamArquitecturaYSeguridadTests.test_09_cifrado_simetrico_aes256_en_reposo_ley_19628)
Verifica el cifrado simétrico autenticado AES-256 en reposo para diagnósticos y datos ... ok
test_10_mitigacion_owasp_xss_sqli_y_validador_archivos (core.tests.CesfamArquitecturaYSeguridadTests.test_10_mitigacion_owasp_xss_sqli_y_validador_archivos)
Verifica sanitización contra XSS, bloqueo de patrones SQLi y validación de archivos ... ok
test_11_endpoint_verificador_criptografico_dag_y_10_modulos_api (core.tests.CesfamArquitecturaYSeguridadTests.test_11_endpoint_verificador_criptografico_dag_y_10_modulos_api)
Verifica el endpoint `GET /api/security/verify-audit-chain/`, las cabeceras de seguridad HSTS/CSP ... ok

----------------------------------------------------------------------
Ran 18 tests in 9.088s

OK
Destroying test database for alias 'default' ('file:memorydb_default?mode=memory&cache=shared')...
 OK
System check identified no issues (4 silenced).
```

### 4.2. Evidencia de Prueba de Rendimiento y Tiempo de Respuesta RNF-03 (`python benchmark_rnf03_cesfam.py`)

```text
$ python benchmark_rnf03_cesfam.py
========================================================================================
BENCHMARK DE RENDIMIENTO Y ESTRÉS CONCURRENTE - RNF-03 (< 3.0 SEGUNDOS)
Sistema Web de Gestión para Farmacia Asistencial CESFAM
========================================================================================
Hilos concurrentes (Workers) : 12
Total peticiones ejecutadas  : 60
Peticiones exitosas (< 3.0s) : 60/60 (100.0%)
Tiempo total de ráfaga       : 1.771 s
Throughput alcanzado         : 33.87 req/seg
----------------------------------------------------------------------------------------
Latencia Mínima              : 3.77 ms
Latencia Promedio            : 195.86 ms
Latencia Mediana (P50)       : 126.99 ms
Latencia Percentil 95 (P95)  : 606.96 ms
Latencia Percentil 99 (P99)  : 637.91 ms
Latencia Máxima              : 772.62 ms  [Umbral máximo RNF-03: 3000.00 ms]
----------------------------------------------------------------------------------------
  * GET /api/medicamentos/{id}/proximo-lote-fefo/ (Cálculo FEFO)   | n=12 | Prom:  91.36 ms | Máx: 202.15 ms | RNF-03: OK
  * GET /api/dashboard-resumen/ (KPIs + Predicción IA 90d)         | n=12 | Prom: 187.46 ms | Máx: 346.84 ms | RNF-03: OK
  * GET /api/security/verify-audit-chain/ (Verificación SHA-256 ALCOA+) | n=12 | Prom:  66.70 ms | Máx: 176.12 ms | RNF-03: OK
  * POST /api/lotes/traspasar-bodega-vitrina/ (Transacción Stock FEFO) | n=12 | Prom: 532.18 ms | Máx: 772.62 ms | RNF-03: OK
  * GET /api/medicamentos/ (Catálogo + Lotes FEFO)                 | n=12 | Prom: 101.59 ms | Máx: 215.95 ms | RNF-03: OK
========================================================================================
VEREDICTO RNF-03: APROBADO (100% de las transacciones respondieron en < 3.0 segundos)
========================================================================================
```

### 4.3. Evidencia de Verificación Estática TypeScript y Build de Producción Frontend (`npm run build`)

```text
$ npm run build
> cesfam-farmacia-asistencial-frontend@1.0.0 build
> tsc && vite build

vite v5.4.21 building for production...
transforming...
✓ 1946 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.45 kB │ gzip:  0.32 kB
dist/assets/index-Cjvp4PvW.css   20.95 kB │ gzip:  4.50 kB
dist/assets/index-Bl7yq_Vu.js   196.44 kB │ gzip: 60.81 kB
✓ built in 3.36s
```
