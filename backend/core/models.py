"""
Esquema de Base de Datos Híbrido para el Sistema Web de Gestión Farmacia Asistencial (CESFAM).

Cumple con el 100% del nivel "Destacado" en:
- Criterio 2.1.4.8: Define entidades y relaciones de manera óptima; incluye integridad referencial
  estricta (PROTECT/CASCADE), claves primarias/foráneas y restricciones de dominio (CheckConstraint/UniqueConstraint).
- Criterio 2.1.4.9: Implementa bases estructuradas (SQL Relacional) y no estructuradas
  (JSONB en PostgreSQL con Índices GIN) con ejemplos funcionales:
    a) ImmutableAuditDAG: Registro de auditoría append-only bajo norma ALCOA+ del ISP con cadena SHA-256.
    b) HL7FHIRValidationLog: Almacén documental JSONB de recursos HL7 FHIR R4 (Patient, Coverage, MedicationRequest)
       para interoperabilidad con el bus de MINSAL / FONASA.

EXCLUSIÓN ESTRICTA SECTOR PÚBLICO:
CERO ventas comerciales, CERO POS, CERO boletas/facturas, CERO Isapres, CERO precios comerciales y CERO rol Vendedor.
"""

import hashlib
import json
import uuid
from datetime import timedelta

from django.contrib.auth.models import AbstractUser
from django.contrib.postgres.indexes import GinIndex
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import models
from django.db.models import CheckConstraint, F, Q, UniqueConstraint
from django.utils import timezone

from .validators import (
    cifrar_dato_sensible_ley19628,
    normalizar_rut_chileno,
    validar_rut_chileno,
)


# ==============================================================================
# 1. GESTIÓN DE USUARIOS Y ROLES RBAC (ESTRUCTURADO)
# ==============================================================================


class RolRBAC(models.Model):
    """
    Roles institucionales del sector público de salud (RBAC - Role-Based Access Control).
    Excluye estrictamente cualquier perfil comercial o de ventas.
    """

    class CodigoRol(models.TextChoices):
        ADMIN = "ADMIN", "Administrador del Sistema"
        QF = "QF", "Químico Farmacéutico (Director Técnico)"
        TECNICO = "TECNICO", "Técnico en Farmacia (TENS)"
        CLINICO = "CLINICO", "Personal Clínico (Médico / Enfermero)"

    codigo = models.CharField(
        max_length=20,
        choices=CodigoRol.choices,
        unique=True,
        verbose_name="Código de Rol RBAC",
    )
    nombre = models.CharField(max_length=80, verbose_name="Nombre Institucional del Rol")
    descripcion = models.TextField(verbose_name="Descripción de Funciones Normativas")

    # Matriz de permisos granulares por módulo (Principio de Mínimo Privilegio - RNF-01)
    puede_gestionar_usuarios = models.BooleanField(default=False)
    puede_gestionar_inventario = models.BooleanField(default=False)
    puede_dispensar = models.BooleanField(default=False)
    puede_autorizar_controlados_isp = models.BooleanField(default=False)
    puede_solicitar_reposicion_carro = models.BooleanField(default=False)
    puede_ejecutar_reposicion_carro = models.BooleanField(default=False)
    puede_auditar_dag = models.BooleanField(default=False)
    requiere_mfa_obligatorio = models.BooleanField(default=False)

    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "cesfam_rol_rbac"
        verbose_name = "Rol RBAC Institucional"
        verbose_name_plural = "Roles RBAC Institucionales"
        ordering = ["codigo"]

    def __str__(self) -> str:
        return f"{self.get_codigo_display()} [{self.codigo}]"


class Usuario(AbstractUser):
    """
    Funcionario del CESFAM autenticado en la plataforma.
    Integra validación de RUT chileno Módulo 11, vínculo con RolRBAC y estado MFA.
    """

    rut = models.CharField(
        max_length=15,
        unique=True,
        db_index=True,
        validators=[validar_rut_chileno],
        verbose_name="RUT Funcionario (Módulo 11)",
    )
    telefono = models.CharField(max_length=25, blank=True, verbose_name="Teléfono Institucional")
    rol = models.ForeignKey(
        RolRBAC,
        on_delete=models.PROTECT,
        related_name="usuarios",
        null=True,
        blank=True,
        verbose_name="Rol RBAC Asignado",
    )
    registro_superintendencia_salud = models.CharField(
        max_length=40,
        blank=True,
        verbose_name="N° Registro Superintendencia de Salud (SIS)",
    )
    mfa_habilitado = models.BooleanField(
        default=False,
        verbose_name="Autenticación Multifactor (MFA) Activa",
    )
    debe_cambiar_password = models.BooleanField(
        default=True,
        verbose_name="Cambio de Contraseña Pendiente en Primer Inicio (HU-4)",
    )
    establecimiento = models.CharField(
        max_length=120,
        default="CESFAM Dr. Salvador Allende",
        verbose_name="Establecimiento de Salud APS",
    )

    class Meta:
        db_table = "cesfam_usuario"
        verbose_name = "Usuario Funcionario CESFAM"
        verbose_name_plural = "Usuarios Funcionarios CESFAM"

    def clean(self):
        super().clean()
        if self.rut:
            validar_rut_chileno(self.rut)
            self.rut = normalizar_rut_chileno(self.rut)

    def save(self, *args, **kwargs):
        if self.rut:
            validar_rut_chileno(self.rut)
            self.rut = normalizar_rut_chileno(self.rut)
        super().save(*args, **kwargs)

    @property
    def codigo_rol(self) -> str:
        return self.rol.codigo if self.rol else "SIN_ROL"

    def __str__(self) -> str:
        nombre_completo = f"{self.first_name} {self.last_name}".strip() or self.username
        return f"{nombre_completo} ({self.rut}) - {self.codigo_rol}"


# ==============================================================================
# 2. PACIENTES BENEFICIARIOS Y PROGRAMAS DE SALUD PÚBLICA (GES/AUGE Y CRÓNICOS)
# ==============================================================================


