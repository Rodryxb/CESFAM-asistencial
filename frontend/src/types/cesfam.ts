/**
 * Contratos de Datos Estrictos (TypeScript) para el Sistema Web de Gestión
 * de Farmacia Asistencial CESFAM (Red Pública MINSAL).
 *
 * Cumple exclusión estricta del sector público:
 * CERO ventas comerciales, CERO POS, CERO boletas/facturas, CERO Isapres, CERO precios.
 */

export type CodigoRolRBAC = "ADMIN" | "QF" | "TECNICO" | "CLINICO";
export type TramoFonasa = "A" | "B" | "C" | "D";
export type SemaforoFEFO = "VERDE" | "AMARILLO" | "ROJO";
export type TipoControlISP = "NO_CONTROLADO" | "PSICOTROPICO" | "ESTUPEFACIENTE";
export type TipoRecetaMedica = "FISICA" | "DIGITAL" | "RETENIDA";
export type TipoCarroClinico = "CARRO_PARO" | "CARRO_UNIDOSIS";
export type NivelRiesgoQuiebre = "CRITICO" | "ALTO" | "MEDIO" | "OPTIMO";

export interface RolRBAC {
  id: number;
  codigo: CodigoRolRBAC;
  nombre: string;
  descripcion: string;
  puede_gestionar_usuarios: boolean;
  puede_gestionar_inventario: boolean;
  puede_dispensar: boolean;
  puede_autorizar_controlados_isp: boolean;
  puede_solicitar_reposicion_carro: boolean;
  puede_ejecutar_reposicion_carro: boolean;
  puede_auditar_dag: boolean;
  requiere_mfa_obligatorio: boolean;
}

export interface PacienteBeneficiario {
  id: number;
  rut: string;
  nombres: string;
  apellidos: string;
  nombre_completo: string;
  fecha_nacimiento: string;
  sexo: "F" | "M" | "I";
  telefono: string;
  direccion: string;
  sector_cesfam: "SECTOR_AZUL" | "SECTOR_VERDE" | "SECTOR_ROJO" | "SECTOR_AMARILLO";
  tramo_fonasa: TramoFonasa;
  patologias_declaradas: string;
  activo: boolean;
}

export interface LoteFarmaceutico {
  id: number;
  numero_lote: string;
  medicamento: number;
  medicamento_nombre: string;
  codigo_cenabast: string;
  fecha_fabricacion: string;
  fecha_vencimiento: string;
  stock_bodega: number;
  stock_vitrina: number;
  stock_total: number;
  estado_lote: "DISPONIBLE" | "CUARENTENA" | "VENCIDO" | "EN_DEVOLUCION" | "PARA_DONACION";
  dias_para_vencer: number;
  esta_vencido: boolean;
  semaforo_vencimiento: SemaforoFEFO;
  es_habil_fefo: boolean;
  guia_despacho_cenabast: string;
}

export interface MedicamentoArsenal {
  id: number;
  codigo_cenabast: string;
  codigo_atc: string;
  nombre_generico: string;
  concentracion: string;
  forma_farmaceutica: string;
  unidad_medida: string;
  categoria_nombre: string;
  es_controlado: boolean;
  tipo_controlado: TipoControlISP;
  requiere_receta_retenida: boolean;
  requiere_cadena_frio: boolean;
  esencial_carro_paro: boolean;
  stock_minimo_alerta: number;
  stock_critico_alerta: number;
  descripcion?: string;
  lotes: LoteFarmaceutico[];
}

export interface PrediccionDemandaMedicamento {
  medicamento_id: number;
  codigo_cenabast: string;
  nombre_generico: string;
  concentracion: string;
  es_controlado_isp: boolean;
  tipo_controlado: TipoControlISP;
  horizonte_analisis_dias: number;
  inventario_actual: {
    stock_bodega_habil: number;
    stock_vitrina_habil: number;
    stock_util_total: number;
    stock_vencido_bloqueado_fefo: number;
    stock_vence_dentro_90_dias: number;
    distribucion_semaforo_lotes: Record<SemaforoFEFO, number>;
  };
  proyeccion_demanda_90_dias: {
    pacientes_ges_activos: number;
    pacientes_cronicos_activos: number;
    cuotas_pendientes_90_dias: number;
    demanda_programas_ges_cronicos_unidades: number;
    demanda_basal_morbilidad_carros_unidades: number;
    demanda_total_proyectada_90_dias: number;
    margen_seguridad_15_pct: number;
    requerimiento_bruto_90_dias: number;
  };
  indicadores_riesgo_y_abastecimiento: {
    consumo_diario_estimado: number;
    dias_autonomia_estimados: number;
    balance_proyectado_90_dias: number;
    nivel_riesgo_quiebre: NivelRiesgoQuiebre;
    sugerencia_abastecimiento_cenabast_unidades: number;
    multiplo_embalaje_cenabast: number;
    normativa_abastecimiento: string;
    accion_recomendada: string;
  };
}

/**
 * Componente No Estructurado 1 (JSONB con Índice GIN en PostgreSQL):
 * Registro de Auditoría Inmutable encadenado con SHA-256 bajo norma ALCOA+ del ISP.
 */
export interface ImmutableAuditDAGNode {
  id: number;
  event_uuid: string;
  timestamp: string;
  actor_rut: string;
  actor_role: CodigoRolRBAC | string;
  ip_address: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  payload_json: Record<string, unknown>;
  previous_hash: string;
  current_hash: string;
}

/**
 * Componente No Estructurado 2 (JSONB con Índices GIN en PostgreSQL):
 * Recursos HL7 FHIR R4 (Patient, Coverage, MedicationRequest) del Bus MINSAL/FONASA.
 */
export interface HL7FHIRValidationLogRecord {
  id: number;
  transaction_uuid: string;
  paciente_rut: string;
  paciente_nombre: string;
  bus_endpoint: string;
  fhir_version: string;
  tramo_fonasa_confirmado: TramoFonasa;
  cobertura_gratuita_confirmada: boolean;
  estado_validacion: string;
  patient_resource: Record<string, unknown>;
  coverage_resource: Record<string, unknown>;
  medication_request_resource: Record<string, unknown>;
  operation_outcome_resource: Record<string, unknown>;
  fecha_validacion: string;
}
