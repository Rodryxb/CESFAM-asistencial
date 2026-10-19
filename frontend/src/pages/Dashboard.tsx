import React from "react";
import {
  AlertOctagon,
  Boxes,
  CalendarClock,
  ClipboardCheck,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  Siren,
} from "lucide-react";
import { HelpBanner, PageTitle, Semaforo } from "../components/ui";
import {
  menorDiasMed,
  semaforoDeDias,
  stockBodegaMed,
  stockTotalMed,
  stockVitrinaMed,
  useMedicamentos,
} from "../data/demo";
import { MedicamentoArsenal } from "../types/cesfam";

/**
 * Ordena el arsenal desde el medicamento más crítico (menor stock / en alerta crítica)
 * hasta el que tiene mayor disponibilidad ("de lo más crítico a lo que más haya"),
 * desempatando por fecha de caducidad más próxima (FEFO).
 */
const ordenarPorCriticidadYStock = (meds: MedicamentoArsenal[]): MedicamentoArsenal[] => {
  return [...meds].sort((a, b) => {
    const stockA = stockTotalMed(a);
    const stockB = stockTotalMed(b);
    const diasA = menorDiasMed(a);
    const diasB = menorDiasMed(b);

    const criticoA = stockA <= a.stock_critico_alerta || diasA <= 0 ? 0 : 1;
    const criticoB = stockB <= b.stock_critico_alerta || diasB <= 0 ? 0 : 1;

    if (criticoA !== criticoB) return criticoA - criticoB;
    if (stockA !== stockB) return stockA - stockB;
    return diasA - diasB;
  });
};

