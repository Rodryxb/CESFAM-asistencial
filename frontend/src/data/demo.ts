/**
 * Estado reactivo compartido y datos de demostración para el Sistema Web de Gestión
 * de Farmacia Asistencial CESFAM (Red Pública MINSAL).
 * Sin precios ni ventas: farmacia pública asistencial 100% gratuita.
 */
import { useEffect, useState } from "react";
import { obtenerMedicamentosConLotesFEFO } from "../services/cesfamApi";
import {
  CodigoRolRBAC,
  LoteFarmaceutico,
  MedicamentoArsenal,
  SemaforoFEFO,
  TipoControlISP,
} from "../types/cesfam";

export type Vista = "dashboard" | "dispensacion" | "inventario" | "carros" | "productos" | "registros" | "qf" | "admin";

export const ROLES: { codigo: CodigoRolRBAC; nombre: string }[] = [
  { codigo: "TECNICO", nombre: "Técnico en Farmacia" },
  { codigo: "QF", nombre: "Q.F." },
  { codigo: "CLINICO", nombre: "Personal Clínico" },
  { codigo: "ADMIN", nombre: "Admin" },
];

/** Matriz RBAC: qué vistas ve cada rol en el menú lateral. */
export const PERMISOS_VISTA: Record<CodigoRolRBAC, Vista[]> = {
  TECNICO: ["dashboard", "dispensacion", "inventario", "carros", "productos", "registros"],
  QF: ["dashboard", "dispensacion", "inventario", "carros", "productos", "registros", "qf"],
  CLINICO: ["dashboard", "carros", "productos", "inventario", "registros"],
  ADMIN: ["dashboard", "dispensacion", "productos", "inventario", "carros", "registros", "admin"],
};

export const semaforoDeDias = (dias: number, stock: number, critico: number): SemaforoFEFO => {
  if (stock <= critico || dias <= 0) return "ROJO";
  if (dias <= 90) return "AMARILLO";
  return "VERDE";
};

const hoy = new Date();
export const enDias = (d: number) => new Date(hoy.getTime() + d * 86400000).toISOString().slice(0, 10);

export const crearLoteDemo = (
  id: number,
  medId: number,
  nombre: string,
  num: string,
  dias: number,
  bod: number,
  vit: number
): LoteFarmaceutico => ({
  id,
  numero_lote: num,
  medicamento: medId,
  medicamento_nombre: nombre,
  codigo_cenabast: `CEN-${String(medId).padStart(4, "0")}`,
  fecha_fabricacion: enDias(dias - 700),
  fecha_vencimiento: enDias(dias),
  stock_bodega: bod,
  stock_vitrina: vit,
  stock_total: bod + vit,
  estado_lote: dias <= 0 ? "VENCIDO" : "DISPONIBLE",
  dias_para_vencer: dias,
  esta_vencido: dias <= 0,
  semaforo_vencimiento: dias <= 30 ? "ROJO" : dias <= 90 ? "AMARILLO" : "VERDE",
  es_habil_fefo: dias > 0 && bod + vit > 0,
  guia_despacho_cenabast: `GD-CEN-${202600 + id}`,
});

const med = (
  id: number,
  nombre: string,
  conc: string,
  forma: string,
  descripcion: string,
  extra: Partial<MedicamentoArsenal>,
  lotes: LoteFarmaceutico[]
): MedicamentoArsenal => ({
  id,
  codigo_cenabast: `CEN-${String(id).padStart(4, "0")}`,
  codigo_atc: `ATC-${id}`,
  nombre_generico: nombre,
  concentracion: conc,
  forma_farmaceutica: forma,
  unidad_medida: forma,
  categoria_nombre: "Arsenal APS MINSAL",
  es_controlado: false,
  tipo_controlado: "NO_CONTROLADO",
  requiere_receta_retenida: false,
  requiere_cadena_frio: false,
  esencial_carro_paro: false,
  stock_minimo_alerta: 200,
  stock_critico_alerta: 60,
  descripcion,
  lotes,
  ...extra,
});

/** Catálogo inicial base (7 medicamentos) */
export const MEDICAMENTOS_DEMO: MedicamentoArsenal[] = [
  med(
    1,
    "Metformina Clorhidrato",
    "850 mg",
    "Comprimido",
    "Hipoglicemiante oral de primera línea para control de Diabetes Mellitus Tipo 2 (Programa GES #07).",
    { categoria_nombre: "Diabetes GES #07" },
    [
      crearLoteDemo(11, 1, "Metformina Clorhidrato", "MET-2401", 45, 300, 80),
      crearLoteDemo(12, 1, "Metformina Clorhidrato", "MET-2509", 400, 900, 120),
    ]
  ),
  med(
    2,
    "Losartán Potásico",
    "50 mg",
    "Comprimido",
    "Antihipertensivo antagonista de receptores de angiotensina II (ARA-II) para Hipertensión Arterial Primaria (GES #21).",
    { categoria_nombre: "Cardiovascular FOFAR" },
    [crearLoteDemo(21, 2, "Losartán Potásico", "LOS-2402", 130, 500, 100)]
  ),
  med(
    3,
    "Atorvastatina Cálcica",
    "20 mg",
    "Comprimido",
    "Hipolipemiante inhibidor de HMG-CoA reductasa para dislipidemia y prevención cardiovascular secundaria.",
    { categoria_nombre: "Cardiovascular FOFAR" },
    [crearLoteDemo(31, 3, "Atorvastatina Cálcica", "ATO-2403", 70, 120, 40)]
  ),
  med(
    4,
    "Insulina Humana NPH",
    "100 UI/mL",
    "Frasco Ampolla",
    "Insulina de acción intermedia para Diabetes Mellitus insulinorrequiriente. Requiere cadena de frío (2°C a 8°C).",
    { categoria_nombre: "Diabetes GES #07", requiere_cadena_frio: true, stock_critico_alerta: 40 },
    [crearLoteDemo(41, 4, "Insulina Humana NPH", "INS-2404", 200, 25, 10)]
  ),
  med(
    5,
    "Clonazepam",
    "2 mg",
    "Comprimido",
    "Benzodiacepina ansiolítica y anticonvulsivante sujeta a fiscalización D.S. 405 ISP. Exige Receta Retenida.",
    {
      categoria_nombre: "Salud Mental / Controlados ISP",
      es_controlado: true,
      tipo_controlado: "PSICOTROPICO",
      requiere_receta_retenida: true,
    },
    [crearLoteDemo(51, 5, "Clonazepam", "CLO-2405", 300, 150, 50)]
  ),
  med(
    6,
    "Adrenalina (Epinefrina)",
    "1 mg/mL",
    "Ampolla",
    "Catecolamina vasoactiva crítica para Carro de Paro: reanimación cardiopulmonar avanzada y shock anafiláctico.",
    { categoria_nombre: "Urgencia y Carro de Paro", esencial_carro_paro: true, stock_critico_alerta: 20 },
    [crearLoteDemo(61, 6, "Adrenalina (Epinefrina)", "ADR-2406", 25, 15, 3)]
  ),
  med(
    7,
    "Amoxicilina",
    "500 mg",
    "Cápsula",
    "Antibiótico betalactámico de amplio espectro para infecciones respiratorias agudas bacterianas en APS.",
    { categoria_nombre: "Antimicrobianos APS", stock_critico_alerta: 60 },
    [crearLoteDemo(71, 7, "Amoxicilina", "AMO-2407", 365, 40, 10)]
  ),
];