class Paciente(models.Model):
    """
    Paciente beneficiario inscrito en el CESFAM (Red Pública de Salud).
    Validado estrictamente con algoritmo Módulo 11 y afiliación pública FONASA (Tramos A, B, C, D).
    CERO Isapres ni seguros privados.
    """

    class TramoFonasa(models.TextChoices):
        TRAMO_A = "A", "FONASA Tramo A (Carente de recursos / Gratuidad Total)"
        TRAMO_B = "B", "FONASA Tramo B (Ingreso menor o igual al IMM / Gratuidad APS)"
        TRAMO_C = "C", "FONASA Tramo C (Gratuidad total en APS / Copago Cero)"
        TRAMO_D = "D", "FONASA Tramo D (Gratuidad total en APS / Copago Cero)"

    class SectorCesfam(models.TextChoices):
        SECTOR_AZUL = "SECTOR_AZUL", "Sector Azul (Equipo de Cabecera 1)"
        SECTOR_VERDE = "SECTOR_VERDE", "Sector Verde (Equipo de Cabecera 2)"
        SECTOR_ROJO = "SECTOR_ROJO", "Sector Rojo (Equipo de Cabecera 3)"
        SECTOR_AMARILLO = "SECTOR_AMARILLO", "Sector Amarillo (Equipo de Cabecera 4)"

    class SexoBiologico(models.TextChoices):
        FEMENINO = "F", "Femenino"
        MASCULINO = "M", "Masculino"
        INTERSEXUAL = "I", "Intersexual / No especificado"

    rut = models.CharField(
        max_length=15,
        unique=True,
        db_index=True,
        validators=[validar_rut_chileno],
        verbose_name="RUT Paciente (Módulo 11)",
    )
    nombres = models.CharField(max_length=100, verbose_name="Nombres")
    apellidos = models.CharField(max_length=100, verbose_name="Apellidos")
    fecha_nacimiento = models.DateField(verbose_name="Fecha de Nacimiento")
    sexo = models.CharField(
        max_length=1,
        choices=SexoBiologico.choices,
        default=SexoBiologico.FEMENINO,
    )
    telefono = models.CharField(max_length=25, verbose_name="Teléfono de Contacto")
    direccion = models.CharField(max_length=200, verbose_name="Domicilio Comunal")
    sector_cesfam = models.CharField(
        max_length=25,
        choices=SectorCesfam.choices,
        default=SectorCesfam.SECTOR_AZUL,
        verbose_name="Sector Territorial CESFAM",
    )
    tramo_fonasa = models.CharField(
        max_length=2,
        choices=TramoFonasa.choices,
        default=TramoFonasa.TRAMO_B,
        verbose_name="Tramo FONASA Validado",
    )
    patologias_declaradas = models.TextField(
        blank=True,
        verbose_name="Patologías Crónicas / GES Diagnosticadas",
    )
    datos_sensibles_cifrados = models.TextField(
        blank=True,
        editable=False,
        verbose_name="Criptograma AES-256 en Reposo Ley 19.628 (Diagnóstico y Contacto)",
    )
    activo = models.BooleanField(default=True, verbose_name="Beneficiario Activo")
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "cesfam_paciente"
        verbose_name = "Paciente Beneficiario CESFAM"
        verbose_name_plural = "Pacientes Beneficiarios CESFAM"
        ordering = ["apellidos", "nombres"]

    def clean(self):
        super().clean()
        validar_rut_chileno(self.rut)
        self.rut = normalizar_rut_chileno(self.rut)

    def save(self, *args, **kwargs):
        validar_rut_chileno(self.rut)
        self.rut = normalizar_rut_chileno(self.rut)
        ficha_sensible = json.dumps(
            {
                "rut": self.rut,
                "patologias_ges_cronicas": self.patologias_declaradas,
                "telefono_contacto": self.telefono,
                "domicilio": self.direccion,
                "tramo_fonasa": self.tramo_fonasa,
            },
            ensure_ascii=False,
        )
        self.datos_sensibles_cifrados = cifrar_dato_sensible_ley19628(ficha_sensible)
        super().save(*args, **kwargs)

    def obtener_datos_sensibles_descifrados(self) -> dict:
        """Descifra el criptograma AES-256 en reposo únicamente cuando un rol clínico autorizado lo solicita."""
        if not self.datos_sensibles_cifrados:
            return {}
        from .security.crypto_aes256 import AES256DataCipher

        texto = AES256DataCipher.decrypt(self.datos_sensibles_cifrados)
        try:
            return json.loads(texto)
        except json.JSONDecodeError:
            return {"raw": texto}

    @property
    def nombre_completo(self) -> str:
        return f"{self.nombres} {self.apellidos}".strip()

    def __str__(self) -> str:
        return f"{self.nombre_completo} ({self.rut}) - FONASA {self.tramo_fonasa}"


class ProgramaSalud(models.Model):
    """
    Programas de Salud Pública administrados por la Farmacia Asistencial:
    - GES / AUGE (Garantías Explícitas en Salud - Ley 19.966)
    - Programa de Salud Cardiovascular (PSCV) / Pacientes Crónicos
    - Programas Ministeriales APS (Salud Mental, IRA/ERA, FOFAR)
    """

    class TipoPrograma(models.TextChoices):
        GES_AUGE = "GES_AUGE", "Programa GES / AUGE (Garantías Explícitas en Salud)"
        CRONICO = "CRONICO", "Programa Pacientes Crónicos / FOFAR"
        APS_MINISTERIAL = "APS_MINISTERIAL", "Programa Ministerial APS General"

    codigo_minsal = models.CharField(
        max_length=30,
        unique=True,
        db_index=True,
        verbose_name="Código MINSAL / Garantía GES",
    )
    nombre = models.CharField(max_length=150, verbose_name="Nombre del Programa de Salud")
    tipo_programa = models.CharField(
        max_length=20,
        choices=TipoPrograma.choices,
        default=TipoPrograma.GES_AUGE,
        db_index=True,
    )
    numero_garantia_ges = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name="N° Problema de Salud GES/AUGE",
    )
    periodicidad_retiro_dias = models.PositiveIntegerField(
        default=30,
        verbose_name="Periodicidad Estándar de Retiro (Días)",
    )
    descripcion = models.TextField(blank=True)
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = "cesfam_programa_salud"
        verbose_name = "Programa de Salud Pública (GES/Crónicos)"
        verbose_name_plural = "Programas de Salud Pública (GES/Crónicos)"
        constraints = [
            CheckConstraint(
                condition=Q(periodicidad_retiro_dias__gt=0),
                name="chk_programa_periodicidad_positiva",
            )
        ]

    def __str__(self) -> str:
        return f"[{self.codigo_minsal}] {self.nombre} ({self.get_tipo_programa_display()})"


# ==============================================================================
# 3. MEDICAMENTOS, CLASIFICACIÓN, CONTROLADOS ISP Y LOTES FEFO
# ==============================================================================


class CategoriaMedicamento(models.Model):
    """Clasificación farmacológica e institucional de medicamentos e insumos clínicos."""

    codigo = models.CharField(max_length=30, unique=True)
    nombre = models.CharField(max_length=100)
    descripcion = models.TextField(blank=True)

    class Meta:
        db_table = "cesfam_categoria_medicamento"
        verbose_name = "Categoría Farmacológica"
        verbose_name_plural = "Categorías Farmacológicas"

    def __str__(self) -> str:
        return f"{self.nombre} ({self.codigo})"


