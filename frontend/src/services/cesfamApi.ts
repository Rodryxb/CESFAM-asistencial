/**
 * Cliente HTTP tipado para la API RESTful de Django REST Framework (`/api/v1/`).
 */
import {
  HL7FHIRValidationLogRecord,
  ImmutableAuditDAGNode,
  MedicamentoArsenal,
  PrediccionDemandaMedicamento,
} from "../types/cesfam";

const API_BASE = "/api/v1";

export async function obtenerMedicamentosConLotesFEFO(): Promise<MedicamentoArsenal[]> {
  const res = await fetch(`${API_BASE}/medicamentos/`);
  if (!res.ok) throw new Error("Error al consultar el catálogo de medicamentos CESFAM");
  return res.json();
}

export async function obtenerPrediccionDemanda90Dias(): Promise<{
  establecimiento: string;
  horizonte_prediccion_dias: number;
  resumen_ejecutivo: {
    total_medicamentos_evaluados: number;
    distribucion_riesgo_quiebre: Record<string, number>;
    total_unidades_a_solicitar_cenabast: number;
  };
  predicciones_por_medicamento: PrediccionDemandaMedicamento[];
}> {
  const res = await fetch(`${API_BASE}/prediccion-demanda-cenabast/?horizonte_dias=90`);
  if (!res.ok) throw new Error("Error al calcular la predicción de demanda a 90 días");
  return res.json();
}

export async function obtenerAuditoriaDAG(): Promise<ImmutableAuditDAGNode[]> {
  const res = await fetch(`${API_BASE}/auditoria-dag/`);
  if (!res.ok) throw new Error("Error al consultar la cadena ImmutableAuditDAG");
  return res.json();
}

export async function obtenerLogsHL7FHIR(): Promise<HL7FHIRValidationLogRecord[]> {
  const res = await fetch(`${API_BASE}/interoperabilidad-fhir/`);
  if (!res.ok) throw new Error("Error al consultar logs HL7 FHIR MINSAL/FONASA");
  return res.json();
}