/**
 * Inyección de 20 Medicamentos Farmacéuticos Reales del Arsenal CESFAM / MINSAL / CENABAST.
 * Todos con descripción clínica real, sin precios ni atributos comerciales.
 */
export const ARSENAL_20_MEDICAMENTOS_REALES: MedicamentoArsenal[] = [
  ...MEDICAMENTOS_DEMO,
  med(
    8,
    "Paracetamol",
    "500 mg",
    "Comprimido",
    "Analgésico y antipirético de primera línea para dolor leve a moderado, artrosis GES y cuadros febriles.",
    { categoria_nombre: "Analgesia y Morbilidad" },
    [crearLoteDemo(81, 8, "Paracetamol", "PAR-2608", 320, 850, 220)]
  ),
  med(
    9,
    "Enalapril Maleato",
    "10 mg",
    "Comprimido",
    "Inhibidor de la enzima convertidora de angiotensina (IECA) para hipertensión arterial e insuficiencia cardíaca.",
    { categoria_nombre: "Cardiovascular FOFAR" },
    [crearLoteDemo(91, 9, "Enalapril Maleato", "ENA-2609", 190, 420, 110)]
  ),
  med(
    10,
    "Amlodipino Besilato",
    "5 mg",
    "Comprimido",
    "Bloqueador de canales de calcio dihidropiridínico para hipertensión arterial y angina crónica estable.",
    { categoria_nombre: "Cardiovascular FOFAR" },
    [crearLoteDemo(101, 10, "Amlodipino Besilato", "AML-2610", 240, 380, 90)]
  ),
  med(
    11,
    "Salbutamol Sulfato",
    "100 mcg/dosis",
    "Inhalador",
    "Broncodilatador agonista beta-2 adrenérgico de acción corta para crisis obstructiva, Asma y EPOC (Sala IRA/ERA).",
    { categoria_nombre: "Respiratorio IRA/ERA", stock_critico_alerta: 35 },
    [crearLoteDemo(111, 11, "Salbutamol Sulfato", "SAL-2611", 80, 22, 8)]
  ),
  med(
    12,
    "Budesonida Inhalador",
    "200 mcg/dosis",
    "Inhalador",
    "Corticoide inhalado de mantención para control antiinflamatorio crónico de Asma Bronquial (GES #39/#61).",
    { categoria_nombre: "Respiratorio IRA/ERA" },
    [crearLoteDemo(121, 12, "Budesonida Inhalador", "BUD-2612", 260, 140, 45)]
  ),
  med(
    13,
    "Levotiroxina Sódica",
    "100 mcg",
    "Comprimido",
    "Hormona tiroidea sintética para terapia de reemplazo en Hipotiroidismo primario (Programa GES #70).",
    { categoria_nombre: "Endocrinología GES #70" },
    [crearLoteDemo(131, 13, "Levotiroxina Sódica", "LEV-2613", 310, 500, 130)]
  ),
  med(
    14,
    "Omeprazol",
    "20 mg",
    "Cápsula",
    "Inhibidor de la bomba de protones para úlcera péptica, reflujo gastroesofágico y gastroprotección.",
    { categoria_nombre: "Gastroenterología APS" },
    [crearLoteDemo(141, 14, "Omeprazol", "OME-2614", 210, 600, 150)]
  ),
  med(
    15,
    "Sertralina Clorhidrato",
    "50 mg",
    "Comprimido",
    "Antidepresivo inhibidor selectivo de recaptación de serotonina (ISRS) para Depresión en APS (GES #34).",
    { categoria_nombre: "Salud Mental APS" },
    [crearLoteDemo(151, 15, "Sertralina Clorhidrato", "SER-2615", 280, 340, 85)]
  ),
  med(
    16,
    "Diazepam",
    "10 mg",
    "Comprimido",
    "Psicotrópico controlado D.S. 405 ISP para crisis de ansiedad severa, convulsiones agudas y sedación.",
    {
      categoria_nombre: "Salud Mental / Controlados ISP",
      es_controlado: true,
      tipo_controlado: "PSICOTROPICO",
      requiere_receta_retenida: true,
      esencial_carro_paro: true,
    },
    [crearLoteDemo(161, 16, "Diazepam", "DIA-2616", 65, 95, 35)]
  ),
  med(
    17,
    "Morfina Clorhidrato",
    "10 mg/mL",
    "Ampolla",
    "Analgésico opioide estupefaciente D.S. 404 ISP para Alivio del Dolor por Cáncer y Cuidados Paliativos (GES #04).",
    {
      categoria_nombre: "Cuidados Paliativos / Controlados ISP",
      es_controlado: true,
      tipo_controlado: "ESTUPEFACIENTE",
      requiere_receta_retenida: true,
      stock_critico_alerta: 25,
    },
    [crearLoteDemo(171, 17, "Morfina Clorhidrato", "MOR-2617", 180, 14, 6)]
  ),
  med(
    18,
    "Amiodarona Clorhidrato",
    "150 mg/3 mL",
    "Ampolla",
    "Antiarrítmico esencial en Carro de Paro para fibrilación ventricular y taquicardia ventricular sin pulso.",
    { categoria_nombre: "Urgencia y Carro de Paro", esencial_carro_paro: true, stock_critico_alerta: 15 },
    [crearLoteDemo(181, 18, "Amiodarona Clorhidrato", "AMI-2618", 195, 10, 4)]
  ),
  med(
    19,
    "Atropina Sulfato",
    "1 mg/mL",
    "Ampolla",
    "Anticolinérgico de urgencia vital en Carro de Paro para bradicardia sinusal sintomática e intoxicación colinérgica.",
    { categoria_nombre: "Urgencia y Carro de Paro", esencial_carro_paro: true, stock_critico_alerta: 15 },
    [crearLoteDemo(191, 19, "Atropina Sulfato", "ATR-2619", 250, 12, 5)]
  ),
  med(
    20,
    "Suero Fisiológico (NaCl 0,9%)",
    "500 mL",
    "Frasco",
    "Solución isotónica estéril para reposición hidroelectrolítica endovenosa y administración en Carro Unidosis.",
    { categoria_nombre: "Insumos y Soluciones Parenterales", stock_critico_alerta: 40 },
    [crearLoteDemo(201, 20, "Suero Fisiológico (NaCl 0,9%)", "SUE-2620", 380, 90, 25)]
  ),
];

