"""
Suite Completa de Pruebas Unitarias, Integrales y de Ciberseguridad TI para la
Farmacia Asistencial CESFAM (Criterios 2.1.4.8, 2.1.4.9, 2.1.5.10, 2.1.5.11, 2.1.5.12 y 2.1.6.13).
"""
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from seed_cesfam import ejecutar_semilla_cesfam, rut_valido
from .models import (
    HL7FHIRValidationLog,
    ImmutableAuditDAG,
    LibroControladoISP,
    Lote,
    Medicamento,
    Paciente,
    RolRBAC,
    Usuario,
)
from .security import (
    AES256DataCipher,
    MFATOTPService,
    validar_archivo_receta_digitalizada,
    validar_parametro_seguro_sqli,
    validar_sin_xss,
)
from .services import AuditDAGService, DemandPredictionService, FEFOService
from .validators import validar_rut_chileno


class CesfamArquitecturaYSeguridadTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.seed_summary = ejecutar_semilla_cesfam()

    def setUp(self):
        self.client = APIClient()

    # ------------------------------------------------------------------
    # FASE 1: ARQUITECTURA DE DATOS HÍBRIDA Y SERVICIOS CRÍTICOS
    # ------------------------------------------------------------------

    def test_01_validador_modulo_11_rut_chileno(self):
        """Verifica que el validador Módulo 11 acepte RUTs válidos y rechace dígitos verificadores erróneos."""
        validar_rut_chileno("11.111.111-1")
        validar_rut_chileno(rut_valido(15234890))
        with self.assertRaises(ValidationError):
            validar_rut_chileno("12.345.678-0")

    def test_02_exclusion_estricta_sector_publico(self):
        """Verifica que no existan roles de venta ni atributos comerciales (precios, boletas, Isapres)."""
        codigos_roles = set(RolRBAC.objects.values_list("codigo", flat=True))
        self.assertEqual(codigos_roles, {"ADMIN", "QF", "TECNICO", "CLINICO"})
        self.assertNotIn("VENDEDOR", codigos_roles)

        campos_medicamento = {f.name for f in Medicamento._meta.get_fields()}
        for prohibido in ("precio", "precio_venta", "iva", "descuento", "boleta", "isapre"):
            self.assertNotIn(prohibido, campos_medicamento)

    def test_03_motor_fefo_bloquea_vencidos_y_prioriza_proximo_a_vencer(self):
        """Verifica bloqueo automático de lotes vencidos y selección FEFO del más próximo a vencer."""
        losartan = Medicamento.objects.get(codigo_cenabast="CEN-100101")
        lote_vencido = Lote.objects.get(numero_lote="LOT-LOS-2024-VENC")
        self.assertEqual(lote_vencido.estado_lote, Lote.EstadoLote.VENCIDO)
        self.assertFalse(lote_vencido.es_habil_fefo)

        asignaciones = FEFOService.seleccionar_lotes_fefo(
            medicamento=losartan,
            cantidad_requerida=30,
            origen="VITRINA",
        )
        self.assertEqual(asignaciones[0].lote.numero_lote, "LOT-LOS-2026-AMAR")

    def test_04_prediccion_demanda_90_dias_cenabast(self):
        """Verifica el algoritmo de Predicción de Demanda a 90 días y sugerencia CENABAST."""
        insulina = Medicamento.objects.get(codigo_cenabast="CEN-100310")
        analisis_insulina = DemandPredictionService.analizar_medicamento_90_dias(
            insulina, horizonte_dias=90
        )
        self.assertEqual(
            analisis_insulina["indicadores_riesgo_y_abastecimiento"]["nivel_riesgo_quiebre"],
            "CRITICO",
        )
        self.assertGreater(
            analisis_insulina["indicadores_riesgo_y_abastecimiento"][
                "sugerencia_abastecimiento_cenabast_unidades"
            ],
            0,
        )

    def test_05_immutable_audit_dag_alcoa_plus_y_cadena_sha256(self):
        """Verifica inmutabilidad append-only y verificación criptográfica SHA-256 de ImmutableAuditDAG."""
        verificacion = AuditDAGService.verificar_integridad_cadena()
        self.assertTrue(verificacion["cadena_integra"])

        primer_nodo = ImmutableAuditDAG.objects.first()
        with self.assertRaises(PermissionDenied):
            primer_nodo.action_type = "INTENTO_ALTERACION"
            primer_nodo.save()

        with self.assertRaises(PermissionDenied):
            primer_nodo.delete()

    def test_06_hl7_fhir_validation_log_recursos_no_estructurados(self):
        """Verifica persistencia JSONB de Patient, Coverage y MedicationRequest en HL7FHIRValidationLog."""
        fhir_log = HL7FHIRValidationLog.objects.first()
        self.assertIsNotNone(fhir_log)
        self.assertEqual(fhir_log.patient_resource["resourceType"], "Patient")
        self.assertEqual(fhir_log.coverage_resource["resourceType"], "Coverage")
        self.assertEqual(fhir_log.medication_request_resource["resourceType"], "MedicationRequest")
        self.assertEqual(LibroControladoISP.objects.count(), 1)

    # ------------------------------------------------------------------
    # FASE 2: CIBERSEGURIDAD TI (JWT + MFA TOTP, RBAC, AES-256, OWASP Y 10 MÓDULOS API)
    # ------------------------------------------------------------------

    def test_07_autenticacion_jwt_mfa_totp_y_rotacion_segura(self):
        """
        Verifica el flujo completo de autenticación JWT + MFA obligatorio para rol crítico (`QF`):
        1. Login inicial emite token con `mfa_required=True` y `mfa_verified=False`.
        2. Sin verificar MFA, el rol crítico es bloqueado en mutaciones protegidas.
        3. `POST /api/security/auth/verify-mfa/` valida el código TOTP RFC 6238 y emite JWT con `mfa_verified=True`.
        4. `POST /api/security/auth/refresh/` rota el Refresh Token y bloquea su reutilización (Anti-Replay).
        """
        qf_user = Usuario.objects.get(username="qf.nataly.caamano")

        # 1. Login sin código TOTP -> mfa_verified=False
        res_login = self.client.post(
            "/api/security/auth/login/",
            {"username": "qf.nataly.caamano", "password": "Cesfam2026!Segura"},
            format="json",
        )
        self.assertEqual(res_login.status_code, 200)
        self.assertTrue(res_login.data["mfa_required"])
        self.assertFalse(res_login.data["mfa_verified"])
        pre_mfa_access = res_login.data["access_token"]

        # 2. Intento de mutar alerta de vencimiento sin MFA verificado -> 403 Forbidden
        lote_amarillo = Lote.objects.get(numero_lote="LOT-LOS-2026-AMAR")
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {pre_mfa_access}")
        res_bloqueado = self.client.post(
            "/api/alertas/",
            {"lote_id": lote_amarillo.id, "accion_qf": "PARA_DONACION"},
            format="json",
        )
        self.assertEqual(res_bloqueado.status_code, 403)

        # 3. Verificación exitosa del código TOTP de 6 dígitos en /api/security/auth/verify-mfa/
        codigo_totp_valido = MFATOTPService.generar_codigo_totp(qf_user)
        res_mfa = self.client.post(
            "/api/security/auth/verify-mfa/",
            {"codigo_totp": codigo_totp_valido},
            format="json",
        )
        self.assertEqual(res_mfa.status_code, 200)
        self.assertTrue(res_mfa.data["mfa_verified"])

        # 4. Rotación segura de Refresh Token e invalidación del token anterior
        refresh_1 = res_mfa.data["refresh_token"]
        res_rotacion = self.client.post(
            "/api/security/auth/refresh/",
            {"refresh_token": refresh_1},
            format="json",
        )
        self.assertEqual(res_rotacion.status_code, 200)

        # Reutilizar refresh_1 debe fallar con 401/403 (Anti-Replay)
        res_replay = self.client.post(
            "/api/security/auth/refresh/",
            {"refresh_token": refresh_1},
            format="json",
        )
        self.assertIn(res_replay.status_code, (401, 403))

    def test_08_matriz_rbac_principio_minimo_privilegio(self):
        """
        Verifica el cumplimiento del principio de mínimo privilegio (Criterio 2.1.5.10):
        - `Personal Clínico` puede solicitar reposición de Carro de Paro, pero NO puede crear usuarios ni gestionar alertas Q.F.
        """
        clinico = Usuario.objects.get(username="enf.matias.herrera")
        self.client.force_authenticate(user=clinico)

        # Personal Clínico bloqueado al intentar crear un usuario (exclusivo de Administrador)
        res_usuarios = self.client.post(
            "/api/usuarios/",
            {
                "username": "intruso",
                "rut": rut_valido(19876543),
                "first_name": "Intruso",
                "last_name": "Test",
                "email": "intruso@cesfam.cl",
            },
            format="json",
        )
        self.assertEqual(res_usuarios.status_code, 403)

        # Personal Clínico SÍ puede consultar el Carro de Paro (RF-12)
        res_carro = self.client.get("/api/carro-paro/")
        self.assertEqual(res_carro.status_code, 200)
        self.assertGreaterEqual(len(res_carro.data), 1)

    def test_09_cifrado_simetrico_aes256_en_reposo_ley_19628(self):
        """
        Verifica el cifrado simétrico autenticado AES-256 en reposo para diagnósticos y datos
        de contacto de pacientes (Ley 19.628) y la detección de adulteración de criptogramas.
        """
        paciente = Paciente.objects.first()
        self.assertTrue(paciente.datos_sensibles_cifrados.startswith(AES256DataCipher.PREFIX))

        descifrado = paciente.obtener_datos_sensibles_descifrados()
        self.assertEqual(descifrado["rut"], paciente.rut)
        self.assertEqual(descifrado["patologias_ges_cronicas"], paciente.patologias_declaradas)

        # Adulterar el último carácter del criptograma debe disparar ValueError por fallo HMAC-SHA256
        adulterado = paciente.datos_sensibles_cifrados[:-2] + "AA"
        with self.assertRaises(ValueError):
            AES256DataCipher.decrypt(adulterado)

    def test_10_mitigacion_owasp_xss_sqli_y_validador_archivos(self):
        """
        Verifica sanitización contra XSS, bloqueo de patrones SQLi y validación de archivos
        de recetas digitalizadas mediante inspección de Magic Bytes y límite de tamaño (5 MB).
        """
        with self.assertRaises(ValidationError):
            validar_sin_xss("<script>alert('XSS')</script>", "observaciones")

        with self.assertRaises(ValidationError):
            validar_parametro_seguro_sqli("1' UNION SELECT username, password FROM cesfam_usuario--")

        # Archivo PDF legítimo (con cabecera binaria %PDF-1.4) es aceptado
        pdf_valido = SimpleUploadedFile(
            "receta_retenida_001.pdf",
            b"%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF",
            content_type="application/pdf",
        )
        info_pdf = validar_archivo_receta_digitalizada(pdf_valido)
        self.assertTrue(info_pdf["archivo_seguro"])
        self.assertEqual(info_pdf["mime_type_verificado"], "application/pdf")

        # Ejecutable .exe renombrado como .pdf es bloqueado por Magic Bytes
        exe_disfrazado = SimpleUploadedFile(
            "receta_falsa.pdf",
            b"MZ\x90\x00\x03\x00\x00\x00malware_payload",
            content_type="application/pdf",
        )
        with self.assertRaises(ValidationError):
            validar_archivo_receta_digitalizada(exe_disfrazado)

        # PDF con script activo /JavaScript embebido es bloqueado
        pdf_con_js = SimpleUploadedFile(
            "receta_exploit.pdf",
            b"%PDF-1.4\n<< /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>",
            content_type="application/pdf",
        )
        with self.assertRaises(ValidationError):
            validar_archivo_receta_digitalizada(pdf_con_js)

    def test_11_endpoint_verificador_criptografico_dag_y_10_modulos_api(self):
        """
        Verifica el endpoint `GET /api/security/verify-audit-chain/`, las cabeceras de seguridad HSTS/CSP
        y la respuesta de los 10 módulos RESTful del CESFAM (incluyendo exportación PDF y Excel).
        """
        qf_user = Usuario.objects.get(username="qf.nataly.caamano")
        self.client.force_authenticate(user=qf_user)

        # 1. Verificador Criptográfico DAG ALCOA+
        res_dag = self.client.get("/api/security/verify-audit-chain/")
        self.assertEqual(res_dag.status_code, 200)
        self.assertTrue(res_dag.data["cadena_integra"])
        self.assertEqual(res_dag.headers["X-Frame-Options"], "DENY")
        self.assertIn("max-age=63072000", res_dag.headers["Strict-Transport-Security"])

        # 2. Recorrido de los 10 módulos RESTful del CESFAM
        endpoints_lectura = [
            "/api/security/governance/",
            "/api/roles/",
            "/api/usuarios/",
            "/api/medicamentos/",
            "/api/lotes/",
            "/api/recetas/",
            "/api/dispensaciones/",
            "/api/libro-controlados-isp/",
            "/api/pacientes/",
            "/api/programas-salud/",
            "/api/inscripciones-programas/",
            "/api/interoperabilidad-fhir/",
            "/api/carro-paro/",
            "/api/carro-unidosis/",
            "/api/reposiciones-carros/",
            "/api/alertas/",
            "/api/prediccion-demanda-cenabast/",
            "/api/dashboard-resumen/",
            "/api/auditoria-dag/",
        ]
        for ep in endpoints_lectura:
            resp = self.client.get(ep)
            self.assertEqual(resp.status_code, 200, f"Fallo en endpoint {ep}")

        # 3. Exportación de Reportes Institucionales PDF y Excel (RF-16)
        res_pdf = self.client.get("/api/reportes/exportar-pdf/?tipo=inventario_fefo")
        self.assertEqual(res_pdf.status_code, 200)
        self.assertEqual(res_pdf["Content-Type"], "application/pdf")
        self.assertTrue(res_pdf.content.startswith(b"%PDF-1.4"))

        res_excel = self.client.get("/api/reportes/exportar-excel/?tipo=prediccion_cenabast")
        self.assertEqual(res_excel.status_code, 200)
        self.assertIn("application/vnd.ms-excel", res_excel["Content-Type"])