const escaparHtml = (texto: string | number): string =>
  String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const Dashboard: React.FC<{ avisar: (m: string) => void }> = ({ avisar }) => {
  const { meds, carros, pedidosCarro, origen } = useMedicamentos();

  const medsOrdenados = ordenarPorCriticidadYStock(meds);

  const vencer = meds.filter(
    (m) => semaforoDeDias(menorDiasMed(m), stockTotalMed(m), 0) === "AMARILLO"
  );
  const quiebres = meds.filter(
    (m) =>
      stockTotalMed(m) <= m.stock_critico_alerta ||
      m.lotes.every((l) => l.dias_para_vencer <= 0)
  );

  const totalUnidadesFarmacia = meds.reduce((acc, m) => acc + stockTotalMed(m), 0);
  const pedidosEnTransito = pedidosCarro.filter((p) => p.estado === "En camino").length;
  const fechaEmisionISO = new Date().toISOString().slice(0, 10);
  const fechaHoraLegible = new Date().toLocaleString("es-CL", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const obtenerFechaCaducidadFEFO = (m: MedicamentoArsenal): string => {
    if (!m.lotes || m.lotes.length === 0) return "Sin lote activo";
    const lotesOrdenados = [...m.lotes].sort(
      (a, b) => a.dias_para_vencer - b.dias_para_vencer
    );
    return lotesOrdenados[0].fecha_vencimiento;
  };

  const obtenerLoteFEFO = (m: MedicamentoArsenal): string => {
    if (!m.lotes || m.lotes.length === 0) return "SIN-LOTE";
    const lotesOrdenados = [...m.lotes].sort(
      (a, b) => a.dias_para_vencer - b.dias_para_vencer
    );
    return lotesOrdenados[0].numero_lote;
  };

  const obtenerEtiquetaEstado = (m: MedicamentoArsenal): string => {
    const dias = menorDiasMed(m);
    const total = stockTotalMed(m);
    if (dias <= 0) return "CRÍTICO - LOTE VENCIDO";
    if (total <= m.stock_critico_alerta) return "CRÍTICO - BAJO UMBRAL";
    if (dias <= 90) return "ALERTA FEFO - PRÓXIMO A VENCER";
    if (total <= m.stock_minimo_alerta) return "PRECAUCIÓN - STOCK MÍNIMO";
    return "ÓPTIMO - VIGENTE";
  };

  /**
   * Exporta el inventario completo a un archivo Excel (.xls compatible con MS Excel / LibreOffice)
   * ordenado desde el stock más crítico hasta el de mayor cantidad, incluyendo fechas de caducidad.
   */
  const exportarReporteExcel = () => {
    const filasHtml = medsOrdenados
      .map((m, idx) => {
        const bod = stockBodegaMed(m);
        const vit = stockVitrinaMed(m);
        const tot = stockTotalMed(m);
        const dias = menorDiasMed(m);
        const niv = semaforoDeDias(dias, tot, m.stock_critico_alerta);
        const fechaCad = obtenerFechaCaducidadFEFO(m);
        const loteFefo = obtenerLoteFEFO(m);
        const estadoTexto = obtenerEtiquetaEstado(m);

        const bgFila =
          niv === "ROJO"
            ? "#FFEDD5"
            : niv === "AMARILLO"
            ? "#FEF3C7"
            : idx % 2 === 0
            ? "#FFFFFF"
            : "#F8FAFC";

        const colorEstado =
          niv === "ROJO" ? "#9A3412" : niv === "AMARILLO" ? "#92400E" : "#065F46";

        const detalleLotes =
          m.lotes && m.lotes.length > 0
            ? m.lotes
                .map(
                  (l) =>
                    `${l.numero_lote} (Cad: ${l.fecha_vencimiento}, ${l.dias_para_vencer}d, ${l.stock_total} u.)`
                )
                .join(" | ")
            : "Sin lotes";

        const condiciones: string[] = [];
        if (m.es_controlado) condiciones.push(`Controlado ISP (${m.tipo_controlado})`);
        if (m.requiere_cadena_frio) condiciones.push("Cadena de Frío (2°C-8°C)");
        if (m.esencial_carro_paro) condiciones.push("Esencial Carro de Paro");

        return `<tr style="background-color:${bgFila};">
          <td style="text-align:center;font-weight:bold;border:1px solid #CBD5E1;padding:6px;">${
            idx + 1
          }</td>
          <td style="font-weight:bold;color:${colorEstado};border:1px solid #CBD5E1;padding:6px;">${escaparHtml(
            estadoTexto
          )}</td>
          <td style="font-family:monospace;border:1px solid #CBD5E1;padding:6px;">${escaparHtml(
            m.codigo_cenabast
          )}</td>
          <td style="font-weight:bold;border:1px solid #CBD5E1;padding:6px;">${escaparHtml(
            m.nombre_generico
          )}</td>
          <td style="border:1px solid #CBD5E1;padding:6px;">${escaparHtml(
            m.concentracion
          )}</td>
          <td style="border:1px solid #CBD5E1;padding:6px;">${escaparHtml(
            m.forma_farmaceutica
          )}</td>
          <td style="border:1px solid #CBD5E1;padding:6px;">${escaparHtml(
            m.categoria_nombre
          )}</td>
          <td style="text-align:right;font-weight:bold;color:${colorEstado};border:1px solid #CBD5E1;padding:6px;">${tot}</td>
          <td style="text-align:right;border:1px solid #CBD5E1;padding:6px;">${bod}</td>
          <td style="text-align:right;border:1px solid #CBD5E1;padding:6px;">${vit}</td>
          <td style="text-align:right;border:1px solid #CBD5E1;padding:6px;">${
            m.stock_critico_alerta
          }</td>
          <td style="font-family:monospace;border:1px solid #CBD5E1;padding:6px;">${escaparHtml(
            loteFefo
          )}</td>
          <td style="text-align:center;font-weight:bold;border:1px solid #CBD5E1;padding:6px;">${escaparHtml(
            fechaCad
          )}</td>
          <td style="text-align:right;border:1px solid #CBD5E1;padding:6px;">${dias} días</td>
          <td style="border:1px solid #CBD5E1;padding:6px;">${escaparHtml(
            detalleLotes
          )}</td>
          <td style="border:1px solid #CBD5E1;padding:6px;">${escaparHtml(
            condiciones.join(", ") || "Estándar APS"
          )}</td>
        </tr>`;
      })
      .join("");

    const contenidoExcel = `\uFEFF<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        <title>Reporte de Inventario y Caducidades CESFAM</title>
      </head>
      <body style="font-family:Segoe UI,Arial,sans-serif;font-size:12px;">
        <table style="border-collapse:collapse;width:100%;">
          <tr>
            <td colspan="16" style="background-color:#C4121A;color:#FFFFFF;font-size:16px;font-weight:bold;padding:10px;border:1px solid #C4121A;">
              SERVICIO DE SALUD METROPOLITANO · FARMACIA ASISTENCIAL CESFAM — REPORTE DE STOCK CRÍTICO Y CADUCIDADES (FEFO)
            </td>
          </tr>
          <tr>
            <td colspan="16" style="background-color:#FDF2F2;color:#1C0D0F;font-weight:bold;padding:6px;border:1px solid #CBD5E1;">
              Fecha de emisión: ${escaparHtml(fechaHoraLegible)} | Ordenado desde el stock más crítico al de mayor disponibilidad | Total medicamentos: ${
      medsOrdenados.length
    } (${totalUnidadesFarmacia} unidades totales) | Críticos: ${
      quiebres.length
    } | Por vencer (FEFO): ${vencer.length}
            </td>
          </tr>
          <tr style="background-color:#1C0D0F;color:#FFFFFF;font-weight:bold;">
            <th style="border:1px solid #CBD5E1;padding:8px;">Prioridad</th>
            <th style="border:1px solid #CBD5E1;padding:8px;">Estado / Criticidad</th>
            <th style="border:1px solid #CBD5E1;padding:8px;">Código CENABAST</th>
            <th style="border:1px solid #CBD5E1;padding:8px;">Medicamento (DCI)</th>
            <th style="border:1px solid #CBD5E1;padding:8px;">Concentración</th>
            <th style="border:1px solid #CBD5E1;padding:8px;">Forma Farmacéutica</th>
            <th style="border:1px solid #CBD5E1;padding:8px;">Programa / Categoría</th>
            <th style="border:1px solid #CBD5E1;padding:8px;">Stock Total</th>
            <th style="border:1px solid #CBD5E1;padding:8px;">Stock Bodega</th>
            <th style="border:1px solid #CBD5E1;padding:8px;">Stock Vitrina</th>
            <th style="border:1px solid #CBD5E1;padding:8px;">Umbral Crítico</th>
            <th style="border:1px solid #CBD5E1;padding:8px;">Lote FEFO</th>
            <th style="border:1px solid #CBD5E1;padding:8px;">Fecha de Caducidad</th>
            <th style="border:1px solid #CBD5E1;padding:8px;">Días para Caducar</th>
            <th style="border:1px solid #CBD5E1;padding:8px;">Detalle Lotes y Vencimientos</th>
            <th style="border:1px solid #CBD5E1;padding:8px;">Condición Normativa</th>
          </tr>
          ${filasHtml}
        </table>
      </body>
    </html>`;

    const blob = new Blob([contenidoExcel], {
      type: "application/vnd.ms-excel;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Reporte_Stock_Critico_y_Caducidades_CESFAM_${fechaEmisionISO}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    avisar(
      `Planilla Excel descargada (${medsOrdenados.length} medicamentos ordenados de más crítico a mayor stock con fechas de caducidad).`
    );
  };

  /**
   * Genera el Reporte PDF Institucional abriendo el documento formal de impresión/PDF
   * sin elementos de navegación de la página.
   */
  const exportarReportePDF = () => {
    const tituloOriginal = document.title;
    document.title = `Reporte_Oficial_Farmacia_CESFAM_${fechaEmisionISO}`;
    avisar("Preparando Reporte PDF institucional... Elija 'Guardar como PDF' en la ventana.");
    setTimeout(() => {
      window.print();
      document.title = tituloOriginal;
    }, 100);
  };

  const kpis = [
    {
      t: "Alertas de Vencimiento (FEFO)",
      v: vencer.length,
      d: vencer.map((m) => m.nombre_generico).join(", ") || "Sin alertas de vencimiento",
      e: "Próximo a Vencer",
      i: <CalendarClock size={26} aria-hidden />,
      c: "border-amber-300 bg-[#FFF9DB] text-amber-950",
    },
    {
      t: "Quiebres / Stock Crítico",
      v: quiebres.length,
      d: quiebres.map((m) => m.nombre_generico).join(", ") || "Sin quiebres de stock",
      e: "Stock Crítico",
      i: <AlertOctagon size={26} className="text-orange-600" aria-hidden />,
      c: "border-2 border-orange-400 bg-orange-50 text-orange-950",
    },
    {
      t: "Dispensaciones de Hoy",
      v: 48,
      d: "32 crónicos · 11 GES · 5 morbilidad",
      e: "Operación Normal",
      i: <ClipboardCheck size={26} aria-hidden />,
      c: "border-emerald-300 bg-[#EBFBEE] text-emerald-950",
    },
    {
      t: "Arsenal y Carros Activos",
      v: meds.length,
      d: `${totalUnidadesFarmacia} u. totales · ${carros.length} carros (${pedidosEnTransito} pedido en camino)`,
      e: "Catálogo Activo",
      i: <Boxes size={26} aria-hidden />,
      c: "border-[#F8C8CB] bg-[#FDF2F2] text-[#1C0D0F]",
    },
  ];

  const semana = [
    { d: "Lunes", n: 41 },
    { d: "Martes", n: 52 },
    { d: "Miércoles", n: 47 },
    { d: "Jueves", n: 58 },
    { d: "Viernes", n: 48 },
  ];
  const max = Math.max(...semana.map((s) => s.n));

  return (
    <>
      {/* ================= VISTA EN PANTALLA (OCULTA AL IMPRIMIR PDF) ================= */}
      <div className="pantalla-no-imprimir">
        <PageTitle
          icon={<LayoutDashboard size={26} />}
          title="Reportes y Dashboard"
          subtitle={`Panel principal de control asistencial · Datos ${
            origen === "api" ? "en vivo del servidor Django REST" : "activos del sistema"
          }`}
        />

        <HelpBanner
          titulo="Resumen operativo de la Farmacia en 3 pasos"
          pasos={[
            "Revise los 4 indicadores superiores de vencimiento FEFO, stock crítico y entregas del día.",
            "Consulte la tabla rápida ordenada desde el stock más crítico y el gráfico de atenciones semanales.",
            "Exporte el informe consolidado a PDF o Excel (ordenado por criticidad y caducidad) con los botones inferiores.",
          ]}
        />

        {/* Tarjetas de KPIs Operacionales */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => (
            <section key={k.t} className={`rounded-2xl border p-4 shadow-sm ${k.c}`}>
              <div className="flex items-center justify-between">
                {k.i}
                <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-extrabold shadow-sm">
                  {k.e}
                </span>
              </div>
              <p className="mt-2.5 text-4xl font-black">{k.v}</p>
              <h2 className="mt-0.5 text-sm font-extrabold">{k.t}</h2>
              <p className="mt-1 truncate text-xs opacity-85" title={k.d}>
                {k.d}
              </p>
            </section>
          ))}
        </div>

        {/* Cuerpo en 2 Columnas: Tabla de Vigilancia FEFO + Gráfico de Dispensaciones */}
        <div className="mb-6 grid gap-5 lg:grid-cols-12">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-7">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-black text-[#1C0D0F]">
                Vigilancia Rápida de Stock Crítico y Caducidad FEFO
              </h2>
              <span className="text-xs font-bold text-[#B80F16]">
                Top {Math.min(6, medsOrdenados.length)} más críticos primero
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200/90">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-[#FBEBEB] font-extrabold text-[#1C0D0F]">
                    <th className="px-3.5 py-2.5">Medicamento</th>
                    <th className="px-3.5 py-2.5">Lote y Caducidad</th>
                    <th className="px-3.5 py-2.5">Bodega</th>
                    <th className="px-3.5 py-2.5">Vitrina</th>
                    <th className="px-3.5 py-2.5">Total</th>
                    <th className="px-3.5 py-2.5">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {medsOrdenados.slice(0, 6).map((m) => {
                    const dias = menorDiasMed(m);
                    const tot = stockTotalMed(m);
                    const fechaCad = obtenerFechaCaducidadFEFO(m);
                    return (
                      <tr key={m.id} className="hover:bg-slate-50/80">
                        <td className="px-3.5 py-2.5 font-bold text-[#1C0D0F]">
                          {m.nombre_generico} {m.concentracion}
                        </td>
                        <td className="px-3.5 py-2.5 font-mono text-slate-600">
                          <div>{obtenerLoteFEFO(m)}</div>
                          <div className="text-[11px] font-sans font-semibold text-slate-500">
                            Vence: {fechaCad} ({dias}d)
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 font-bold text-slate-700">
                          {stockBodegaMed(m)}
                        </td>
                        <td className="px-3.5 py-2.5 font-bold text-[#B80F16]">
                          {stockVitrinaMed(m)}
                        </td>
                        <td className="px-3.5 py-2.5 font-black text-slate-900">
                          {tot} u.
                        </td>
                        <td className="px-3.5 py-2.5">
                          <Semaforo nivel={semaforoDeDias(dias, tot, m.stock_critico_alerta)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-5">
            <div>
              <h2 className="mb-1 text-base font-black text-[#1C0D0F]">
                Dispensaciones de la Semana
              </h2>
              <p className="mb-4 text-xs text-slate-500">
                Pacientes atendidos gratuitamente por día hábil en ventanilla
              </p>
            </div>

            <div
              className="flex h-44 items-end gap-3 rounded-xl bg-[#FAF0F1] p-4"
              role="img"
              aria-label="Gráfico de barras de dispensaciones diarias"
            >
              {semana.map((s) => (
                <div key={s.d} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-xs font-extrabold text-[#1C0D0F]">{s.n}</span>
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-[#C4121A] to-[#C4121A] shadow-sm transition-all"
                    style={{ height: `${(s.n / max) * 105}px` }}
                  />
                  <span className="text-[11px] font-bold text-slate-600">{s.d.slice(0, 3)}</span>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between rounded-xl bg-[#FDF2F2] px-3.5 py-2 text-xs font-bold text-[#1C0D0F]">
              <span className="flex items-center gap-1.5">
                <Siren size={15} className="text-[#B80F16]" aria-hidden />
                Estado Carros Clínicos:
              </span>
              <span className="text-emerald-700">Operativos ({carros.length} activos)</span>
            </div>
          </section>
        </div>

        {/* Botones de Exportación */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <p className="text-xs text-slate-500">
            Reportes oficiales sin valores comerciales (Farmacia Asistencial Gratuita MINSAL). Ordenados de stock más crítico a mayor stock con fechas de caducidad.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl bg-[#C4121A] px-5 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#9E0E15]"
              onClick={exportarReportePDF}
            >
              <FileText size={16} aria-hidden />
              Exportar Reporte a PDF
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-[#C4121A] bg-white px-5 py-2.5 text-xs font-extrabold text-[#C4121A] shadow-sm transition hover:bg-[#FDF2F2]"
              onClick={exportarReporteExcel}
            >
              <FileSpreadsheet size={16} aria-hidden />
              Exportar a Excel
            </button>
          </div>
        </div>
      </div>

      {/* ================= DOCUMENTO OFICIAL PARA EXPORTAR A PDF (@media print) ================= */}
      <div className="comprobante-oficial-print hidden print:block">
        <div className="border-b-2 border-black pb-3 mb-4 flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider">
              Ministerio de Salud · Servicio de Salud Metropolitano · Red de Atención Primaria (APS)
            </p>
            <h1 className="text-lg font-black uppercase mt-0.5">
              Informe Consolidado de Inventario, Criticidad y Caducidades (FEFO)
            </h1>
            <p className="text-xs font-semibold">
              Unidad de Farmacia Asistencial CESFAM · Establecimiento Público Gratuito (Sin Fines Comerciales)
            </p>
          </div>
          <div className="text-right text-xs border border-black p-2">
            <p className="font-black">FOLIO REPORTE: REP-{fechaEmisionISO.replace(/-/g, "")}</p>
            <p>Emisión: {fechaHoraLegible}</p>
            <p>Total Ítems: {medsOrdenados.length} medicamentos</p>
          </div>
        </div>

        {/* Resumen Ejecutivo de Indicadores */}
        <table className="w-full border-collapse text-xs mb-4">
          <thead>
            <tr>
              <th className="text-left font-bold">Quiebres / Stock Crítico</th>
              <th className="text-left font-bold">Alertas Vencimiento FEFO (≤90d)</th>
              <th className="text-left font-bold">Unidades Totales Farmacia</th>
              <th className="text-left font-bold">Carros Clínicos y Pedidos</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-bold">{quiebres.length} medicamentos bajo umbral</td>
              <td className="font-bold">{vencer.length} medicamentos próximos a vencer</td>
              <td className="font-bold">{totalUnidadesFarmacia} unidades físicas</td>
              <td>
                {carros.length} carros operativos ({pedidosEnTransito} solicitud en tránsito)
              </td>
            </tr>
          </tbody>
        </table>

        {/* Tabla Completa Ordenada de Más Crítico a Mayor Stock */}
        <h2 className="text-xs font-black uppercase mb-1.5">
          Nómina Completa de Arsenal Farmacéutico (Ordenada de Más Crítico a Mayor Stock y Fecha de Caducidad)
        </h2>
        <table className="w-full border-collapse text-[10px] mb-6">
          <thead>
            <tr>
              <th>#</th>
              <th>Estado / Prioridad</th>
              <th>Cód. CENABAST</th>
              <th>Medicamento y Concentración</th>
              <th>Stock Total</th>
              <th>Bodega</th>
              <th>Vitrina</th>
              <th>Crítico</th>
              <th>Lote FEFO</th>
              <th>Fecha Caducidad</th>
              <th>Vigencia</th>
            </tr>
          </thead>
          <tbody>
            {medsOrdenados.map((m, idx) => {
              const tot = stockTotalMed(m);
              const bod = stockBodegaMed(m);
              const vit = stockVitrinaMed(m);
              const dias = menorDiasMed(m);
              return (
                <tr key={m.id}>
                  <td className="text-center font-bold">{idx + 1}</td>
                  <td className="font-bold">{obtenerEtiquetaEstado(m)}</td>
                  <td className="font-mono">{m.codigo_cenabast}</td>
                  <td>
                    <strong>{m.nombre_generico}</strong> {m.concentracion} ({m.forma_farmaceutica})
                  </td>
                  <td className="text-right font-black">{tot} u.</td>
                  <td className="text-right">{bod}</td>
                  <td className="text-right">{vit}</td>
                  <td className="text-right">{m.stock_critico_alerta}</td>
                  <td className="font-mono">{obtenerLoteFEFO(m)}</td>
                  <td className="text-center font-bold">{obtenerFechaCaducidadFEFO(m)}</td>
                  <td className="text-right">{dias} días</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Firmas de Conformidad Normativa */}
        <div className="mt-10 grid grid-cols-2 gap-12 pt-6 text-center text-xs">
          <div className="border-t border-black pt-2">
            <p className="font-bold">Químico Farmacéutico (Q.F.) Director Técnico</p>
            <p className="text-[10px]">Visación Técnica de Stock Crítico y Control FEFO · D.S. 466 MINSAL</p>
          </div>
          <div className="border-t border-black pt-2">
            <p className="font-bold">Jefatura de Farmacia / Dirección CESFAM</p>
            <p className="text-[10px]">Recepción Conforme para Reposición CENABAST / Droguería</p>
          </div>
        </div>
      </div>
    </>
  );
};