// ---- Pacientes y recetas de prueba ----
export interface RecetaItem {
  medicamentoId: number;
  indicacion: string;
  cantidad: number;
}
export interface Receta {
  id: string;
  fecha: string;
  medico: string;
  programa: "GES" | "Crónicos" | "Morbilidad";
  items: RecetaItem[];
}
export interface PacienteDemo {
  rut: string;
  nombre: string;
  edad: number;
  tramo: string;
  programa: string;
  recetas: Receta[];
}

export const PACIENTES_DEMO: PacienteDemo[] = [
  {
    rut: "12345678-5",
    nombre: "María González Pérez",
    edad: 67,
    tramo: "FONASA A",
    programa: "Crónicos (Diabetes + HTA)",
    recetas: [
      {
        id: "RX-10231",
        fecha: enDias(-3),
        medico: "Dra. Camila Soto (Médico APS)",
        programa: "Crónicos",
        items: [
          { medicamentoId: 1, indicacion: "1 comprimido cada 12 horas con comida", cantidad: 60 },
          { medicamentoId: 2, indicacion: "1 comprimido al día en la mañana", cantidad: 30 },
        ],
      },
      {
        id: "RX-10198",
        fecha: enDias(-20),
        medico: "Dr. Felipe Rojas (Cardiólogo Interconsulta)",
        programa: "GES",
        items: [{ medicamentoId: 3, indicacion: "1 comprimido en la noche", cantidad: 30 }],
      },
    ],
  },
  {
    rut: "15678942-9",
    nombre: "Juan Carlos Tapia Morales",
    edad: 52,
    tramo: "FONASA B",
    programa: "Cardiovascular FOFAR",
    recetas: [
      {
        id: "RX-20412",
        fecha: enDias(-2),
        medico: "Dr. Carlos Rojas (Médico Cirujano APS)",
        programa: "Crónicos",
        items: [
          { medicamentoId: 9, indicacion: "1 comprimido cada 12 horas (8:00 y 20:00)", cantidad: 60 },
          { medicamentoId: 3, indicacion: "1 comprimido en la noche tras la cena", cantidad: 30 },
        ],
      },
      {
        id: "RX-20355",
        fecha: enDias(-14),
        medico: "Dra. Marcela Lagos (Medicina General)",
        programa: "Morbilidad",
        items: [{ medicamentoId: 14, indicacion: "1 cápsula en ayunas 30 minutos antes del desayuno", cantidad: 30 }],
      },
    ],
  },
  {
    rut: "9876543-3",
    nombre: "Rosa Elena Soto Valenzuela",
    edad: 74,
    tramo: "FONASA A",
    programa: "Adulto Mayor GES #70 (Hipotiroidismo)",
    recetas: [
      {
        id: "RX-30119",
        fecha: enDias(-5),
        medico: "Dra. Camila Soto (Médico APS)",
        programa: "GES",
        items: [
          { medicamentoId: 13, indicacion: "1 comprimido en ayunas estricto con un vaso de agua", cantidad: 30 },
          { medicamentoId: 8, indicacion: "1 comprimido cada 8 horas en caso de dolor articular", cantidad: 60 },
        ],
      },
      {
        id: "RX-29980",
        fecha: enDias(-25),
        medico: "Dr. Rodrigo Fuentes (Geriatría APS)",
        programa: "Crónicos",
        items: [{ medicamentoId: 10, indicacion: "1 comprimido al día en la mañana", cantidad: 30 }],
      },
    ],
  },
  {
    rut: "18234567-9",
    nombre: "Matías Ignacio Silva Castro",
    edad: 29,
    tramo: "FONASA B",
    programa: "Respiratorio Adulto Sala ERA (Asma GES #39)",
    recetas: [
      {
        id: "RX-40891",
        fecha: enDias(-1),
        medico: "Dra. Marcela Lagos (Encargada Sala ERA)",
        programa: "GES",
        items: [
          { medicamentoId: 11, indicacion: "2 inhalaciones cada 6 horas en caso de crisis obstructiva", cantidad: 2 },
          { medicamentoId: 12, indicacion: "2 inhalaciones cada 12 horas con aerocámara de mantención", cantidad: 1 },
        ],
      },
    ],
  },
  {
    rut: "7654321-6",
    nombre: "Don Pedro Alarcón Carrasco",
    edad: 81,
    tramo: "FONASA A",
    programa: "Diabetes Insulinorrequiriente GES #07 + HTA",
    recetas: [
      {
        id: "RX-50772",
        fecha: enDias(-4),
        medico: "Dr. Carlos Rojas (Médico Cirujano APS)",
        programa: "GES",
        items: [
          { medicamentoId: 4, indicacion: "28 UI en la mañana y 12 UI en la noche antes de cenar (Mantener refrigerada)", cantidad: 3 },
          { medicamentoId: 2, indicacion: "1 comprimido cada 12 horas", cantidad: 60 },
          { medicamentoId: 10, indicacion: "1 comprimido en la mañana", cantidad: 30 },
        ],
      },
    ],
  },
  {
    rut: "20123456-5",
    nombre: "Valentina Paz Herrera Muñoz",
    edad: 24,
    tramo: "FONASA B",
    programa: "Salud Mental GES #34 (Depresión Leve a Moderada)",
    recetas: [
      {
        id: "RX-60914",
        fecha: enDias(-6),
        medico: "Dr. Felipe Rojas (Equipo Salud Mental APS)",
        programa: "GES",
        items: [
          { medicamentoId: 15, indicacion: "1 comprimido al día en la mañana junto con el desayuno", cantidad: 30 },
          { medicamentoId: 14, indicacion: "1 cápsula diaria en ayunas por gastroprotección", cantidad: 30 },
        ],
      },
    ],
  },
];

export const PACIENTE_QR: PacienteDemo = PACIENTES_DEMO[0];

