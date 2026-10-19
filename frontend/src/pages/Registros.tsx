import React, { useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileCheck2,
  Filter,
  Lock,
  PackageCheck,
  Pill,
  Printer,
  Search,
  ShoppingCart,
  UserCheck,
  X,
  XCircle,
} from "lucide-react";
import { HelpBanner, PageTitle } from "../components/ui";
import { RegistroDispensacion, useMedicamentos } from "../data/demo";

export const Registros: React.FC<{ avisar: (m: string) => void }> = ({ avisar }) => {
  const { dispensaciones, pedidosCarro, branding } = useMedicamentos();

  const [vistaActiva, setVistaActiva] = useState<"recetas" | "carros">("recetas");

  // Filtros para Historial de Recetas
  const [busquedaRecetas, setBusquedaRecetas] = useState("");
  const [filtroPrograma, setFiltroPrograma] = useState("TODOS");
  const [comprobanteSeleccionado, setComprobanteSeleccionado] = useState<RegistroDispensacion | null>(null);

  // Filtros para Historial de Carros
  const [busquedaCarros, setBusquedaCarros] = useState("");
  const [filtroEstadoCarro, setFiltroEstadoCarro] = useState<"TODOS" | "Aceptado" | "Cancelado">("TODOS");
  const [filtroCarroId, setFiltroCarroId] = useState("TODOS");

  // Filtrado de Recetas Entregadas
  const recetasFiltradas = useMemo(() => {
    return dispensaciones.filter((r) => {
      const q = busquedaRecetas.trim().toLowerCase();
      const coincideTexto =
        !q ||
        r.folio.toLowerCase().includes(q) ||
        r.pacienteNombre.toLowerCase().includes(q) ||
        r.pacienteRut.toLowerCase().includes(q) ||
        r.recetaId.toLowerCase().includes(q) ||
        r.items.some((it) => it.nombre.toLowerCase().includes(q) || it.lote.toLowerCase().includes(q));

      const coincideProg =
        filtroPrograma === "TODOS" ||
        r.programa.toLowerCase().includes(filtroPrograma.toLowerCase());

      return coincideTexto && coincideProg;
    });
  }, [dispensaciones, busquedaRecetas, filtroPrograma]);

  // Filtrado de Carros Clínicos
  const pedidosCarroFiltrados = useMemo(() => {
    return pedidosCarro.filter((p) => {
      const q = busquedaCarros.trim().toLowerCase();
      const coincideTexto =
        !q ||
        p.id.toLowerCase().includes(q) ||
        p.carroNombre.toLowerCase().includes(q) ||
        p.solicitadoPor.toLowerCase().includes(q) ||
        p.quienProvee.toLowerCase().includes(q) ||
        p.items.some((it) => it.nombre.toLowerCase().includes(q));

      const coincideEstado =
        filtroEstadoCarro === "TODOS" ? true : p.estado === filtroEstadoCarro;

      const coincideCarro =
        filtroCarroId === "TODOS" ? true : p.carroId === filtroCarroId;

      return coincideTexto && coincideEstado && coincideCarro;
    });
  }, [pedidosCarro, busquedaCarros, filtroEstadoCarro, filtroCarroId]);

  // Métricas de Recetas
  const totalRecetas = dispensaciones.length;
  const pacientesUnicos = new Set(dispensaciones.map((d) => d.pacienteRut)).size;
  const totalUnidadesDispensadas = dispensaciones.reduce(
    (sum, d) => sum + d.items.reduce((s, it) => s + it.cantidad, 0),
    0
  );

  // Métricas de Carros
  const carrosAprobados = pedidosCarro.filter((p) => p.estado === "Aceptado").length;
  const carrosRechazados = pedidosCarro.filter((p) => p.estado === "Cancelado").length;
  const carrosEnTransito = pedidosCarro.filter((p) => p.estado === "En camino").length;

  const imprimirComprobante = () => {
    avisar("Imprimiendo comprobante oficial...");
    window.print();
  };

  return (
    <>
      <PageTitle
        icon={<ClipboardList size={26} />}
        title="Registros y Bitácora Oficial"
        subtitle="Registro auditable de recetas entregadas a pacientes y movimientos de carros clínicos (Aprobados y Rechazados)"
      />

      <HelpBanner
        titulo="¿Cómo consultar los registros del sistema? 2 vistas especializadas"
        pasos={[
          "En 'Historial de Recetas Entregadas' consulte cada despacho asistencial realizado a pacientes con su folio y médico prescriptor.",
          "En 'Historial de Entregas de Carros' revise todos los abastecimientos aprobados o rechazados/cancelados con trazabilidad de stock.",
          "Haga clic en 'Ver Comprobante' en cualquier receta para previsualizar o imprimir la constancia de entrega oficial.",
        ]}
      />

      {/* ================= PESTAÑAS PRINCIPALES DE SELECCIÓN ================= */}
      <div className="mb-6 flex flex-wrap items-center gap-3 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setVistaActiva("recetas")}
          className={`inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-black transition ${
            vistaActiva === "recetas"
              ? "bg-[#C4121A] text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          <Pill size={18} aria-hidden />
          <span>Historial de Recetas Entregadas</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${
              vistaActiva === "recetas" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            {totalRecetas}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setVistaActiva("carros")}
          className={`inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-black transition ${
            vistaActiva === "carros"
              ? "bg-[#C4121A] text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          <ShoppingCart size={18} aria-hidden />
          <span>Historial de Entregas de Carros</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${
              vistaActiva === "carros" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            {pedidosCarro.length}
          </span>
        </button>
      </div>

      {/* ================= VISTA 1: HISTORIAL DE RECETAS ENTREGADAS ================= */}
      {vistaActiva === "recetas" && (
        <div className="space-y-6">
          {/* Tarjetas de Indicadores de Dispensación */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-extrabold uppercase">Recetas Entregadas</span>
                <FileCheck2 size={22} className="text-[#C4121A]" />
              </div>
              <p className="mt-2 text-3xl font-black text-[#1C0D0F]">{totalRecetas}</p>
              <p className="mt-0.5 text-xs text-slate-500">Comprobantes oficiales emitidos</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-extrabold uppercase">Pacientes Atendidos</span>
                <UserCheck size={22} className="text-[#B80F16]" />
              </div>
              <p className="mt-2 text-3xl font-black text-[#1C0D0F]">{pacientesUnicos}</p>
              <p className="mt-0.5 text-xs text-slate-500">Beneficiarios únicos con retiro conforme</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-extrabold uppercase">Unidades Físicas</span>
                <PackageCheck size={22} className="text-emerald-700" />
              </div>
              <p className="mt-2 text-3xl font-black text-[#1C0D0F]">
                {totalUnidadesDispensadas} u.
              </p>
              <p className="mt-0.5 text-xs text-slate-500">Descontadas de vitrina bajo FEFO</p>
            </div>
          </div>

          {/* Barra de Filtros y Búsqueda */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-1 items-stretch min-w-[260px] max-w-md">
              <input
                type="search"
                value={busquedaRecetas}
                onChange={(e) => setBusquedaRecetas(e.target.value)}
                placeholder="Buscar por RUT, paciente, folio o medicamento..."
                className="w-full rounded-l-xl border border-r-0 border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-800 focus:border-[#B80F16] focus:outline-none"
              />
              <span className="flex items-center justify-center rounded-r-xl bg-[#C4121A] px-3.5 text-white">
                <Search size={16} aria-hidden />
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Filter size={15} className="text-slate-500" aria-hidden />
              <span className="text-xs font-bold text-slate-600">Programa:</span>
              <select
                value={filtroPrograma}
                onChange={(e) => setFiltroPrograma(e.target.value)}
                aria-label="Filtrar por programa de salud"
                className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-extrabold text-[#1C0D0F]"
              >
                <option value="TODOS">Todos los Programas</option>
                <option value="Crónicos">Crónicos (Diabetes + HTA)</option>
                <option value="GES">Programas GES / AUGE</option>
                <option value="Cardiovascular">Cardiovascular FOFAR</option>
                <option value="Morbilidad">Morbilidad General</option>
              </select>
            </div>
          </div>

          {/* Tabla Oficial de Recetas Entregadas */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-[#FBEBEB] text-xs font-extrabold uppercase tracking-wider text-[#1C0D0F]">
                  <th className="px-4 py-3.5">Folio & Fecha</th>
                  <th className="px-4 py-3.5">Paciente Beneficiario</th>
                  <th className="px-4 py-3.5">Programa</th>
                  <th className="px-4 py-3.5">Fármacos Entregados (Lote FEFO & Cantidad)</th>
                  <th className="px-4 py-3.5">Médico Prescriptor</th>
                  <th className="px-4 py-3.5 text-center">Comprobante</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {recetasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                      No se encontraron entregas que coincidan con los criterios de búsqueda.
                    </td>
                  </tr>
                ) : (
                  recetasFiltradas.map((r) => (
                    <tr key={r.folio} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-sm font-black text-[#1C0D0F]">
                          {r.folio}
                        </span>
                        <span className="block text-xs font-medium text-slate-500">
                          {r.fechaHora}
                        </span>
                        <span className="text-[11px] text-slate-400">Receta: {r.recetaId}</span>
                      </td>

                      <td className="px-4 py-3.5">
                        <p className="font-bold text-[#1C0D0F]">{r.pacienteNombre}</p>
                        <p className="text-xs text-slate-600">
                          RUT: <strong>{r.pacienteRut}</strong> · {r.pacienteEdad} años
                        </p>
                        <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold text-slate-700">
                          {r.pacienteTramo}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="inline-block rounded-full bg-[#FDE8E8] px-2.5 py-0.5 text-xs font-extrabold text-[#B80F16]">
                          {r.programa}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <ul className="space-y-1 text-xs">
                          {r.items.map((it, idx) => (
                            <li key={idx} className="flex flex-wrap items-center gap-1.5">
                              <span className="font-bold text-[#1C0D0F]">
                                {it.nombre} {it.concentracion}
                              </span>
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                                {it.lote}
                              </span>
                              <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-black text-emerald-900">
                                <Lock size={10} aria-hidden /> {it.cantidad} u.
                              </span>
                            </li>
                          ))}
                        </ul>
                      </td>

                      <td className="px-4 py-3.5">
                        <p className="text-xs font-bold text-slate-800">{r.medico}</p>
                        <p className="text-[11px] text-slate-500">
                          Dispensado por: {r.dispensadoPor}
                        </p>
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => setComprobanteSeleccionado(r)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[#C4121A] bg-[#FDF2F2] px-3 py-1.5 text-xs font-bold text-[#C4121A] transition hover:bg-[#C4121A] hover:text-white"
                          title="Ver documento oficial de entrega"
                        >
                          <Eye size={14} aria-hidden />
                          Ver Comprobante
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= VISTA 2: HISTORIAL DE CARROS (APROBADOS Y RECHAZADOS) ================= */}
      {vistaActiva === "carros" && (
        <div className="space-y-6">
          {/* Tarjetas de Indicadores de Carros */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-emerald-200 bg-[#EBFBEE] p-4 shadow-sm text-emerald-950">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase">Pedidos Aprobados</span>
                <CheckCircle2 size={24} className="text-emerald-700" />
              </div>
              <p className="mt-2 text-3xl font-black">{carrosAprobados}</p>
              <p className="mt-0.5 text-xs opacity-85">Stock recibido y sumado al carro clínico</p>
            </div>

            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm text-red-950">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase">Pedidos Rechazados / Anulados</span>
                <XCircle size={24} className="text-red-700" />
              </div>
              <p className="mt-2 text-3xl font-black">{carrosRechazados}</p>
              <p className="mt-0.5 text-xs opacity-85">Solicitudes canceladas sin alterar stock</p>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm text-amber-950">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase">En Tránsito (Pendientes)</span>
                <CalendarClock size={24} className="text-amber-700" />
              </div>
              <p className="mt-2 text-3xl font-black">{carrosEnTransito}</p>
              <p className="mt-0.5 text-xs opacity-85">En camino a la espera de recepción física</p>
            </div>
          </div>

          {/* Barra de Filtros y Búsqueda */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-1 items-stretch min-w-[260px] max-w-md">
              <input
                type="search"
                value={busquedaCarros}
                onChange={(e) => setBusquedaCarros(e.target.value)}
                placeholder="Buscar por ID de pedido, carro, insumo o proveedor..."
                className="w-full rounded-l-xl border border-r-0 border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-800 focus:border-[#B80F16] focus:outline-none"
              />
              <span className="flex items-center justify-center rounded-r-xl bg-[#C4121A] px-3.5 text-white">
                <Search size={16} aria-hidden />
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Filtro por Estado */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-600">Estado:</span>
                <select
                  value={filtroEstadoCarro}
                  onChange={(e) =>
                    setFiltroEstadoCarro(e.target.value as "TODOS" | "Aceptado" | "Cancelado")
                  }
                  aria-label="Filtrar por estado del pedido"
                  className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-extrabold text-[#1C0D0F]"
                >
                  <option value="TODOS">Todos los Estados ({pedidosCarro.length})</option>
                  <option value="Aceptado">Solo Aprobados ({carrosAprobados})</option>
                  <option value="Cancelado">Solo Rechazados / Cancelados ({carrosRechazados})</option>
                </select>
              </div>

              {/* Filtro por Carro */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-600">Carro:</span>
                <select
                  value={filtroCarroId}
                  onChange={(e) => setFiltroCarroId(e.target.value)}
                  aria-label="Filtrar por carro clínico"
                  className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-extrabold text-[#1C0D0F]"
                >
                  <option value="TODOS">Todos los Carros</option>
                  <option value="CP-01">Carro de Paro (CP-01)</option>
                  <option value="CU-01">Carro de Unidosis (CU-01)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Tabla de Movimientos de Carros Aprobados y Rechazados */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-[#FBEBEB] text-xs font-extrabold uppercase tracking-wider text-[#1C0D0F]">
                  <th className="px-4 py-3.5">Folio & Fecha Solicitud</th>
                  <th className="px-4 py-3.5">Carro Destino</th>
                  <th className="px-4 py-3.5">Trazabilidad (Solicita / Provee)</th>
                  <th className="px-4 py-3.5">Insumos y Cantidades</th>
                  <th className="px-4 py-3.5">Estado Auditado</th>
                  <th className="px-4 py-3.5">Recepción / Cierre</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {pedidosCarroFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                      No se registraron movimientos con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  pedidosCarroFiltrados.map((ped) => {
                    const totalUnidades = ped.items.reduce((s, it) => s + it.cantidad, 0);
                    const esAprobado = ped.estado === "Aceptado";
                    const esRechazado = ped.estado === "Cancelado";

                    return (
                      <tr
                        key={ped.id}
                        className={`transition ${
                          esAprobado
                            ? "bg-emerald-50/30 hover:bg-emerald-50/60"
                            : esRechazado
                            ? "bg-red-50/30 hover:bg-red-50/60"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <td className="px-4 py-3.5">
                          <span className="font-mono text-sm font-black text-[#1C0D0F]">
                            {ped.id}
                          </span>
                          <span className="block text-xs font-medium text-slate-500">
                            {ped.fechaHora}
                          </span>
                        </td>

                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#FDE8E8] px-2 py-0.5 text-xs font-black text-[#B80F16]">
                            <ShoppingCart size={13} aria-hidden />
                            {ped.carroNombre}
                          </span>
                          <p className="mt-1 text-[11px] text-slate-500 italic">{ped.motivo}</p>
                        </td>

                        <td className="px-4 py-3.5">
                          <p className="font-bold text-[#1C0D0F]">
                            Solicita: <span className="font-normal">{ped.solicitadoPor}</span>
                          </p>
                          <p className="text-xs text-slate-600">
                            <strong>Provee:</strong> {ped.quienProvee}
                          </p>
                        </td>

                        <td className="px-4 py-3.5">
                          <p className="font-extrabold text-[#B80F16]">
                            Total: +{totalUnidades} unidades
                          </p>
                          <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-slate-700">
                            {ped.items.map((it, idx) => (
                              <li key={idx}>
                                <strong>{it.nombre}</strong> {it.concentracion} —{" "}
                                <span className="font-mono text-[11px] text-slate-500">
                                  {it.lote}
                                </span>{" "}
                                (<strong>+{it.cantidad} u.</strong>)
                              </li>
                            ))}
                          </ul>
                        </td>

                        <td className="px-4 py-3.5">
                          {esAprobado ? (
                            <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-950 shadow-sm">
                              <CheckCircle2 size={14} className="text-emerald-700" aria-hidden />
                              APROBADO
                            </span>
                          ) : esRechazado ? (
                            <span className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-red-100 px-3 py-1 text-xs font-black text-red-950 shadow-sm">
                              <XCircle size={14} className="text-red-700" aria-hidden />
                              RECHAZADO / CANCELADO
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-xl bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-900">
                              En Tránsito
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3.5">
                          {esAprobado ? (
                            <div className="text-xs">
                              <p className="font-bold text-emerald-900">✔ Stock sumado al carro</p>
                              <p className="text-[11px] text-slate-500">
                                Recepción: {ped.fechaRecepcion || ped.fechaHora}
                              </p>
                              <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 font-bold">
                                <Lock size={10} /> Registro inmutable
                              </span>
                            </div>
                          ) : esRechazado ? (
                            <div className="text-xs">
                              <p className="font-bold text-red-900">✖ Sin impacto en stock</p>
                              <p className="text-[11px] text-slate-500">Solicitud descartada</p>
                              <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 font-bold">
                                <Lock size={10} /> Registro cerrado
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-amber-800 font-semibold">
                              Esperando recepción física
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= MODAL DE PREVISUALIZACIÓN DE COMPROBANTE OFICIAL ================= */}
      {comprobanteSeleccionado && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            {/* Botón Cerrar */}
            <button
              type="button"
              onClick={() => setComprobanteSeleccionado(null)}
              className="absolute right-4 top-4 rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label="Cerrar comprobante"
            >
              <X size={20} />
            </button>

            {/* Documento Formal de Comprobante */}
            <div className="comprobante-oficial-print rounded-xl border border-slate-300 bg-white p-6 text-slate-900">
              <div className="border-b-2 border-slate-900 pb-3">
                <div className="flex flex-wrap items-center justify-between gap-4">
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

                  <div className="rounded border border-slate-800 bg-slate-50 p-2 text-right text-xs">
                    <p className="text-[10px] font-bold uppercase text-slate-600">Folio Dispensación</p>
                    <p className="font-mono text-sm font-black text-slate-900">
                      N° {comprobanteSeleccionado.folio}
                    </p>
                    <p className="text-[10px] text-slate-500">{comprobanteSeleccionado.fechaHora} hrs</p>
                  </div>
                </div>

                <div className="mt-2.5 rounded border border-slate-300 bg-slate-100 py-1 text-center">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-900">
                    Comprobante de Dispensación y Entrega Gratuita de Medicamentos (APS / MINSAL)
                  </p>
                </div>
              </div>

              {/* Datos del Paciente */}
              <div className="my-3 grid grid-cols-2 gap-3 rounded border border-slate-300 bg-slate-50/70 p-2.5 text-xs">
                <div className="space-y-0.5">
                  <p>
                    <strong className="text-slate-900">Paciente:</strong> {comprobanteSeleccionado.pacienteNombre}
                  </p>
                  <p>
                    <strong className="text-slate-900">RUT:</strong> {comprobanteSeleccionado.pacienteRut} &nbsp;|&nbsp;{" "}
                    <strong className="text-slate-900">Edad:</strong> {comprobanteSeleccionado.pacienteEdad} años
                  </p>
                  <p>
                    <strong className="text-slate-900">Tramo FONASA:</strong> {comprobanteSeleccionado.pacienteTramo}
                  </p>
                  <p>
                    <strong className="text-slate-900">Programa:</strong> {comprobanteSeleccionado.programa}
                  </p>
                </div>

                <div className="space-y-0.5">
                  <p>
                    <strong className="text-slate-900">Receta Folio:</strong> {comprobanteSeleccionado.recetaId}
                  </p>
                  <p>
                    <strong className="text-slate-900">Médico:</strong> {comprobanteSeleccionado.medico}
                  </p>
                  <p>
                    <strong className="text-slate-900">Dispensado por:</strong> {comprobanteSeleccionado.dispensadoPor}
                  </p>
                  {comprobanteSeleccionado.observaciones && (
                    <p>
                      <strong className="text-slate-900">Obs:</strong> {comprobanteSeleccionado.observaciones}
                    </p>
                  )}
                </div>
              </div>

              {/* Tabla de Fármacos */}
              <table className="my-3 w-full border-collapse border border-slate-400 text-xs">
                <thead>
                  <tr className="border-b border-slate-400 bg-slate-200 text-slate-900 font-bold">
                    <th className="border-r border-slate-400 p-1.5 text-center w-8">N°</th>
                    <th className="border-r border-slate-400 p-1.5 text-left">Fármaco y Concentración</th>
                    <th className="border-r border-slate-400 p-1.5 text-left">Presentación</th>
                    <th className="border-r border-slate-400 p-1.5 text-center">Lote FEFO</th>
                    <th className="border-r border-slate-400 p-1.5 text-center">Cantidad</th>
                    <th className="p-1.5 text-left">Posología</th>
                  </tr>
                </thead>
                <tbody>
                  {comprobanteSeleccionado.items.map((it, idx) => (
                    <tr key={idx} className="border-b border-slate-300">
                      <td className="border-r border-slate-300 p-1.5 text-center font-bold">{idx + 1}</td>
                      <td className="border-r border-slate-300 p-1.5 font-bold text-slate-900">
                        {it.nombre} {it.concentracion}
                      </td>
                      <td className="border-r border-slate-300 p-1.5">{it.forma}</td>
                      <td className="border-r border-slate-300 p-1.5 text-center font-mono">{it.lote}</td>
                      <td className="border-r border-slate-300 p-1.5 text-center font-black">{it.cantidad} u.</td>
                      <td className="p-1.5 italic text-slate-700">{it.indicacion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Firmas de Conformidad */}
              <div className="mt-8 grid grid-cols-2 gap-8 text-center text-xs">
                <div className="border-t border-slate-800 pt-1">
                  <p className="font-bold">Firma y Timbre Farmacia</p>
                  <p className="text-[10px] text-slate-600">Dispensado Conforme APS / MINSAL</p>
                </div>
                <div className="border-t border-slate-800 pt-1">
                  <p className="font-bold">Firma Paciente o Representante</p>
                  <p className="text-[10px] text-slate-600">RUT: {comprobanteSeleccionado.pacienteRut}</p>
                </div>
              </div>
            </div>

            {/* Botones de Acción del Modal */}
            <div className="mt-5 flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setComprobanteSeleccionado(null)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={imprimirComprobante}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#C4121A] px-5 py-2 text-xs font-black text-white hover:bg-[#9E0E15]"
              >
                <Printer size={15} aria-hidden />
                Imprimir Comprobante Oficial
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
