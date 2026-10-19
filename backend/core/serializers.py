"""
Serializadores de Django REST Framework para los 10 Módulos del Sistema Web de Gestión
de Farmacia Asistencial CESFAM.
Integra sanitización activa contra XSS/SQLi (OWASP Top 10), cifrado simétrico AES-256 en reposo
(Ley 19.628) y exposición de esquemas estructurados (SQL) y no estructurados (JSONB + GIN).
"""
from rest_framework import serializers
from .models import (
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
    MovimientoInventario,
    Paciente,
    ProgramaSalud,
    RecetaMedica,
    ReposicionCarro,
    RolRBAC,
    StockCarroClinico,
    Usuario,
)
from .security.owasp_validators import (
    sanitizar_diccionario_xss,
    validar_archivo_receta_digitalizada,
)


class SecureSanitizedModelSerializer(serializers.ModelSerializer):
    """
    Clase base que aplica sanitización OWASP Top 10 (Anti-XSS y Anti-SQLi)
    sobre todas las cadenas de entrada antes de persistir en la base de datos.
    """

    def validate(self, attrs):
        attrs = super().validate(attrs)
        return sanitizar_diccionario_xss(attrs)


# ==============================================================================
# SERIALIZADORES DE SEGURIDAD TI (JWT + MFA TOTP + UPLOAD SEGURO)
# ==============================================================================


class LoginJWTSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    codigo_mfa_totp = serializers.CharField(
        max_length=6,
        required=False,
        allow_blank=True,
        help_text="Código TOTP de 6 dígitos (opcional en login directo o verificable en /verify-mfa/).",
    )


class VerifyMFATOTPSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150, required=False)
    codigo_totp = serializers.CharField(min_length=6, max_length=6)


class RefreshTokenRotationSerializer(serializers.Serializer):
    refresh_token = serializers.CharField()


class RecetaUploadSecuritySerializer(serializers.Serializer):
    archivo_receta = serializers.FileField()

    def validate_archivo_receta(self, archivo):
        validar_archivo_receta_digitalizada(archivo)
        return archivo


# ==============================================================================
# SERIALIZADORES DE LOS 10 MÓDULOS OPERACIONALES CESFAM
# ==============================================================================


class RolRBACSerializer(SecureSanitizedModelSerializer):
    class Meta:
        model = RolRBAC
        fields = "__all__"


class UsuarioSerializer(SecureSanitizedModelSerializer):
    rol_detalle = RolRBACSerializer(source="rol", read_only=True)
    codigo_rol = serializers.ReadOnlyField()
    password = serializers.CharField(write_only=True, required=False, min_length=10)

    class Meta:
        model = Usuario
        fields = [
            "id",
            "username",
            "password",
            "rut",
            "first_name",
            "last_name",
            "email",
            "telefono",
            "rol",
            "rol_detalle",
            "codigo_rol",
            "registro_superintendencia_salud",
            "mfa_habilitado",
            "debe_cambiar_password",
            "establecimiento",
            "is_active",
        ]

    def create(self, validated_data):
        password = validated_data.pop("password", "Cesfam2026!Temporal")
        usuario = Usuario(**validated_data)
        usuario.set_password(password)
        usuario.save()
        return usuario

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class PacienteSerializer(SecureSanitizedModelSerializer):
    nombre_completo = serializers.ReadOnlyField()
    ficha_sensible_descifrada_aes256 = serializers.SerializerMethodField()

    class Meta:
        model = Paciente
        fields = [
            "id",
            "rut",
            "nombres",
            "apellidos",
            "nombre_completo",
            "fecha_nacimiento",
            "sexo",
            "telefono",
            "direccion",
            "sector_cesfam",
            "tramo_fonasa",
            "patologias_declaradas",
            "datos_sensibles_cifrados",
            "ficha_sensible_descifrada_aes256",
            "activo",
            "creado_en",
            "actualizado_en",
        ]
        read_only_fields = ["datos_sensibles_cifrados"]

    def get_ficha_sensible_descifrada_aes256(self, obj: Paciente) -> dict:
        return obj.obtener_datos_sensibles_descifrados()


class ProgramaSaludSerializer(SecureSanitizedModelSerializer):
    class Meta:
        model = ProgramaSalud
        fields = "__all__"


class CategoriaMedicamentoSerializer(SecureSanitizedModelSerializer):
    class Meta:
        model = CategoriaMedicamento
        fields = "__all__"