export const buscarPaciente = (rutNormalizado: string): PacienteDemo | null => {
  const norm = rutNormalizado.replace(/[^0-9kK]/g, "").toUpperCase();
  return (
    PACIENTES_DEMO.find((p) => {
      const pNorm = p.rut.replace(/[^0-9kK]/g, "").toUpperCase();
      return pNorm === norm;
    }) ?? null
  );
};

// ---- Modelos y datos iniciales de Carros Clínicos y Trazabilidad de Pedidos ----
export interface ItemCarroClinico {
  medicamentoId: number;
  nombre: string;
  concentracion: string;
  actual: number;
  requerido: number;
  dias: number;
}

export interface CarroClinicoInfo {
  id: string;
  tipo: string;
  ubicacion: string;
  responsable: string;
  sello: string;
  revision: string;
  items: ItemCarroClinico[];
}

export type EstadoPedidoCarro = "En camino" | "Aceptado" | "Cancelado";

export interface ItemPedidoCarro {
  medicamentoId: number;
  nombre: string;
  concentracion: string;
  lote: string;
  cantidad: number;
}

export interface PedidoReposicionCarro {
  id: string;
  carroId: string;
  carroNombre: string;
  fechaHora: string;
  quienProvee: string;
  solicitadoPor: string;
  motivo: string;
  estado: EstadoPedidoCarro;
  llegoAlCarro: boolean;
  fechaRecepcion?: string;
  items: ItemPedidoCarro[];
}

const CARROS_INICIALES: CarroClinicoInfo[] = [
  {
    id: "BOD-01",
    tipo: "Bodega Central Farmacia",
    ubicacion: "Almacén Central y Estanterías CESFAM",
    responsable: "Q.F. María González · TENS Camila Torres",
    sello: "BOD-CENABAST-01",
    revision: enDias(0),
    items: [
      { medicamentoId: 6, nombre: "Adrenalina (Epinefrina)", concentracion: "1 mg/mL", actual: 18, requerido: 60, dias: 25 },
      { medicamentoId: 4, nombre: "Insulina Humana NPH", concentracion: "100 UI/mL", actual: 35, requerido: 80, dias: 200 },
      { medicamentoId: 7, nombre: "Amoxicilina", concentracion: "500 mg", actual: 50, requerido: 120, dias: 365 },
    ],
  },
  {
    id: "CP-01",
    tipo: "Carro de Paro",
    ubicacion: "Box de Procedimientos y Reanimación",
    responsable: "Enf. Andrea Muñoz · Supervisa Q.F. Nataly Caamaño",
    sello: "SELLO-PARO-041",
    revision: enDias(-2),
    items: [
      { medicamentoId: 6, nombre: "Adrenalina (Epinefrina)", concentracion: "1 mg/mL", actual: 3, requerido: 10, dias: 25 },
      { medicamentoId: 18, nombre: "Amiodarona Clorhidrato", concentracion: "150 mg/3 mL", actual: 4, requerido: 6, dias: 195 },
      { medicamentoId: 19, nombre: "Atropina Sulfato", concentracion: "1 mg/mL", actual: 6, requerido: 6, dias: 250 },
    ],
  },
  {
    id: "CU-01",
    tipo: "Carro de Unidosis",
    ubicacion: "Sala de Observación y Tratamiento",
    responsable: "TENS Luis Vera · Supervisa Q.F. Nataly Caamaño",
    sello: "SELLO-UNI-118",
    revision: enDias(-1),
    items: [
      { medicamentoId: 8, nombre: "Paracetamol", concentracion: "500 mg", actual: 20, requerido: 40, dias: 320 },
      { medicamentoId: 11, nombre: "Salbutamol Sulfato", concentracion: "100 mcg/dosis", actual: 2, requerido: 5, dias: 80 },
      { medicamentoId: 20, nombre: "Suero Fisiológico (NaCl 0,9%)", concentracion: "500 mL", actual: 8, requerido: 8, dias: 380 },
    ],
  },
];

export interface ItemDispensado {
  medicamentoId: number;
  nombre: string;
  concentracion: string;
  forma: string;
  lote: string;
  cantidad: number;
  indicacion: string;
}

export interface RegistroDispensacion {
  folio: string;
  fechaHora: string;
  pacienteRut: string;
  pacienteNombre: string;
  pacienteEdad: number;
  pacienteTramo: string;
  programa: string;
  recetaId: string;
  medico: string;
  dispensadoPor: string;
  items: ItemDispensado[];
  observaciones?: string;
}