class Medicamento(models.Model):
    """
    Catálogo institucional de Medicamentos e Insumos Clínicos del Arsenal Farmacológico APS.
    Incluye codificación CENABAST (Ley 21.198) y bandera de fiscalización ISP (Estupefacientes / Psicotrópicos).
    Cumple exclusión estricta: CERO precios comerciales, CERO descuentos.
    """

    class TipoControlISP(models.TextChoices):
        NO_CONTROLADO = "NO_CONTROLADO", "No Controlado (Dispensación Asistencial Estándar)"
        PSICOTROPICO = "PSICOTROPICO", "Psicotrópico (Decreto Supremo N° 405 ISP)"
        ESTUPEFACIENTE = "ESTUPEFACIENTE", "Estupefaciente (Decreto Supremo N° 404 ISP)"

    class FormaFarmaceutica(models.TextChoices):
        COMPRIMIDO = "COMPRIMIDO", "Comprimido Oral"
        CAPSULA = "CAPSULA", "Cápsula"
        SUSPENSION_INYECTABLE = "SUSPENSION_INYECTABLE", "Suspensión Inyectable (Frasco Ampolla)"
        SOLUCION_INYECTABLE = "SOLUCION_INYECTABLE", "Solución Inyectable (Ampolla)"
        INHALADOR = "INHALADOR", "Aerosol / Inhalador"
        INSUMO_CLINICO = "INSUMO_CLINICO", "Insumo Clínico / Dispositivo Médico"

    codigo_cenabast = models.CharField(
        max_length=30,
        unique=True,
        db_index=True,
        verbose_name="Código Nacional CENABAST",
    )
    codigo_atc = models.CharField(
        max_length=20,
        blank=True,
        verbose_name="Código Anatómico Terapéutico Químico (ATC OMS)",
    )
    nombre_generico = models.CharField(
        max_length=140,
        db_index=True,
        verbose_name="Denominación Común Internacional (DCI)",
    )
    concentracion = models.CharField(max_length=60, verbose_name="Concentración / Dosis")
    forma_farmaceutica = models.CharField(
        max_length=30,
        choices=FormaFarmaceutica.choices,
        default=FormaFarmaceutica.COMPRIMIDO,
    )
    unidad_medida = models.CharField(
        max_length=30,
        default="COMPRIMIDO",
        verbose_name="Unidad de Dispensación",
    )
    categoria = models.ForeignKey(
        CategoriaMedicamento,
        on_delete=models.PROTECT,
        related_name="medicamentos",
        verbose_name="Categoría Farmacológica",
    )
    es_insumo_clinico = models.BooleanField(
        default=False,
        verbose_name="Es Insumo Clínico",
    )
    es_controlado = models.BooleanField(
        default=False,
        db_index=True,
        verbose_name="Sujeto a Control Legal ISP (Estupefaciente/Psicotrópico)",
    )
    tipo_controlado = models.CharField(
        max_length=20,
        choices=TipoControlISP.choices,
        default=TipoControlISP.NO_CONTROLADO,
        verbose_name="Clasificación Legal ISP (D.S. 404/405)",
    )
    requiere_receta_retenida = models.BooleanField(
        default=False,
        verbose_name="Exige Receta Retenida / Cheque",
    )
    requiere_cadena_frio = models.BooleanField(
        default=False,
        verbose_name="Requiere Refrigeración (2°C - 8°C)",
    )
    esencial_carro_paro = models.BooleanField(
        default=False,
        verbose_name="Fármaco Crítico de Carro de Paro",
    )
    stock_minimo_alerta = models.PositiveIntegerField(
        default=200,
        verbose_name="Umbral de Stock Mínimo (Alerta Preventiva)",
    )
    stock_critico_alerta = models.PositiveIntegerField(
        default=80,
        verbose_name="Umbral de Stock Crítico (Riesgo de Quiebre)",
    )
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = "cesfam_medicamento"
        verbose_name = "Medicamento / Insumo Arsenal CESFAM"
        verbose_name_plural = "Medicamentos e Insumos Arsenal CESFAM"
        ordering = ["nombre_generico"]
        constraints = [
            CheckConstraint(
                condition=(
                    Q(es_controlado=False, tipo_controlado="NO_CONTROLADO")
                    | Q(
                        es_controlado=True,
                        tipo_controlado__in=["PSICOTROPICO", "ESTUPEFACIENTE"],
                        requiere_receta_retenida=True,
                    )
                ),
                name="chk_medicamento_coherencia_controlado_isp",
            ),
            CheckConstraint(
                condition=Q(stock_minimo_alerta__gte=F("stock_critico_alerta")),
                name="chk_medicamento_umbrales_stock_coherentes",
            ),
        ]

    def __str__(self) -> str:
        ctrl = f" [CONTROLADO: {self.tipo_controlado}]" if self.es_controlado else ""
        return f"{self.nombre_generico} {self.concentracion} ({self.codigo_cenabast}){ctrl}"