class LoteSerializer(SecureSanitizedModelSerializer):
    medicamento_nombre = serializers.CharField(source="medicamento.nombre_generico", read_only=True)
    codigo_cenabast = serializers.CharField(source="medicamento.codigo_cenabast", read_only=True)
    stock_total = serializers.ReadOnlyField()
    dias_para_vencer = serializers.ReadOnlyField()
    esta_vencido = serializers.ReadOnlyField()
    semaforo_vencimiento = serializers.ReadOnlyField()
    es_habil_fefo = serializers.ReadOnlyField()

    class Meta:
        model = Lote
        fields = [
            "id",
            "numero_lote",
            "medicamento",
            "medicamento_nombre",
            "codigo_cenabast",
            "fecha_fabricacion",
            "fecha_vencimiento",
            "fecha_recepcion",
            "stock_bodega",
            "stock_vitrina",
            "stock_total",
            "estado_lote",
            "dias_para_vencer",
            "esta_vencido",
            "semaforo_vencimiento",
            "es_habil_fefo",
            "guia_despacho_cenabast",
            "observaciones_qf",
        ]


class MedicamentoSerializer(SecureSanitizedModelSerializer):
    categoria_nombre = serializers.CharField(source="categoria.nombre", read_only=True)
    lotes = LoteSerializer(many=True, read_only=True)

    class Meta:
        model = Medicamento
        fields = [
            "id",
            "codigo_cenabast",
            "codigo_atc",
            "nombre_generico",
            "concentracion",
            "forma_farmaceutica",
            "unidad_medida",
            "categoria",
            "categoria_nombre",
            "es_insumo_clinico",
            "es_controlado",
            "tipo_controlado",
            "requiere_receta_retenida",
            "requiere_cadena_frio",
            "esencial_carro_paro",
            "stock_minimo_alerta",
            "stock_critico_alerta",
            "activo",
            "lotes",
        ]


class InscripcionProgramaSaludSerializer(SecureSanitizedModelSerializer):
    paciente_nombre = serializers.CharField(source="paciente.nombre_completo", read_only=True)
    paciente_rut = serializers.CharField(source="paciente.rut", read_only=True)
    programa_nombre = serializers.CharField(source="programa.nombre", read_only=True)
    medicamento_nombre = serializers.CharField(source="medicamento.nombre_generico", read_only=True)
    cuotas_pendientes = serializers.ReadOnlyField()
    tiene_cuota_disponible = serializers.ReadOnlyField()

    class Meta:
        model = InscripcionProgramaSalud
        fields = [
            "id",
            "paciente",
            "paciente_nombre",
            "paciente_rut",
            "programa",
            "programa_nombre",
            "medicamento",
            "medicamento_nombre",
            "dosis_mensual_unidades",
            "cuotas_totales_autorizadas",
            "cuotas_consumidas",
            "cuotas_pendientes",
            "tiene_cuota_disponible",
            "fecha_inscripcion",
            "fecha_ultimo_retiro",
            "fecha_proximo_retiro",
            "fecha_vencimiento_cobertura",
            "estado",
        ]


class DetalleRecetaSerializer(SecureSanitizedModelSerializer):
    medicamento_nombre = serializers.CharField(source="medicamento.nombre_generico", read_only=True)
    saldo_pendiente = serializers.ReadOnlyField()

    class Meta:
        model = DetalleReceta
        fields = [
            "id",
            "receta",
            "medicamento",
            "medicamento_nombre",
            "posologia",
            "cantidad_prescrita",
            "cantidad_dispensada",
            "saldo_pendiente",
        ]


class RecetaMedicaSerializer(SecureSanitizedModelSerializer):
    paciente_nombre = serializers.CharField(source="paciente.nombre_completo", read_only=True)
    paciente_rut = serializers.CharField(source="paciente.rut", read_only=True)
    esta_vigente = serializers.ReadOnlyField()
    detalles = DetalleRecetaSerializer(many=True, read_only=True)

    class Meta:
        model = RecetaMedica
        fields = [
            "id",
            "folio_receta",
            "paciente",
            "paciente_nombre",
            "paciente_rut",
            "programa_salud",
            "tipo_receta",
            "medico_prescriptor_nombre",
            "medico_prescriptor_rut",
            "medico_registro_sis",
            "diagnostico_cie10",
            "fecha_emision",
            "fecha_vencimiento",
            "estado",
            "esta_vigente",
            "folio_archivo_retenida",
            "observaciones",
            "detalles",
        ]