const DISPENSACIONES_INICIALES: RegistroDispensacion[] = [
  {
    folio: "20261019-4587",
    fechaHora: `${enDias(0)} 08:45`,
    pacienteRut: "12345678-5",
    pacienteNombre: "María González Pérez",
    pacienteEdad: 67,
    pacienteTramo: "FONASA A",
    programa: "Crónicos (Diabetes + HTA)",
    recetaId: "RX-10231",
    medico: "Dra. Camila Soto (Médico APS)",
    dispensadoPor: "María González (Químico Farmacéutico)",
    items: [
      { medicamentoId: 1, nombre: "Metformina Clorhidrato", concentracion: "850 mg", forma: "Comprimido", lote: "MET-2401", cantidad: 60, indicacion: "1 comprimido cada 12 horas con comida" },
      { medicamentoId: 2, nombre: "Losartán Potásico", concentracion: "50 mg", forma: "Comprimido", lote: "LOS-2402", cantidad: 30, indicacion: "1 comprimido al día en la mañana" },
    ],
    observaciones: "Paciente retira con carnet de identidad. Control cardiovascular en 30 días.",
  },
  {
    folio: "20261019-4512",
    fechaHora: `${enDias(0)} 09:20`,
    pacienteRut: "15678942-9",
    pacienteNombre: "Juan Carlos Tapia Morales",
    pacienteEdad: 52,
    pacienteTramo: "FONASA B",
    programa: "Cardiovascular FOFAR",
    recetaId: "RX-20412",
    medico: "Dr. Carlos Rojas (Médico Cirujano APS)",
    dispensadoPor: "Camila Torres (Técnico en Farmacia)",
    items: [
      { medicamentoId: 9, nombre: "Enalapril Maleato", concentracion: "10 mg", forma: "Comprimido", lote: "ENA-2609", cantidad: 60, indicacion: "1 comprimido cada 12 horas (8:00 y 20:00)" },
      { medicamentoId: 3, nombre: "Atorvastatina Cálcica", concentracion: "20 mg", forma: "Comprimido", lote: "ATO-2403", cantidad: 30, indicacion: "1 comprimido en la noche tras la cena" },
    ],
    observaciones: "Se refuerza importancia de adherencia a terapia antihipertensiva.",
  },
  {
    folio: "20261018-4390",
    fechaHora: `${enDias(-1)} 11:30`,
    pacienteRut: "9876543-3",
    pacienteNombre: "Rosa Elena Soto Valenzuela",
    pacienteEdad: 74,
    pacienteTramo: "FONASA A",
    programa: "Adulto Mayor GES #70 (Hipotiroidismo)",
    recetaId: "RX-30119",
    medico: "Dra. Camila Soto (Médico APS)",
    dispensadoPor: "Camila Torres (Técnico en Farmacia)",
    items: [
      { medicamentoId: 13, nombre: "Levotiroxina Sódica", concentracion: "100 mcg", forma: "Comprimido", lote: "LEV-2613", cantidad: 30, indicacion: "1 comprimido en ayunas estricto con un vaso de agua" },
      { medicamentoId: 8, nombre: "Paracetamol", concentracion: "500 mg", forma: "Comprimido", lote: "PAR-2608", cantidad: 60, indicacion: "1 comprimido cada 8 horas en caso de dolor articular" },
    ],
    observaciones: "Retira hija debidamente autorizada con poder simple y cédula.",
  },
  {
    folio: "20261018-4288",
    fechaHora: `${enDias(-1)} 15:10`,
    pacienteRut: "7654321-6",
    pacienteNombre: "Don Pedro Alarcón Carrasco",
    pacienteEdad: 81,
    pacienteTramo: "FONASA A",
    programa: "Diabetes Insulinorrequiriente GES #07 + HTA",
    recetaId: "RX-50772",
    medico: "Dr. Carlos Rojas (Médico Cirujano APS)",
    dispensadoPor: "María González (Químico Farmacéutico)",
    items: [
      { medicamentoId: 4, nombre: "Insulina Humana NPH", concentracion: "100 UI/mL", forma: "Frasco Ampolla", lote: "INS-2404", cantidad: 3, indicacion: "28 UI mañana y 12 UI noche (Mantener refrigerada)" },
      { medicamentoId: 2, nombre: "Losartán Potásico", concentracion: "50 mg", forma: "Comprimido", lote: "LOS-2402", cantidad: 60, indicacion: "1 comprimido cada 12 horas" },
    ],
    observaciones: "Se verifica cadena de frío (entrega en bolsa isotérmica con gel refrigerante).",
  },
  {
    folio: "20261017-4105",
    fechaHora: `${enDias(-2)} 10:15`,
    pacienteRut: "20123456-5",
    pacienteNombre: "Valentina Paz Herrera Muñoz",
    pacienteEdad: 24,
    pacienteTramo: "FONASA B",
    programa: "Salud Mental GES #34 (Depresión)",
    recetaId: "RX-60914",
    medico: "Dr. Felipe Rojas (Equipo Salud Mental APS)",
    dispensadoPor: "Camila Torres (Técnico en Farmacia)",
    items: [
      { medicamentoId: 15, nombre: "Sertralina Clorhidrato", concentracion: "50 mg", forma: "Comprimido", lote: "SER-2615", cantidad: 30, indicacion: "1 comprimido al día en la mañana" },
      { medicamentoId: 14, nombre: "Omeprazol", concentracion: "20 mg", forma: "Cápsula", lote: "OME-2614", cantidad: 30, indicacion: "1 cápsula diaria en ayunas" },
    ],
    observaciones: "Entrega conforme mensual Programa Salud Mental.",
  },
];

const PEDIDOS_CARRO_INICIALES: PedidoReposicionCarro[] = [
  {
    id: "PED-CP01-901",
    carroId: "CP-01",
    carroNombre: "Carro de Paro · CP-01",
    fechaHora: `${enDias(0)} 09:15`,
    quienProvee: "Bodega Central Farmacia CESFAM · Despacha Q.F. Nataly Caamaño",
    solicitadoPor: "Enf. Andrea Muñoz (Personal Clínico)",
    motivo: "Reposición urgente post Código Azul en Box Reanimación",
    estado: "En camino",
    llegoAlCarro: false,
    items: [
      { medicamentoId: 6, nombre: "Adrenalina (Epinefrina)", concentracion: "1 mg/mL", lote: "ADR-2406 (FEFO)", cantidad: 7 },
      { medicamentoId: 18, nombre: "Amiodarona Clorhidrato", concentracion: "150 mg/3 mL", lote: "AMI-2618 (FEFO)", cantidad: 2 },
    ],
  },
  {
    id: "PED-CU01-884",
    carroId: "CU-01",
    carroNombre: "Carro de Unidosis · CU-01",
    fechaHora: `${enDias(-1)} 16:40`,
    quienProvee: "Bodega Central Farmacia CESFAM · Despacha TENS Camila Fuentes",
    solicitadoPor: "TENS Luis Vera (Sala de Observación)",
    motivo: "Refuerzo de analgesia y broncodilatadores jornada diurna",
    estado: "Aceptado",
    llegoAlCarro: true,
    fechaRecepcion: `${enDias(-1)} 17:05`,
    items: [
      { medicamentoId: 8, nombre: "Paracetamol", concentracion: "500 mg", lote: "PAR-2608 (FEFO)", cantidad: 20 },
      { medicamentoId: 11, nombre: "Salbutamol Sulfato", concentracion: "100 mcg/dosis", lote: "SAL-2611 (FEFO)", cantidad: 3 },
    ],
  },
  {
    id: "PED-CP01-850",
    carroId: "CP-01",
    carroNombre: "Carro de Paro · CP-01",
    fechaHora: `${enDias(-2)} 11:20`,
    quienProvee: "Droguería Central SSM / CENABAST",
    solicitadoPor: "Enf. Rodrigo Silva (Urgencia SAPU)",
    motivo: "Solicitud duplicada post entrega de turno",
    estado: "Cancelado",
    llegoAlCarro: false,
    items: [
      { medicamentoId: 6, nombre: "Adrenalina (Epinefrina)", concentracion: "1 mg/mL", lote: "ADR-2406", cantidad: 5 },
      { medicamentoId: 19, nombre: "Atropina Sulfato", concentracion: "1 mg/mL", lote: "ATR-2619", cantidad: 4 },
    ],
  },
  {
    id: "PED-CP01-792",
    carroId: "CP-01",
    carroNombre: "Carro de Paro · CP-01",
    fechaHora: `${enDias(-3)} 14:10`,
    quienProvee: "Bodega Central Farmacia CESFAM · Despacha Q.F. Nataly Caamaño",
    solicitadoPor: "Enf. Andrea Muñoz (Personal Clínico)",
    motivo: "Reposición programada semanal",
    estado: "Aceptado",
    llegoAlCarro: true,
    fechaRecepcion: `${enDias(-3)} 14:38`,
    items: [
      { medicamentoId: 18, nombre: "Amiodarona Clorhidrato", concentracion: "150 mg/3 mL", lote: "AMI-2618", cantidad: 3 },
    ],
  },
  {
    id: "PED-CU01-710",
    carroId: "CU-01",
    carroNombre: "Carro de Unidosis · CU-01",
    fechaHora: `${enDias(-5)} 10:05`,
    quienProvee: "Laboratorio Chile S.A.",
    solicitadoPor: "TENS Luis Vera (Sala de Observación)",
    motivo: "Pedido rechazado por no contar con guía de despacho visada",
    estado: "Cancelado",
    llegoAlCarro: false,
    items: [
      { medicamentoId: 8, nombre: "Paracetamol", concentracion: "500 mg", lote: "PAR-2608", cantidad: 50 },
    ],
  },
];