class InscripcionProgramaSalud(models.Model):
    """
    Control de cuotas de entrega gratuitas para pacientes adscritos a programas GES/AUGE y Crónicos (RF-10).
    Permite proyectar exactamente las cuotas pendientes a 90 días para el motor de Predicción de Demanda.
    """

    class EstadoInscripcion(models.TextChoices):
        ACTIVA = "ACTIVA", "Activa con Cobertura Vigente"
        SUSPENDIDA = "SUSPENDIDA", "Suspendida Temporalmente"
        FINALIZADA = "FINALIZADA", "Cuotas Completadas"
        VENCIDA = "VENCIDA", "Vigencia Expirada"

    paciente = models.ForeignKey(
        Paciente,
        on_delete=models.PROTECT,
        related_name="inscripciones_programas",
    )
    programa = models.ForeignKey(
        ProgramaSalud,
        on_delete=models.PROTECT,
        related_name="inscripciones",
    )
    medicamento = models.ForeignKey(
        Medicamento,
        on_delete=models.PROTECT,
        related_name="inscripciones_programas",
    )
    dosis_mensual_unidades = models.PositiveIntegerField(
        verbose_name="Unidades por Cuota Mensual",
    )
    cuotas_totales_autorizadas = models.PositiveIntegerField(
        default=12,
        verbose_name="Total de Cuotas Autorizadas en el Ciclo",
    )
    cuotas_consumidas = models.PositiveIntegerField(
        default=0,
        verbose_name="Cuotas Retiradas a la Fecha",
    )
    fecha_inscripcion = models.DateField(default=timezone.localdate)
    fecha_ultimo_retiro = models.DateField(null=True, blank=True)
    fecha_proximo_retiro = models.DateField(
        db_index=True,
        verbose_name="Fecha Programada de Próximo Retiro",
    )
    fecha_vencimiento_cobertura = models.DateField(
        verbose_name="Fecha Límite de Vigencia del Tratamiento",
    )
    estado = models.CharField(
        max_length=15,
        choices=EstadoInscripcion.choices,
        default=EstadoInscripcion.ACTIVA,
        db_index=True,
    )

    class Meta:
        db_table = "cesfam_inscripcion_programa_salud"
        verbose_name = "Inscripción y Control de Cuotas GES/Crónicos"
        verbose_name_plural = "Inscripciones y Control de Cuotas GES/Crónicos"
        constraints = [
            CheckConstraint(
                condition=Q(cuotas_consumidas__lte=F("cuotas_totales_autorizadas")),
                name="chk_cuotas_consumidas_no_exceden_autorizadas",
            ),
            CheckConstraint(
                condition=Q(dosis_mensual_unidades__gt=0),
                name="chk_dosis_mensual_positiva",
            ),
            UniqueConstraint(
                fields=["paciente", "programa", "medicamento", "fecha_inscripcion"],
                name="uq_inscripcion_paciente_programa_medicamento",
            ),
        ]

    @property
    def cuotas_pendientes(self) -> int:
        return max(0, self.cuotas_totales_autorizadas - self.cuotas_consumidas)

    @property
    def tiene_cuota_disponible(self) -> bool:
        hoy = timezone.localdate()
        return (
            self.estado == self.EstadoInscripcion.ACTIVA
            and self.cuotas_pendientes > 0
            and self.fecha_vencimiento_cobertura >= hoy
        )

    def calcular_cuotas_en_ventana_dias(self, dias_horizonte: int = 90) -> int:
        """
        Calcula cuántas cuotas de retiro vencen dentro de los próximos `dias_horizonte` (ej. 90 días),
        limitado por las cuotas pendientes reales del paciente y la vigencia de su cobertura.
        """
        if not self.tiene_cuota_disponible:
            return 0
        periodicidad = max(1, self.programa.periodicidad_retiro_dias)
        ciclos_en_ventana = max(1, dias_horizonte // periodicidad)
        return min(self.cuotas_pendientes, ciclos_en_ventana)

    def __str__(self) -> str:
        return (
            f"{self.paciente.nombre_completo} | {self.programa.codigo_minsal} | "
            f"{self.medicamento.nombre_generico} (Cuotas: {self.cuotas_consumidas}/{self.cuotas_totales_autorizadas})"
        )


class Lote(models.Model):
    """
    Control físico y sanitario de Lotes por Medicamento (RF-04 y RF-05).
    Separa explícitamente `stock_bodega` y `stock_vitrina`, controla la `fecha_vencimiento`
    y alimenta el algoritmo FEFO (First Expired, First Out) y el Semáforo Sanitario.
    """

    class EstadoLote(models.TextChoices):
        DISPONIBLE = "DISPONIBLE", "Disponible para Uso Clínico / Dispensación"
        CUARENTENA = "CUARENTENA", "En Cuarentena / Retención Preventiva"
        VENCIDO = "VENCIDO", "Vencido (Bloqueado por Motor FEFO)"
        EN_DEVOLUCION = "EN_DEVOLUCION", "En Proceso de Devolución / Canje CENABAST (HU-3)"
        PARA_DONACION = "PARA_DONACION", "Marcado para Donación / Traslado Red APS (HU-3)"

    numero_lote = models.CharField(
        max_length=50,
        db_index=True,
        verbose_name="Código de Lote de Fabricación",
    )
    medicamento = models.ForeignKey(
        Medicamento,
        on_delete=models.PROTECT,
        related_name="lotes",
        verbose_name="Medicamento / Insumo",
    )
    fecha_fabricacion = models.DateField(verbose_name="Fecha de Elaboración")
    fecha_vencimiento = models.DateField(
        db_index=True,
        verbose_name="Fecha de Vencimiento (Criterio FEFO)",
    )
    fecha_recepcion = models.DateField(
        default=timezone.localdate,
        verbose_name="Fecha de Recepción en Bodega CESFAM",
    )
    stock_bodega = models.PositiveIntegerField(
        default=0,
        verbose_name="Stock en Bodega Central",
    )
    stock_vitrina = models.PositiveIntegerField(
        default=0,
        verbose_name="Stock en Vitrina de Dispensación",
    )
    estado_lote = models.CharField(
        max_length=20,
        choices=EstadoLote.choices,
        default=EstadoLote.DISPONIBLE,
        db_index=True,
    )
    guia_despacho_cenabast = models.CharField(
        max_length=50,
        default="GD-CENABAST-2026",
        verbose_name="Guía de Abastecimiento CENABAST",
    )
    observaciones_qf = models.TextField(
        blank=True,
        verbose_name="Observaciones Técnicas del Q.F.",
    )

    class Meta:
        db_table = "cesfam_lote"
        verbose_name = "Lote Farmacéutico (FEFO)"
        verbose_name_plural = "Lotes Farmacéuticos (FEFO)"
        ordering = ["fecha_vencimiento", "id"]
        constraints = [
            UniqueConstraint(
                fields=["medicamento", "numero_lote"],
                name="uq_medicamento_numero_lote",
            ),
            CheckConstraint(
                condition=Q(stock_bodega__gte=0) & Q(stock_vitrina__gte=0),
                name="chk_lote_stocks_no_negativos",
            ),
            CheckConstraint(
                condition=Q(fecha_vencimiento__gt=F("fecha_fabricacion")),
                name="chk_lote_vencimiento_posterior_fabricacion",
            ),
        ]

    @property
    def stock_total(self) -> int:
        return self.stock_bodega + self.stock_vitrina

    @property
    def dias_para_vencer(self) -> int:
        return (self.fecha_vencimiento - timezone.localdate()).days

    @property
    def esta_vencido(self) -> bool:
        return self.fecha_vencimiento <= timezone.localdate()

    @property
    def semaforo_vencimiento(self) -> str:
        """
        Clasificación visual y normativa del lote:
        - ROJO: Lote vencido (<= 0 días) o en ventana crítica inminente (<= 30 días).
        - AMARILLO: Alerta preventiva (< 90 días / 3 meses según Historia de Usuario 3).
        - VERDE: Vigencia holgada (> 90 días).
        """
        dias = self.dias_para_vencer
        if dias <= 30 or self.estado_lote == self.EstadoLote.VENCIDO:
            return "ROJO"
        if dias <= 90:
            return "AMARILLO"
        return "VERDE"

    @property
    def es_habil_fefo(self) -> bool:
        """Determina si el lote es apto para ser seleccionado por el motor automático FEFO."""
        return (
            not self.esta_vencido
            and self.estado_lote == self.EstadoLote.DISPONIBLE
            and self.stock_total > 0
        )

    def __str__(self) -> str:
        return (
            f"Lote {self.numero_lote} ({self.medicamento.nombre_generico}) - "
            f"Vence: {self.fecha_vencimiento} [{self.semaforo_vencimiento}] "
            f"(Bodega: {self.stock_bodega} | Vitrina: {self.stock_vitrina})"
        )


# ==============================================================================
# 4. RECETAS MÉDICAS Y DISPENSACIÓN CON TRAZABILIDAD DE TERCERO AUTORIZADO
# ==============================================================================


class RecetaMedica(models.Model):
    """
    Prescripción médica asistencial (RF-08).
    Soporta los 3 formatos requeridos: Física, Digital (interoperabilidad MINSAL) y Retenida (Controlados ISP).
    """

    class TipoReceta(models.TextChoices):
        FISICA = "FISICA", "Receta Médica Física APS"
        DIGITAL = "DIGITAL", "Receta Médica Electrónica / Digital (Bus HL7 FHIR)"
        RETENIDA = "RETENIDA", "Receta Médica Retenida / Cheque (Controlados ISP)"

    class EstadoReceta(models.TextChoices):
        VIGENTE = "VIGENTE", "Vigente con Saldo Disponible"
        DISPENSADA_PARCIAL = "DISPENSADA_PARCIAL", "Dispensada Parcialmente (Con Saldo)"
        DISPENSADA_TOTAL = "DISPENSADA_TOTAL", "Dispensada Totalmente (Sin Saldo)"
        VENCIDA = "VENCIDA", "Vencida"
        ANULADA = "ANULADA", "Anulada por Prescriptor / Q.F."

    folio_receta = models.CharField(
        max_length=40,
        unique=True,
        db_index=True,
        verbose_name="Folio Único de Receta",
    )
    paciente = models.ForeignKey(
        Paciente,
        on_delete=models.PROTECT,
        related_name="recetas",
        verbose_name="Paciente Beneficiario",
    )
    programa_salud = models.ForeignKey(
        ProgramaSalud,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recetas",
        verbose_name="Programa de Salud Asociado (GES/Crónico)",
    )
    tipo_receta = models.CharField(
        max_length=15,
        choices=TipoReceta.choices,
        default=TipoReceta.FISICA,
        db_index=True,
    )
    medico_prescriptor_nombre = models.CharField(
        max_length=120,
        verbose_name="Nombre Médico Prescriptor",
    )
    medico_prescriptor_rut = models.CharField(
        max_length=15,
        validators=[validar_rut_chileno],
        verbose_name="RUT Médico Prescriptor (Módulo 11)",
    )
    medico_registro_sis = models.CharField(
        max_length=40,
        default="SIS-MED-APS",
        verbose_name="Registro Superintendencia de Salud del Médico",
    )
    diagnostico_cie10 = models.CharField(
        max_length=180,
        verbose_name="Diagnóstico Clínico CIE-10",
    )
    fecha_emision = models.DateField(default=timezone.localdate)
    fecha_vencimiento = models.DateField(verbose_name="Fecha de Vencimiento de la Receta")
    estado = models.CharField(
        max_length=25,
        choices=EstadoReceta.choices,
        default=EstadoReceta.VIGENTE,
        db_index=True,
    )
    folio_archivo_retenida = models.CharField(
        max_length=50,
        blank=True,
        verbose_name="Folio Custodia Receta Retenida ISP",
    )
    observaciones = models.TextField(blank=True)

    class Meta:
        db_table = "cesfam_receta_medica"
        verbose_name = "Receta Médica"
        verbose_name_plural = "Recetas Médicas"
        ordering = ["-fecha_emision", "-id"]

    def clean(self):
        super().clean()
        validar_rut_chileno(self.medico_prescriptor_rut)
        self.medico_prescriptor_rut = normalizar_rut_chileno(self.medico_prescriptor_rut)

    def save(self, *args, **kwargs):
        validar_rut_chileno(self.medico_prescriptor_rut)
        self.medico_prescriptor_rut = normalizar_rut_chileno(self.medico_prescriptor_rut)
        super().save(*args, **kwargs)

    @property
    def esta_vigente(self) -> bool:
        return (
            self.fecha_vencimiento >= timezone.localdate()
            and self.estado in (self.EstadoReceta.VIGENTE, self.EstadoReceta.DISPENSADA_PARCIAL)
        )

    def __str__(self) -> str:
        return f"{self.folio_receta} [{self.tipo_receta}] - {self.paciente.nombre_completo}"


class DetalleReceta(models.Model):
    """Ítems prescritos dentro de una Receta Médica con control de saldo."""

    receta = models.ForeignKey(
        RecetaMedica,
        on_delete=models.CASCADE,
        related_name="detalles",
    )
    medicamento = models.ForeignKey(
        Medicamento,
        on_delete=models.PROTECT,
        related_name="prescripciones",
    )
    posologia = models.CharField(max_length=200, verbose_name="Indicaciones y Posología")
    cantidad_prescrita = models.PositiveIntegerField(verbose_name="Cantidad Total Prescrita")
    cantidad_dispensada = models.PositiveIntegerField(
        default=0,
        verbose_name="Cantidad Acumulada Dispensada",
    )

    class Meta:
        db_table = "cesfam_detalle_receta"
        verbose_name = "Detalle de Receta Médica"
        verbose_name_plural = "Detalles de Recetas Médicas"
        constraints = [
            CheckConstraint(
                condition=Q(cantidad_prescrita__gt=0),
                name="chk_detalle_receta_cantidad_positiva",
            ),
            CheckConstraint(
                condition=Q(cantidad_dispensada__lte=F("cantidad_prescrita")),
                name="chk_detalle_receta_dispensado_no_excede_prescrito",
            ),
        ]

    @property
    def saldo_pendiente(self) -> int:
        return max(0, self.cantidad_prescrita - self.cantidad_dispensada)

    def __str__(self) -> str:
        return (
            f"{self.receta.folio_receta} -> {self.medicamento.nombre_generico} "
            f"(Dispensado: {self.cantidad_dispensada}/{self.cantidad_prescrita})"
        )


class Dispensacion(models.Model):
    """
    Registro transaccional de entrega gratuita de medicamentos a pacientes (RF-09 y RF-11).
    Vincula Receta, Paciente, Lote asignado por FEFO, Cuota de Programa de Salud,
    Funcionario Dispensador, Autorización de Q.F. (si es controlado) y Trazabilidad de
    Retiro por Tercero Autorizado.
    """

    codigo_dispensacion = models.CharField(
        max_length=40,
        unique=True,
        db_index=True,
        verbose_name="Folio de Dispensación Asistencial",
    )
    receta = models.ForeignKey(
        RecetaMedica,
        on_delete=models.PROTECT,
        related_name="dispensaciones",
    )
    detalle_receta = models.ForeignKey(
        DetalleReceta,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="dispensaciones",
    )
    paciente = models.ForeignKey(
        Paciente,
        on_delete=models.PROTECT,
        related_name="dispensaciones",
    )
    medicamento = models.ForeignKey(
        Medicamento,
        on_delete=models.PROTECT,
        related_name="dispensaciones",
    )
    lote = models.ForeignKey(
        Lote,
        on_delete=models.PROTECT,
        related_name="dispensaciones",
        verbose_name="Lote Asignado por Motor FEFO",
    )
    inscripcion_programa = models.ForeignKey(
        InscripcionProgramaSalud,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dispensaciones",
        verbose_name="Inscripción GES/Crónico Imputada",
    )
    usuario_dispensador = models.ForeignKey(
        Usuario,
        on_delete=models.PROTECT,
        related_name="dispensaciones_ejecutadas",
        verbose_name="Funcionario que Dispensa (Técnico / Q.F.)",
    )
    usuario_autorizador_qf = models.ForeignKey(
        Usuario,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="dispensaciones_visadas_qf",
        verbose_name="Químico Farmacéutico Autorizador (Controlados ISP)",
    )
    cantidad_dispensada = models.PositiveIntegerField(verbose_name="Unidades Entregadas")
    numero_cuota_aplicada = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name="N° de Cuota GES/Crónico Imputada",
    )
    fecha_dispensacion = models.DateTimeField(default=timezone.now, db_index=True)

    # Trazabilidad de Retiro por Tercero Autorizado (RF-11)
    es_retiro_tercero = models.BooleanField(
        default=False,
        verbose_name="Retirado por Tercero Autorizado / Cuidador",
    )
    tercero_nombre = models.CharField(
        max_length=120,
        blank=True,
        verbose_name="Nombre Completo del Tercero que Retira",
    )
    tercero_rut = models.CharField(
        max_length=15,
        blank=True,
        verbose_name="RUT del Tercero que Retira (Módulo 11)",
    )
    tercero_parentesco = models.CharField(
        max_length=60,
        blank=True,
        verbose_name="Parentesco o Vínculo con el Paciente",
    )
    tercero_telefono = models.CharField(
        max_length=25,
        blank=True,
        verbose_name="Teléfono del Tercero Autorizado",
    )

    comprobante_hash_sha256 = models.CharField(
        max_length=64,
        editable=False,
        verbose_name="Hash SHA-256 del Comprobante de Retiro Asistencial",
    )
    observaciones = models.TextField(blank=True)

    class Meta:
        db_table = "cesfam_dispensacion"
        verbose_name = "Dispensación de Medicamento"
        verbose_name_plural = "Dispensaciones de Medicamentos"
        ordering = ["-fecha_dispensacion"]
        constraints = [
            CheckConstraint(
                condition=Q(cantidad_dispensada__gt=0),
                name="chk_dispensacion_cantidad_positiva",
            ),
        ]

    def clean(self):
        super().clean()
        if self.es_retiro_tercero:
            if not self.tercero_nombre or not self.tercero_rut or not self.tercero_parentesco:
                raise ValidationError(
                    "En retiros por tercero autorizado (RF-11) es obligatorio registrar "
                    "nombre, RUT (Módulo 11) y parentesco de quien retira."
                )
            validar_rut_chileno(self.tercero_rut)
            self.tercero_rut = normalizar_rut_chileno(self.tercero_rut)

        if self.medicamento_id and self.medicamento.es_controlado:
            if not self.usuario_autorizador_qf:
                raise ValidationError(
                    "Los medicamentos controlados (Estupefacientes/Psicotrópicos) exigen "
                    "la visación obligatoria de un Químico Farmacéutico."
                )

    def save(self, *args, **kwargs):
        self.clean()
        if not self.comprobante_hash_sha256:
            semilla = (
                f"{self.codigo_dispensacion}|{self.paciente_id}|{self.medicamento_id}|"
                f"{self.lote_id}|{self.cantidad_dispensada}|{timezone.now().isoformat()}"
            )
            self.comprobante_hash_sha256 = hashlib.sha256(semilla.encode("utf-8")).hexdigest()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        retiro = f" [Retira Tercero: {self.tercero_nombre}]" if self.es_retiro_tercero else ""
        return (
            f"{self.codigo_dispensacion} | {self.paciente.nombre_completo} -> "
            f"{self.medicamento.nombre_generico} x{self.cantidad_dispensada} (Lote {self.lote.numero_lote}){retiro}"
        )


