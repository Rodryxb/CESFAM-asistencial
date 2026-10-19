import React, { useState } from "react";
import {
  ArrowRightLeft,
  BookLock,
  CalendarClock,
  CheckCircle2,
  FlaskConical,
  Package,
  Star,
  Store,
} from "lucide-react";
import { HelpBanner, PageTitle, Semaforo } from "../components/ui";
import {
  LIBRO_CONTROLADOS,
  menorDiasMed,
  semaforoDeDias,
  stockBodegaMed,
  stockTotalMed,
  stockVitrinaMed,
  traspasarStockBodegaAVitrinaFEFO,
  useMedicamentos,
} from "../data/demo";

export const PanelQF: React.FC<{ avisar: (m: string) => void }> = ({ avisar }) => {
  const { meds } = useMedicamentos();
  const [tab, setTab] = useState<"inventario" | "controlados">("inventario");
  const [mensajeTraspaso, setMensajeTraspaso] = useState<{ id: number; texto: string } | null>(null);

  // Cantidad elegida para traspasar de bodega a vitrina por cada medicamento
  const [cantidadesTraspaso, setCantidadesTraspaso] = useState<Record<number, number>>({});

  const obtenerCantTraspaso = (medId: number, stockBodega: number): number => {
    const guardada = cantidadesTraspaso[medId];
    if (guardada !== undefined) return Math.min(guardada, stockBodega);
    if (stockBodega >= 40) return 40;
    return stockBodega;
  };

  const cambiarCantTraspaso = (medId: number, valor: number, stockBodega: number) => {
    const segura = isNaN(valor) ? 0 : Math.max(0, Math.min(valor, stockBodega));
    setCantidadesTraspaso((prev) => ({ ...prev, [medId]: segura }));
  };

  const ejecutarTraspaso = (medId: number, nombre: string, cant: number) => {
    if (cant <= 0) return;
    const res = traspasarStockBodegaAVitrinaFEFO(medId, cant);
    if (res.movidas > 0) {
      const detalleLotes = res.lotesImpactados
        .map((l) => `${l.lote} (${l.cantidad} u., vence: ${l.fechaVenc})`)
        .join(" + ");

      const textoConfirmacion = `✔ ${res.movidas} u. trasladadas a Vitrina bajo regla FEFO [Lote(s): ${detalleLotes}]. Listas para despacho al paciente sin riesgo de merma.`;
      setMensajeTraspaso({ id: medId, texto: textoConfirmacion });
      avisar(`✔ ${res.movidas} u. de ${nombre} movidas a Vitrina bajo regla FEFO.`);
    }
  };

  return (
    <>
      <PageTitle
        icon={<FlaskConical size={26} />}
        title="Panel del Químico Farmacéutico"
        subtitle="Control técnico de inventario asistencial, fraccionamiento FEFO y Libro Oficial de Controlados ISP"
      />

      <HelpBanner
        titulo="Gestión Farmacéutica Asistencial en 3 pasos"
        pasos={[
          "En 'Inventario' supervise los niveles de stock en Bodega y Vitrina junto con el lote FEFO más próximo a caducar.",
          "Seleccione 40, 60, 100 o escriba cualquier cantidad exacta para mover cajas a Vitrina: el sistema consumirá primero el lote que vence antes para evitar pérdidas.",
          "En 'Libro Digital de Controlados' audite los asientos normativos de psicotrópicos y estupefacientes (D.S. 404 y 405 ISP).",
        ]}
      />

      {/* Selector de Pestañas */}
      <div role="tablist" className="mb-5 grid grid-cols-2 gap-3">
        <button
          role="tab"
          aria-selected={tab === "inventario"}
          onClick={() => setTab("inventario")}
          className={`flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-extrabold transition ${
            tab === "inventario"
              ? "bg-[#C4121A] text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          <Package size={18} aria-hidden />
          <span>Inventario & Traspaso FEFO ({meds.length})</span>
        </button>

        <button
          role="tab"
          aria-selected={tab === "controlados"}
          onClick={() => setTab("controlados")}
          className={`flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-extrabold transition ${
            tab === "controlados"
              ? "bg-purple-900 text-white shadow-sm"
              : "border border-purple-200 bg-purple-50 text-purple-900 hover:bg-purple-100/70"
          }`}
        >
          <BookLock size={18} aria-hidden />
          <span>Libro Digital de Controlados ISP ({LIBRO_CONTROLADOS.length})</span>
        </button>
      </div>

      {tab === "inventario" ? (
        <div className="space-y-6">
          {/* Banner Educativo sobre Funcionamiento de FEFO sin Pérdidas */}
          <section className="rounded-2xl border border-[#F5C2C6] bg-[#FCF0F1] p-4 text-xs text-[#1C0D0F] shadow-sm">
            <div className="mb-1.5 flex items-center gap-2 text-sm font-black text-[#C4121A]">
              <CalendarClock size={20} className="text-[#C4121A]" aria-hidden />
              <span>¿Cómo funciona el Sistema FEFO para evitar pérdidas de medicamentos?</span>
            </div>
            <p className="leading-relaxed text-slate-700">
              <strong>Regla Técnica FEFO (First Expired, First Out / Primero en Vencer, Primero en Salir):</strong> Al
              traspasar <strong>40, 60, 100 unidades o la cantidad que usted elija</strong> desde la Bodega Central a la
              Vitrina de Atención, el sistema selecciona automáticamente las cajas del{" "}
              <strong>lote que tiene la fecha de caducidad más cercana</strong>. Al quedar ese lote en el mesón de
              atención, los técnicos dispensarán esas cajas primero a los pacientes, garantizando que el tratamiento se
              consuma antes de su vencimiento y <strong>evitando cualquier merma o pérdida de medicamentos en el CESFAM</strong>.
            </p>
          </section>

          {/* Tarjetas de Medicamentos con Control de Traspaso FEFO */}
          <div className="grid gap-5 md:grid-cols-2">
            {meds.map((m) => {
              const total = stockTotalMed(m);
              const bod = stockBodegaMed(m);
              const vit = stockVitrinaMed(m);
              const dias = menorDiasMed(m);
              const loteFefo = [...m.lotes].sort((a, b) => a.dias_para_vencer - b.dias_para_vencer)[0];
              const cantTraspaso = obtenerCantTraspaso(m.id, bod);
              const tieneMensaje = mensajeTraspaso?.id === m.id;

              return (
                <article key={m.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3.5">
                  {/* Encabezado del Medicamento */}
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <h2 className="text-base font-black text-[#1C0D0F]">
                        {m.nombre_generico} {m.concentracion}
                      </h2>
                      <p className="text-xs text-slate-500">
                        {m.forma_farmaceutica} · {m.categoria_nombre}
                        {m.es_controlado ? " · Controlado ISP (D.S. 405)" : ""}
                      </p>
                    </div>
                    <Semaforo nivel={semaforoDeDias(dias, total, m.stock_critico_alerta)} />
                  </div>

                  {/* Lote FEFO Prioritario de Salida */}
                  {loteFefo && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50/80 px-3 py-2 text-xs border border-amber-200">
                      <span className="flex items-center gap-1.5 font-bold text-amber-950">
                        <Star size={14} className="text-amber-600 fill-amber-500" aria-hidden />
                        Lote FEFO prioritario a mover:
                      </span>
                      <span className="font-mono font-black text-amber-950">
                        {loteFefo.numero_lote} (Caduca: {loteFefo.fecha_vencimiento} · {loteFefo.dias_para_vencer} días)
                      </span>
                    </div>
                  )}

                  {m.descripcion && (
                    <p className="text-xs text-slate-600 line-clamp-2">{m.descripcion}</p>
                  )}

                  {/* Bloques de Stock: Bodega vs Vitrina */}
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-center gap-1 text-slate-600">
                        <Package size={16} aria-hidden />
                        <span className="text-xs font-bold">Bodega Central</span>
                      </div>
                      <p className="mt-1 text-2xl font-black text-slate-900">{bod} u.</p>
                      <span className="text-[10px] text-slate-500">Almacenamiento masivo</span>
                    </div>

                    <div className="rounded-xl border border-[#F5C2C6] bg-[#FCF0F1] p-3">
                      <div className="flex items-center justify-center gap-1 text-[#C4121A]">
                        <Store size={16} aria-hidden />
                        <span className="text-xs font-bold">Vitrina de Atención</span>
                      </div>
                      <p className="mt-1 text-2xl font-black text-[#C4121A]">{vit} u.</p>
                      <span className="text-[10px] text-slate-500">Disponible para entrega inmediata</span>
                    </div>
                  </div>

                  {/* Desglose de Lotes en Bodega (si tiene más de 1 lote) */}
                  {m.lotes.length > 1 && (
                    <div className="rounded-xl bg-slate-50 p-2.5 text-[11px] text-slate-600 border border-slate-100">
                      <span className="font-bold text-[#1C0D0F] block mb-1">
                        Lotes disponibles en Bodega ({m.lotes.length}):
                      </span>
                      <ul className="space-y-0.5 font-mono">
                        {m.lotes.map((l) => (
                          <li key={l.id} className="flex justify-between">
                            <span>
                              {l.numero_lote} (Vence: {l.fecha_vencimiento}):
                            </span>
                            <strong className="text-slate-800">{l.stock_bodega} u. en bodega</strong>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Mensaje de Confirmación de Traspaso */}
                  {tieneMensaje && (
                    <div className="rounded-xl bg-emerald-50 p-2.5 text-xs font-bold text-emerald-900 border border-emerald-200 flex items-start gap-1.5">
                      <CheckCircle2 size={16} className="text-emerald-700 shrink-0 mt-0.5" aria-hidden />
                      <span>{mensajeTraspaso.texto}</span>
                    </div>
                  )}

                  {/* Controles de Selección de Cantidad a Mover */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-black text-[#1C0D0F]">
                        Cantidad a mover de Bodega a Vitrina:
                      </label>
                      <span className="text-[11px] font-semibold text-slate-500">
                        Máx disponible: <strong>{bod} u.</strong>
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Input Numérico Libre */}
                      <div className="flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 shadow-sm">
                        <span className="text-[11px] font-bold text-slate-600">Cant:</span>
                        <input
                          type="number"
                          min={1}
                          max={bod}
                          value={cantTraspaso || ""}
                          placeholder="0"
                          disabled={bod <= 0}
                          onChange={(e) =>
                            cambiarCantTraspaso(m.id, parseInt(e.target.value, 10), bod)
                          }
                          aria-label={`Cantidad a mover para ${m.nombre_generico}`}
                          className="w-16 rounded-md border border-slate-200 px-1.5 py-0.5 text-center text-xs font-black text-[#1C0D0F] focus:border-[#C4121A] focus:outline-none"
                        />
                        <span className="text-[11px] font-bold text-slate-500">u.</span>
                      </div>

                      {/* Botones de Selección Rápida: 40, 60, 100, Todo */}
                      <div className="flex items-center gap-1">
                        {[40, 60, 100].map((q) => (
                          <button
                            key={q}
                            type="button"
                            disabled={bod < q}
                            onClick={() => cambiarCantTraspaso(m.id, q, bod)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-extrabold transition ${
                              cantTraspaso === q
                                ? "bg-[#C4121A] text-white shadow-sm"
                                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                            }`}
                            title={`Seleccionar ${q} unidades`}
                          >
                            {q}
                          </button>
                        ))}

                        <button
                          type="button"
                          disabled={bod <= 0}
                          onClick={() => cambiarCantTraspaso(m.id, bod, bod)}
                          className={`rounded-lg px-2.5 py-1 text-xs font-extrabold transition ${
                            cantTraspaso === bod && bod > 0
                              ? "bg-[#C4121A] text-white shadow-sm"
                              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                          }`}
                          title="Seleccionar todo el stock disponible en bodega"
                        >
                          Todo ({bod})
                        </button>
                      </div>
                    </div>

                    {/* Botón de Ejecución del Traspaso */}
                    <button
                      type="button"
                      disabled={bod <= 0 || cantTraspaso <= 0 || cantTraspaso > bod}
                      onClick={() => ejecutarTraspaso(m.id, m.nombre_generico, cantTraspaso)}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#C4121A] py-2.5 text-xs font-black text-white shadow-sm transition hover:bg-[#9E0E15] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ArrowRightLeft size={14} aria-hidden />
                      Mover {cantTraspaso > 0 ? `${cantTraspaso} u.` : ""} de Bodega a Vitrina (FEFO)
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        /* Pestaña: Libro Digital de Controlados ISP */
        <section className="rounded-2xl border border-purple-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-purple-100 pb-3">
            <div>
              <h2 className="text-lg font-black text-purple-950 flex items-center gap-2">
                <BookLock size={22} className="text-purple-800" />
                <span>Libro Oficial de Controlados (Psicotrópicos y Estupefacientes)</span>
              </h2>
              <p className="text-xs text-slate-600">
                Registro foliado e inmutable obligatorio según reglamentación sanitaria D.S. 404 y 405 del ISP.
              </p>
            </div>
            <span className="rounded-xl bg-purple-100 px-3 py-1 text-xs font-black text-purple-900">
              Visación Q.F. Al Día
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-purple-200">
            <table className="w-full border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-purple-200 bg-purple-100/70 text-xs font-extrabold uppercase text-purple-950">
                  <th className="px-4 py-3">Folio Asiento</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Medicamento Fiscalizado</th>
                  <th className="px-4 py-3">Clasificación ISP</th>
                  <th className="px-4 py-3">Paciente Beneficiario</th>
                  <th className="px-4 py-3 text-center">Cantidad Salida</th>
                  <th className="px-4 py-3 text-right">Saldo en Libro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-100 bg-white">
                {LIBRO_CONTROLADOS.map((r) => (
                  <tr key={r.folio} className="hover:bg-purple-50/50">
                    <td className="px-4 py-3 font-mono font-black text-purple-950">{r.folio}</td>
                    <td className="px-4 py-3 text-slate-600">{r.fecha}</td>
                    <td className="px-4 py-3 font-bold text-[#1C0D0F]">{r.medicamento}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-purple-100 px-2 py-0.5 text-xs font-extrabold text-purple-900">
                        {r.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">{r.paciente}</td>
                    <td className="px-4 py-3 text-center font-black text-red-700">-{r.cantidad} u.</td>
                    <td className="px-4 py-3 text-right font-mono font-black text-emerald-800">
                      {r.saldo} u.
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
};