// ==============================================================================
// STORE REACTIVO GLOBAL EN MEMORIA (Sincroniza CRUD, Recetas y Carros Clínicos)
// ==============================================================================
let _medsState: MedicamentoArsenal[] = [...MEDICAMENTOS_DEMO];
let _origenState: "demo" | "api" = "demo";
let _carrosState: CarroClinicoInfo[] = [...CARROS_INICIALES];
let _pedidosState: PedidoReposicionCarro[] = [...PEDIDOS_CARRO_INICIALES];
let _dispensacionesState: RegistroDispensacion[] = [...DISPENSACIONES_INICIALES];
let _apiConsultada = false;

const _listeners = new Set<() => void>();
const notificarCambios = () => _listeners.forEach((fn) => fn());

export function registrarDispensacionEnHistorial(disp: RegistroDispensacion): void {
  _dispensacionesState = [disp, ..._dispensacionesState];
  notificarCambios();
}

export interface NuevoMedicamentoInput {
  nombre_generico: string;
  concentracion: string;
  forma_farmaceutica: string;
  categoria_nombre: string;
  descripcion: string;
  stock_bodega: number;
  stock_vitrina: number;
  dias_para_vencer: number;
  stock_critico_alerta: number;
  es_controlado: boolean;
  tipo_controlado: TipoControlISP;
  esencial_carro_paro: boolean;
  requiere_cadena_frio: boolean;
}

export function inyectar20MedicamentosReales(): number {
  const mapaExistentes = new Map(_medsState.map((m) => [m.nombre_generico.toLowerCase(), m]));
  const fusionados: MedicamentoArsenal[] = [..._medsState];
  let agregados = 0;

  for (const prod of ARSENAL_20_MEDICAMENTOS_REALES) {
    const clave = prod.nombre_generico.toLowerCase();
    if (!mapaExistentes.has(clave)) {
      fusionados.push({
        ...prod,
        lotes: prod.lotes.map((l) => ({ ...l })),
      });
      agregados++;
    } else {
      // Asegura que tenga su descripción clínica actualizada
      const actual = mapaExistentes.get(clave)!;
      if (!actual.descripcion) {
        actual.descripcion = prod.descripcion;
      }
    }
  }

  _medsState = [...fusionados];
  notificarCambios();
  return agregados;
}

export function crearMedicamentoCRUD(input: NuevoMedicamentoInput): MedicamentoArsenal {
  const nuevoId = _medsState.reduce((max, m) => Math.max(max, m.id), 0) + 1;
  const prefijo = input.nombre_generico.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase() || "MED";
  const loteInicial = crearLoteDemo(
    nuevoId * 10 + 1,
    nuevoId,
    input.nombre_generico,
    `${prefijo}-${2600 + nuevoId}`,
    Math.max(1, input.dias_para_vencer),
    Math.max(0, input.stock_bodega),
    Math.max(0, input.stock_vitrina)
  );

  const nuevo: MedicamentoArsenal = {
    id: nuevoId,
    codigo_cenabast: `CEN-${String(nuevoId).padStart(4, "0")}`,
    codigo_atc: `ATC-${nuevoId}`,
    nombre_generico: input.nombre_generico.trim(),
    concentracion: input.concentracion.trim(),
    forma_farmaceutica: input.forma_farmaceutica.trim() || "Comprimido",
    unidad_medida: input.forma_farmaceutica.trim() || "Comprimido",
    categoria_nombre: input.categoria_nombre.trim() || "Arsenal APS MINSAL",
    descripcion: input.descripcion.trim() || "Medicamento del arsenal farmacológico asistencial CESFAM.",
    es_controlado: input.es_controlado,
    tipo_controlado: input.es_controlado ? input.tipo_controlado : "NO_CONTROLADO",
    requiere_receta_retenida: input.es_controlado,
    requiere_cadena_frio: input.requiere_cadena_frio,
    esencial_carro_paro: input.esencial_carro_paro,
    stock_minimo_alerta: Math.max(input.stock_critico_alerta * 2, 100),
    stock_critico_alerta: Math.max(1, input.stock_critico_alerta),
    lotes: [loteInicial],
  };

  _medsState = [nuevo, ..._medsState];
  notificarCambios();
  return nuevo;
}

export function actualizarMedicamentoCRUD(id: number, input: NuevoMedicamentoInput): void {
  _medsState = _medsState.map((m) => {
    if (m.id !== id) return m;
    const loteBase = m.lotes[0] ?? crearLoteDemo(id * 10 + 1, id, input.nombre_generico, `LOT-${id}`, input.dias_para_vencer, input.stock_bodega, input.stock_vitrina);
    const dias = Math.max(1, input.dias_para_vencer);
    const bod = Math.max(0, input.stock_bodega);
    const vit = Math.max(0, input.stock_vitrina);
    const loteActualizado: LoteFarmaceutico = {
      ...loteBase,
      medicamento_nombre: input.nombre_generico.trim(),
      dias_para_vencer: dias,
      fecha_vencimiento: enDias(dias),
      stock_bodega: bod,
      stock_vitrina: vit,
      stock_total: bod + vit,
      semaforo_vencimiento: dias <= 30 ? "ROJO" : dias <= 90 ? "AMARILLO" : "VERDE",
    };

    return {
      ...m,
      nombre_generico: input.nombre_generico.trim(),
      concentracion: input.concentracion.trim(),
      forma_farmaceutica: input.forma_farmaceutica.trim(),
      categoria_nombre: input.categoria_nombre.trim(),
      descripcion: input.descripcion.trim(),
      stock_critico_alerta: Math.max(1, input.stock_critico_alerta),
      es_controlado: input.es_controlado,
      tipo_controlado: input.es_controlado ? input.tipo_controlado : "NO_CONTROLADO",
      requiere_receta_retenida: input.es_controlado,
      esencial_carro_paro: input.esencial_carro_paro,
      requiere_cadena_frio: input.requiere_cadena_frio,
      lotes: [loteActualizado, ...m.lotes.slice(1)],
    };
  });
  notificarCambios();
}