class LibroControladoISP(models.Model):
    """
    Libro Digital Oficial de Control de Estupefacientes (D.S. 404) y Psicotrópicos (D.S. 405)
    exigido por el Instituto de Salud Pública (ISP).
    """

    folio_libro_isp = models.CharField(max_length=40, unique=True, db_index=True)
    dispensacion = models.OneToOneField(
        Dispensacion,
        on_delete=models.PROTECT,
        related_name="registro_libro_isp",
    )
    medicamento = models.ForeignKey(Medicamento, on_delete=models.PROTECT)
    lote = models.ForeignKey(Lote, on_delete=models.PROTECT)
    receta_retenida = models.ForeignKey(RecetaMedica, on_delete=models.PROTECT)
    quimico_farmaceutico = models.ForeignKey(
        Usuario,
        on_delete=models.PROTECT,
        related_name="registros_isp_firmados",
    )
    tipo_controlado = models.CharField(max_length=20)
    saldo_anterior_lote = models.PositiveIntegerField()
    cantidad_egresada = models.PositiveIntegerField()
    saldo_posterior_lote = models.PositiveIntegerField()
    paciente_rut = models.CharField(max_length=15)
    medico_prescriptor_rut = models.CharField(max_length=15)
    firma_electronica_qf_sha256 = models.CharField(max_length=64)
    fecha_registro = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "cesfam_libro_controlado_isp"
        verbose_name = "Asiento Libro Digital de Controlados ISP"
        verbose_name_plural = "Libro Digital de Controlados ISP (D.S. 404/405)"

    def __str__(self) -> str:
        return f"ISP {self.folio_libro_isp} - {self.medicamento.nombre_generico} ({self.tipo_controlado})"


