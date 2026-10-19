import React, { useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  Eye,
  FileText,
  HeartPulse,
  Info,
  Lock,
  Pill,
  Printer,
  QrCode,
  Search,
  Star,
  UserRound,
  X,
} from "lucide-react";
import { HelpBanner, PageTitle, Semaforo } from "../components/ui";
import {
  ajustarStockMedicamentoCRUD,
  buscarPaciente,
  PACIENTES_DEMO,
  PACIENTE_QR,
  PacienteDemo,
  registrarDispensacionEnHistorial,
  semaforoDeDias,
  useMedicamentos,
} from "../data/demo";
import { validarRutChilenoModulo11 } from "../utils/rutModulo11";
import { LoteFarmaceutico, MedicamentoArsenal } from "../types/cesfam";

/** FEFO: primer lote vigente con menor fecha de vencimiento. */
const loteFEFO = (m?: MedicamentoArsenal): LoteFarmaceutico | undefined =>
  m
    ? [...m.lotes]
        .filter((l) => l.dias_para_vencer > 0 && l.stock_total > 0)
        .sort((a, b) => a.dias_para_vencer - b.dias_para_vencer)[0]
    : undefined;

const formatearRut = (v: string) => {
  const l = v.replace(/[^0-9kK]/g, "").toUpperCase().slice(0, 9);
  return l.length > 1 ? `${l.slice(0, -1)}-${l.slice(-1)}` : l;
};