export function eliminarMedicamentoCRUD(id: number): void {
  _medsState = _medsState.filter((m) => m.id !== id);
  notificarCambios();
}

export function ajustarStockMedicamentoCRUD(id: number, deltaBodega: number, deltaVitrina: number): void {
  _medsState = _medsState.map((m) => {
    if (m.id !== id || m.lotes.length === 0) return m;
    const primero = m.lotes[0];
    const bod = Math.max(0, primero.stock_bodega + deltaBodega);
    const vit = Math.max(0, primero.stock_vitrina + deltaVitrina);
    const loteMod: LoteFarmaceutico = {
      ...primero,
      stock_bodega: bod,
      stock_vitrina: vit,
      stock_total: bod + vit,
    };
    return { ...m, lotes: [loteMod, ...m.lotes.slice(1)] };
  });
  notificarCambios();
}

/**
 * Traspasa stock de Bodega Central a Vitrina de Atención aplicando estrictamente la regla FEFO:
 * consume prioritariamente las cajas del lote que vence más pronto. Si se agota, continúa con
 * el siguiente lote con vencimiento más cercano, previniendo mermas y vencimientos en estantería.
 */
export function traspasarStockBodegaAVitrinaFEFO(
  medicamentoId: number,
  cantidad: number
): {
  movidas: number;
  lotesImpactados: { lote: string; cantidad: number; dias: number; fechaVenc: string }[];
} {
  let restante = Math.max(0, cantidad);
  const impacto: { lote: string; cantidad: number; dias: number; fechaVenc: string }[] = [];

  _medsState = _medsState.map((m) => {
    if (m.id !== medicamentoId || m.lotes.length === 0) return m;

    // Ordenar lotes estrictamente bajo regla FEFO (menor cantidad de días para vencer primero)
    const lotesOrdenados = [...m.lotes].sort((a, b) => a.dias_para_vencer - b.dias_para_vencer);

    const lotesModificados = lotesOrdenados.map((lote) => {
      if (restante <= 0 || lote.stock_bodega <= 0) return lote;

      const aMover = Math.min(restante, lote.stock_bodega);
      restante -= aMover;
      impacto.push({
        lote: lote.numero_lote,
        cantidad: aMover,
        dias: lote.dias_para_vencer,
        fechaVenc: lote.fecha_vencimiento,
      });

      const nuevoBod = lote.stock_bodega - aMover;
      const nuevoVit = lote.stock_vitrina + aMover;

      return {
        ...lote,
        stock_bodega: nuevoBod,
        stock_vitrina: nuevoVit,
        stock_total: nuevoBod + nuevoVit,
      };
    });

    return {
      ...m,
      lotes: lotesModificados,
    };
  });

  notificarCambios();
  return { movidas: cantidad - restante, lotesImpactados: impacto };
}

export function agregarMedicamentoARecetaDemo(medicamentoId: number, cantidad: number, indicacion: string): void {
  const recetaActiva = PACIENTE_QR.recetas[0];
  const existente = recetaActiva.items.find((i) => i.medicamentoId === medicamentoId);
  if (existente) {
    existente.cantidad += cantidad;
    existente.indicacion = indicacion || existente.indicacion;
  } else {
    recetaActiva.items.push({
      medicamentoId,
      cantidad,
      indicacion: indicacion || "Según indicación médica asistencial APS",
    });
  }
  notificarCambios();
}

// ---- Gestión reactiva de Carros Clínicos y Trazabilidad de Pedidos ----
export function crearPedidoReposicionCarro(params: {
  carroId: string;
  quienProvee: string;
  solicitadoPor: string;
  motivo: string;
  items: { medicamentoId: number; cantidad: number }[];
}): PedidoReposicionCarro | null {
  const carro = _carrosState.find((c) => c.id === params.carroId);
  if (!carro || params.items.length === 0) return null;

  const itemsDetallados: ItemPedidoCarro[] = params.items.map((it) => {
    const medCrud = _medsState.find((m) => m.id === it.medicamentoId);
    const itemCarro = carro.items.find((ci) => ci.medicamentoId === it.medicamentoId);
    const nombre = medCrud?.nombre_generico ?? itemCarro?.nombre ?? `Medicamento #${it.medicamentoId}`;
    const concentracion = medCrud?.concentracion ?? itemCarro?.concentracion ?? "";
    const loteFefo = medCrud?.lotes[0]?.numero_lote ? `${medCrud.lotes[0].numero_lote} (FEFO)` : "LOT-FEFO-2026";
    return {
      medicamentoId: it.medicamentoId,
      nombre,
      concentracion,
      lote: loteFefo,
      cantidad: Math.max(1, it.cantidad),
    };
  });

  const ahora = new Date();
  const horaStr = ahora.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  const nuevoPedido: PedidoReposicionCarro = {
    id: `PED-${carro.id.replace("-", "")}-${Math.floor(100 + Math.random() * 900)}`,
    carroId: carro.id,
    carroNombre: `${carro.tipo} · ${carro.id}`,
    fechaHora: `${enDias(0)} ${horaStr}`,
    quienProvee: params.quienProvee,
    solicitadoPor: params.solicitadoPor,
    motivo: params.motivo || "Reposición y armado preventivo de stock clínico",
    estado: "En camino",
    llegoAlCarro: false,
    items: itemsDetallados,
  };

  _pedidosState = [nuevoPedido, ..._pedidosState];
  notificarCambios();
  return nuevoPedido;
}