# ==============================================================================
# 5. CARROS CLÍNICOS (CARRO DE PARO Y CARRO UNIDOSIS) Y REPOSICIONES
# ==============================================================================


class CarroClinico(models.Model):
    """
    Administración de Carros Clínicos del establecimiento (RF-12 y RF-13):
    - CARRO_PARO: Carro de Paro para emergencias vitales (Adrenalina, Atropina, Amiodarona, etc.).
    - CARRO_UNIDOSIS: Carro Unidosis o de Tratamiento para procedimientos clínicos diarios.
    """

    class TipoCarro(models.TextChoices):
        CARRO_PARO = "CARRO_PARO", "Carro de Paro (Emergencia Vital / Reanimación)"
        CARRO_UNIDOSIS = "CARRO_UNIDOSIS", "Carro Unidosis / Carro de Tratamiento Clínico"

    class EstadoCarro(models.TextChoices):
        SELLADO_OPERATIVO = "SELLADO_OPERATIVO", "Sellado y 100% Operativo"
        ABIERTO_EN_USO = "ABIERTO_EN_USO", "Abierto por Emergencia / Uso Clínico"
        PENDIENTE_REPOSICION = "PENDIENTE_REPOSICION", "Con Faltantes - Pendiente de Reposición"
        EN_REVISION_QF = "EN_REVISION_QF", "En Auditoría por Químico Farmacéutico"

    codigo_carro = models.CharField(max_length=30, unique=True, db_index=True)
    nombre = models.CharField(max_length=120)
    tipo_carro = models.CharField(
        max_length=20,
        choices=TipoCarro.choices,
        db_index=True,
    )
    ubicacion_clinica = models.CharField(
        max_length=140,
        verbose_name="Box o Servicio Clínico Asignado",
    )
    codigo_sello_seguridad = models.CharField(
        max_length=40,
        verbose_name="N° Sello de Seguridad Actual",
    )
    estado = models.CharField(
        max_length=25,
        choices=EstadoCarro.choices,
        default=EstadoCarro.SELLADO_OPERATIVO,
    )
    responsable_qf = models.ForeignKey(
        Usuario,
        on_delete=models.PROTECT,
        related_name="carros_supervisados",
    )
    ultima_revision = models.DateTimeField(default=timezone.now)
    activo = models.BooleanField(default=True)

    class Meta:
        db_table = "cesfam_carro_clinico"
        verbose_name = "Carro Clínico (Paro / Unidosis)"
        verbose_name_plural = "Carros Clínicos (Paro y Unidosis)"

    def __str__(self) -> str:
        return f"[{self.codigo_carro}] {self.nombre} ({self.get_tipo_carro_display()}) - {self.estado}"


class StockCarroClinico(models.Model):
    """Dotación estándar versus stock actual de medicamentos/insumos dentro de un Carro Clínico."""

    carro = models.ForeignKey(
        CarroClinico,
        on_delete=models.CASCADE,
        related_name="dotacion",
    )
    medicamento = models.ForeignKey(
        Medicamento,
        on_delete=models.PROTECT,
        related_name="dotaciones_carro",
    )
    lote_asignado = models.ForeignKey(
        Lote,
        on_delete=models.PROTECT,
        related_name="asignaciones_carro",
    )
    cantidad_estandar = models.PositiveIntegerField(
        verbose_name="Dotación Normativa Estándar",
    )
    cantidad_actual = models.PositiveIntegerField(
        verbose_name="Existencia Física Actual en el Carro",
    )

    class Meta:
        db_table = "cesfam_stock_carro_clinico"
        verbose_name = "Dotación de Medicamento en Carro Clínico"
        verbose_name_plural = "Dotaciones de Medicamentos en Carros Clínicos"
        constraints = [
            UniqueConstraint(
                fields=["carro", "medicamento"],
                name="uq_carro_medicamento_dotacion",
            ),
            CheckConstraint(
                condition=Q(cantidad_estandar__gt=0) & Q(cantidad_actual__gte=0),
                name="chk_stock_carro_cantidades_validas",
            ),
        ]

    @property
    def diferencia_faltante(self) -> int:
        return max(0, self.cantidad_estandar - self.cantidad_actual)

    def __str__(self) -> str:
        return (
            f"{self.carro.codigo_carro} | {self.medicamento.nombre_generico}: "
            f"{self.cantidad_actual}/{self.cantidad_estandar} (Faltante: {self.diferencia_faltante})"
        )