export const Dispensacion: React.FC<{ avisar: (m: string) => void }> = ({ avisar }) => {
  const { meds, branding } = useMedicamentos();

  // Paciente de demostración precargado
  const [rutInput, setRutInput] = useState(PACIENTE_QR.rut);
  const [errorRut, setErrorRut] = useState<string | null>(null);
  const [paciente, setPaciente] = useState<PacienteDemo>(PACIENTE_QR);
  const [recetaIdx, setRecetaIdx] = useState(0);
  const [tabActiva, setTabActiva] = useState<"medicamentos" | "recetas" | "alertas">("medicamentos");
  const [indicacionesPaciente, setIndicacionesPaciente] = useState("");
  const [folioEntrega, setFolioEntrega] = useState<string | null>(null);
  const [mostrarModalEntregaConforme, setMostrarModalEntregaConforme] = useState(false);
  const [mostrarModalComprobante, setMostrarModalComprobante] = useState(false);

  const recetaActiva = paciente.recetas[recetaIdx] ?? paciente.recetas[0];

  const medPorId = (id: number) => meds.find((m) => m.id === id) ?? meds[0];

  const manejarBusqueda = (e: React.FormEvent) => {
    e.preventDefault();
    const limpio = rutInput.trim();
    if (!limpio) {
      setErrorRut("Ingrese un RUT chileno para buscar al paciente.");
      return;
    }
    const val = validarRutChilenoModulo11(limpio);
    if (!val.esValido) {
      setErrorRut(val.mensajeError ?? "RUT inválido según dígito verificador Módulo 11.");
      return;
    }
    const encontrado = buscarPaciente(val.rutNormalizado);
    if (!encontrado) {
      setErrorRut("RUT válido (Módulo 11 OK), pero sin ficha activa. Se mantiene paciente de demostración.");
      return;
    }
    setErrorRut(null);
    setPaciente(encontrado);
    setRecetaIdx(0);
    avisar(`Ficha clínica de ${encontrado.nombre} cargada.`);
  };

  const simularEscaneoQR = () => {
    setRutInput(PACIENTE_QR.rut);
    setErrorRut(null);
    setPaciente(PACIENTE_QR);
    setRecetaIdx(0);
    avisar("Cédula QR escaneada correctamente: Paciente cargado.");
  };

  const lineas = useMemo(() => {
    if (!recetaActiva) return [];
    return recetaActiva.items
      .map((it) => {
        const m = medPorId(it.medicamentoId);
        if (!m) return null;
        return {
          it,
          m,
          cantidad: it.cantidad,
          lote: loteFEFO(m),
        };
      })
      .filter(
        (
          x
        ): x is {
          it: { medicamentoId: number; indicacion: string; cantidad: number };
          m: MedicamentoArsenal;
          cantidad: number;
          lote: LoteFarmaceutico | undefined;
        } => x !== null
      );
  }, [recetaActiva, meds]);

  const registrarEntrega = () => {
    if (lineas.length === 0) {
      avisar("No hay medicamentos en la receta seleccionada.");
      return;
    }
    lineas.forEach(({ m, cantidad }) => {
      ajustarStockMedicamentoCRUD(m.id, 0, -cantidad);
    });
    const nuevoFolio = `20261019-${Math.floor(1000 + Math.random() * 9000)}`;
    setFolioEntrega(nuevoFolio);

    // Guardar en el Historial Oficial de Registros
    registrarDispensacionEnHistorial({
      folio: nuevoFolio,
      fechaHora: `${new Date().toLocaleDateString("es-CL")} ${new Date().toLocaleTimeString("es-CL", {
        hour: "2-digit",
        minute: "2-digit",
      })}`,
      pacienteRut: paciente.rut,
      pacienteNombre: paciente.nombre,
      pacienteEdad: paciente.edad,
      pacienteTramo: paciente.tramo,
      programa: recetaActiva?.programa ?? paciente.programa,
      recetaId: recetaActiva?.id ?? "RX-REC-01",
      medico: recetaActiva?.medico ?? "Dra. Camila Soto (Médico APS)",
      dispensadoPor: "Camila Torres (Técnico en Farmacia)",
      items: lineas.map(({ it, m, cantidad, lote }) => ({
        medicamentoId: m.id,
        nombre: m.nombre_generico,
        concentracion: m.concentracion,
        forma: m.forma_farmaceutica,
        lote: lote?.numero_lote ?? "LOT-FEFO-2026",
        cantidad,
        indicacion: it.indicacion,
      })),
      observaciones: indicacionesPaciente.trim() || undefined,
    });

    avisar(`Entrega conforme registrada (N° ${nuevoFolio}). Guardada en Registros.`);
    setMostrarModalEntregaConforme(true);
  };

  const cancelarLimpiar = () => {
    setIndicacionesPaciente("");
    setFolioEntrega(null);
    setErrorRut(null);
    setMostrarModalEntregaConforme(false);
    setMostrarModalComprobante(false);
    avisar("Formulario de entrega reiniciado.");
  };

  const abrirImprimir = () => {
    if (!folioEntrega) {
      avisar("Debe registrar y finalizar la entrega del producto antes de imprimir el comprobante.");
      return;
    }
    setMostrarModalComprobante(true);
  };

  const ejecutarImpresionNavegador = () => {
    avisar("Imprimiendo exclusivamente el comprobante oficial...");
    window.print();
  };

  /** Documento formal del comprobante para visualización limpia en modal e impresión en papel */
  const renderDocumentoComprobante = () => (
    <div className="comprobante-oficial-print rounded-xl border border-slate-300 bg-white p-6 text-slate-900 shadow-sm">
      {/* Encabezado Oficial */}
      <div className="border-b-2 border-slate-900 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={branding.sigla}
                className="h-14 w-14 object-contain"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded border border-slate-900 bg-slate-100 text-xs font-black">
                MINSAL
              </div>
            )}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
                República de Chile · Ministerio de Salud · Red Asistencial
              </p>
              <h2 className="text-base font-black uppercase text-slate-900">
                {branding.sigla} · {branding.nombreCentro}
              </h2>
              <p className="text-[11px] text-slate-600">
                {branding.servicioSalud} · Farmacia Asistencial APS
              </p>
            </div>
          </div>

          <div className="rounded border border-slate-800 bg-slate-50 p-2 text-right">
            <p className="text-[10px] font-bold uppercase text-slate-600">Folio Dispensación</p>
            <p className="font-mono text-sm font-black text-slate-900">
              N° {folioEntrega || "20261019-4587"}
            </p>
            <p className="text-[10px] text-slate-500">
              {new Date().toLocaleDateString("es-CL")} {new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })} hrs
            </p>
          </div>
        </div>

        <div className="mt-2.5 rounded bg-slate-100 py-1 text-center border border-slate-300">
          <p className="text-xs font-black uppercase tracking-wider text-slate-900">
            Comprobante de Dispensación y Entrega Gratuita de Medicamentos (APS / MINSAL)
          </p>
        </div>
      </div>

      {/* Identificación del Paciente y Prescripción */}
      <div className="my-3 grid grid-cols-2 gap-3 rounded border border-slate-300 bg-slate-50/70 p-2.5 text-xs">
        <div className="space-y-0.5">
          <p>
            <strong className="text-slate-900">Paciente:</strong> {paciente.nombre}
          </p>
          <p>
            <strong className="text-slate-900">RUT:</strong> {paciente.rut} &nbsp;|&nbsp;{" "}
            <strong className="text-slate-900">Edad:</strong> {paciente.edad} años
          </p>
          <p>
            <strong className="text-slate-900">N° Ficha:</strong> 245678 &nbsp;|&nbsp;{" "}
            <strong className="text-slate-900">Tramo:</strong> {paciente.tramo}
          </p>
          <p>
            <strong className="text-slate-900">Programa:</strong>{" "}
            {recetaActiva?.programa || paciente.programa}
          </p>
        </div>

        <div className="space-y-0.5">
          <p>
            <strong className="text-slate-900">Receta Folio:</strong> {recetaActiva?.id || "REC-2026-001"}
          </p>
          <p>
            <strong className="text-slate-900">Fecha Receta:</strong> {recetaActiva?.fecha || "2026-10-07"}
          </p>
          <p>
            <strong className="text-slate-900">Médico:</strong>{" "}
            {recetaActiva?.medico || "Dr. Carlos Rojas (Médico Cirujano APS)"}
          </p>
          <p>
            <strong className="text-slate-900">Dispensado por:</strong> María González (Químico Farmacéutico · Reg. SIS 45892)
          </p>
        </div>
      </div>

      {/* Tabla Oficial de Medicamentos */}
      <div className="my-3 overflow-x-auto">
        <table className="w-full border-collapse border border-slate-400 text-xs">
          <thead>
            <tr className="border-b border-slate-400 bg-slate-200 text-slate-900 font-bold">
              <th className="border-r border-slate-400 p-1.5 text-center w-8">N°</th>
              <th className="border-r border-slate-400 p-1.5 text-left">Fármaco y Concentración</th>
              <th className="border-r border-slate-400 p-1.5 text-left">Presentación</th>
              <th className="border-r border-slate-400 p-1.5 text-center">Lote FEFO</th>
              <th className="border-r border-slate-400 p-1.5 text-center">Vence</th>
              <th className="border-r border-slate-400 p-1.5 text-center">Cantidad</th>
              <th className="p-1.5 text-left">Posología / Dosis</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-300">
            {lineas.map(({ it, m, cantidad, lote }, idx) => (
              <tr key={m.id}>
                <td className="border-r border-slate-300 p-1.5 text-center font-bold">{idx + 1}</td>
                <td className="border-r border-slate-300 p-1.5 font-bold">
                  {m.nombre_generico} {m.concentracion}
                </td>
                <td className="border-r border-slate-300 p-1.5">{m.forma_farmaceutica}</td>
                <td className="border-r border-slate-300 p-1.5 text-center font-mono">
                  {lote?.numero_lote ?? "LOT-FEFO"}
                </td>
                <td className="border-r border-slate-300 p-1.5 text-center">
                  {lote?.fecha_vencimiento ?? "2026-12"}
                </td>
                <td className="border-r border-slate-300 p-1.5 text-center font-extrabold">
                  {cantidad} u.
                </td>
                <td className="p-1.5 text-[11px]">{it.indicacion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Indicaciones al Paciente */}
      <div className="my-3 rounded border border-slate-300 bg-slate-50 p-2 text-xs">
        <p className="font-bold text-slate-900">Indicaciones de Uso y Cuidados:</p>
        <p className="mt-0.5 text-slate-700">
          {indicacionesPaciente ||
            "Tomar con abundante agua según los horarios prescritos. Mantener en lugar fresco y seco (a menos de 25°C), fuera del alcance de los niños. Ante sospecha de reacción adversa (RAM), acuda a su CESFAM."}
        </p>
      </div>

      {/* Marco Normativo y Legal de Gratuidad */}
      <div className="border-t border-slate-300 pt-1.5 text-[9px] text-slate-600 leading-tight">
        <p>
          * Dispensación asistencial 100% gratuita financiada por el Sistema Nacional de Servicios de Salud (FONASA / APS). Prohibida estrictamente su venta comercial o canje bajo sanciones del Art. 102 del Código Sanitario y Ley N° 20.584 de Derechos y Deberes de los Pacientes.
        </p>
        <p>
          * Verificación FEFO y trazabilidad de lotes garantizada bajo Norma Técnica N° 147 del Instituto de Salud Pública (ISP).
        </p>
      </div>

      {/* Bloque de Firmas */}
      <div className="mt-6 grid grid-cols-2 gap-8 text-center text-xs">
        <div>
          <div className="mx-auto w-48 border-t border-slate-800 pt-1 font-bold text-slate-900">
            Firma y Timbre Farmacia
          </div>
          <p className="text-[10px] text-slate-600">Q.F. María González / TENS</p>
        </div>
        <div>
          <div className="mx-auto w-48 border-t border-slate-800 pt-1 font-bold text-slate-900">
            Firma / Huella Conforme
          </div>
          <p className="text-[10px] text-slate-600">
            Paciente o Representante (RUT: {paciente.rut})
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* ================= CONTENIDO DE PANTALLA (OCULTO AL IMPRIMIR) ================= */}
      <div className="pantalla-no-imprimir">
        <PageTitle
          icon={<Pill size={26} />}
          title="Entrega de Medicamentos"
          subtitle="Gestión de dispensación gratuita para pacientes del CESFAM"
        />

        <HelpBanner
          titulo="¿Cómo dispensar medicamentos al paciente? Guía en 3 pasos"
          pasos={[
            "Busque al paciente por RUT (Módulo 11) o presione “Simular Cédula QR” para cargar su ficha.",
            "Verifique los medicamentos de la receta, el lote FEFO sugerido y las cantidades.",
            "Presione “Registrar Entrega” para descontar de Vitrina y emitir el comprobante oficial.",
          ]}
        />

        {/* ================= FILA SUPERIOR DE 3 BLOQUES CELESTES ================= */}
        <div className="mb-5 grid gap-4 lg:grid-cols-12">
          {/* Bloque 1: Buscar Paciente */}
          <div className="rounded-2xl border border-[#F8C8CB] bg-[#FDF2F2] p-4 lg:col-span-5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <label htmlFor="input-buscar-paciente" className="text-sm font-extrabold text-[#1C0D0F]">
                Buscar Paciente
              </label>
              <button
                type="button"
                onClick={simularEscaneoQR}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#B80F16] px-2.5 py-1 text-xs font-bold text-white shadow-sm transition hover:bg-[#10457A]"
              >
                <QrCode size={14} aria-hidden />
                Simular Cédula QR
              </button>
            </div>

            <form onSubmit={manejarBusqueda} className="flex items-stretch">
              <input
                id="input-buscar-paciente"
                type="text"
                value={rutInput}
                onChange={(e) => {
                  setRutInput(formatearRut(e.target.value));
                  setErrorRut(null);
                }}
                placeholder="Ingrese RUT (ej: 12345678-5)..."
                className="w-full rounded-l-xl border border-r-0 border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-800 focus:border-[#B80F16] focus:outline-none"
              />
              <button
                type="submit"
                aria-label="Buscar paciente"
                className="flex items-center justify-center rounded-r-xl bg-[#C4121A] px-4 text-white transition hover:bg-[#9E0E15]"
              >
                <Search size={18} aria-hidden />
              </button>
            </form>

            {/* Selector rápido de pacientes cargados en el sistema */}
            <div className="mt-2.5">
              <p className="mb-1 text-[11px] font-bold text-slate-500">
                Pacientes registrados en el sistema ({PACIENTES_DEMO.length}):
              </p>
              <div className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto py-0.5">
                {PACIENTES_DEMO.map((p) => {
                  const seleccionado = paciente.rut === p.rut;
                  return (
                    <button
                      key={p.rut}
                      type="button"
                      onClick={() => {
                        setRutInput(p.rut);
                        setErrorRut(null);
                        setPaciente(p);
                        setRecetaIdx(0);
                        avisar(`Ficha de ${p.nombre} cargada.`);
                      }}
                      className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${
                        seleccionado
                          ? "bg-[#C4121A] text-white shadow-sm"
                          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                      title={`${p.nombre} · RUT: ${p.rut} (${p.programa})`}
                    >
                      {p.nombre.split(" ")[0]} ({p.rut})
                    </button>
                  );
                })}
              </div>
            </div>

            {errorRut && (
              <p role="alert" className="mt-2 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-bold text-red-800">
                ⚠ {errorRut}
              </p>
            )}
          </div>

          {/* Bloque 2: Ficha del Paciente */}
          <div className="flex items-center gap-3.5 rounded-2xl border border-[#F8C8CB] bg-[#FDF2F2] p-4 lg:col-span-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#F8C8CB] text-[#B80F16]">
              <UserRound size={32} aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-black text-[#1C0D0F]">{paciente.nombre}</p>
              <p className="text-xs font-semibold text-slate-600">
                RUT: <strong className="text-[#1C0D0F]">{paciente.rut}</strong> | Edad: {paciente.edad} años
              </p>
              <p className="text-xs font-semibold text-[#B80F16]">
                N° Ficha: 245678 · {paciente.tramo}
              </p>
            </div>
          </div>

          {/* Bloque 3: Programa de Salud */}
          <div className="flex items-center gap-3.5 rounded-2xl border border-[#F8C8CB] bg-[#FDF2F2] p-4 lg:col-span-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#F8C8CB] text-[#C4121A]">
              <HeartPulse size={26} aria-hidden />
            </div>
            <div>
              <p className="text-xs font-extrabold text-[#1C0D0F]">Programa de Salud</p>
              <p className="text-sm font-bold text-[#C4121A]">
                {recetaActiva?.programa ?? paciente.programa}
              </p>
            </div>
          </div>
        </div>

        {/* ================= PESTAÑAS DE NAVEGACIÓN ================= */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTabActiva("medicamentos")}
            className={`rounded-t-xl px-5 py-2.5 text-sm font-extrabold transition ${
              tabActiva === "medicamentos"
                ? "bg-[#C4121A] text-white shadow-sm"
                : "bg-[#E8EFF7] text-[#1C0D0F] hover:bg-[#DCE7F4]"
            }`}
          >
            Medicamentos a Entregar ({lineas.length})
          </button>

          <button
            type="button"
            onClick={() => setTabActiva("recetas")}
            className={`rounded-t-xl px-5 py-2.5 text-sm font-extrabold transition ${
              tabActiva === "recetas"
                ? "bg-[#C4121A] text-white shadow-sm"
                : "bg-[#E8EFF7] text-[#1C0D0F] hover:bg-[#DCE7F4]"
            }`}
          >
            Historial / Recetas ({paciente.recetas.length})
          </button>

          <button
            type="button"
            onClick={() => setTabActiva("alertas")}
            className={`rounded-t-xl px-5 py-2.5 text-sm font-extrabold transition ${
              tabActiva === "alertas"
                ? "bg-[#C4121A] text-white shadow-sm"
                : "bg-[#E8EFF7] text-[#1C0D0F] hover:bg-[#DCE7F4]"
            }`}
          >
            Alertas FEFO
          </button>
        </div>

        {/* ================= CUERPO EN 2 COLUMNAS ================= */}
        <div className="grid gap-5 lg:grid-cols-12">
          {/* Columna Izquierda */}
          <div className="space-y-4 lg:col-span-9">
            {tabActiva === "medicamentos" && (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-[#FBEBEB] text-xs font-extrabold uppercase tracking-wider text-[#1C0D0F]">
                      <th className="px-3.5 py-3">N°</th>
                      <th className="px-3.5 py-3">Medicamento</th>
                      <th className="px-3.5 py-3">Presentación</th>
                      <th className="px-3.5 py-3">Dosis Indicada</th>
                      <th className="px-3.5 py-3 text-center">Cantidad Prescrita</th>
                      <th className="px-3.5 py-3">Observaciones / Lote FEFO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {lineas.map(({ it, m, cantidad, lote }, index) => (
                      <tr key={`${recetaActiva?.id}-${m.id}`} className="hover:bg-slate-50/80">
                        <td className="px-3.5 py-3.5 font-bold text-slate-700">{index + 1}</td>
                        <td className="px-3.5 py-3.5">
                          <p className="font-extrabold text-[#1C0D0F]">
                            {m.nombre_generico} {m.concentracion}
                          </p>
                          <p className="text-xs text-slate-500">{m.codigo_cenabast}</p>
                        </td>
                        <td className="px-3.5 py-3.5 font-medium text-slate-700">
                          {m.forma_farmaceutica}
                        </td>
                        <td className="px-3.5 py-3.5 font-medium text-slate-700">{it.indicacion}</td>
                        <td className="px-3.5 py-3.5 text-center">
                          <div
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-black text-[#1C0D0F] shadow-sm"
                            title="Cantidad fija prescrita por el médico tratante en receta médica (inmutable)"
                          >
                            <Lock size={12} className="text-slate-500" aria-hidden />
                            <span>{cantidad} u.</span>
                          </div>
                          <span className="block text-[10px] font-semibold text-slate-400 mt-0.5">
                            Fijada por receta médica
                          </span>
                        </td>
                        <td className="px-3.5 py-3.5">
                          {lote ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                                <Star size={12} aria-hidden />
                                FEFO: {lote.numero_lote} ({lote.dias_para_vencer}d)
                              </span>
                              <Semaforo
                                nivel={semaforoDeDias(
                                  lote.dias_para_vencer,
                                  lote.stock_total,
                                  m.stock_critico_alerta
                                )}
                              />
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">Control en 3 meses</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tabActiva === "recetas" && (
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-extrabold text-[#1C0D0F]">
                  Seleccione la receta médica activa del paciente:
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  {paciente.recetas.map((r, i) => {
                    const activa = i === recetaIdx;
                    return (
                      <div
                        key={r.id}
                        className={`rounded-xl border-2 bg-white p-4 transition ${
                          activa ? "border-[#C4121A] shadow-sm" : "border-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 font-extrabold text-[#1C0D0F]">
                            <FileText size={17} className="text-[#B80F16]" aria-hidden />
                            Receta {r.id}
                          </span>
                          <span className="rounded-full bg-[#FDE8E8] px-2.5 py-0.5 text-xs font-bold text-[#B80F16]">
                            {r.programa}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          Fecha: {r.fecha} · Prescriptor: {r.medico}
                        </p>
                        <p className="mt-2 text-xs font-semibold text-slate-700">
                          {r.items.length} medicamento(s) prescrito(s)
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setRecetaIdx(i);
                            setTabActiva("medicamentos");
                            avisar(`Receta ${r.id} seleccionada para entrega.`);
                          }}
                          className="mt-3 w-full rounded-lg bg-[#C4121A] py-2 text-xs font-bold text-white hover:bg-[#9E0E15]"
                        >
                          {activa ? "✔ Receta Seleccionada" : "Cargar esta Receta"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {tabActiva === "alertas" && (
              <div className="space-y-2.5 rounded-xl border border-amber-300 bg-amber-50/70 p-4">
                <p className="text-sm font-extrabold text-amber-950">
                  Prioridad de Lotes FEFO (First Expired, First Out) para esta entrega:
                </p>
                {lineas.map(({ m, lote }) => (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-3 text-xs shadow-sm"
                  >
                    <div>
                      <strong className="text-sm text-[#1C0D0F]">
                        {m.nombre_generico} {m.concentracion}
                      </strong>
                      <p className="text-slate-600">{m.descripcion}</p>
                    </div>
                    {lote && (
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-amber-100 px-2.5 py-1 font-bold text-amber-900">
                          Lote Prioritario: {lote.numero_lote} · Vence en {lote.dias_para_vencer} días
                        </span>
                        <Semaforo
                          nivel={semaforoDeDias(
                            lote.dias_para_vencer,
                            lote.stock_total,
                            m.stock_critico_alerta
                          )}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Bloque Inferior: Indicaciones al Paciente + Profesional Responsable */}
            <div className="grid gap-4 md:grid-cols-12">
              <div className="rounded-xl border border-[#F8C8CB] bg-[#FDF2F2] p-4 md:col-span-8">
                <label
                  htmlFor="indicaciones-paciente"
                  className="mb-2 flex items-center gap-2 text-xs font-extrabold text-[#1C0D0F]"
                >
                  <FileText size={16} className="text-[#B80F16]" aria-hidden />
                  <span>Indicaciones al Paciente (Opcional)</span>
                </label>
                <textarea
                  id="indicaciones-paciente"
                  rows={2}
                  value={indicacionesPaciente}
                  onChange={(e) => setIndicacionesPaciente(e.target.value)}
                  placeholder="Ej: Tomar con alimentos, ante efectos adversos consultar en su CESFAM..."
                  className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm text-slate-700 focus:border-[#B80F16] focus:outline-none"
                />
              </div>

              <div className="rounded-xl border border-[#F8C8CB] bg-[#FDF2F2] p-4 md:col-span-4">
                <p className="mb-2 flex items-center gap-2 text-xs font-extrabold text-[#1C0D0F]">
                  <UserRound size={16} className="text-[#B80F16]" aria-hidden />
                  <span>Profesional Responsable</span>
                </p>
                <div className="rounded-lg border border-slate-200 bg-[#F5E6E8] px-3.5 py-2.5 text-sm font-bold text-[#1C0D0F]">
                  María González - QF
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Médico prescriptor: {recetaActiva?.medico ?? "Dr. C. Rojas"}
                </p>
              </div>
            </div>
          </div>

          {/* Columna Derecha */}
          <div className="space-y-4 lg:col-span-3">
            <div className="rounded-xl border border-[#F8C8CB] bg-[#FDF2F2] p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-[#1C0D0F]">
                <Info size={17} className="text-[#C4121A]" aria-hidden />
                <span>Información Importante</span>
              </h2>
              <ul className="space-y-2.5 text-xs text-slate-700">
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
                  <span>Verificar identidad del paciente (RUT y nombre).</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
                  <span>Entregar medicamentos según prescripción vigente.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
                  <span>Registrar la entrega en el sistema.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
                  <span>Entregar indicaciones de uso.</span>
                </li>
              </ul>
            </div>

          </div>
        </div>

        {/* ================= BARRA INFERIOR DE BOTONES ================= */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={cancelarLimpiar}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <X size={17} aria-hidden />
              Cancelar
            </button>

            <button
              type="button"
              onClick={registrarEntrega}
              className="inline-flex items-center gap-2 rounded-xl bg-[#C4121A] px-6 py-2.5 text-sm font-extrabold text-white shadow-md transition hover:bg-[#9E0E15]"
            >
              <Check size={18} aria-hidden />
              Registrar Entrega
            </button>
          </div>

          {folioEntrega && (
            <button
              type="button"
              onClick={abrirImprimir}
              className="inline-flex items-center gap-2 rounded-xl border border-[#C4121A] bg-white px-5 py-2.5 text-sm font-extrabold text-[#C4121A] shadow-sm transition hover:bg-[#FDF2F2]"
            >
              <Printer size={17} aria-hidden />
              Imprimir Comprobante (N° {folioEntrega})
            </button>
          )}
        </div>
      </div>

      {/* ================= COMPROBANTE OFICIAL (IMPRESIÓN EN PAPEL / PDF) ================= */}
      {/* En pantalla está oculto con CSS, y en @media print es LO ÚNICO que se imprime */}
      <div className="hidden print:block">
        {renderDocumentoComprobante()}
      </div>

      {/* ================= MODAL VENTANA EMERGENTE: ENTREGA CONFORME ================= */}
      {mostrarModalEntregaConforme && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-modal-entrega-conforme"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 print:hidden"
        >
          <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            {/* Cabecera verde de confirmación oficial con el texto solicitado */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-6 text-white text-center">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm shadow-inner">
                <CheckCircle2 size={36} className="text-white" aria-hidden />
              </div>
              <h3 id="titulo-modal-entrega-conforme" className="text-2xl font-black tracking-tight">
                Entrega Conforme
              </h3>
              <p className="mt-1 text-sm font-medium text-emerald-100">
                Registro guardado correctamente
              </p>
              <div className="mt-3 inline-block rounded-xl bg-white/15 px-4 py-1.5 backdrop-blur-sm border border-white/20">
                <span className="font-mono text-sm font-black text-white">
                  N° de entrega: {folioEntrega}
                </span>
              </div>
            </div>

            {/* Resumen Asistencial de la Entrega */}
            <div className="p-6 space-y-4 text-xs overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 border border-slate-200">
                <div>
                  <span className="block text-[11px] font-bold text-slate-500 uppercase">Paciente</span>
                  <strong className="text-sm text-slate-900">{paciente.nombre}</strong>
                  <p className="text-slate-600 font-mono text-[11px]">RUT: {paciente.rut}</p>
                </div>
                <div>
                  <span className="block text-[11px] font-bold text-slate-500 uppercase">Receta Médica</span>
                  <strong className="text-sm text-slate-900">{recetaActiva?.id}</strong>
                  <p className="text-slate-600">{recetaActiva?.programa}</p>
                </div>
              </div>

              <div>
                <p className="font-extrabold text-slate-800 mb-2">
                  Medicamentos entregados al paciente ({lineas.length}):
                </p>
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                  {lineas.map(({ m, cantidad, lote }) => (
                    <div key={m.id} className="flex items-center justify-between p-2.5 bg-white text-xs">
                      <div>
                        <strong className="text-slate-900">{m.nombre_generico} {m.concentracion}</strong>
                        <span className="ml-2 font-mono text-[11px] text-slate-500">Lote: {lote?.numero_lote ?? "FEFO"}</span>
                      </div>
                      <span className="rounded-lg bg-emerald-100 px-2.5 py-1 font-black text-emerald-800">
                        {cantidad} u.
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-emerald-900 font-medium">
                <p className="text-[11px] leading-relaxed">
                  ✓ Stock físico descontado de Vitrina en tiempo real.<br />
                  ✓ Transacción sellada e inscrita en el Historial Oficial de Registros.<br />
                  ✓ Ahora puede derivar e imprimir el comprobante oficial de entrega.
                </p>
              </div>
            </div>

            {/* Acciones del Modal: Deriva a Imprimir Comprobante */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-4">
              <button
                type="button"
                onClick={() => {
                  setMostrarModalEntregaConforme(false);
                  cancelarLimpiar();
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
              >
                Cerrar y Siguiente Paciente
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMostrarModalEntregaConforme(false);
                    setMostrarModalComprobante(true);
                  }}
                  className="rounded-xl border border-[#C4121A] bg-white px-4 py-2.5 text-xs font-bold text-[#C4121A] hover:bg-[#FDE8E8] transition"
                >
                  <Eye size={14} className="inline mr-1" aria-hidden />
                  Ver Vista Previa
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMostrarModalEntregaConforme(false);
                    ejecutarImpresionNavegador();
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#C4121A] px-5 py-2.5 text-xs font-black text-white shadow-md hover:bg-[#9E0E15] transition"
                >
                  <Printer size={16} aria-hidden />
                  Imprimir Comprobante Oficial
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL DE VISTA PREVIA DEL COMPROBANTE ================= */}
      {mostrarModalComprobante && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-modal-comprobante"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 print:hidden"
        >
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Printer size={20} className="text-[#C4121A]" aria-hidden />
                <h3 id="titulo-modal-comprobante" className="text-base font-extrabold text-slate-900">
                  Vista Previa del Comprobante de Entrega
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setMostrarModalComprobante(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label="Cerrar vista previa"
              >
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto p-5">
              {renderDocumentoComprobante()}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3.5 bg-slate-50 rounded-b-2xl">
              <span className="text-xs text-slate-500">
                Al presionar “Imprimir Documento” solo se imprimirá el comprobante oficial (sin la barra lateral ni la web).
              </span>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setMostrarModalComprobante(false)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={ejecutarImpresionNavegador}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#C4121A] px-5 py-2 text-xs font-extrabold text-white shadow hover:bg-[#9E0E15]"
                >
                  <Printer size={16} aria-hidden />
                  Imprimir Documento
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