export function actualizarEstadoPedidoCarro(pedidoId: string, nuevoEstado: EstadoPedidoCarro): boolean {
  const pedidoObjetivo = _pedidosState.find((p) => p.id === pedidoId);
  if (!pedidoObjetivo) return false;

  // SEGURIDAD CLÍNICA ASISTENCIAL: Una vez "Aceptado", NO HAY VUELTA ATRÁS (registro sellado e inmutable)
  if (pedidoObjetivo.estado === "Aceptado") {
    return false;
  }
  // Un pedido cancelado tampoco puede ser reactivado
  if (pedidoObjetivo.estado === "Cancelado") {
    return false;
  }

  // Si pasa a "Aceptado", suma el stock solicitado al destino y abastece el inventario
  if (nuevoEstado === "Aceptado") {
    const esProveedorExterno =
      pedidoObjetivo.quienProvee.includes("CENABAST") ||
      pedidoObjetivo.quienProvee.includes("Laboratorio") ||
      pedidoObjetivo.quienProvee.includes("MINSAL") ||
      pedidoObjetivo.quienProvee.includes("Droguería");
    const esDestinoBodega = pedidoObjetivo.carroId === "BOD-01";

    _carrosState = _carrosState.map((carro) => {
      if (carro.id !== pedidoObjetivo.carroId) return carro;
      const nuevosItems = [...carro.items];

      for (const itemPed of pedidoObjetivo.items) {
        const idx = nuevosItems.findIndex(
          (ci) =>
            ci.medicamentoId === itemPed.medicamentoId ||
            ci.nombre.toLowerCase() === itemPed.nombre.toLowerCase()
        );
        const medCrud = _medsState.find((m) => m.id === itemPed.medicamentoId);
        const diasVenc = medCrud ? menorDiasMed(medCrud) : 180;

        if (idx >= 0) {
          nuevosItems[idx] = {
            ...nuevosItems[idx],
            actual: nuevosItems[idx].actual + itemPed.cantidad,
          };
        } else {
          nuevosItems.push({
            medicamentoId: itemPed.medicamentoId,
            nombre: itemPed.nombre,
            concentracion: itemPed.concentracion,
            actual: itemPed.cantidad,
            requerido: Math.max(10, itemPed.cantidad),
            dias: diasVenc,
          });
        }

        // Ingreso físico de insumos al CESFAM:
        // Si el pedido proviene de CENABAST / Proveedor externo o su destino es la Bodega Central,
        // suma (+) a la Bodega de Farmacia, elevando las existencias por sobre el umbral y apagando la alerta crítica.
        if (medCrud) {
          if (esDestinoBodega || esProveedorExterno) {
            ajustarStockMedicamentoCRUD(medCrud.id, itemPed.cantidad, 0);
          } else {
            // Traslado interno exclusivo desde Bodega hacia carro clínico
            ajustarStockMedicamentoCRUD(medCrud.id, -itemPed.cantidad, 0);
          }
        }
      }

      return {
        ...carro,
        sello: `SELLO-VERIF-${Math.floor(100 + Math.random() * 900)}`,
        revision: enDias(0),
        items: nuevosItems,
      };
    });
  }

  const horaStr = new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  _pedidosState = _pedidosState.map((p) => {
    if (p.id !== pedidoId) return p;
    return {
      ...p,
      estado: nuevoEstado,
      llegoAlCarro: nuevoEstado === "Aceptado" ? true : nuevoEstado === "Cancelado" ? false : p.llegoAlCarro,
      fechaRecepcion: nuevoEstado === "Aceptado" ? `${enDias(0)} ${horaStr}` : p.fechaRecepcion,
    };
  });

  notificarCambios();
  return true;
}

export interface ConfigInstitucional {
  sigla: string;
  nombreCentro: string;
  servicioSalud: string;
  logoUrl: string; // URL o DataURL base64 personalizado por el Admin
}

const BRAND_STORAGE_KEY = "cesfam_branding_config_v1";

const cargarBrandingInicial = (): ConfigInstitucional => {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(BRAND_STORAGE_KEY) : null;
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {
    sigla: "CESFAM",
    nombreCentro: "Centro de Salud Familiar",
    servicioSalud: "Servicio de Salud · Red Asistencial",
    logoUrl: "",
  };
};

let _brandingState: ConfigInstitucional = cargarBrandingInicial();

export function actualizarConfigInstitucional(parcial: Partial<ConfigInstitucional>): void {
  _brandingState = { ..._brandingState, ...parcial };
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(BRAND_STORAGE_KEY, JSON.stringify(_brandingState));
    }
  } catch {
    // ignore
  }
  notificarCambios();
}

export function useMedicamentos() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    _listeners.add(listener);

    if (!_apiConsultada) {
      _apiConsultada = true;
      obtenerMedicamentosConLotesFEFO()
        .then((d) => {
          if (Array.isArray(d) && d.length) {
            _medsState = d.map((item) => ({
              ...item,
              descripcion:
                item.descripcion ||
                ARSENAL_20_MEDICAMENTOS_REALES.find(
                  (r) => r.nombre_generico.toLowerCase() === item.nombre_generico.toLowerCase()
                )?.descripcion ||
                "Medicamento del arsenal farmacológico asistencial CESFAM.",
            }));
            _origenState = "api";
            notificarCambios();
          }
        })
        .catch(() => undefined);
    }

    return () => {
      _listeners.delete(listener);
    };
  }, []);

  return {
    meds: _medsState,
    origen: _origenState,
    carros: _carrosState,
    pedidosCarro: _pedidosState,
    dispensaciones: _dispensacionesState,
    branding: _brandingState,
  };
}

export const stockTotalMed = (m: MedicamentoArsenal) => m.lotes.reduce((s, l) => s + l.stock_total, 0);
export const stockBodegaMed = (m: MedicamentoArsenal) => m.lotes.reduce((s, l) => s + l.stock_bodega, 0);
export const stockVitrinaMed = (m: MedicamentoArsenal) => m.lotes.reduce((s, l) => s + l.stock_vitrina, 0);
export const menorDiasMed = (m: MedicamentoArsenal) =>
  m.lotes.length ? Math.min(...m.lotes.map((l) => l.dias_para_vencer)) : 365;

// ---- Libro de controlados (recetas retenidas) ----
export const LIBRO_CONTROLADOS = [
  { folio: "LC-0412", fecha: enDias(-1), paciente: "J. Muñoz R.", medicamento: "Clonazepam 2 mg", tipo: "Psicotrópico", cantidad: 30, receta: "Retenida", saldo: 120 },
  { folio: "LC-0411", fecha: enDias(-2), paciente: "P. Araya S.", medicamento: "Clonazepam 2 mg", tipo: "Psicotrópico", cantidad: 60, receta: "Retenida", saldo: 150 },
  { folio: "LC-0410", fecha: enDias(-4), paciente: "R. Díaz T.", medicamento: "Morfina 10 mg", tipo: "Estupefaciente", cantidad: 10, receta: "Retenida", saldo: 40 },
];

// ---- Auditoría ALCOA+ ----
export const hashDemo = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0").repeat(8).slice(0, 64);
};
