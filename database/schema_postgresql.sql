-- =============================================================================
-- SISTEMA WEB DE GESTIÓN PARA FARMACIA ASISTENCIAL (CESFAM)
-- ESQUEMA DE BASE DE DATOS HÍBRIDO EN POSTGRESQL 18
-- Criterio 2.1.4.8 (Entidades y relaciones óptimas con PK/FK e integridad referencial)
-- Criterio 2.1.4.9 (Bases estructuradas SQL + No estructuradas JSONB con Índices GIN)
-- EXCLUSIÓN ESTRICTA SECTOR PÚBLICO: CERO ventas, POS, boletas, Isapres o precios comerciales.
-- =============================================================================

BEGIN;

-- Extensión para UUIDs y funciones criptográficas SHA-256 en PostgreSQL
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- SECCIÓN I: MODELO ESTRUCTURADO RELACIONAL (SQL CON PK/FK E INTEGRIDAD ESTRICTA)
-- =============================================================================

-- 1. ROLES RBAC INSTITUCIONALES (Exclusivamente Sector Público APS)
CREATE TABLE IF NOT EXISTS cesfam_rol_rbac (
    id BIGSERIAL PRIMARY KEY,
    codigo VARCHAR(20) NOT NULL UNIQUE
        CHECK (codigo IN ('ADMIN', 'QF', 'TECNICO', 'CLINICO')),
    nombre VARCHAR(80) NOT NULL,
    descripcion TEXT NOT NULL,
    puede_gestionar_usuarios BOOLEAN NOT NULL DEFAULT FALSE,
    puede_gestionar_inventario BOOLEAN NOT NULL DEFAULT FALSE,
    puede_dispensar BOOLEAN NOT NULL DEFAULT FALSE,
    puede_autorizar_controlados_isp BOOLEAN NOT NULL DEFAULT FALSE,
    puede_solicitar_reposicion_carro BOOLEAN NOT NULL DEFAULT FALSE,
    puede_ejecutar_reposicion_carro BOOLEAN NOT NULL DEFAULT FALSE,
    puede_auditar_dag BOOLEAN NOT NULL DEFAULT FALSE,
    requiere_mfa_obligatorio BOOLEAN NOT NULL DEFAULT FALSE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. USUARIOS FUNCIONARIOS CESFAM
CREATE TABLE IF NOT EXISTS cesfam_usuario (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(128) NOT NULL,
    rut VARCHAR(15) NOT NULL UNIQUE,
    first_name VARCHAR(150) NOT NULL,
    last_name VARCHAR(150) NOT NULL,
    email VARCHAR(254) NOT NULL,
    telefono VARCHAR(25) NOT NULL DEFAULT '',
    rol_id BIGINT REFERENCES cesfam_rol_rbac(id) ON DELETE RESTRICT,
    registro_superintendencia_salud VARCHAR(40) NOT NULL DEFAULT '',
    mfa_habilitado BOOLEAN NOT NULL DEFAULT FALSE,
    debe_cambiar_password BOOLEAN NOT NULL DEFAULT TRUE,
    establecimiento VARCHAR(120) NOT NULL DEFAULT 'CESFAM Dr. Salvador Allende',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_staff BOOLEAN NOT NULL DEFAULT FALSE,
    is_superuser BOOLEAN NOT NULL DEFAULT FALSE,
    date_joined TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login TIMESTAMPTZ
);

-- 3. PACIENTES BENEFICIARIOS (RUT Módulo 11 + Exclusividad FONASA Tramos A/B/C/D)
CREATE TABLE IF NOT EXISTS cesfam_paciente (
    id BIGSERIAL PRIMARY KEY,
    rut VARCHAR(15) NOT NULL UNIQUE,
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    fecha_nacimiento DATE NOT NULL,
    sexo CHAR(1) NOT NULL DEFAULT 'F' CHECK (sexo IN ('F', 'M', 'I')),
    telefono VARCHAR(25) NOT NULL,
    direccion VARCHAR(200) NOT NULL,
    sector_cesfam VARCHAR(25) NOT NULL
        CHECK (sector_cesfam IN ('SECTOR_AZUL', 'SECTOR_VERDE', 'SECTOR_ROJO', 'SECTOR_AMARILLO')),
    tramo_fonasa VARCHAR(2) NOT NULL
        CHECK (tramo_fonasa IN ('A', 'B', 'C', 'D')),
    patologias_declaradas TEXT NOT NULL DEFAULT '',
    datos_sensibles_cifrados VARCHAR(120) NOT NULL DEFAULT '',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. PROGRAMAS DE SALUD PÚBLICA (GES/AUGE Y CRÓNICOS)
CREATE TABLE IF NOT EXISTS cesfam_programa_salud (
    id BIGSERIAL PRIMARY KEY,
    codigo_minsal VARCHAR(30) NOT NULL UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    tipo_programa VARCHAR(20) NOT NULL
        CHECK (tipo_programa IN ('GES_AUGE', 'CRONICO', 'APS_MINISTERIAL')),
    numero_garantia_ges INTEGER CHECK (numero_garantia_ges IS NULL OR numero_garantia_ges > 0),
    periodicidad_retiro_dias INTEGER NOT NULL DEFAULT 30
        CONSTRAINT chk_programa_periodicidad_positiva CHECK (periodicidad_retiro_dias > 0),
    descripcion TEXT NOT NULL DEFAULT '',
    activo BOOLEAN NOT NULL DEFAULT TRUE
);

-- 5. CATEGORÍAS FARMACOLÓGICAS Y MEDICAMENTOS (ARSENAL CENABAST + CONTROLADOS ISP)
CREATE TABLE IF NOT EXISTS cesfam_categoria_medicamento (
    id BIGSERIAL PRIMARY KEY,
    codigo VARCHAR(30) NOT NULL UNIQUE,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS cesfam_medicamento (
    id BIGSERIAL PRIMARY KEY,
    codigo_cenabast VARCHAR(30) NOT NULL UNIQUE,
    codigo_atc VARCHAR(20) NOT NULL DEFAULT '',
    nombre_generico VARCHAR(140) NOT NULL,
    concentracion VARCHAR(60) NOT NULL,
    forma_farmaceutica VARCHAR(30) NOT NULL,
    unidad_medida VARCHAR(30) NOT NULL DEFAULT 'COMPRIMIDO',
    categoria_id BIGINT NOT NULL REFERENCES cesfam_categoria_medicamento(id) ON DELETE RESTRICT,
    es_insumo_clinico BOOLEAN NOT NULL DEFAULT FALSE,
    es_controlado BOOLEAN NOT NULL DEFAULT FALSE,
    tipo_controlado VARCHAR(20) NOT NULL DEFAULT 'NO_CONTROLADO'
        CHECK (tipo_controlado IN ('NO_CONTROLADO', 'PSICOTROPICO', 'ESTUPEFACIENTE')),
    requiere_receta_retenida BOOLEAN NOT NULL DEFAULT FALSE,
    requiere_cadena_frio BOOLEAN NOT NULL DEFAULT FALSE,
    esencial_carro_paro BOOLEAN NOT NULL DEFAULT FALSE,
    stock_minimo_alerta INTEGER NOT NULL DEFAULT 200 CHECK (stock_minimo_alerta > 0),
    stock_critico_alerta INTEGER NOT NULL DEFAULT 80 CHECK (stock_critico_alerta > 0),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT chk_medicamento_coherencia_controlado_isp CHECK (
        (es_controlado = FALSE AND tipo_controlado = 'NO_CONTROLADO')
        OR (es_controlado = TRUE AND tipo_controlado IN ('PSICOTROPICO', 'ESTUPEFACIENTE') AND requiere_receta_retenida = TRUE)
    ),
    CONSTRAINT chk_medicamento_umbrales_stock_coherentes CHECK (stock_minimo_alerta >= stock_critico_alerta)
);

-- 6. INSCRIPCIÓN EN PROGRAMAS DE SALUD Y CONTROL DE CUOTAS (GES/CRÓNICOS)
CREATE TABLE IF NOT EXISTS cesfam_inscripcion_programa_salud (
    id BIGSERIAL PRIMARY KEY,
    paciente_id BIGINT NOT NULL REFERENCES cesfam_paciente(id) ON DELETE RESTRICT,
    programa_id BIGINT NOT NULL REFERENCES cesfam_programa_salud(id) ON DELETE RESTRICT,
    medicamento_id BIGINT NOT NULL REFERENCES cesfam_medicamento(id) ON DELETE RESTRICT,
    dosis_mensual_unidades INTEGER NOT NULL CHECK (dosis_mensual_unidades > 0),
    cuotas_totales_autorizadas INTEGER NOT NULL DEFAULT 12 CHECK (cuotas_totales_autorizadas > 0),
    cuotas_consumidas INTEGER NOT NULL DEFAULT 0 CHECK (cuotas_consumidas >= 0),
    fecha_inscripcion DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_ultimo_retiro DATE,
    fecha_proximo_retiro DATE NOT NULL,
    fecha_vencimiento_cobertura DATE NOT NULL,
    estado VARCHAR(15) NOT NULL DEFAULT 'ACTIVA'
        CHECK (estado IN ('ACTIVA', 'SUSPENDIDA', 'FINALIZADA', 'VENCIDA')),
    CONSTRAINT chk_cuotas_consumidas_no_exceden_autorizadas CHECK (cuotas_consumidas <= cuotas_totales_autorizadas),
    CONSTRAINT uq_inscripcion_paciente_programa_medicamento UNIQUE (paciente_id, programa_id, medicamento_id, fecha_inscripcion)
);

-- 7. LOTES FARMACÉUTICOS (STOCK BODEGA, STOCK VITRINA, FECHA VENCIMIENTO FEFO)
CREATE TABLE IF NOT EXISTS cesfam_lote (
    id BIGSERIAL PRIMARY KEY,
    numero_lote VARCHAR(50) NOT NULL,
    medicamento_id BIGINT NOT NULL REFERENCES cesfam_medicamento(id) ON DELETE RESTRICT,
    fecha_fabricacion DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    fecha_recepcion DATE NOT NULL DEFAULT CURRENT_DATE,
    stock_bodega INTEGER NOT NULL DEFAULT 0,
    stock_vitrina INTEGER NOT NULL DEFAULT 0,
    estado_lote VARCHAR(20) NOT NULL DEFAULT 'DISPONIBLE'
        CHECK (estado_lote IN ('DISPONIBLE', 'CUARENTENA', 'VENCIDO', 'EN_DEVOLUCION', 'PARA_DONACION')),
    guia_despacho_cenabast VARCHAR(50) NOT NULL DEFAULT 'GD-CENABAST-2026',
    observaciones_qf TEXT NOT NULL DEFAULT '',
    CONSTRAINT uq_medicamento_numero_lote UNIQUE (medicamento_id, numero_lote),
    CONSTRAINT chk_lote_stocks_no_negativos CHECK (stock_bodega >= 0 AND stock_vitrina >= 0),
    CONSTRAINT chk_lote_vencimiento_posterior_fabricacion CHECK (fecha_vencimiento > fecha_fabricacion)
);

CREATE INDEX IF NOT EXISTS idx_cesfam_lote_fefo
    ON cesfam_lote (medicamento_id, estado_lote, fecha_vencimiento ASC);

-- 8. RECETAS MÉDICAS (FÍSICA, DIGITAL, RETENIDA) Y DETALLE DE PRESCRIPCIÓN
CREATE TABLE IF NOT EXISTS cesfam_receta_medica (
    id BIGSERIAL PRIMARY KEY,
    folio_receta VARCHAR(40) NOT NULL UNIQUE,
    paciente_id BIGINT NOT NULL REFERENCES cesfam_paciente(id) ON DELETE RESTRICT,
    programa_salud_id BIGINT REFERENCES cesfam_programa_salud(id) ON DELETE SET NULL,
    tipo_receta VARCHAR(15) NOT NULL
        CHECK (tipo_receta IN ('FISICA', 'DIGITAL', 'RETENIDA')),
    medico_prescriptor_nombre VARCHAR(120) NOT NULL,
    medico_prescriptor_rut VARCHAR(15) NOT NULL,
    medico_registro_sis VARCHAR(40) NOT NULL DEFAULT 'SIS-MED-APS',
    diagnostico_cie10 VARCHAR(180) NOT NULL,
    fecha_emision DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_vencimiento DATE NOT NULL,
    estado VARCHAR(25) NOT NULL DEFAULT 'VIGENTE'
        CHECK (estado IN ('VIGENTE', 'DISPENSADA_PARCIAL', 'DISPENSADA_TOTAL', 'VENCIDA', 'ANULADA')),
    folio_archivo_retenida VARCHAR(50) NOT NULL DEFAULT '',
    observaciones TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS cesfam_detalle_receta (
    id BIGSERIAL PRIMARY KEY,
    receta_id BIGINT NOT NULL REFERENCES cesfam_receta_medica(id) ON DELETE CASCADE,
    medicamento_id BIGINT NOT NULL REFERENCES cesfam_medicamento(id) ON DELETE RESTRICT,
    posologia VARCHAR(200) NOT NULL,
    cantidad_prescrita INTEGER NOT NULL CHECK (cantidad_prescrita > 0),
    cantidad_dispensada INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_dispensada >= 0),
    CONSTRAINT chk_detalle_receta_dispensado_no_excede_prescrito CHECK (cantidad_dispensada <= cantidad_prescrita)
);

-- 9. DISPENSACIONES ASISTENCIALES Y RETIRO POR TERCERO AUTORIZADO
CREATE TABLE IF NOT EXISTS cesfam_dispensacion (
    id BIGSERIAL PRIMARY KEY,
    codigo_dispensacion VARCHAR(40) NOT NULL UNIQUE,
    receta_id BIGINT NOT NULL REFERENCES cesfam_receta_medica(id) ON DELETE RESTRICT,
    detalle_receta_id BIGINT REFERENCES cesfam_detalle_receta(id) ON DELETE RESTRICT,
    paciente_id BIGINT NOT NULL REFERENCES cesfam_paciente(id) ON DELETE RESTRICT,
    medicamento_id BIGINT NOT NULL REFERENCES cesfam_medicamento(id) ON DELETE RESTRICT,
    lote_id BIGINT NOT NULL REFERENCES cesfam_lote(id) ON DELETE RESTRICT,
    inscripcion_programa_id BIGINT REFERENCES cesfam_inscripcion_programa_salud(id) ON DELETE SET NULL,
    usuario_dispensador_id BIGINT NOT NULL REFERENCES cesfam_usuario(id) ON DELETE RESTRICT,
    usuario_autorizador_qf_id BIGINT REFERENCES cesfam_usuario(id) ON DELETE RESTRICT,
    cantidad_dispensada INTEGER NOT NULL CHECK (cantidad_dispensada > 0),
    numero_cuota_aplicada INTEGER,
    fecha_dispensacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    es_retiro_tercero BOOLEAN NOT NULL DEFAULT FALSE,
    tercero_nombre VARCHAR(120) NOT NULL DEFAULT '',
    tercero_rut VARCHAR(15) NOT NULL DEFAULT '',
    tercero_parentesco VARCHAR(60) NOT NULL DEFAULT '',
    tercero_telefono VARCHAR(25) NOT NULL DEFAULT '',
    comprobante_hash_sha256 CHAR(64) NOT NULL,
    observaciones TEXT NOT NULL DEFAULT ''
);

-- 10. LIBRO DIGITAL DE CONTROL DE ESTUPEFACIENTES Y PSICOTRÓPICOS (D.S. 404/405 ISP)
CREATE TABLE IF NOT EXISTS cesfam_libro_controlado_isp (
    id BIGSERIAL PRIMARY KEY,
    folio_libro_isp VARCHAR(40) NOT NULL UNIQUE,
    dispensacion_id BIGINT NOT NULL UNIQUE REFERENCES cesfam_dispensacion(id) ON DELETE RESTRICT,
    medicamento_id BIGINT NOT NULL REFERENCES cesfam_medicamento(id) ON DELETE RESTRICT,
    lote_id BIGINT NOT NULL REFERENCES cesfam_lote(id) ON DELETE RESTRICT,
    receta_retenida_id BIGINT NOT NULL REFERENCES cesfam_receta_medica(id) ON DELETE RESTRICT,
    quimico_farmaceutico_id BIGINT NOT NULL REFERENCES cesfam_usuario(id) ON DELETE RESTRICT,
    tipo_controlado VARCHAR(20) NOT NULL CHECK (tipo_controlado IN ('PSICOTROPICO', 'ESTUPEFACIENTE')),
    saldo_anterior_lote INTEGER NOT NULL,
    cantidad_egresada INTEGER NOT NULL CHECK (cantidad_egresada > 0),
    saldo_posterior_lote INTEGER NOT NULL,
    paciente_rut VARCHAR(15) NOT NULL,
    medico_prescriptor_rut VARCHAR(15) NOT NULL,
    firma_electronica_qf_sha256 CHAR(64) NOT NULL,
    fecha_registro TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. CARROS CLÍNICOS (CARRO DE PARO Y CARRO UNIDOSIS) Y REPOSICIONES
CREATE TABLE IF NOT EXISTS cesfam_carro_clinico (
    id BIGSERIAL PRIMARY KEY,
    codigo_carro VARCHAR(30) NOT NULL UNIQUE,
    nombre VARCHAR(120) NOT NULL,
    tipo_carro VARCHAR(20) NOT NULL CHECK (tipo_carro IN ('CARRO_PARO', 'CARRO_UNIDOSIS')),
    ubicacion_clinica VARCHAR(140) NOT NULL,
    codigo_sello_seguridad VARCHAR(40) NOT NULL,
    estado VARCHAR(25) NOT NULL DEFAULT 'SELLADO_OPERATIVO'
        CHECK (estado IN ('SELLADO_OPERATIVO', 'ABIERTO_EN_USO', 'PENDIENTE_REPOSICION', 'EN_REVISION_QF')),
    responsable_qf_id BIGINT NOT NULL REFERENCES cesfam_usuario(id) ON DELETE RESTRICT,
    ultima_revision TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS cesfam_stock_carro_clinico (
    id BIGSERIAL PRIMARY KEY,
    carro_id BIGINT NOT NULL REFERENCES cesfam_carro_clinico(id) ON DELETE CASCADE,
    medicamento_id BIGINT NOT NULL REFERENCES cesfam_medicamento(id) ON DELETE RESTRICT,
    lote_asignado_id BIGINT NOT NULL REFERENCES cesfam_lote(id) ON DELETE RESTRICT,
    cantidad_estandar INTEGER NOT NULL CHECK (cantidad_estandar > 0),
    cantidad_actual INTEGER NOT NULL CHECK (cantidad_actual >= 0),
    CONSTRAINT uq_carro_medicamento_dotacion UNIQUE (carro_id, medicamento_id)
);

CREATE TABLE IF NOT EXISTS cesfam_reposicion_carro (
    id BIGSERIAL PRIMARY KEY,
    codigo_solicitud VARCHAR(40) NOT NULL UNIQUE,
    carro_id BIGINT NOT NULL REFERENCES cesfam_carro_clinico(id) ON DELETE RESTRICT,
    solicitado_por_id BIGINT NOT NULL REFERENCES cesfam_usuario(id) ON DELETE RESTRICT,
    aprobado_por_id BIGINT REFERENCES cesfam_usuario(id) ON DELETE RESTRICT,
    motivo_consumo VARCHAR(180) NOT NULL,
    estado VARCHAR(25) NOT NULL DEFAULT 'SOLICITADA'
        CHECK (estado IN ('SOLICITADA', 'APROBADA_EJECUTADA', 'RECHAZADA')),
    nuevo_sello_seguridad VARCHAR(40) NOT NULL DEFAULT '',
    fecha_solicitud TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_ejecucion TIMESTAMPTZ,
    observaciones TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS cesfam_detalle_reposicion_carro (
    id BIGSERIAL PRIMARY KEY,
    reposicion_id BIGINT NOT NULL REFERENCES cesfam_reposicion_carro(id) ON DELETE CASCADE,
    medicamento_id BIGINT NOT NULL REFERENCES cesfam_medicamento(id) ON DELETE RESTRICT,
    cantidad_consumida INTEGER NOT NULL CHECK (cantidad_consumida >= 0),
    cantidad_solicitada INTEGER NOT NULL CHECK (cantidad_solicitada > 0),
    cantidad_repuesta INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_repuesta >= 0),
    lote_origen_fefo_id BIGINT REFERENCES cesfam_lote(id) ON DELETE RESTRICT
);

-- 12. MOVIMIENTOS HISTÓRICOS DE INVENTARIO (RF-17)
CREATE TABLE IF NOT EXISTS cesfam_movimiento_inventario (
    id BIGSERIAL PRIMARY KEY,
    tipo_movimiento VARCHAR(30) NOT NULL,
    medicamento_id BIGINT NOT NULL REFERENCES cesfam_medicamento(id) ON DELETE RESTRICT,
    lote_id BIGINT NOT NULL REFERENCES cesfam_lote(id) ON DELETE RESTRICT,
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    ubicacion_origen VARCHAR(40) NOT NULL,
    ubicacion_destino VARCHAR(40) NOT NULL,
    stock_bodega_resultante INTEGER NOT NULL CHECK (stock_bodega_resultante >= 0),
    stock_vitrina_resultante INTEGER NOT NULL CHECK (stock_vitrina_resultante >= 0),
    usuario_responsable_id BIGINT NOT NULL REFERENCES cesfam_usuario(id) ON DELETE RESTRICT,
    referencia_operacion VARCHAR(60) NOT NULL,
    fecha_movimiento TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- SECCIÓN II: MODELO NO ESTRUCTURADO (JSONB EN POSTGRESQL CON ÍNDICES GIN - 2.1.4.9)
-- =============================================================================

-- A) TABLA `immutable_audit_dag` (Norma ALCOA+ del ISP, Append-Only y Hash SHA-256 encadenado)
CREATE TABLE IF NOT EXISTS immutable_audit_dag (
    id BIGSERIAL PRIMARY KEY,
    event_uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_user_id BIGINT REFERENCES cesfam_usuario(id) ON DELETE RESTRICT,
    actor_rut VARCHAR(15) NOT NULL,
    actor_role VARCHAR(30) NOT NULL,
    ip_address INET NOT NULL DEFAULT '127.0.0.1',
    action_type VARCHAR(60) NOT NULL,
    entity_type VARCHAR(60) NOT NULL,
    entity_id VARCHAR(60) NOT NULL,
    payload_json JSONB NOT NULL,
    previous_hash CHAR(64) NOT NULL,
    current_hash CHAR(64) NOT NULL UNIQUE
);

-- Índice Invertido Generalizado (GIN) sobre el documento JSONB del DAG de Auditoría
CREATE INDEX IF NOT EXISTS idx_audit_dag_payload_gin
    ON immutable_audit_dag USING GIN (payload_json jsonb_path_ops);

-- Trigger nativo PostgreSQL para garantizar Inmutabilidad Absoluta (Append-Only ALCOA+)
CREATE OR REPLACE FUNCTION fn_prevent_audit_dag_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'VIOLACIÓN NORMA ALCOA+ ISP: La tabla immutable_audit_dag es estrictamente append-only. Prohibido ejecutar % sobre registros de auditoría.', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_audit_dag_append_only ON immutable_audit_dag;
CREATE TRIGGER trg_immutable_audit_dag_append_only
BEFORE UPDATE OR DELETE ON immutable_audit_dag
FOR EACH ROW EXECUTE FUNCTION fn_prevent_audit_dag_mutation();

-- B) TABLA `hl7_fhir_validation_log` (Bus de Interoperabilidad HL7 FHIR R4 MINSAL/FONASA)
CREATE TABLE IF NOT EXISTS hl7_fhir_validation_log (
    id BIGSERIAL PRIMARY KEY,
    transaction_uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    paciente_id BIGINT NOT NULL REFERENCES cesfam_paciente(id) ON DELETE RESTRICT,
    receta_id BIGINT REFERENCES cesfam_receta_medica(id) ON DELETE SET NULL,
    bus_endpoint VARCHAR(160) NOT NULL DEFAULT 'https://interoperabilidad.minsal.cl/fhir/r4/$validate-ges-fonasa',
    fhir_version VARCHAR(15) NOT NULL DEFAULT '4.0.1 (R4-CL)',
    tramo_fonasa_confirmado VARCHAR(5) NOT NULL DEFAULT 'B',
    cobertura_gratuita_confirmada BOOLEAN NOT NULL DEFAULT TRUE,
    estado_validacion VARCHAR(30) NOT NULL DEFAULT 'VALIDADO_MINSAL_FONASA',
    patient_resource JSONB NOT NULL,
    coverage_resource JSONB NOT NULL,
    medication_request_resource JSONB NOT NULL,
    operation_outcome_resource JSONB NOT NULL DEFAULT '{}'::jsonb,
    fecha_validacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices GIN nativos en PostgreSQL sobre los 3 recursos HL7 FHIR R4 no estructurados
CREATE INDEX IF NOT EXISTS idx_fhir_patient_gin
    ON hl7_fhir_validation_log USING GIN (patient_resource);

CREATE INDEX IF NOT EXISTS idx_fhir_coverage_gin
    ON hl7_fhir_validation_log USING GIN (coverage_resource);

CREATE INDEX IF NOT EXISTS idx_fhir_medreq_gin
    ON hl7_fhir_validation_log USING GIN (medication_request_resource);

COMMIT;