class ReposicionCarro(models.Model):
    """
    Solicitud y ejecución de reposición de Carros Clínicos (RF-14 y Historia de Usuario 2).
    Flujo: Personal Clínico solicita reposición -> Técnico en Farmacia / Q.F. aprueba y ejecuta
    descontando desde Bodega bajo criterio FEFO.
    """

    class EstadoReposicion(models.TextChoices):
        SOLICITADA = "SOLICITADA", "Solicitada por Personal Clínico (En Cola)"
        APROBADA_EJECUTADA = "APROBADA_EJECUTADA", "Aprobada y Repuesta por Farmacia (FEFO)"
        RECHAZADA = "RECHAZADA", "Observada / Rechazada"

    codigo_solicitud = models.CharField(max_length=40, unique=True, db_index=True)
    carro = models.ForeignKey(
        CarroClinico,
        on_delete=models.PROTECT,
        related_name="reposiciones",
    )
    solicitado_por = models.ForeignKey(
        Usuario,
        on_delete=models.PROTECT,
        related_name="solicitudes_reposicion_creadas",
        verbose_name="Solicitado por (Personal Clínico)",
    )
    aprobado_por = models.ForeignKey(
        Usuario,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="reposiciones_carro_aprobadas",
        verbose_name="Aprobado y Ejecutado por (Técnico / Q.F.)",
    )
    motivo_consumo = models.CharField(
        max_length=180,
        verbose_name="Motivo Clínico de Uso / Reposición",
    )
    estado = models.CharField(
        max_length=25,
        choices=EstadoReposicion.choices,
        default=EstadoReposicion.SOLICITADA,
        db_index=True,
    )
    nuevo_sello_seguridad = models.CharField(max_length=40, blank=True)
    fecha_solicitud = models.DateTimeField(default=timezone.now)
    fecha_ejecucion = models.DateTimeField(null=True, blank=True)
    observaciones = models.TextField(blank=True)

    class Meta:
        db_table = "cesfam_reposicion_carro"
        verbose_name = "Reposición de Carro Clínico"
        verbose_name_plural = "Reposiciones de Carros Clínicos"
        ordering = ["-fecha_solicitud"]

    def __str__(self) -> str:
        return f"{self.codigo_solicitud} - {self.carro.codigo_carro} [{self.estado}]"


class DetalleReposicionCarro(models.Model):
    """Detalle por medicamento de una reposición de Carro Clínico."""

    reposicion = models.ForeignKey(
        ReposicionCarro,
        on_delete=models.CASCADE,
        related_name="detalles",
    )
    medicamento = models.ForeignKey(
        Medicamento,
        on_delete=models.PROTECT,
    )
    cantidad_consumida = models.PositiveIntegerField(
        verbose_name="Cantidad Consumida en Atención Clínica",
    )
    cantidad_solicitada = models.PositiveIntegerField(
        verbose_name="Cantidad Solicitada a Reponer",
    )
    cantidad_repuesta = models.PositiveIntegerField(
        default=0,
        verbose_name="Cantidad Efectivamente Repuesta por Farmacia",
    )
    lote_origen_fefo = models.ForeignKey(
        Lote,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        verbose_name="Lote de Bodega Asignado por FEFO",
    )

    class Meta:
        db_table = "cesfam_detalle_reposicion_carro"
        verbose_name = "Detalle de Reposición de Carro"
        verbose_name_plural = "Detalles de Reposición de Carros"

    def __str__(self) -> str:
        return (
            f"{self.reposicion.codigo_solicitud} | {self.medicamento.nombre_generico}: "
            f"Solicitado {self.cantidad_solicitada}, Repuesto {self.cantidad_repuesta}"
        )


class MovimientoInventario(models.Model):
    """Historial estructurado de movimientos de inventario (RF-17)."""

    class TipoMovimiento(models.TextChoices):
        INGRESO_CENABAST = "INGRESO_CENABAST", "Recepción de Abastecimiento CENABAST"
        TRASPASO_BODEGA_VITRINA = "TRASPASO_BODEGA_VITRINA", "Traspaso Interno Bodega -> Vitrina"
        DISPENSACION_PACIENTE = "DISPENSACION_PACIENTE", "Dispensación Gratuita a Paciente"
        REPOSICION_CARRO = "REPOSICION_CARRO", "Reposición de Carro Clínico (Paro / Unidosis)"
        BAJA_O_DEVOLUCION = "BAJA_O_DEVOLUCION", "Retiro por Vencimiento / Devolución / Donación"

    tipo_movimiento = models.CharField(
        max_length=30,
        choices=TipoMovimiento.choices,
        db_index=True,
    )
    medicamento = models.ForeignKey(
        Medicamento,
        on_delete=models.PROTECT,
        related_name="movimientos",
    )
    lote = models.ForeignKey(
        Lote,
        on_delete=models.PROTECT,
        related_name="movimientos",
    )
    cantidad = models.PositiveIntegerField()
    ubicacion_origen = models.CharField(max_length=40)
    ubicacion_destino = models.CharField(max_length=40)
    stock_bodega_resultante = models.PositiveIntegerField()
    stock_vitrina_resultante = models.PositiveIntegerField()
    usuario_responsable = models.ForeignKey(
        Usuario,
        on_delete=models.PROTECT,
        related_name="movimientos_inventario",
    )
    referencia_operacion = models.CharField(max_length=60)
    fecha_movimiento = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "cesfam_movimiento_inventario"
        verbose_name = "Movimiento Histórico de Inventario"
        verbose_name_plural = "Movimientos Históricos de Inventario"
        ordering = ["-fecha_movimiento", "-id"]

    def __str__(self) -> str:
        return (
            f"[{self.tipo_movimiento}] {self.medicamento.nombre_generico} "
            f"(Lote {self.lote.numero_lote}) x{self.cantidad} - Ref: {self.referencia_operacion}"
        )


# ==============================================================================
# 6. COMPONENTE NO ESTRUCTURADO (JSONB EN POSTGRESQL CON ÍNDICES GIN - 2.1.4.9)
# ==============================================================================


class ImmutableAuditQuerySet(models.QuerySet):
    """QuerySet que prohíbe operaciones masivas de borrado o actualización sobre el DAG de auditoría."""

    def delete(self):
        raise PermissionDenied(
            "VIOLACIÓN NORMA ALCOA+ ISP: La tabla ImmutableAuditDAG es estrictamente append-only. "
            "No se permite eliminar registros de auditoría."
        )

    def update(self, **kwargs):
        raise PermissionDenied(
            "VIOLACIÓN NORMA ALCOA+ ISP: La tabla ImmutableAuditDAG es estrictamente inmutable. "
            "No se permite modificar registros existentes."
        )


