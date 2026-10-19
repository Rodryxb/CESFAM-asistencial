import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Barcode,
  CheckCircle2,
  Clock,
  History,
  Lock,
  PackageCheck,
  Pill,
  Plus,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Trash2,
  Truck,
  UserRound,
  XCircle,
  Zap,
} from "lucide-react";
import { HelpBanner, PageTitle } from "../components/ui";
import {
  actualizarEstadoPedidoCarro,
  CarroClinicoInfo,
  crearPedidoReposicionCarro,
  enDias,
  EstadoPedidoCarro,
  inyectar20MedicamentosReales,
  menorDiasMed,
  stockBodegaMed,
  stockTotalMed,
  useMedicamentos,
} from "../data/demo";

const PROVEEDORES_DISPONIBLES = [
  "Laboratorio Chile S.A. / CENABAST · Despacha Q.F. Nataly Caamaño",
  "Abastecimiento Red Asistencial MINSAL",
  "Bodega Central Farmacia CESFAM · Despacha TENS Camila Torres",
];

interface ItemCanasta {
  medicamentoId: number;
  nombre: string;
  concentracion: string;
  cantidad: number;
  loteFefo?: string;
}

export const CarrosClinicos: React.FC<{ avisar: (m: string) => void }> = ({ avisar }) => {
  const { meds, carros, pedidosCarro } = useMedicamentos();

  const [carroSeleccionadoId, setCarroSeleccionadoId] = useState<string>("CP-01");
  const [proveedorElegido, setProveedorElegido] = useState<string>(PROVEEDORES_DISPONIBLES[0]);
  const [busquedaTrazabilidad, setBusquedaTrazabilidad] = useState<string>("");
  const [medIdSeleccionado, setMedIdSeleccionado] = useState<number>(2); // Losartán 50 mg por defecto
  const [cantidadPedirCrud, setCantidadPedirCrud] = useState<number>(20);
  const [filtroCarroHistorial, setFiltroCarroHistorial] = useState<string>("TODOS");

  // Canasta proactiva multi-ítem para armar pedidos consolidados
  const [canasta, setCanasta] = useState<ItemCanasta[]>([]);
  const [motivoCanasta, setMotivoCanasta] = useState<string>("");
  const [pedidoRecienteId, setPedidoRecienteId] = useState<string | null>(null);

  const carroActivo = carros.find((c) => c.id === carroSeleccionadoId) ?? carros[0];

  // Búsqueda estricta sobre los productos existentes en el CRUD
  const resultadosCrud = useMemo(() => {
    const q = busquedaTrazabilidad.trim().toLowerCase();
    if (!q) return meds;
    return meds.filter(
      (m) =>
        m.nombre_generico.toLowerCase().includes(q) ||
        m.concentracion.toLowerCase().includes(q) ||
        m.codigo_cenabast.toLowerCase().includes(q) ||
        m.lotes.some((l) => l.numero_lote.toLowerCase().includes(q))
    );
  }, [meds, busquedaTrazabilidad]);

  const medFoco = useMemo(() => {
    const enResultados = resultadosCrud.find((m) => m.id === medIdSeleccionado);
    return enResultados ?? resultadosCrud[0] ?? meds[0];
  }, [resultadosCrud, medIdSeleccionado, meds]);

  // Recomendaciones automáticas de productos bajo stock o esenciales en el CRUD
  const productosRecomendadosBajoStock = useMemo(() => {
    return meds.filter((m) => {
      const itemEnCarro = carroActivo?.items.find((i) => i.medicamentoId === m.id);
      const bajoEnCarro = itemEnCarro ? itemEnCarro.actual < itemEnCarro.requerido : false;
      const bajoEnFarmacia = stockTotalMed(m) <= m.stock_critico_alerta * 2;
      return bajoEnCarro || m.esencial_carro_paro || bajoEnFarmacia;
    });
  }, [meds, carroActivo]);

  const faltantesEnCarro = carroActivo.items.filter((i) => i.actual < i.requerido);
  const totalFaltantesCarro = useMemo(
    () => faltantesEnCarro.reduce((acc, it) => acc + Math.max(0, it.requerido - it.actual), 0),
    [faltantesEnCarro]
  );

  const totalUnidadesCanasta = useMemo(
    () => canasta.reduce((sum, it) => sum + it.cantidad, 0),
    [canasta]
  );

  // Funciones para armar la Canasta Multi-ítem
  const agregarACanasta = (
    medicamentoId: number,
    cantidad: number,
    nombreCustom?: string,
    concentracionCustom?: string
  ) => {
    const medCrud = meds.find((m) => m.id === medicamentoId);
    const itemCarro = carroActivo.items.find((ci) => ci.medicamentoId === medicamentoId);
    const nombre = nombreCustom ?? medCrud?.nombre_generico ?? itemCarro?.nombre ?? `Medicamento #${medicamentoId}`;
    const concentracion = concentracionCustom ?? medCrud?.concentracion ?? itemCarro?.concentracion ?? "";
    const loteFefo = medCrud?.lotes[0]?.numero_lote ?? `L24${medicamentoId}1`;

    setCanasta((prev) => {
      const idx = prev.findIndex((i) => i.medicamentoId === medicamentoId);
      if (idx >= 0) {
        const copia = [...prev];
        copia[idx] = {
          ...copia[idx],
          cantidad: copia[idx].cantidad + Math.max(1, cantidad),
        };
        return copia;
      }
      return [
        ...prev,
        {
          medicamentoId,
          nombre,
          concentracion,
          cantidad: Math.max(1, cantidad),
          loteFefo,
        },
      ];
    });

    avisar(`🛒 +${cantidad} u. de ${nombre} agregadas al pedido de ${carroActivo.id}.`);
  };

  const modificarCantidadCanasta = (medicamentoId: number, delta: number) => {
    setCanasta((prev) =>
      prev
        .map((it) => {
          if (it.medicamentoId !== medicamentoId) return it;
          const nueva = it.cantidad + delta;
          return nueva > 0 ? { ...it, cantidad: nueva } : null;
        })
        .filter((it): it is ItemCanasta => it !== null)
    );
  };

  const fijarCantidadCanasta = (medicamentoId: number, valor: number) => {
    const cantVal = Math.max(1, valor);
    setCanasta((prev) =>
      prev.map((it) => (it.medicamentoId === medicamentoId ? { ...it, cantidad: cantVal } : it))
    );
  };

  const quitarDeCanasta = (medicamentoId: number) => {
    setCanasta((prev) => prev.filter((it) => it.medicamentoId !== medicamentoId));
  };

  const vaciarCanasta = () => {
    setCanasta([]);
    avisar("Canasta de reposición vaciada.");
  };

  // Cargar rápidamente todos los fármacos con déficit en el carro hacia la canasta
  const cargarCriticosACanasta = () => {
    if (faltantesEnCarro.length === 0) {
      avisar(`El carro ${carroActivo.id} se encuentra con dotación completa al 100%.`);
      return;
    }

    setCanasta((prev) => {
      const copia = [...prev];
      for (const it of faltantesEnCarro) {
        const deficit = Math.max(1, it.requerido - it.actual);
        const idx = copia.findIndex((c) => c.medicamentoId === it.medicamentoId);
        const medCrud = meds.find((m) => m.id === it.medicamentoId);
        const loteFefo = medCrud?.lotes[0]?.numero_lote ?? `L24${it.medicamentoId}7`;

        if (idx >= 0) {
          copia[idx].cantidad = Math.max(copia[idx].cantidad, deficit);
        } else {
          copia.push({
            medicamentoId: it.medicamentoId,
            nombre: it.nombre,
            concentracion: it.concentracion,
            cantidad: deficit,
            loteFefo,
          });
        }
      }
      return copia;
    });

    avisar(
      `⚡ ${faltantesEnCarro.length} medicamentos críticos cargados a la canasta (+${totalFaltantesCarro} u.). Puede revisar o despachar el pedido.`
    );
  };

  // Despacho express de stock crítico en 1 solo clic
  const despacharReposicionCriticaInmediata = () => {
    if (faltantesEnCarro.length === 0) {
      avisar(`El carro ${carroActivo.id} ya se encuentra con su dotación óptima.`);
      return;
    }

    const items = faltantesEnCarro.map((it) => ({
      medicamentoId: it.medicamentoId,
      cantidad: Math.max(1, it.requerido - it.actual),
    }));
    const totalU = items.reduce((s, i) => s + i.cantidad, 0);

    const pedido = crearPedidoReposicionCarro({
      carroId: carroActivo.id,
      quienProvee: proveedorElegido,
      solicitadoPor: "Alejandra Rojas (TENS Farmacia)",
      motivo: `⚡ Reposición de emergencia por Stock Crítico (${faltantesEnCarro.length} ítems bajo meta)`,
      items,
    });

    if (pedido) {
      setPedidoRecienteId(pedido.id);
      avisar(
        `⚡ Solicitud ${pedido.id} por +${totalU} u. despachada en estado 'En camino'. Cuando llegue el carro al box, presione 'Aprobar y Recibir' en el Historial.`
      );
    }
  };

  // Emitir la canasta consolidada completa
  const emitirPedidoCanasta = () => {
    if (canasta.length === 0) {
      avisar("La canasta está vacía. Añada medicamentos antes de solicitar.");
      return;
    }

    const pedido = crearPedidoReposicionCarro({
      carroId: carroActivo.id,
      quienProvee: proveedorElegido,
      solicitadoPor: "Alejandra Rojas (TENS Farmacia)",
      motivo:
        motivoCanasta.trim() ||
        `Reposición integral y programada de dotación para ${carroActivo.tipo}`,
      items: canasta.map((it) => ({
        medicamentoId: it.medicamentoId,
        cantidad: it.cantidad,
      })),
    });

    if (pedido) {
      setPedidoRecienteId(pedido.id);
      const totalProds = canasta.length;
      const totalU = totalUnidadesCanasta;
      setCanasta([]);
      setMotivoCanasta("");
      avisar(
        `🚚 Solicitud ${pedido.id} emitida con éxito (${totalProds} productos · +${totalU} u.) con estado 'En camino'. Al arribar el carro físicamente, confirme la llegada en el Historial.`
      );
    }
  };

  const solicitarReposicionCompleta = (carro: CarroClinicoInfo) => {
    const itemsParaPedir = carro.items.map((it) => {
      const faltante = Math.max(0, it.requerido - it.actual);
      return {
        medicamentoId: it.medicamentoId,
        cantidad: faltante > 0 ? faltante : 10,
      };
    });

    const pedido = crearPedidoReposicionCarro({
      carroId: carro.id,
      quienProvee: proveedorElegido,
      solicitadoPor: "Alejandra Rojas (TENS Farmacia)",
      motivo: `Reposición integral de dotación para ${carro.tipo}`,
      items: itemsParaPedir,
    });

    if (pedido) {
      setPedidoRecienteId(pedido.id);
      avisar(
        `Solicitud ${pedido.id} generada ("En camino"). Al llegar el pedido, presione "Aprobar y Recibir" en el Historial para incorporar el stock.`
      );
    }
  };

  const cambiarEstado = (pedidoId: string, nuevoEstado: EstadoPedidoCarro) => {
    const exito = actualizarEstadoPedidoCarro(pedidoId, nuevoEstado);
    if (!exito) {
      avisar(`El pedido ${pedidoId} ya fue cerrado e inmutable. No permite cambios.`);
      return;
    }

    if (nuevoEstado === "Aceptado") {
      avisar(
        `✔ Pedido ${pedidoId} ACEPTADO Y RECIBIDO: Stock incorporado inmediatamente al carro clínico. Registro sellado e inmutable.`
      );
    } else if (nuevoEstado === "Cancelado") {
      avisar(`✖ Pedido ${pedidoId} CANCELADO: Solicitud anulada y archivada.`);
    }
  };

  // Pedidos filtrados para el historial
  const pedidosHistorial = useMemo(() => {
    if (filtroCarroHistorial === "TODOS") return pedidosCarro;
    return pedidosCarro.filter((p) => p.carroId === filtroCarroHistorial);
  }, [pedidosCarro, filtroCarroHistorial]);

  const cantEnCamino = pedidosCarro.filter((p) => p.estado === "En camino").length;
  const cantAceptados = pedidosCarro.filter((p) => p.estado === "Aceptado").length;
  const cantCancelados = pedidosCarro.filter((p) => p.estado === "Cancelado").length;

  return (
    <>
      <PageTitle
        icon={<Truck size={26} />}
        title="Solicitar Stock / Confirmar"
        subtitle="Armado de pedidos de reposición para Carros Clínicos y confirmación de llegada de stock en tiempo real"
      />

      <HelpBanner
        titulo="¿Cómo solicitar stock y confirmar la recepción de carros? Flujo en 3 pasos"
        pasos={[
          "Seleccione el carro clínico para revisar su dotación actual, medicamentos y fechas de vencimiento.",
          "Use el panel derecho para armar el carrito de reposición con los medicamentos solicitados y enviarlo a despacho.",
          "En el Historial de Llegadas, cuando arribe el pedido presione 'Aprobar y Recibir' para incorporar el stock al carro.",
        ]}
      />

      {/* ================= BLOQUE SUPERIOR: CARRO CLÍNICO + TRAZABILIDAD Y CATÁLOGO ================= */}
      <div className="mb-6 grid gap-6 lg:grid-cols-12">
        {/* ================= PANEL IZQUIERDO (8 COL): CARRO SELECCIONADO ================= */}
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-8">
          {/* Cabecera del Carro + Selector de Carros */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2.5">
              <ShoppingCart size={22} className="text-[#C4121A]" aria-hidden />
              <div>
                <h2 className="text-lg font-black text-[#1C0D0F]">
                  {carroActivo.id === "BOD-01" ? "Existencias de Bodega Central" : "Dotación del Carro Clínico"}
                </h2>
                <p className="text-xs text-slate-500">
                  {carroActivo.id === "BOD-01"
                    ? "Control de abastecimiento central y recepción directa desde CENABAST"
                    : "Control de stock asistencial en boxes y unidades clínicas"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {carros.map((c) => {
                const act = c.id === carroActivo.id;
                const label =
                  c.id === "BOD-01"
                    ? "🏛️ Bodega Central (Farmacia)"
                    : c.id === "CP-01"
                    ? "🚑 Carro de Paro (CP-01)"
                    : `💊 Carro Unidosis (${c.id})`;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCarroSeleccionadoId(c.id)}
                    className={`rounded-xl px-3.5 py-1.5 text-xs font-extrabold transition ${
                      act
                        ? "bg-[#C4121A] text-white shadow-sm"
                        : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}

              {faltantesEnCarro.length > 0 && (
                <button
                  type="button"
                  onClick={cargarCriticosACanasta}
                  className="inline-flex items-center gap-2 rounded-xl border-2 border-amber-600 bg-amber-400 px-4 py-2 text-xs font-black text-slate-950 shadow-md transition hover:bg-amber-300 hover:shadow-lg active:scale-95"
                  title="Cargar rápidamente los fármacos en stock crítico a la canasta"
                >
                  <Zap size={15} className="fill-amber-950 text-amber-950" aria-hidden />
                  <span className="tracking-wide">Reponer Stock Crítico</span>
                  <span className="rounded-full bg-slate-950 px-2 py-0.5 text-[11px] font-black text-amber-300 shadow-inner">
                    {faltantesEnCarro.length}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => solicitarReposicionCompleta(carroActivo)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#C4121A] px-3.5 py-1.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#9E0E15]"
              >
                <Plus size={14} aria-hidden />
                Reposición Integral (100% Meta)
              </button>
            </div>
          </div>

          {/* Sub-barra de metadatos y estado del carro */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#FAF0F1] px-4 py-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-bold text-[#1C0D0F]">
                ▣ {carroActivo.id} - {carroActivo.tipo} ({carroActivo.ubicacion})
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-3 py-0.5 font-extrabold ${
                  faltantesEnCarro.length === 0
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-900"
                }`}
              >
                <CheckCircle2 size={13} aria-hidden />
                {faltantesEnCarro.length === 0
                  ? "Dotación Completa"
                  : `${faltantesEnCarro.length} ítems bajo meta`}
              </span>
              <span className="font-mono text-[11px] font-bold text-slate-500">
                Sello: {carroActivo.sello}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-slate-600">
              <div>
                <span className="block text-[10px] text-slate-400">Última revisión</span>
                <strong className="text-[#1C0D0F]">{carroActivo.revision}</strong>
              </div>
              <div className="flex items-center gap-1.5">
                <UserRound size={15} className="text-[#B80F16]" aria-hidden />
                <div>
                  <span className="block text-[10px] text-slate-400">Responsable</span>
                  <strong className="text-[#1C0D0F]">Alejandra Rojas (TENS)</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Banner interactivo de Reposición Rápida de Stock Crítico */}
          {faltantesEnCarro.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 p-3.5 text-xs text-amber-950 shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
                  <AlertTriangle size={18} aria-hidden />
                </div>
                <div>
                  <p className="font-extrabold text-[#1C0D0F]">
                    Alerta de Stock Crítico Asistencial: {faltantesEnCarro.length} medicamento(s) bajo meta en {carroActivo.id}
                  </p>
                  <p className="text-[11px] text-amber-800">
                    Déficit total: <strong>{totalFaltantesCarro} unidades</strong> para la dotación mínima de seguridad clínica.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={cargarCriticosACanasta}
                  className="inline-flex items-center gap-2 rounded-xl border-2 border-amber-600 bg-amber-400 px-3.5 py-2 font-black text-slate-950 shadow-sm transition hover:bg-amber-300 active:scale-95"
                >
                  <ShoppingCart size={15} className="text-slate-950" aria-hidden />
                  <span>Cargar Críticos a la Canasta (+{totalFaltantesCarro} u.)</span>
                </button>
                <button
                  type="button"
                  onClick={despacharReposicionCriticaInmediata}
                  className="inline-flex items-center gap-1.5 rounded-xl border-2 border-orange-700 bg-orange-600 px-3.5 py-2 font-black text-white shadow-md transition hover:bg-orange-700 active:scale-95"
                >
                  <Zap size={14} aria-hidden />
                  ⚡ Reponer Críticos Inmediato (1 Clic)
                </button>
              </div>
            </div>
          )}

          {/* Tabla de medicamentos del carro activo */}
          <div className="overflow-x-auto rounded-xl border border-slate-200/90">
            <table className="w-full border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-[#FBEBEB] text-xs font-extrabold text-[#1C0D0F]">
                  <th className="px-4 py-3">Medicamento</th>
                  <th className="px-4 py-3">Lote FEFO</th>
                  <th className="px-4 py-3">Vencimiento</th>
                  <th className="px-4 py-3">Dotación Actual / Meta</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Armar Pedido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {carroActivo.items.map((item) => {
                  const medCrud = meds.find((m) => m.id === item.medicamentoId);
                  const loteStr = medCrud?.lotes[0]?.numero_lote ?? `L24${item.medicamentoId}7`;
                  const fechaVenc = medCrud?.lotes[0]?.fecha_vencimiento ?? enDias(item.dias);
                  const disponible = item.actual >= item.requerido;
                  const deficit = Math.max(0, item.requerido - item.actual);
                  const porcentaje = Math.min(100, Math.round((item.actual / item.requerido) * 100));
                  const enCanasta = canasta.find((c) => c.medicamentoId === item.medicamentoId);

                  return (
                    <tr key={`${carroActivo.id}-${item.medicamentoId}`} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="font-bold text-[#1C0D0F]">
                              {item.nombre} {item.concentracion}
                            </p>
                            <p className="text-[11px] text-slate-500">{medCrud?.categoria_nombre}</p>
                          </div>
                          {enCanasta && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-[#B80F16]">
                              🛒 {enCanasta.cantidad} u. en canasta
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{loteStr}</td>
                      <td className="px-4 py-3 text-slate-600">{fechaVenc}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-[#1C0D0F]">
                            {item.actual}{" "}
                            <span className="text-xs font-normal text-slate-400">
                              / {item.requerido}
                            </span>
                          </span>
                          <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className={`h-full rounded-full ${
                                disponible ? "bg-emerald-600" : "bg-amber-500"
                              }`}
                              style={{ width: `${porcentaje}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            disponible
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-900"
                          }`}
                        >
                          {disponible ? "Dotación OK" : "Bajo Stock"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {deficit > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                agregarACanasta(
                                  item.medicamentoId,
                                  deficit,
                                  item.nombre,
                                  item.concentracion
                                )
                              }
                              className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-black text-white shadow-xs transition hover:bg-amber-600"
                              title={`Cargar ${deficit} u. faltantes a la canasta de pedido`}
                            >
                              <Zap size={12} aria-hidden /> +{deficit} u. (Faltante)
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              agregarACanasta(
                                item.medicamentoId,
                                10,
                                item.nombre,
                                item.concentracion
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-[#C4121A]/30 bg-[#FDF2F2] px-2.5 py-1 text-xs font-bold text-[#B80F16] transition hover:bg-[#C4121A] hover:text-white"
                            title="Agregar +10 unidades a la canasta"
                          >
                            <Plus size={12} aria-hidden /> +10 u.
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ================= CANASTA / CARRITO DE SOLICITUD EN ARMADO ================= */}
          <div className="mt-4 rounded-xl border-2 border-dashed border-[#C4121A]/40 bg-[#FDF3F3] p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F8C8CB] pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#C4121A] text-white">
                  <ShoppingCart size={18} aria-hidden />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#1C0D0F]">
                    Canasta de Solicitud para {carroActivo.id} ({carroActivo.tipo})
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Arme su pedido consolidado con múltiples fármacos antes de despachar a bodega/CENABAST
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[#C4121A] px-3 py-0.5 text-xs font-black text-white shadow-xs">
                  {canasta.length} fármacos · {totalUnidadesCanasta} u.
                </span>
                {canasta.length > 0 && (
                  <button
                    type="button"
                    onClick={vaciarCanasta}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                    title="Vaciar todos los ítems de la canasta"
                  >
                    <Trash2 size={12} aria-hidden /> Vaciar
                  </button>
                )}
              </div>
            </div>

            {canasta.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-xs font-medium text-slate-500">
                  La canasta de solicitud está vacía. Añada medicamentos desde la tabla superior (+10 u., Faltante) o desde el Catálogo de la derecha.
                </p>
                {faltantesEnCarro.length > 0 && (
                  <button
                    type="button"
                    onClick={cargarCriticosACanasta}
                    className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl border-2 border-amber-600 bg-amber-400 px-3.5 py-1.5 text-xs font-black text-slate-950 shadow-sm transition hover:bg-amber-300"
                  >
                    <Zap size={14} className="fill-slate-950 text-slate-950" aria-hidden />
                    ⚡ Cargar {faltantesEnCarro.length} ítems en Stock Crítico a la Canasta (+{totalFaltantesCarro} u.)
                  </button>
                )}
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {/* Lista de medicamentos en la canasta */}
                <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                  {canasta.map((it) => (
                    <div
                      key={it.medicamentoId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-[#1C0D0F]">
                          {it.nombre} {it.concentracion}
                        </span>
                        <span className="ml-2 font-mono text-[11px] text-slate-500">
                          {it.loteFefo}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Selector de cantidad interactivo */}
                        <div className="flex items-center rounded-lg border border-slate-300 bg-slate-50">
                          <button
                            type="button"
                            onClick={() => modificarCantidadCanasta(it.medicamentoId, -5)}
                            className="px-2 py-0.5 text-xs font-black text-slate-600 hover:bg-slate-200"
                            title="Restar 5 unidades"
                          >
                            -5
                          </button>
                          <input
                            type="number"
                            min={1}
                            value={it.cantidad}
                            onChange={(e) =>
                              fijarCantidadCanasta(it.medicamentoId, Number(e.target.value))
                            }
                            className="w-12 bg-white text-center font-black text-[#1C0D0F] focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => modificarCantidadCanasta(it.medicamentoId, 5)}
                            className="px-2 py-0.5 text-xs font-black text-slate-600 hover:bg-slate-200"
                            title="Sumar 5 unidades"
                          >
                            +5
                          </button>
                          <span className="pr-2 text-[11px] font-bold text-slate-400">u.</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => quitarDeCanasta(it.medicamentoId)}
                          className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          title="Eliminar de la canasta"
                        >
                          <Trash2 size={14} aria-hidden />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Parámetros de la solicitud y Botón de Despacho */}
                <div className="grid gap-2 sm:grid-cols-12 pt-2 border-t border-[#F8C8CB]">
                  <div className="sm:col-span-5">
                    <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                      Proveedor que abastece:
                    </label>
                    <select
                      value={proveedorElegido}
                      onChange={(e) => setProveedorElegido(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800"
                    >
                      {PROVEEDORES_DISPONIBLES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-7 flex flex-col justify-end">
                    <button
                      type="button"
                      onClick={emitirPedidoCanasta}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#C4121A] to-[#C4121A] px-4 py-2.5 text-xs font-black text-white shadow-md transition hover:opacity-95"
                    >
                      <Truck size={16} aria-hidden />
                      Solicitar Carrito ({canasta.length} ítems · {totalUnidadesCanasta} u.) y Generar Estado de Llegada
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Banner de Pedido Recién Despachado (Estado de Llegada) */}
          {pedidoRecienteId && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50/70 p-3 text-xs text-red-950 shadow-xs">
              <div className="flex items-center gap-2">
                <Truck size={18} className="text-[#C4121A]" aria-hidden />
                <div>
                  <p className="font-extrabold text-[#1C0D0F]">
                    Pedido {pedidoRecienteId} despachado hacia {carroActivo.id}
                  </p>
                  <p className="text-[11px] text-red-800">
                    Estado: <strong>En camino (En tránsito)</strong>. Al llegar físicamente, presione "Aprobar y Recibir" en el Historial inferior para sumar el stock.
                  </p>
                </div>
              </div>

              <a
                href="#historial-carros"
                className="inline-flex items-center gap-1 rounded-lg bg-[#C4121A] px-3 py-1 font-bold text-white hover:bg-[#9E0E15]"
              >
                Ver en Historial
              </a>
            </div>
          )}
        </section>

        {/* ================= PANEL DERECHO (4 COL): TRAZABILIDAD DEL MEDICAMENTO & CATÁLOGO ================= */}
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-4">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <h2 className="flex items-center gap-2 text-base font-black text-[#1C0D0F]">
              <Barcode size={20} className="text-[#C4121A]" aria-hidden />
              <span>Solicitar Stock desde Catálogo</span>
            </h2>
            {meds.length < 20 && (
              <button
                type="button"
                onClick={() => {
                  const n = inyectar20MedicamentosReales();
                  avisar(`${n} medicamentos reales cargados al catálogo.`);
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-[#FDE8E8] px-2.5 py-1 text-[11px] font-extrabold text-[#B80F16] hover:bg-[#F8C8CB]"
              >
                <Sparkles size={12} aria-hidden /> +20 Meds
              </button>
            )}
          </div>

          {/* Buscador de Producto en CRUD */}
          <div>
            <label
              htmlFor="buscar-trazabilidad-crud"
              className="mb-1 block text-xs font-bold text-slate-600"
            >
              Buscar producto en el catálogo ({meds.length} disponibles):
            </label>
            <div className="flex items-stretch">
              <input
                id="buscar-trazabilidad-crud"
                type="search"
                value={busquedaTrazabilidad}
                onChange={(e) => setBusquedaTrazabilidad(e.target.value)}
                placeholder="Nombre, concentración o código..."
                className="w-full rounded-l-xl border border-r-0 border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-[#B80F16] focus:outline-none"
              />
              <span className="flex items-center justify-center rounded-r-xl bg-[#C4121A] px-3.5 text-white">
                <Search size={16} aria-hidden />
              </span>
            </div>
          </div>

          {/* Píldoras rápidas de selección */}
          <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto py-1">
            {resultadosCrud.slice(0, 8).map((m) => {
              const sel = medFoco?.id === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMedIdSeleccionado(m.id)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                    sel ? "bg-[#C4121A] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {m.nombre_generico} {m.concentracion}
                </button>
              );
            })}
          </div>

          {/* Tarjeta Informativa del Producto Seleccionado */}
          {medFoco && (
            <div className="rounded-xl border border-[#F8C8CB] bg-[#FDF4F4] p-4 text-xs">
              <div className="mb-2.5 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F8C8CB] text-[#B80F16]">
                  <Pill size={20} aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-black text-[#1C0D0F]">
                    {medFoco.nombre_generico} {medFoco.concentracion}
                  </p>
                  <p className="text-[11px] text-slate-500">{medFoco.forma_farmaceutica}</p>
                </div>
              </div>

              <dl className="space-y-1.5 border-t border-[#F8C8CB] pt-2">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Lote FEFO:</dt>
                  <dd className="font-mono font-bold text-[#1C0D0F]">
                    {medFoco.lotes[0]?.numero_lote ?? "L24567"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Caducidad:</dt>
                  <dd className="font-bold text-[#1C0D0F]">
                    {medFoco.lotes[0]?.fecha_vencimiento ?? "2027-12"} ({menorDiasMed(medFoco)}d)
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Stock en Bodega Central:</dt>
                  <dd className="font-extrabold text-[#B80F16]">{stockBodegaMed(medFoco)} u.</dd>
                </div>
              </dl>

              {/* Formulario de Solicitud hacia el Carro */}
              <div className="mt-3 space-y-2 border-t border-[#F8C8CB] pt-2.5">
                <label className="block text-[11px] font-bold text-[#1C0D0F]">
                  Proveedor que abastece:
                </label>
                <select
                  value={proveedorElegido}
                  onChange={(e) => setProveedorElegido(e.target.value)}
                  aria-label="Seleccionar proveedor de abastecimiento"
                  className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800"
                >
                  {PROVEEDORES_DISPONIBLES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-2 pt-1">
                  <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1">
                    <span className="text-[11px] font-bold text-slate-600">Cant:</span>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={cantidadPedirCrud}
                      onChange={(e) => setCantidadPedirCrud(Math.max(1, Number(e.target.value)))}
                      aria-label="Cantidad a solicitar al carro"
                      className="w-14 text-center text-xs font-extrabold text-[#1C0D0F] focus:outline-none"
                    />
                    <span className="text-[11px] font-bold text-slate-500">u.</span>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      agregarACanasta(
                        medFoco.id,
                        cantidadPedirCrud,
                        medFoco.nombre_generico,
                        medFoco.concentracion
                      )
                    }
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#C4121A] px-3 py-2 text-xs font-black text-white shadow-sm transition hover:bg-[#9E0E15]"
                  >
                    <ShoppingCart size={14} aria-hidden />
                    + Añadir {cantidadPedirCrud} u. a Canasta
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Recomendaciones de fármacos con bajo stock */}
          <div className="pt-1">
            <p className="mb-1.5 text-xs font-extrabold text-[#1C0D0F]">
              Sugeridos para reforzar este carro:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {productosRecomendadosBajoStock.slice(0, 5).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() =>
                    agregarACanasta(m.id, 15, m.nombre_generico, m.concentracion)
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-950 transition hover:bg-amber-100"
                  title="Agregar +15 unidades a la canasta de solicitud"
                >
                  <Plus size={12} aria-hidden />
                  {m.nombre_generico} (+15)
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ================= BLOQUE INFERIOR (12 COLUMNAS): HISTORIAL OFICIAL DE MOVIMIENTOS HACIA ABAJO ================= */}
      <section id="historial-carros" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {/* Cabecera del Historial con Filtros y Métricas */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-black text-[#1C0D0F]">
              <History size={22} className="text-[#C4121A]" aria-hidden />
              <span>Historial Oficial de Trazabilidad y Recepción de Pedidos</span>
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Bitácora de movimientos y reposiciones hacia carros clínicos · Una vez <strong>Aprobado</strong> el registro es sellado e inmutable (no hay vuelta atrás).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Filtro por Carro */}
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs">
              <span className="font-bold text-slate-600">Filtrar por Carro:</span>
              <select
                value={filtroCarroHistorial}
                onChange={(e) => setFiltroCarroHistorial(e.target.value)}
                aria-label="Filtrar historial por carro"
                className="bg-transparent font-extrabold text-[#1C0D0F] focus:outline-none"
              >
                <option value="TODOS">Todos los Carros Clínicos ({pedidosCarro.length})</option>
                {carros.map((c) => (
                  <option key={c.id} value={c.id}>
                    Solo Carro {c.id} ({c.tipo})
                  </option>
                ))}
              </select>
            </div>

            {/* Badges de Conteo de Estados */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2.5 py-1 font-extrabold text-amber-900">
                <Clock size={12} aria-hidden /> {cantEnCamino} En camino
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1 font-extrabold text-emerald-900">
                <CheckCircle2 size={12} aria-hidden /> {cantAceptados} Aprobados
              </span>
              {cantCancelados > 0 && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-red-100 px-2.5 py-1 font-extrabold text-red-900">
                  <XCircle size={12} aria-hidden /> {cantCancelados} Cancelados
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tabla de Historial con Registros hacia Abajo */}
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full border-collapse text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-[#FBEBEB] text-xs font-extrabold uppercase tracking-wider text-[#1C0D0F]">
                <th className="px-4 py-3.5">Folio & Solicitud</th>
                <th className="px-4 py-3.5">Carro Clínico Destino</th>
                <th className="px-4 py-3.5">Trazabilidad (Quién Solicita y Quién Provee)</th>
                <th className="px-4 py-3.5">Insumos y Cantidades Solicitadas</th>
                <th className="px-4 py-3.5">Estado / Llegada al Carro</th>
                <th className="px-4 py-3.5 text-center">Gestión de Aprobación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {pedidosHistorial.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                    No se registran movimientos para el filtro seleccionado.
                  </td>
                </tr>
              ) : (
                pedidosHistorial.map((ped) => {
                  const totalUnidades = ped.items.reduce((s, it) => s + it.cantidad, 0);
                  const estaAceptado = ped.estado === "Aceptado";
                  const estaCancelado = ped.estado === "Cancelado";
                  const estaEnCamino = ped.estado === "En camino";

                  return (
                    <tr
                      key={ped.id}
                      className={`transition ${
                        estaAceptado
                          ? "bg-emerald-50/30 hover:bg-emerald-50/60"
                          : estaCancelado
                          ? "bg-slate-50/80 opacity-75"
                          : "hover:bg-amber-50/40"
                      }`}
                    >
                      {/* Folio y Fecha/Hora */}
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-sm font-black text-[#1C0D0F]">
                          {ped.id}
                        </span>
                        <span className="block text-xs font-medium text-slate-500">
                          {ped.fechaHora}
                        </span>
                      </td>

                      {/* Carro Destino */}
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1 rounded-md bg-[#FDE8E8] px-2 py-0.5 text-xs font-extrabold text-[#B80F16]">
                          <ShoppingCart size={13} aria-hidden />
                          {ped.carroNombre}
                        </span>
                        <p className="mt-1 text-[11px] text-slate-500 italic">
                          {ped.motivo}
                        </p>
                      </td>

                      {/* Quién Solicita y Quién Provee */}
                      <td className="px-4 py-3.5">
                        <p className="font-bold text-[#1C0D0F]">
                          Solicita: <span className="font-normal">{ped.solicitadoPor}</span>
                        </p>
                        <p className="text-xs text-slate-600">
                          <strong>Provee:</strong> {ped.quienProvee}
                        </p>
                      </td>

                      {/* Insumos y Cantidad */}
                      <td className="px-4 py-3.5">
                        <p className="font-extrabold text-[#B80F16]">
                          Total: +{totalUnidades} unidades físicas
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

                      {/* Estado y Llegada */}
                      <td className="px-4 py-3.5">
                        {estaAceptado ? (
                          <div>
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-900 shadow-sm">
                              <PackageCheck size={14} aria-hidden />
                              Llegó y Sumado (+Stock)
                            </span>
                            {ped.fechaRecepcion && (
                              <p className="mt-1 text-[11px] font-semibold text-emerald-800">
                                Recepción: {ped.fechaRecepcion}
                              </p>
                            )}
                          </div>
                        ) : estaCancelado ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-900">
                            <XCircle size={14} aria-hidden />
                            Cancelado (Sin Stock)
                          </span>
                        ) : (
                          <div>
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-900">
                              <Clock size={14} aria-hidden />
                              En camino (En tránsito)
                            </span>
                            <p className="mt-1 text-[11px] text-amber-800">
                              Pendiente de recepción física
                            </p>
                          </div>
                        )}
                      </td>

                      {/* Gestión de Aprobación (Inmutable tras Aprobado) */}
                      <td className="px-4 py-3.5 text-center">
                        {estaEnCamino ? (
                          <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:justify-center">
                            {/* Botón Aceptar / Aprobar */}
                            <button
                              type="button"
                              onClick={() => cambiarEstado(ped.id, "Aceptado")}
                              className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-black text-white shadow-sm transition hover:bg-emerald-800"
                              title="Confirmar llegada: suma el stock al carro y sella el registro"
                            >
                              <ShieldCheck size={14} aria-hidden />
                              Aprobar y Recibir (+Stock)
                            </button>

                            {/* Botón Cancelar */}
                            <button
                              type="button"
                              onClick={() => cambiarEstado(ped.id, "Cancelado")}
                              className="inline-flex items-center gap-1 rounded-xl border border-red-300 bg-white px-2.5 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-50"
                              title="Anular solicitud sin afectar inventario"
                            >
                              <XCircle size={14} aria-hidden />
                              Cancelar
                            </button>
                          </div>
                        ) : estaAceptado ? (
                          /* Estado Sellado e Inmutable (Sin Vuelta Atrás) */
                          <div className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-extrabold text-emerald-950">
                            <Lock size={13} className="text-emerald-700" aria-hidden />
                            <span>Aprobado Definitivo · Registro Cerrado</span>
                          </div>
                        ) : (
                          /* Cancelado Inmutable */
                          <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
                            <Lock size={13} aria-hidden />
                            <span>Anulado · Registro Cerrado</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
};

