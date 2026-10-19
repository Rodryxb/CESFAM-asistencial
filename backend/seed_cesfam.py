#!/usr/bin/env python
"""
Semilla de Datos Iniciales (`seed_cesfam.py`) para el Sistema Web de Gestión
de Farmacia Asistencial CESFAM.

Puebla de forma idempotente:
1. Roles RBAC del Sector Público (Administrador, Químico Farmacéutico, Técnico en Farmacia, Personal Clínico).
2. Usuarios Funcionarios con RUT chileno validado mediante Módulo 11.
3. Pacientes Beneficiarios FONASA (Tramos A, B, C, D) con patologías GES/AUGE y Crónicos.
4. Programas de Salud Pública (GES Hipertensión, GES Diabetes Tipo 2, Crónicos Cardiovascular FOFAR, GES Salud Mental)
   e Inscripciones con Control de Cuotas para alimentar el motor de Predicción de Demanda a 90 días.
5. Medicamentos Reales de un CESFAM Chileno (Losartán, Metformina, Insulina NPH, Paracetamol,
   Adrenalina para Carro de Paro, Diazepam como Psicotrópico Controlado y Morfina como Estupefaciente Controlado).
6. Lotes Farmacéuticos en estados VERDE (>90 días), AMARILLO (31-90 días) y ROJO (<=30 días y Vencidos).
7. Recetas (Física, Digital y Retenida), Dispensaciones automáticas FEFO (incluyendo retiro por tercero autorizado
   y asiento en Libro Digital de Controlados ISP), Carros Clínicos (Carro de Paro y Carro Unidosis) y Reposiciones.
8. Registros No Estructurados JSONB con Índices GIN en `ImmutableAuditDAG` (ALCOA+ SHA-256) y `HL7FHIRValidationLog` (MINSAL/FONASA).
"""
import os
import sys
from datetime import date, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "cesfam_project.settings")

import django

django.setup()

from django.db import transaction
from django.utils import timezone

from core.models import (
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
    Paciente,
    ProgramaSalud,
    RecetaMedica,
    ReposicionCarro,
    RolRBAC,
    StockCarroClinico,
    Usuario,
)
from core.services import (
    AuditDAGService,
    DemandPredictionService,
    FEFOService,
    HL7FHIRService,
)
from core.validators import calcular_dv_modulo_11


def rut_valido(cuerpo: int) -> str:
    """Genera un RUT chileno garantizado bajo el algoritmo Módulo 11."""
    cuerpo_str = str(cuerpo)
    return f"{cuerpo_str}-{calcular_dv_modulo_11(cuerpo_str)}"