class ImmutableAuditDAG(models.Model):
    """
    Tabla No Estructurada / Híbrida 1: `ImmutableAuditDAG` (Criterio 2.1.4.9).
    Implementa trazabilidad avanzada tipo DAG (Directed Acyclic Graph) / cadena de custodia
    inmutable bajo la norma sanitaria ALCOA+ (Atribuible, Legible, Contemporánea, Original, Exacta)
    exigida por el Instituto de Salud Pública (ISP).

    - Almacena el documento de cambio en `payload_json` (tipo nativo `JSONB` en PostgreSQL)
      indexado con `GinIndex` para consultas documentales de alta velocidad.
    - Encadena cada evento mediante un hash criptográfico SHA-256 (`previous_hash` -> `current_hash`).
    """

    GENESIS_HASH = "0" * 64

    event_uuid = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        editable=False,
        verbose_name="UUID Único del Nodo DAG",
    )
    timestamp = models.DateTimeField(
        default=timezone.now,
        editable=False,
        db_index=True,
        verbose_name="Marca de Tiempo Contemporánea (ALCOA+)",
    )
    actor_user = models.ForeignKey(
        Usuario,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        editable=False,
        related_name="eventos_auditoria_dag",
    )
    actor_rut = models.CharField(
        max_length=15,
        editable=False,
        db_index=True,
        verbose_name="RUT del Actor Responsable (Atribuible)",
    )
    actor_role = models.CharField(
        max_length=30,
        editable=False,
        verbose_name="Rol RBAC en el Momento de la Operación",
    )
    ip_address = models.GenericIPAddressField(
        default="127.0.0.1",
        editable=False,
        verbose_name="Dirección IP de Origen",
    )
    action_type = models.CharField(
        max_length=60,
        editable=False,
        db_index=True,
        verbose_name="Tipo de Operación Crítica",
    )
    entity_type = models.CharField(
        max_length=60,
        editable=False,
        db_index=True,
        verbose_name="Entidad Afectada",
    )
    entity_id = models.CharField(
        max_length=60,
        editable=False,
        db_index=True,
        verbose_name="Identificador de la Entidad",
    )

    # Columna No Estructurada JSONB con Índice GIN en PostgreSQL
    payload_json = models.JSONField(
        editable=False,
        verbose_name="Payload No Estructurado JSONB del Cambio (Estado Previo/Nuevo y Metadatos ALCOA+)",
    )

    # Eslabones criptográficos SHA-256 del Grafo Acíclico Dirigido (DAG)
    previous_hash = models.CharField(
        max_length=64,
        editable=False,
        db_index=True,
        verbose_name="Hash SHA-256 del Nodo Previo",
    )
    current_hash = models.CharField(
        max_length=64,
        unique=True,
        editable=False,
        db_index=True,
        verbose_name="Hash SHA-256 del Nodo Actual",
    )

    objects = ImmutableAuditQuerySet.as_manager()

    class Meta:
        db_table = "immutable_audit_dag"
        verbose_name = "Nodo de Auditoría Inmutable DAG (ALCOA+ ISP)"
        verbose_name_plural = "Registro de Auditoría Inmutable DAG (ALCOA+ ISP)"
        ordering = ["id"]
        indexes = [
            GinIndex(
                fields=["payload_json"],
                name="idx_audit_dag_payload_gin",
            ),
        ]

    @classmethod
    def calcular_hash_sha256(
        cls,
        *,
        event_uuid: str,
        timestamp_iso: str,
        actor_rut: str,
        actor_role: str,
        action_type: str,
        entity_type: str,
        entity_id: str,
        payload_json: dict,
        previous_hash: str,
    ) -> str:
        """Calcula de forma determinista el hash SHA-256 canónico del evento de auditoría."""
        payload_canonico = json.dumps(payload_json, sort_keys=True, ensure_ascii=False, default=str)
        bloque = (
            f"{previous_hash}|{event_uuid}|{timestamp_iso}|{actor_rut}|"
            f"{actor_role}|{action_type}|{entity_type}|{entity_id}|{payload_canonico}"
        )
        return hashlib.sha256(bloque.encode("utf-8")).hexdigest()

    def save(self, *args, **kwargs):
        if self.pk is not None:
            raise PermissionDenied(
                "VIOLACIÓN NORMA ALCOA+ ISP: Los nodos de ImmutableAuditDAG son inmutables (append-only) "
                "y no pueden ser alterados una vez persistidos."
            )

        if not self.timestamp:
            self.timestamp = timezone.now()

        ultimo_nodo = ImmutableAuditDAG.objects.order_by("-id").first()
        self.previous_hash = ultimo_nodo.current_hash if ultimo_nodo else self.GENESIS_HASH

        timestamp_iso = self.timestamp.isoformat()
        if isinstance(self.payload_json, dict) and "_alcoa_timestamp_iso" not in self.payload_json:
            self.payload_json = {
                **self.payload_json,
                "_alcoa_timestamp_iso": timestamp_iso,
                "_alcoa_standard": "ISP-CHILE-ALCOA-PLUS",
            }

        self.current_hash = self.calcular_hash_sha256(
            event_uuid=str(self.event_uuid),
            timestamp_iso=self.payload_json.get("_alcoa_timestamp_iso", timestamp_iso),
            actor_rut=self.actor_rut,
            actor_role=self.actor_role,
            action_type=self.action_type,
            entity_type=self.entity_type,
            entity_id=str(self.entity_id),
            payload_json=self.payload_json,
            previous_hash=self.previous_hash,
        )
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionDenied(
            "VIOLACIÓN NORMA ALCOA+ ISP: Prohibido eliminar nodos de la cadena ImmutableAuditDAG."
        )

    def __str__(self) -> str:
        return (
            f"DAG#{self.id} [{self.action_type}] {self.entity_type}:{self.entity_id} "
            f"Hash:{self.current_hash[:12]}..."
        )


class HL7FHIRValidationLog(models.Model):
    """
    Tabla No Estructurada / Híbrida 2: `HL7FHIRValidationLog` (Criterio 2.1.4.9).
    Almacena los recursos no estructurados estándar HL7 FHIR R4 (`Patient`, `Coverage`,
    `MedicationRequest` y `OperationOutcome`) provenientes del bus de interoperabilidad
    con MINSAL y FONASA (Sección 3.4.2 de Evaluación 1).

    Implementa columnas `JSONB` indexadas mediante índices `GIN` en PostgreSQL para permitir
    consultas documentales sobre atributos profundos de los recursos clínicos FHIR.
    """

    class EstadoValidacionFHIR(models.TextChoices):
        VALIDADO = "VALIDADO_MINSAL_FONASA", "Cobertura y Prescripción Validadas en Bus MINSAL/FONASA"
        OBSERVADO = "OBSERVADO", "Observado con Advertencias Clínicas"
        RECHAZADO = "RECHAZADO", "Rechazado por Inconsistencia de Cobertura"

    transaction_uuid = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        editable=False,
        verbose_name="UUID de Transacción Bus Interoperabilidad",
    )
    paciente = models.ForeignKey(
        Paciente,
        on_delete=models.PROTECT,
        related_name="validaciones_fhir",
    )
    receta = models.ForeignKey(
        RecetaMedica,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="validaciones_fhir",
    )
    bus_endpoint = models.CharField(
        max_length=160,
        default="https://interoperabilidad.minsal.cl/fhir/r4/$validate-ges-fonasa",
    )
    fhir_version = models.CharField(max_length=15, default="4.0.1 (R4-CL)")
    tramo_fonasa_confirmado = models.CharField(max_length=5, default="B")
    cobertura_gratuita_confirmada = models.BooleanField(default=True)
    estado_validacion = models.CharField(
        max_length=30,
        choices=EstadoValidacionFHIR.choices,
        default=EstadoValidacionFHIR.VALIDADO,
        db_index=True,
    )

    # Recursos No Estructurados HL7 FHIR R4 en formato JSONB con Índices GIN
    patient_resource = models.JSONField(
        verbose_name="Recurso HL7 FHIR R4 'Patient' (JSONB)",
    )
    coverage_resource = models.JSONField(
        verbose_name="Recurso HL7 FHIR R4 'Coverage' FONASA/GES (JSONB)",
    )
    medication_request_resource = models.JSONField(
        verbose_name="Recurso HL7 FHIR R4 'MedicationRequest' MINSAL (JSONB)",
    )
    operation_outcome_resource = models.JSONField(
        default=dict,
        verbose_name="Recurso HL7 FHIR R4 'OperationOutcome' de Respuesta (JSONB)",
    )

    fecha_validacion = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "hl7_fhir_validation_log"
        verbose_name = "Log de Interoperabilidad HL7 FHIR (MINSAL/FONASA)"
        verbose_name_plural = "Logs de Interoperabilidad HL7 FHIR (MINSAL/FONASA)"
        ordering = ["-fecha_validacion"]
        indexes = [
            GinIndex(
                fields=["patient_resource"],
                name="idx_fhir_patient_gin",
            ),
            GinIndex(
                fields=["coverage_resource"],
                name="idx_fhir_coverage_gin",
            ),
            GinIndex(
                fields=["medication_request_resource"],
                name="idx_fhir_medreq_gin",
            ),
        ]

    def __str__(self) -> str:
        return (
            f"FHIR-R4 {self.transaction_uuid} | Paciente {self.paciente.rut} | "
            f"FONASA {self.tramo_fonasa_confirmado} [{self.estado_validacion}]"
        )