class DispensacionSerializer(SecureSanitizedModelSerializer):
    paciente_nombre = serializers.CharField(source="paciente.nombre_completo", read_only=True)
    paciente_rut = serializers.CharField(source="paciente.rut", read_only=True)
    medicamento_nombre = serializers.CharField(source="medicamento.nombre_generico", read_only=True)
    numero_lote_fefo = serializers.CharField(source="lote.numero_lote", read_only=True)
    dispensador_nombre = serializers.CharField(source="usuario_dispensador.username", read_only=True)

    class Meta:
        model = Dispensacion
        fields = "__all__"


class LibroControladoISPSerializer(serializers.ModelSerializer):
    medicamento_nombre = serializers.CharField(source="medicamento.nombre_generico", read_only=True)
    numero_lote = serializers.CharField(source="lote.numero_lote", read_only=True)
    qf_nombre = serializers.CharField(source="quimico_farmaceutico.get_full_name", read_only=True)

    class Meta:
        model = LibroControladoISP
        fields = "__all__"


class StockCarroClinicoSerializer(SecureSanitizedModelSerializer):
    medicamento_nombre = serializers.CharField(source="medicamento.nombre_generico", read_only=True)
    numero_lote = serializers.CharField(source="lote_asignado.numero_lote", read_only=True)
    semaforo_lote = serializers.CharField(source="lote_asignado.semaforo_vencimiento", read_only=True)
    diferencia_faltante = serializers.ReadOnlyField()

    class Meta:
        model = StockCarroClinico
        fields = [
            "id",
            "carro",
            "medicamento",
            "medicamento_nombre",
            "lote_asignado",
            "numero_lote",
            "semaforo_lote",
            "cantidad_estandar",
            "cantidad_actual",
            "diferencia_faltante",
        ]


class CarroClinicoSerializer(SecureSanitizedModelSerializer):
    dotacion = StockCarroClinicoSerializer(many=True, read_only=True)
    responsable_qf_nombre = serializers.CharField(source="responsable_qf.get_full_name", read_only=True)

    class Meta:
        model = CarroClinico
        fields = [
            "id",
            "codigo_carro",
            "nombre",
            "tipo_carro",
            "ubicacion_clinica",
            "codigo_sello_seguridad",
            "estado",
            "responsable_qf",
            "responsable_qf_nombre",
            "ultima_revision",
            "activo",
            "dotacion",
        ]


class DetalleReposicionCarroSerializer(SecureSanitizedModelSerializer):
    medicamento_nombre = serializers.CharField(source="medicamento.nombre_generico", read_only=True)
    numero_lote_fefo = serializers.CharField(
        source="lote_origen_fefo.numero_lote", read_only=True, default=None
    )

    class Meta:
        model = DetalleReposicionCarro
        fields = [
            "id",
            "reposicion",
            "medicamento",
            "medicamento_nombre",
            "cantidad_consumida",
            "cantidad_solicitada",
            "cantidad_repuesta",
            "lote_origen_fefo",
            "numero_lote_fefo",
        ]


class ReposicionCarroSerializer(SecureSanitizedModelSerializer):
    carro_codigo = serializers.CharField(source="carro.codigo_carro", read_only=True)
    carro_nombre = serializers.CharField(source="carro.nombre", read_only=True)
    detalles = DetalleReposicionCarroSerializer(many=True, read_only=True)

    class Meta:
        model = ReposicionCarro
        fields = [
            "id",
            "codigo_solicitud",
            "carro",
            "carro_codigo",
            "carro_nombre",
            "solicitado_por",
            "aprobado_por",
            "motivo_consumo",
            "estado",
            "nuevo_sello_seguridad",
            "fecha_solicitud",
            "fecha_ejecucion",
            "observaciones",
            "detalles",
        ]


class MovimientoInventarioSerializer(serializers.ModelSerializer):
    medicamento_nombre = serializers.CharField(source="medicamento.nombre_generico", read_only=True)
    numero_lote = serializers.CharField(source="lote.numero_lote", read_only=True)

    class Meta:
        model = MovimientoInventario
        fields = "__all__"


class ImmutableAuditDAGSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImmutableAuditDAG
        fields = "__all__"


class HL7FHIRValidationLogSerializer(serializers.ModelSerializer):
    paciente_rut = serializers.CharField(source="paciente.rut", read_only=True)
    paciente_nombre = serializers.CharField(source="paciente.nombre_completo", read_only=True)

    class Meta:
        model = HL7FHIRValidationLog
        fields = "__all__"
