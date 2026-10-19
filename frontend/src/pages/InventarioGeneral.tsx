import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Boxes,
  Package,
  Search,
  Siren,
  Sparkles,
  Store,
} from "lucide-react";
import { HelpBanner, PageTitle, Semaforo } from "../components/ui";
import {
  ajustarStockMedicamentoCRUD,
  inyectar20MedicamentosReales,
  menorDiasMed,
  semaforoDeDias,
  stockBodegaMed,
  stockTotalMed,
  stockVitrinaMed,
  useMedicamentos,
} from "../data/demo";

type FiltroEstado = "TODOS" | "VERDE" | "AMARILLO" | "ROJO" | "EN_CARROS";

export const InventarioGeneral: React.FC<{ avisar: (m: string) => void }> = ({ avisar }) => {
  const { meds, carros } = useMedicamentos();
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("TODOS");
  const [cantidadesTraspaso, setCantidadesTraspaso] = useState<Record<number, number>>({});

  const obtenerCantTraspaso = (medId: number, stockBod: number) => {
    if (cantidadesTraspaso[medId] !== undefined) {
      return cantidadesTraspaso[medId];
    }
    return stockBod >= 30 ? 30 : stockBod > 0 ? stockBod : 0;
  };

  const cambiarCantTraspaso = (medId: number, valor: number, stockBod: number) => {
    const v = isNaN(valor) ? 0 : Math.max(0, Math.min(valor, stockBod));
    setCantidadesTraspaso((prev) => ({ ...prev, [medId]: v }));
  };

  // Mapa de cuántas unidades de cada medicamento están en Carros Clínicos
  const stockEnCarrosPorMed = useMemo(() => {
    const mapa: Record<number, { total: number; detalle: string[] }> = {};
    for (const c of carros) {
      for (const it of c.items) {
        if (!mapa[it.medicamentoId]) {
          mapa[it.medicamentoId] = { total: 0, detalle: [] };
        }
        mapa[it.medicamentoId].total += it.actual;
        mapa[it.medicamentoId].detalle.push(`${c.id}: ${it.actual} u.`);
      }
    }
    return mapa;
  }, [carros]);

  const kpis = useMemo(() => {
    let totalBodega = 0;
    let totalVitrina = 0;
    let totalCarros = 0;
    let criticos = 0;
    let porVencer = 0;

    for (const m of meds) {
      const bod = stockBodegaMed(m);
      const vit = stockVitrinaMed(m);
      const tot = bod + vit;
      const sem = semaforoDeDias(menorDiasMed(m), tot, m.stock_critico_alerta);
      totalBodega += bod;
      totalVitrina += vit;
      if (sem === "ROJO") criticos++;
      if (sem === "AMARILLO") porVencer++;
    }
    for (const c of carros) {
      for (const it of c.items) totalCarros += it.actual;
    }

    return {
      productosCount: meds.length,
      totalBodega,
      totalVitrina,
      totalCarros,
      granTotal: totalBodega + totalVitrina + totalCarros,
      criticos,
      porVencer,
    };
  }, [meds, carros]);

  const productosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return meds.filter((m) => {
      const tot = stockTotalMed(m);
      const sem = semaforoDeDias(menorDiasMed(m), tot, m.stock_critico_alerta);
      const enCarros = (stockEnCarrosPorMed[m.id]?.total ?? 0) > 0;

      if (filtroEstado === "VERDE" && sem !== "VERDE") return false;
      if (filtroEstado === "AMARILLO" && sem !== "AMARILLO") return false;
      if (filtroEstado === "ROJO" && sem !== "ROJO") return false;
      if (filtroEstado === "EN_CARROS" && !enCarros) return false;

      if (!q) return true;
      return (
        m.nombre_generico.toLowerCase().includes(q) ||
        m.concentracion.toLowerCase().includes(q) ||
        m.codigo_cenabast.toLowerCase().includes(q) ||
        m.categoria_nombre.toLowerCase().includes(q) ||
        (m.descripcion ?? "").toLowerCase().includes(q)
      );
    });
  }, [meds, busqueda, filtroEstado, stockEnCarrosPorMed]);

  return (
    <>
      <PageTitle
        icon={<Boxes />}
        title="Stock de Todo el Inventario y Productos"
        subtitle="Visión consolidada en tiempo real: Bodega Central, Vitrina de Dispensación y Carros Clínicos"
      />

      <HelpBanner
        titulo="¿Cómo consultar el stock completo de su inventario? 3 pasos"
        pasos={[
          "Revise las tarjetas superiores con el total de unidades en Bodega, Vitrina y Carros Clínicos.",
          "Use los filtros rápidos o el buscador para encontrar cualquier medicamento o lote FEFO.",
          "Transfiera unidades de Bodega a Vitrina o inyecte los 20 medicamentos reales cuando lo necesite.",
        ]}
      />

      {/* KPIs Consolidados del Inventario */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="card border-2 border-[#F5C2C6] bg-[#FCF0F1] p-4">
          <p className="text-xs font-extrabold uppercase text-[#9E0E15]">Total Productos</p>
          <p className="mt-1 text-3xl font-extrabold text-[#9E0E15]">{kpis.productosCount}</p>
          <p className="text-xs text-slate-600">{kpis.granTotal} u. totales en el CESFAM</p>
        </div>

        <div className="card p-4">
          <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase text-slate-600">
            <Package size={15} aria-hidden /> Stock en Bodega
          </p>
          <p className="mt-1 text-3xl font-extrabold text-slate-900">{kpis.totalBodega}</p>
          <p className="text-xs text-slate-500">Reserva para Vitrina y Carros</p>
        </div>

        <div className="card p-4">
          <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase text-slate-600">
            <Store size={15} aria-hidden /> Stock en Vitrina
          </p>
          <p className="mt-1 text-3xl font-extrabold text-slate-900">{kpis.totalVitrina}</p>
          <p className="text-xs text-slate-500">Listo para entregar a pacientes</p>
        </div>

        <div className="card p-4">
          <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase text-slate-600">
            <Siren size={15} aria-hidden /> En Carros Clínicos
          </p>
          <p className="mt-1 text-3xl font-extrabold text-slate-900">{kpis.totalCarros}</p>
          <p className="text-xs text-slate-500">Carro de Paro + Unidosis</p>
        </div>

        <div className="card border-2 border-orange-400 bg-orange-50/70 p-4">
          <p className="flex items-center gap-1.5 text-xs font-black uppercase text-orange-950">
            <AlertTriangle size={15} className="text-orange-600" aria-hidden /> Alertas de Stock
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-black text-orange-950">
            <span className="rounded-lg border border-orange-500 bg-orange-400 px-2.5 py-0.5 text-slate-950 shadow-xs">
              {kpis.criticos} Críticos
            </span>
            <span className="text-lg font-bold text-amber-900">· {kpis.porVencer} Por Vencer</span>
          </p>
          <p className="text-xs font-semibold text-orange-900">Monitoreo FEFO automático</p>
        </div>
      </div>

      {/* Barra de búsqueda, filtros por estado y botón de inyección */}
      <div className="card mb-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado de stock">
            {(
              [
                ["TODOS", `Todos (${meds.length})`],
                ["VERDE", "Stock Seguro"],
                ["AMARILLO", "Próximo a Vencer"],
                ["ROJO", "Stock Crítico"],
                ["EN_CARROS", "Presentes en Carros Clínicos"],
              ] as [FiltroEstado, string][]
            ).map(([cod, label]) => {
              const esActivo = filtroEstado === cod;
              const esRojo = cod === "ROJO";
              return (
                <button
                  key={cod}
                  type="button"
                  onClick={() => setFiltroEstado(cod)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm transition ${
                    esActivo
                      ? esRojo
                        ? "border-2 border-orange-600 bg-orange-400 font-black text-slate-950 shadow-md ring-2 ring-orange-300"
                        : "bg-[#C4121A] font-bold text-white shadow-sm"
                      : esRojo
                      ? "border-2 border-orange-400 bg-orange-100 font-black text-orange-950 shadow-xs hover:bg-orange-200"
                      : "border border-slate-300 bg-slate-50 font-bold text-slate-700 hover:bg-[#FDE8E8]"
                  }`}
                >
                  {esRojo && (
                    <AlertTriangle
                      size={15}
                      className={esActivo ? "fill-slate-950 text-orange-200" : "text-orange-700"}
                      aria-hidden
                    />
                  )}
                  {label}
                  {esRojo && kpis.criticos > 0 && (
                    <span
                      className={`ml-1 rounded-full px-2 py-0.5 text-xs font-black ${
                        esActivo ? "bg-slate-950 text-amber-300" : "bg-orange-600 text-white"
                      }`}
                    >
                      {kpis.criticos}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              const n = inyectar20MedicamentosReales();
              avisar(
                n > 0
                  ? `Se inyectaron ${n} medicamentos reales al inventario.`
                  : "Los 20 medicamentos reales ya están cargados en el inventario."
              );
            }}
            className="btn bg-[#C4121A] hover:bg-[#9E0E15] !py-2 text-sm text-white shadow-sm hover:brightness-105"
          >
            <Sparkles size={18} aria-hidden />
            Inyectar 20 Medicamentos Reales
          </button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-3.5 text-slate-400" size={20} aria-hidden />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar en todo el inventario por nombre, concentración, código CENABAST, categoría o descripción..."
            className="input pl-11"
          />
        </div>
      </div>

      {/* Listado en cuadrícula responsiva para aprovechar al máximo los márgenes en pantallas medianas y anchas */}
      <div className="grid gap-4 xl:grid-cols-2">
        {productosFiltrados.map((m) => {
          const bod = stockBodegaMed(m);
          const vit = stockVitrinaMed(m);
          const enCarros = stockEnCarrosPorMed[m.id]?.total ?? 0;
          const detalleCarros = stockEnCarrosPorMed[m.id]?.detalle ?? [];
          const totalFarmacia = bod + vit;
          const totalGeneral = totalFarmacia + enCarros;
          const dias = menorDiasMed(m);
          const loteFefo = m.lotes[0];
          const cantTraspaso = obtenerCantTraspaso(m.id, bod);
          const esCritico = semaforoDeDias(dias, totalFarmacia, m.stock_critico_alerta) === "ROJO";

          return (
            <article
              key={m.id}
              className={`card flex flex-col justify-between transition hover:shadow-md ${
                esCritico
                  ? "border-2 border-orange-400/80 bg-orange-50/20 shadow-orange-100"
                  : "border border-slate-200/90 shadow-sm"
              }`}
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-[#FDE8E8] px-2 py-0.5 text-xs font-extrabold text-[#9E0E15]">
                        {m.codigo_cenabast}
                      </span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                        {m.categoria_nombre}
                      </span>
                    </div>

                    <h2 className="text-lg font-black text-slate-900">
                      {m.nombre_generico}{" "}
                      <span className="text-[#C4121A]">{m.concentracion}</span>{" "}
                      <span className="text-xs font-semibold text-slate-500">({m.forma_farmaceutica})</span>
                    </h2>
                  </div>

                  <Semaforo nivel={semaforoDeDias(dias, totalFarmacia, m.stock_critico_alerta)} />
                </div>

                {m.descripcion && (
                  <p className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">
                    <strong className="text-slate-700">Uso: </strong>
                    {m.descripcion}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between text-xs font-semibold text-slate-500">
                  <span>
                    Lote FEFO: <strong className="font-mono text-slate-800">{loteFefo?.numero_lote ?? "S/L"}</strong> (vence en {dias} días)
                  </span>
                  <span>
                    Umbral crítico: ≤<strong className="text-slate-800">{m.stock_critico_alerta} u.</strong>
                  </span>
                </div>
              </div>

              {/* Desglose numérico de Stock por ubicación + Acción de Traspaso Configurable */}
              <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <p className="text-[11px] font-bold text-slate-500">Bodega</p>
                    <p className="text-lg font-black text-slate-900">{bod}</p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <p className="text-[11px] font-bold text-slate-500">Vitrina</p>
                    <p className="text-lg font-black text-slate-900">{vit}</p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <p className="text-[11px] font-bold text-slate-500">En Carros</p>
                    <p className="text-lg font-black text-slate-900">{enCarros}</p>
                    {detalleCarros.length > 0 && (
                      <p className="truncate text-[10px] font-semibold text-[#9E0E15]">{detalleCarros.join(", ")}</p>
                    )}
                  </div>

                  <div className="rounded-xl border-2 border-[#C4121A] bg-[#FCF0F1] p-2">
                    <p className="text-[11px] font-black text-[#9E0E15]">Total</p>
                    <p className="text-lg font-black text-[#9E0E15]">{totalGeneral}</p>
                  </div>
                </div>

                {/* Control interactivo de cantidad para Traspasar de Bodega a Vitrina */}
                <div className="space-y-2 pt-1">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-extrabold text-slate-700">
                      Traspaso a Vitrina (Mesón de Entrega):
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500">
                      {bod > 0 ? `${bod} u. disponibles en Bodega` : "Sin stock en Bodega"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Input numérico para elegir cantidad exacta */}
                    <div className="flex items-center gap-1 rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-1">
                      <span className="text-[11px] font-bold text-slate-600">Cant:</span>
                      <input
                        type="number"
                        min={1}
                        max={bod}
                        value={cantTraspaso || ""}
                        placeholder="0"
                        onChange={(e) =>
                          cambiarCantTraspaso(m.id, parseInt(e.target.value, 10), bod)
                        }
                        aria-label={`Cantidad a traspasar de Bodega a Vitrina para ${m.nombre_generico}`}
                        className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1 text-center text-xs font-black text-slate-900 focus:border-[#C4121A] focus:outline-none"
                      />
                      <span className="text-[11px] font-bold text-slate-500">u.</span>
                    </div>

                    {/* Botones rápidos de selección */}
                    <div className="flex items-center gap-1">
                      {[10, 30, 50].map((q) => (
                        <button
                          key={q}
                          type="button"
                          disabled={bod < q}
                          onClick={() => cambiarCantTraspaso(m.id, q, bod)}
                          className={`rounded-lg px-2 py-1 text-[11px] font-extrabold transition ${
                            cantTraspaso === q
                              ? "bg-[#C4121A] text-white shadow-sm"
                              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                          }`}
                          title={`Elegir ${q} unidades`}
                        >
                          {q}
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={bod <= 0}
                        onClick={() => cambiarCantTraspaso(m.id, bod, bod)}
                        className={`rounded-lg px-2 py-1 text-[11px] font-extrabold transition ${
                          cantTraspaso === bod && bod > 0
                            ? "bg-[#C4121A] text-white shadow-sm"
                            : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                        }`}
                        title="Seleccionar todo el stock disponible en Bodega"
                      >
                        Todo
                      </button>
                    </div>

                    {/* Botón para ejecutar el traspaso */}
                    <button
                      type="button"
                      disabled={bod <= 0 || cantTraspaso <= 0 || cantTraspaso > bod}
                      onClick={() => {
                        ajustarStockMedicamentoCRUD(m.id, -cantTraspaso, cantTraspaso);
                        avisar(
                          `Se traspasaron ${cantTraspaso} u. de ${m.nombre_generico} desde Bodega hacia Vitrina.`
                        );
                      }}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-[#C4121A] bg-white !min-h-[38px] !py-2 text-xs font-extrabold text-[#C4121A] shadow-sm transition hover:bg-[#FDE8E8] hover:shadow disabled:opacity-50"
                      title={
                        bod <= 0
                          ? "No hay stock en Bodega para traspasar"
                          : `Traspasar ${cantTraspaso} unidades desde Bodega central hacia Vitrina`
                      }
                    >
                      <ArrowRightLeft size={15} aria-hidden />
                      Traspasar {cantTraspaso > 0 ? `${cantTraspaso} u.` : ""} a Vitrina
                    </button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
};