@transaction.atomic
def ejecutar_semilla_cesfam() -> dict:
    hoy = timezone.localdate()

    # ------------------------------------------------------------------
    # 1. ROLES RBAC (ESTRICTAMENTE SECTOR PÚBLICO - CERO ROLES DE VENTA)
    # ------------------------------------------------------------------
    roles_data = [
        {
            "codigo": RolRBAC.CodigoRol.ADMIN,
            "nombre": "Administrador del Sistema CESFAM",
            "descripcion": "Gestión de usuarios, roles, configuración institucional y supervisión global.",
            "puede_gestionar_usuarios": True,
            "puede_gestionar_inventario": True,
            "puede_dispensar": False,
            "puede_autorizar_controlados_isp": False,
            "puede_solicitar_reposicion_carro": False,
            "puede_ejecutar_reposicion_carro": False,
            "puede_auditar_dag": True,
            "requiere_mfa_obligatorio": True,
        },
        {
            "codigo": RolRBAC.CodigoRol.QF,
            "nombre": "Químico Farmacéutico (Director Técnico)",
            "descripcion": "Supervisión técnica del inventario, lotes FEFO, autorización de estupefacientes/psicotrópicos ISP y carros clínicos.",
            "puede_gestionar_usuarios": False,
            "puede_gestionar_inventario": True,
            "puede_dispensar": True,
            "puede_autorizar_controlados_isp": True,
            "puede_solicitar_reposicion_carro": True,
            "puede_ejecutar_reposicion_carro": True,
            "puede_auditar_dag": True,
            "requiere_mfa_obligatorio": True,
        },
        {
            "codigo": RolRBAC.CodigoRol.TECNICO,
            "nombre": "Técnico en Farmacia (TENS)",
            "descripcion": "Registro de recetas, dispensación FEFO a pacientes, actualización de stock y reposición de carros clínicos.",
            "puede_gestionar_usuarios": False,
            "puede_gestionar_inventario": True,
            "puede_dispensar": True,
            "puede_autorizar_controlados_isp": False,
            "puede_solicitar_reposicion_carro": False,
            "puede_ejecutar_reposicion_carro": True,
            "puede_auditar_dag": False,
            "requiere_mfa_obligatorio": False,
        },
        {
            "codigo": RolRBAC.CodigoRol.CLINICO,
            "nombre": "Personal Clínico (Médico / Enfermero)",
            "descripcion": "Solicitud de abastecimiento de Carros de Paro y Unidosis, registro de consumos clínicos y consulta de stock.",
            "puede_gestionar_usuarios": False,
            "puede_gestionar_inventario": False,
            "puede_dispensar": False,
            "puede_autorizar_controlados_isp": False,
            "puede_solicitar_reposicion_carro": True,
            "puede_ejecutar_reposicion_carro": False,
            "puede_auditar_dag": False,
            "requiere_mfa_obligatorio": False,
        },
    ]

    roles = {}
    for r_data in roles_data:
        rol, _ = RolRBAC.objects.update_or_create(
            codigo=r_data["codigo"],
            defaults=r_data,
        )
        roles[rol.codigo] = rol

    # ------------------------------------------------------------------
    # 2. USUARIOS FUNCIONARIOS CESFAM
    # ------------------------------------------------------------------
    usuarios_config = [
        ("admin.cesfam", rut_valido(13456789), "Rodrigo", "Castro Sandoval", "ADMIN", "SIS-ADM-001", True),
        ("qf.nataly.caamano", rut_valido(15234890), "Nataly", "Caamaño Vega", "QF", "SIS-QF-48291", True),
        ("tens.camila.fuentes", rut_valido(18923456), "Camila", "Fuentes Riquelme", "TECNICO", "SIS-TENS-99210", False),
        ("enf.matias.herrera", rut_valido(16789123), "Matías", "Herrera Sepúlveda", "CLINICO", "SIS-ENF-71543", False),
    ]

    usuarios = {}
    for uname, rut_u, fname, lname, rol_cod, sis_reg, mfa in usuarios_config:
        user, created = Usuario.objects.update_or_create(
            username=uname,
            defaults={
                "rut": rut_u,
                "first_name": fname,
                "last_name": lname,
                "email": f"{uname}@cesfam-saludpublica.cl",
                "telefono": "+56 9 8765 4321",
                "rol": roles[rol_cod],
                "registro_superintendencia_salud": sis_reg,
                "mfa_habilitado": mfa,
                "debe_cambiar_password": False,
                "is_staff": rol_cod in ("ADMIN", "QF"),
                "is_superuser": rol_cod == "ADMIN",
            },
        )
        if created:
            user.set_password("Cesfam2026!Segura")
            user.save()
        usuarios[rol_cod] = user

    # ------------------------------------------------------------------
    # 3. CATEGORÍAS Y MEDICAMENTOS REALES DE UN CESFAM CHILENO
    # ------------------------------------------------------------------
    cat_cardio, _ = CategoriaMedicamento.objects.update_or_create(
        codigo="CAT-CARDIO",
        defaults={
            "nombre": "Cardiovascular e Hipertensión (GES / PSCV)",
            "descripcion": "Fármacos antihipertensivos e hipolipemiantes del Fondo de Farmacia (FOFAR).",
        },
    )
    cat_diab, _ = CategoriaMedicamento.objects.update_or_create(
        codigo="CAT-DIABETES",
        defaults={
            "nombre": "Antidiabéticos Orales e Insulinas (GES #07)",
            "descripcion": "Hipoglicemiantes e insulinas con control de cadena de frío.",
        },
    )
    cat_analg, _ = CategoriaMedicamento.objects.update_or_create(
        codigo="CAT-ANALGESIA",
        defaults={
            "nombre": "Analgésicos y Antipiréticos APS",
            "descripcion": "Manejo sintomático del dolor y fiebre en morbilidad general.",
        },
    )
    cat_urgencia, _ = CategoriaMedicamento.objects.update_or_create(
        codigo="CAT-CARRO-PARO",
        defaults={
            "nombre": "Urgencia Vital y Carro de Paro",
            "descripcion": "Medicamentos vasoactivos y de soporte vital avanzado para reanimación.",
        },
    )
    cat_controlados, _ = CategoriaMedicamento.objects.update_or_create(
        codigo="CAT-CONTROLADOS-ISP",
        defaults={
            "nombre": "Salud Mental y Controlados ISP (D.S. 404 / D.S. 405)",
            "descripcion": "Estupefacientes y Psicotrópicos sujetos a Libro Digital ISP y Receta Retenida.",
        },
    )

    medicamentos_data = [
        {
            "key": "LOSARTAN",
            "codigo_cenabast": "CEN-100101",
            "codigo_atc": "C09CA01",
            "nombre_generico": "Losartán Potásico",
            "concentracion": "50 mg",
            "forma_farmaceutica": Medicamento.FormaFarmaceutica.COMPRIMIDO,
            "unidad_medida": "COMPRIMIDO",
            "categoria": cat_cardio,
            "es_controlado": False,
            "tipo_controlado": Medicamento.TipoControlISP.NO_CONTROLADO,
            "requiere_receta_retenida": False,
            "requiere_cadena_frio": False,
            "esencial_carro_paro": False,
            "stock_minimo_alerta": 600,
            "stock_critico_alerta": 250,
        },
        {
            "key": "METFORMINA",
            "codigo_cenabast": "CEN-100205",
            "codigo_atc": "A10BA02",
            "nombre_generico": "Metformina Clorhidrato",
            "concentracion": "850 mg",
            "forma_farmaceutica": Medicamento.FormaFarmaceutica.COMPRIMIDO,
            "unidad_medida": "COMPRIMIDO",
            "categoria": cat_diab,
            "es_controlado": False,
            "tipo_controlado": Medicamento.TipoControlISP.NO_CONTROLADO,
            "requiere_receta_retenida": False,
            "requiere_cadena_frio": False,
            "esencial_carro_paro": False,
            "stock_minimo_alerta": 600,
            "stock_critico_alerta": 240,
        },
        {
            "key": "INSULINA_NPH",
            "codigo_cenabast": "CEN-100310",
            "codigo_atc": "A10AC01",
            "nombre_generico": "Insulina Humana NPH",
            "concentracion": "100 UI/mL (Frasco Ampolla 10 mL)",
            "forma_farmaceutica": Medicamento.FormaFarmaceutica.SUSPENSION_INYECTABLE,
            "unidad_medida": "FRASCO_AMPOLLA",
            "categoria": cat_diab,
            "es_controlado": False,
            "tipo_controlado": Medicamento.TipoControlISP.NO_CONTROLADO,
            "requiere_receta_retenida": False,
            "requiere_cadena_frio": True,
            "esencial_carro_paro": False,
            "stock_minimo_alerta": 40,
            "stock_critico_alerta": 18,
        },
        {
            "key": "PARACETAMOL",
            "codigo_cenabast": "CEN-100412",
            "codigo_atc": "N02BE01",
            "nombre_generico": "Paracetamol",
            "concentracion": "500 mg",
            "forma_farmaceutica": Medicamento.FormaFarmaceutica.COMPRIMIDO,
            "unidad_medida": "COMPRIMIDO",
            "categoria": cat_analg,
            "es_controlado": False,
            "tipo_controlado": Medicamento.TipoControlISP.NO_CONTROLADO,
            "requiere_receta_retenida": False,
            "requiere_cadena_frio": False,
            "esencial_carro_paro": False,
            "stock_minimo_alerta": 500,
            "stock_critico_alerta": 200,
        },
        {
            "key": "ADRENALINA",
            "codigo_cenabast": "CEN-100501",
            "codigo_atc": "C01CA24",
            "nombre_generico": "Adrenalina (Epinefrina)",
            "concentracion": "1 mg/mL (Ampolla 1 mL)",
            "forma_farmaceutica": Medicamento.FormaFarmaceutica.SOLUCION_INYECTABLE,
            "unidad_medida": "AMPOLLA",
            "categoria": cat_urgencia,
            "es_controlado": False,
            "tipo_controlado": Medicamento.TipoControlISP.NO_CONTROLADO,
            "requiere_receta_retenida": False,
            "requiere_cadena_frio": False,
            "esencial_carro_paro": True,
            "stock_minimo_alerta": 50,
            "stock_critico_alerta": 20,
        },
        {
            "key": "DIAZEPAM",
            "codigo_cenabast": "CEN-100609",
            "codigo_atc": "N05BA01",
            "nombre_generico": "Diazepam",
            "concentracion": "10 mg",
            "forma_farmaceutica": Medicamento.FormaFarmaceutica.COMPRIMIDO,
            "unidad_medida": "COMPRIMIDO",
            "categoria": cat_controlados,
            "es_controlado": True,
            "tipo_controlado": Medicamento.TipoControlISP.PSICOTROPICO,
            "requiere_receta_retenida": True,
            "requiere_cadena_frio": False,
            "esencial_carro_paro": True,
            "stock_minimo_alerta": 120,
            "stock_critico_alerta": 45,
        },
        {
            "key": "MORFINA",
            "codigo_cenabast": "CEN-100688",
            "codigo_atc": "N02AA01",
            "nombre_generico": "Morfina Clorhidrato",
            "concentracion": "10 mg/mL (Ampolla 1 mL)",
            "forma_farmaceutica": Medicamento.FormaFarmaceutica.SOLUCION_INYECTABLE,
            "unidad_medida": "AMPOLLA",
            "categoria": cat_controlados,
            "es_controlado": True,
            "tipo_controlado": Medicamento.TipoControlISP.ESTUPEFACIENTE,
            "requiere_receta_retenida": True,
            "requiere_cadena_frio": False,
            "esencial_carro_paro": False,
            "stock_minimo_alerta": 30,
            "stock_critico_alerta": 12,
        },
    ]

    meds = {}
    for m in medicamentos_data:
        key = m.pop("key")
        med_obj, _ = Medicamento.objects.update_or_create(
            codigo_cenabast=m["codigo_cenabast"],
            defaults=m,
        )
        meds[key] = med_obj

    # ------------------------------------------------------------------
    # 4. LOTES EN SEMÁFORO ROJO, AMARILLO Y VERDE (PARA MOTOR FEFO)
    # ------------------------------------------------------------------
    lotes_data = [
        # Losartán: 1 lote ROJO vencido (será bloqueado por FEFO), 1 AMARILLO (próximo a vencer, sale primero por FEFO) y 1 VERDE
        {
            "medicamento": meds["LOSARTAN"],
            "numero_lote": "LOT-LOS-2024-VENC",
            "fecha_fabricacion": hoy - timedelta(days=730),
            "fecha_vencimiento": hoy - timedelta(days=12),  # ROJO - Vencido
            "stock_bodega": 80,
            "stock_vitrina": 40,
            "estado_lote": Lote.EstadoLote.DISPONIBLE,  # FEFOService lo bloqueará automáticamente a VENCIDO
            "guia_despacho_cenabast": "GD-CEN-2024-1102",
        },
        {
            "medicamento": meds["LOSARTAN"],
            "numero_lote": "LOT-LOS-2026-AMAR",
            "fecha_fabricacion": hoy - timedelta(days=300),
            "fecha_vencimiento": hoy + timedelta(days=45),  # AMARILLO (31-90 días) -> Elegido primero por FEFO
            "stock_bodega": 120,
            "stock_vitrina": 120,
            "estado_lote": Lote.EstadoLote.DISPONIBLE,
            "guia_despacho_cenabast": "GD-CEN-2026-0145",
        },
        {
            "medicamento": meds["LOSARTAN"],
            "numero_lote": "LOT-LOS-2027-VERD",
            "fecha_fabricacion": hoy - timedelta(days=60),
            "fecha_vencimiento": hoy + timedelta(days=270),  # VERDE (>90 días)
            "stock_bodega": 180,
            "stock_vitrina": 90,
            "estado_lote": Lote.EstadoLote.DISPONIBLE,
            "guia_despacho_cenabast": "GD-CEN-2026-0890",
        },
        # Metformina: 1 lote ROJO vigente (vence en 20 días) y 1 lote VERDE
        {
            "medicamento": meds["METFORMINA"],
            "numero_lote": "LOT-MET-2026-ROJO",
            "fecha_fabricacion": hoy - timedelta(days=340),
            "fecha_vencimiento": hoy + timedelta(days=20),  # ROJO (<=30 días)
            "stock_bodega": 60,
            "stock_vitrina": 90,
            "estado_lote": Lote.EstadoLote.DISPONIBLE,
            "guia_despacho_cenabast": "GD-CEN-2025-9921",
        },
        {
            "medicamento": meds["METFORMINA"],
            "numero_lote": "LOT-MET-2027-VERD",
            "fecha_fabricacion": hoy - timedelta(days=45),
            "fecha_vencimiento": hoy + timedelta(days=310),  # VERDE
            "stock_bodega": 150,
            "stock_vitrina": 60,
            "estado_lote": Lote.EstadoLote.DISPONIBLE,
            "guia_despacho_cenabast": "GD-CEN-2026-0912",
        },
        # Insulina NPH: Stock deliberadamente ajustado en AMARILLO para activar alerta CRÍTICA en predicción a 90 días
        {
            "medicamento": meds["INSULINA_NPH"],
            "numero_lote": "LOT-INS-2026-AMAR",
            "fecha_fabricacion": hoy - timedelta(days=180),
            "fecha_vencimiento": hoy + timedelta(days=55),  # AMARILLO
            "stock_bodega": 8,
            "stock_vitrina": 6,
            "estado_lote": Lote.EstadoLote.DISPONIBLE,
            "guia_despacho_cenabast": "GD-CEN-2026-0331",
        },
        # Paracetamol: Lote en VERDE con alto stock (estado ÓPTIMO)
        {
            "medicamento": meds["PARACETAMOL"],
            "numero_lote": "LOT-PAR-2027-VERD",
            "fecha_fabricacion": hoy - timedelta(days=30),
            "fecha_vencimiento": hoy + timedelta(days=420),  # VERDE
            "stock_bodega": 1200,
            "stock_vitrina": 400,
            "estado_lote": Lote.EstadoLote.DISPONIBLE,
            "guia_despacho_cenabast": "GD-CEN-2026-1020",
        },
        # Adrenalina (Carro de Paro): Lote en AMARILLO y Lote en VERDE
        {
            "medicamento": meds["ADRENALINA"],
            "numero_lote": "LOT-ADR-2026-AMAR",
            "fecha_fabricacion": hoy - timedelta(days=250),
            "fecha_vencimiento": hoy + timedelta(days=65),  # AMARILLO
            "stock_bodega": 35,
            "stock_vitrina": 10,
            "estado_lote": Lote.EstadoLote.DISPONIBLE,
            "guia_despacho_cenabast": "GD-CEN-2026-0410",
        },
        {
            "medicamento": meds["ADRENALINA"],
            "numero_lote": "LOT-ADR-2027-VERD",
            "fecha_fabricacion": hoy - timedelta(days=40),
            "fecha_vencimiento": hoy + timedelta(days=290),  # VERDE
            "stock_bodega": 45,
            "stock_vitrina": 15,
            "estado_lote": Lote.EstadoLote.DISPONIBLE,
            "guia_despacho_cenabast": "GD-CEN-2026-0988",
        },
        # Diazepam 10 mg (Psicotrópico Controlado ISP): Lote en AMARILLO
        {
            "medicamento": meds["DIAZEPAM"],
            "numero_lote": "LOT-DIAZ-2026-AMAR",
            "fecha_fabricacion": hoy - timedelta(days=210),
            "fecha_vencimiento": hoy + timedelta(days=75),  # AMARILLO
            "stock_bodega": 90,
            "stock_vitrina": 60,
            "estado_lote": Lote.EstadoLote.DISPONIBLE,
            "guia_despacho_cenabast": "GD-CEN-2026-0512",
        },
        # Morfina 10 mg/mL (Estupefaciente Controlado ISP): Lote en VERDE
        {
            "medicamento": meds["MORFINA"],
            "numero_lote": "LOT-MORF-2027-VERD",
            "fecha_fabricacion": hoy - timedelta(days=50),
            "fecha_vencimiento": hoy + timedelta(days=240),  # VERDE
            "stock_bodega": 30,
            "stock_vitrina": 15,
            "estado_lote": Lote.EstadoLote.DISPONIBLE,
            "guia_despacho_cenabast": "GD-CEN-2026-0774",
        },
    ]

    lotes = {}
    for l_data in lotes_data:
        lote_obj, _ = Lote.objects.update_or_create(
            medicamento=l_data["medicamento"],
            numero_lote=l_data["numero_lote"],
            defaults=l_data,
        )
        lotes[lote_obj.numero_lote] = lote_obj

    # Ejecutar bloqueo automático FEFO del lote vencido
    FEFOService.sincronizar_y_bloquear_lotes_vencidos(actor_user=usuarios["QF"])

    # ------------------------------------------------------------------
    # 5. PROGRAMAS DE SALUD (GES/AUGE Y CRÓNICOS) Y PACIENTES DE PRUEBA
    # ------------------------------------------------------------------
    prog_ges_hta, _ = ProgramaSalud.objects.update_or_create(
        codigo_minsal="GES-21-HTA",
        defaults={
            "nombre": "GES Problema de Salud N° 21: Hipertensión Arterial Primaria o Esencial",
            "tipo_programa": ProgramaSalud.TipoPrograma.GES_AUGE,
            "numero_garantia_ges": 21,
            "periodicidad_retiro_dias": 30,
            "descripcion": "Cobertura farmacológica gratuita garantizada por ley para pacientes hipertensos en APS.",
        },
    )
    prog_ges_dm2, _ = ProgramaSalud.objects.update_or_create(
        codigo_minsal="GES-07-DM2",
        defaults={
            "nombre": "GES Problema de Salud N° 07: Diabetes Mellitus Tipo 2",
            "tipo_programa": ProgramaSalud.TipoPrograma.GES_AUGE,
            "numero_garantia_ges": 7,
            "periodicidad_retiro_dias": 30,
            "descripcion": "Cobertura garantizada de hipoglicemiantes orales e insulina NPH en CESFAM.",
        },
    )
    prog_cronico_pscv, _ = ProgramaSalud.objects.update_or_create(
        codigo_minsal="FOFAR-PSCV-CRON",
        defaults={
            "nombre": "Programa de Salud Cardiovascular (PSCV) - Fondo de Farmacia Crónicos",
            "tipo_programa": ProgramaSalud.TipoPrograma.CRONICO,
            "numero_garantia_ges": None,
            "periodicidad_retiro_dias": 30,
            "descripcion": "Seguimiento y entrega mensual de fármacos por cuotas para pacientes crónicos.",
        },
    )
    prog_ges_sm, _ = ProgramaSalud.objects.update_or_create(
        codigo_minsal="GES-34-SM",
        defaults={
            "nombre": "GES Problema de Salud N° 34: Salud Mental y Trastornos de Ansiedad APS",
            "tipo_programa": ProgramaSalud.TipoPrograma.GES_AUGE,
            "numero_garantia_ges": 34,
            "periodicidad_retiro_dias": 30,
            "descripcion": "Tratamiento integral de salud mental bajo supervisión de Químico Farmacéutico.",
        },
    )

    pacientes_data = [
        (
            rut_valido(7654321),
            "María Elena",
            "González Tapia",
            date(1954, 4, 12),
            "F",
            "SECTOR_AZUL",
            "A",
            "Hipertensión Arterial Esencial (I10) y Diabetes Mellitus Tipo 2 (E11)",
        ),
        (
            rut_valido(8432198),
            "Jorge Humberto",
            "Valenzuela Contreras",
            date(1958, 9, 23),
            "M",
            "SECTOR_VERDE",
            "B",
            "Diabetes Mellitus Insulinorrequiriente (E11.9) e Hipertensión (I10)",
        ),
        (
            rut_valido(9123456),
            "Carmen Gloria",
            "Soto Morales",
            date(1962, 1, 18),
            "F",
            "SECTOR_ROJO",
            "B",
            "Hipertensión Arterial Crónica PSCV (I10) y Trastorno de Ansiedad Severo (F41.1)",
        ),
        (
            rut_valido(10876543),
            "Pedro Antonio",
            "Rojas Llanos",
            date(1949, 11, 5),
            "M",
            "SECTOR_AZUL",
            "A",
            "Cardiopatía Hipertensiva (I11) y Diabetes Mellitus Tipo 2 (E11)",
        ),
        (
            rut_valido(12345678),
            "Rosa Ester",
            "Muñoz Poblete",
            date(1966, 7, 30),
            "F",
            "SECTOR_AMARILLO",
            "C",
            "Hipertensión Arterial Primaria GES #21 (I10) y Dislipidemia",
        ),
        (
            rut_valido(14567891),
            "Luis Alberto",
            "Bravo Cáceres",
            date(1971, 3, 14),
            "M",
            "SECTOR_VERDE",
            "D",
            "Diabetes Mellitus Tipo 2 descompensada GES #07 (E11)",
        ),
    ]

    pacientes = []
    for rut_p, nom, ape, fnac, sexo, sector, tramo, patol in pacientes_data:
        pac, _ = Paciente.objects.update_or_create(
            rut=rut_p,
            defaults={
                "nombres": nom,
                "apellidos": ape,
                "fecha_nacimiento": fnac,
                "sexo": sexo,
                "telefono": "+56 9 7654 3210",
                "direccion": "Av. Recoleta 1450, Comuna APS",
                "sector_cesfam": sector,
                "tramo_fonasa": tramo,
                "patologias_declaradas": patol,
                "activo": True,
            },
        )
        pacientes.append(pac)

    # Inscripciones de Pacientes en Programas GES/AUGE y Crónicos con Cuotas Pendientes
    # (Dimensionadas para que la Predicción de Demanda a 90 días cruce las cuotas y sugiera compra CENABAST)
    inscripciones_config = [
        # Losartán 50 mg: 5 pacientes crónicos/GES con 60 comprimidos mensuales c/u -> 300/mes -> 900 en 90 días
        (pacientes[0], prog_ges_hta, meds["LOSARTAN"], 60, 12, 3),
        (pacientes[1], prog_ges_hta, meds["LOSARTAN"], 60, 12, 4),
        (pacientes[2], prog_cronico_pscv, meds["LOSARTAN"], 60, 12, 2),
        (pacientes[3], prog_cronico_pscv, meds["LOSARTAN"], 60, 12, 5),
        (pacientes[4], prog_ges_hta, meds["LOSARTAN"], 60, 12, 1),
        # Metformina 850 mg: 4 pacientes GES DM2 con 60 comprimidos mensuales c/u -> 240/mes -> 720 en 90 días
        (pacientes[0], prog_ges_dm2, meds["METFORMINA"], 60, 12, 3),
        (pacientes[1], prog_ges_dm2, meds["METFORMINA"], 60, 12, 4),
        (pacientes[3], prog_ges_dm2, meds["METFORMINA"], 60, 12, 2),
        (pacientes[5], prog_ges_dm2, meds["METFORMINA"], 60, 12, 1),
        # Insulina NPH: 4 pacientes GES DM2 con 3 frascos ampolla mensuales c/u -> 12/mes -> 36 en 90 días (Stock útil=14 -> RIESGO CRÍTICO)
        (pacientes[0], prog_ges_dm2, meds["INSULINA_NPH"], 3, 12, 2),
        (pacientes[1], prog_ges_dm2, meds["INSULINA_NPH"], 3, 12, 3),
        (pacientes[3], prog_ges_dm2, meds["INSULINA_NPH"], 2, 12, 1),
        (pacientes[5], prog_ges_dm2, meds["INSULINA_NPH"], 2, 12, 2),
        # Diazepam 10 mg: Paciente en programa Salud Mental GES
        (pacientes[2], prog_ges_sm, meds["DIAZEPAM"], 30, 6, 1),
    ]

    inscripciones = []
    for pac, prog, med, dosis_mes, totales, consumidas in inscripciones_config:
        insc, _ = InscripcionProgramaSalud.objects.update_or_create(
            paciente=pac,
            programa=prog,
            medicamento=med,
            fecha_inscripcion=hoy - timedelta(days=90),
            defaults={
                "dosis_mensual_unidades": dosis_mes,
                "cuotas_totales_autorizadas": totales,
                "cuotas_consumidas": consumidas,
                "fecha_ultimo_retiro": hoy - timedelta(days=25),
                "fecha_proximo_retiro": hoy + timedelta(days=5),
                "fecha_vencimiento_cobertura": hoy + timedelta(days=275),
                "estado": InscripcionProgramaSalud.EstadoInscripcion.ACTIVA,
            },
        )
        inscripciones.append(insc)

    # ------------------------------------------------------------------
    # 6. RECETAS (FÍSICA, DIGITAL, RETENIDA) Y DISPENSACIONES FEFO
    # ------------------------------------------------------------------
    medico_rut_1 = rut_valido(11223344)
    medico_rut_2 = rut_valido(14332211)

    # Receta 1: DIGITAL (GES Hipertensión - Losartán 50 mg)
    receta_digital, _ = RecetaMedica.objects.update_or_create(
        folio_receta="REC-DIG-2026-0001",
        defaults={
            "paciente": pacientes[0],
            "programa_salud": prog_ges_hta,
            "tipo_receta": RecetaMedica.TipoReceta.DIGITAL,
            "medico_prescriptor_nombre": "Dra. Alejandra Pizarro Méndez",
            "medico_prescriptor_rut": medico_rut_1,
            "medico_registro_sis": "SIS-MED-55120",
            "diagnostico_cie10": "I10 - Hipertensión esencial (primaria) [GES #21]",
            "fecha_emision": hoy - timedelta(days=2),
            "fecha_vencimiento": hoy + timedelta(days=28),
            "estado": RecetaMedica.EstadoReceta.VIGENTE,
        },
    )
    DetalleReceta.objects.update_or_create(
        receta=receta_digital,
        medicamento=meds["LOSARTAN"],
        defaults={
            "posologia": "1 comprimido de 50 mg cada 12 horas por 30 días",
            "cantidad_prescrita": 60,
            "cantidad_dispensada": 0,
        },
    )

    # Receta 2: FÍSICA (GES Diabetes - Metformina 850 mg, retirada por Tercero Autorizado)
    receta_fisica, _ = RecetaMedica.objects.update_or_create(
        folio_receta="REC-FIS-2026-0002",
        defaults={
            "paciente": pacientes[3],
            "programa_salud": prog_ges_dm2,
            "tipo_receta": RecetaMedica.TipoReceta.FISICA,
            "medico_prescriptor_nombre": "Dr. Sebastián Alarcón Lagos",
            "medico_prescriptor_rut": medico_rut_2,
            "medico_registro_sis": "SIS-MED-64891",
            "diagnostico_cie10": "E11 - Diabetes mellitus tipo 2 [GES #07]",
            "fecha_emision": hoy - timedelta(days=1),
            "fecha_vencimiento": hoy + timedelta(days=29),
            "estado": RecetaMedica.EstadoReceta.VIGENTE,
        },
    )
    DetalleReceta.objects.update_or_create(
        receta=receta_fisica,
        medicamento=meds["METFORMINA"],
        defaults={
            "posologia": "1 comprimido de 850 mg con desayuno y cena por 30 días",
            "cantidad_prescrita": 60,
            "cantidad_dispensada": 0,
        },
    )

    # Receta 3: RETENIDA (Psicotrópico Controlado D.S. 405 ISP - Diazepam 10 mg)
    receta_retenida, _ = RecetaMedica.objects.update_or_create(
        folio_receta="REC-RET-ISP-2026-0003",
        defaults={
            "paciente": pacientes[2],
            "programa_salud": prog_ges_sm,
            "tipo_receta": RecetaMedica.TipoReceta.RETENIDA,
            "medico_prescriptor_nombre": "Dra. Alejandra Pizarro Méndez",
            "medico_prescriptor_rut": medico_rut_1,
            "medico_registro_sis": "SIS-MED-55120",
            "diagnostico_cie10": "F41.1 - Trastorno de ansiedad generalizada [Controlado D.S. 405]",
            "fecha_emision": hoy,
            "fecha_vencimiento": hoy + timedelta(days=15),
            "estado": RecetaMedica.EstadoReceta.VIGENTE,
            "folio_archivo_retenida": "ARCH-RET-ISP-2026-0089",
        },
    )
    DetalleReceta.objects.update_or_create(
        receta=receta_retenida,
        medicamento=meds["DIAZEPAM"],
        defaults={
            "posologia": "1 comprimido de 10 mg en la noche por 30 días (Bajo supervisión Q.F.)",
            "cantidad_prescrita": 30,
            "cantidad_dispensada": 0,
        },
    )

    # Ejecutar dispensaciones reales mediante FEFOService si aún no se han ejecutado
    if Dispensacion.objects.count() == 0:
        # 1) Dispensación FEFO de Losartán (selecciona automáticamente LOT-LOS-2026-AMAR e ignora el vencido LOT-LOS-2024-VENC)
        FEFOService.dispensar_medicamento_fefo(
            receta=receta_digital,
            medicamento=meds["LOSARTAN"],
            cantidad_a_dispensar=60,
            usuario_dispensador=usuarios["TECNICO"],
            observaciones="Dispensación mensual GES #21 validada por motor FEFO.",
        )

        # 2) Dispensación FEFO con Retiro por Tercero Autorizado (RF-11)
        FEFOService.dispensar_medicamento_fefo(
            receta=receta_fisica,
            medicamento=meds["METFORMINA"],
            cantidad_a_dispensar=60,
            usuario_dispensador=usuarios["TECNICO"],
            es_retiro_tercero=True,
            tercero_nombre="Claudia Andrea Rojas Silva",
            tercero_rut=rut_valido(17654321),
            tercero_parentesco="Hija / Cuidadora Principal Acreditada",
            tercero_telefono="+56 9 9123 4567",
            observaciones="Paciente adulto mayor con movilidad reducida; retira hija autorizada.",
        )

        # 3) Dispensación FEFO de Medicamento Controlado (Diazepam) con Receta Retenida y Firma Q.F.
        FEFOService.dispensar_medicamento_fefo(
            receta=receta_retenida,
            medicamento=meds["DIAZEPAM"],
            cantidad_a_dispensar=30,
            usuario_dispensador=usuarios["TECNICO"],
            usuario_autorizador_qf=usuarios["QF"],
            observaciones="Dispensación controlada D.S. 405 ISP con retención física de receta y firma Q.F.",
        )

    # ------------------------------------------------------------------
    # 7. CARROS CLÍNICOS (CARRO DE PARO Y CARRO UNIDOSIS) Y REPOSICIÓN FEFO
    # ------------------------------------------------------------------
    carro_paro, _ = CarroClinico.objects.update_or_create(
        codigo_carro="CP-SAPU-01",
        defaults={
            "nombre": "Carro de Paro Box Reanimación Urgencia CESFAM/SAPU",
            "tipo_carro": CarroClinico.TipoCarro.CARRO_PARO,
            "ubicacion_clinica": "Box de Reanimación Avanzada - Sector Urgencia",
            "codigo_sello_seguridad": "SELLO-PARO-2026-0041",
            "estado": CarroClinico.EstadoCarro.PENDIENTE_REPOSICION,
            "responsable_qf": usuarios["QF"],
        },
    )
    StockCarroClinico.objects.update_or_create(
        carro=carro_paro,
        medicamento=meds["ADRENALINA"],
        defaults={
            "lote_asignado": lotes["LOT-ADR-2026-AMAR"],
            "cantidad_estandar": 20,
            "cantidad_actual": 14,  # Faltan 6 ampollas tras código azul
        },
    )

    carro_unidosis, _ = CarroClinico.objects.update_or_create(
        codigo_carro="CU-PROC-01",
        defaults={
            "nombre": "Carro Unidosis Sala de Tratamiento y Procedimientos",
            "tipo_carro": CarroClinico.TipoCarro.CARRO_UNIDOSIS,
            "ubicacion_clinica": "Sala de Procedimientos Clínicos Sector Azul/Verde",
            "codigo_sello_seguridad": "SELLO-UNI-2026-0118",
            "estado": CarroClinico.EstadoCarro.SELLADO_OPERATIVO,
            "responsable_qf": usuarios["QF"],
        },
    )
    StockCarroClinico.objects.update_or_create(
        carro=carro_unidosis,
        medicamento=meds["PARACETAMOL"],
        defaults={
            "lote_asignado": lotes["LOT-PAR-2027-VERD"],
            "cantidad_estandar": 100,
            "cantidad_actual": 100,
        },
    )

    if ReposicionCarro.objects.count() == 0:
        solicitud_rep = ReposicionCarro.objects.create(
            codigo_solicitud="REP-CP-2026-0001",
            carro=carro_paro,
            solicitado_por=usuarios["CLINICO"],
            motivo_consumo="Reposición urgente post-reanimación cardiopulmonar en Box SAPU (consumo de 6 ampollas de Adrenalina).",
            estado=ReposicionCarro.EstadoReposicion.SOLICITADA,
        )
        DetalleReposicionCarro.objects.create(
            reposicion=solicitud_rep,
            medicamento=meds["ADRENALINA"],
            cantidad_consumida=6,
            cantidad_solicitada=6,
        )
        FEFOService.aprobar_y_ejecutar_reposicion_carro_fefo(
            reposicion=solicitud_rep,
            usuario_ejecutor=usuarios["TECNICO"],
            nuevo_sello_seguridad="SELLO-PARO-2026-0042-SELLADO",
        )

    # ------------------------------------------------------------------
    # 8. LOGS DE INTEROPERABILIDAD HL7 FHIR (JSONB CON ÍNDICES GIN)
    # ------------------------------------------------------------------
    if HL7FHIRValidationLog.objects.count() == 0:
        HL7FHIRService.validar_y_registrar_interoperabilidad(
            paciente=pacientes[0],
            receta=receta_digital,
            actor_user=usuarios["TECNICO"],
        )
        HL7FHIRService.validar_y_registrar_interoperabilidad(
            paciente=pacientes[2],
            receta=receta_retenida,
            actor_user=usuarios["QF"],
        )

    resumen_prediccion = DemandPredictionService.generar_reporte_prediccion_global(horizonte_dias=90)
    integridad_dag = AuditDAGService.verificar_integridad_cadena()

    return {
        "roles_rbac": RolRBAC.objects.count(),
        "usuarios": Usuario.objects.count(),
        "pacientes": Paciente.objects.count(),
        "programas_salud": ProgramaSalud.objects.count(),
        "inscripciones_cuotas": InscripcionProgramaSalud.objects.count(),
        "medicamentos": Medicamento.objects.count(),
        "lotes": Lote.objects.count(),
        "dispensaciones_fefo": Dispensacion.objects.count(),
        "libro_controlados_isp": LibroControladoISP.objects.count(),
        "carros_clinicos": CarroClinico.objects.count(),
        "reposiciones_carros": ReposicionCarro.objects.count(),
        "nodos_immutable_audit_dag": ImmutableAuditDAG.objects.count(),
        "cadena_dag_integra": integridad_dag["cadena_integra"],
        "logs_hl7_fhir_jsonb": HL7FHIRValidationLog.objects.count(),
        "resumen_prediccion_90d": resumen_prediccion["resumen_ejecutivo"],
    }


if __name__ == "__main__":
    resultado = ejecutar_semilla_cesfam()
    print("=== SEMILLA CESFAM FARMACIA ASISTENCIAL EJECUTADA EXITOSAMENTE ===")
    for k, v in resultado.items():
        print(f"  - {k}: {v}")
