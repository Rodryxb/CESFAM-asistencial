import React, { useMemo, useState } from "react";
import {
  Boxes,
  CalendarClock,
  CheckCircle2,
  Edit3,
  FilePlus2,
  Layers,
  Lock,
  PackagePlus,
  Pill,
  Plus,
  Search,
  Stethoscope,
  Store,
  Trash2,
  X,
} from "lucide-react";
import { HelpBanner, PageTitle, Semaforo } from "../components/ui";
import {
  actualizarMedicamentoCRUD,
  agregarMedicamentoARecetaDemo,
  ajustarStockMedicamentoCRUD,
  crearMedicamentoCRUD,
  eliminarMedicamentoCRUD,
  menorDiasMed,
  NuevoMedicamentoInput,
  semaforoDeDias,
  stockBodegaMed,
  stockTotalMed,
  stockVitrinaMed,
  useMedicamentos,
} from "../data/demo";
import { CodigoRolRBAC, MedicamentoArsenal, TipoControlISP } from "../types/cesfam";

const FORM_VACIO: NuevoMedicamentoInput = {
  nombre_generico: "",
  concentracion: "",
  forma_farmaceutica: "Comprimido",
  categoria_nombre: "Arsenal APS MINSAL",
  descripcion: "",
  stock_bodega: 200,
  stock_vitrina: 60,
  dias_para_vencer: 240,
  stock_critico_alerta: 50,
  es_controlado: false,
  tipo_controlado: "NO_CONTROLADO",
  esencial_carro_paro: false,
  requiere_cadena_frio: false,
};

interface Props {
  rol: CodigoRolRBAC;
  setRol?: (r: CodigoRolRBAC) => void;
  avisar: (m: string) => void;
}

export const ProductosRecetar: React.FC<Props> = ({ rol, avisar }) => {
  const { meds } = useMedicamentos();
  const [busqueda, setBusqueda] = useState("");
  const [filtroCat, setFiltroCat] = useState("TODAS");
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<NuevoMedicamentoInput>(FORM_VACIO);

  const esAdmin = rol === "ADMIN";

  const categorias = useMemo(() => {
    const set = new Set(meds.map((m) => m.categoria_nombre || "Arsenal APS"));
    return ["TODAS", ...Array.from(set)];
  }, [meds]);

  const medsFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return meds.filter((m) => {
      const coincideCat = filtroCat === "TODAS" || m.categoria_nombre === filtroCat;
      const coincideTexto =
        !q ||
        m.nombre_generico.toLowerCase().includes(q) ||
        m.concentracion.toLowerCase().includes(q) ||
        (m.descripcion ?? "").toLowerCase().includes(q) ||
        m.codigo_cenabast.toLowerCase().includes(q);
      return coincideCat && coincideTexto;
    });
  }, [meds, busqueda, filtroCat]);

  const abrirNuevo = () => {
    if (!esAdmin) {
      avisar("Acceso restringido: Solo el Administrador puede registrar nuevos medicamentos.");
      return;
    }
    setEditandoId(null);
    setForm(FORM_VACIO);
    setMostrarFormulario(true);
  };

  const abrirEdicion = (m: MedicamentoArsenal) => {
    if (!esAdmin) {
      avisar("Acceso restringido: Solo el Administrador puede editar medicamentos.");
      return;
    }
    setEditandoId(m.id);
    setForm({
      nombre_generico: m.nombre_generico,
      concentracion: m.concentracion,
      forma_farmaceutica: m.forma_farmaceutica,
      categoria_nombre: m.categoria_nombre,
      descripcion: m.descripcion || "",
      stock_bodega: stockBodegaMed(m),
      stock_vitrina: stockVitrinaMed(m),
      dias_para_vencer: menorDiasMed(m),
      stock_critico_alerta: m.stock_critico_alerta,
      es_controlado: m.es_controlado,
      tipo_controlado: m.tipo_controlado,
      esencial_carro_paro: m.esencial_carro_paro,
      requiere_cadena_frio: m.requiere_cadena_frio,
    });
    setMostrarFormulario(true);
  };

  const guardarProducto = (e: React.FormEvent) => {
    e.preventDefault();
    if (!esAdmin) {
      avisar("Acceso denegado: Se requiere rol Administrador.");
      return;
    }
    if (!form.nombre_generico.trim() || !form.concentracion.trim()) {
      avisar("Complete al menos el nombre genérico y la concentración.");
      return;
    }
    if (editandoId !== null) {
      actualizarMedicamentoCRUD(editandoId, form);
      avisar(`Producto "${form.nombre_generico}" actualizado correctamente.`);
    } else {
      const creado = crearMedicamentoCRUD(form);
      avisar(`Nuevo producto "${creado.nombre_generico}" registrado en el arsenal oficial.`);
    }
    setMostrarFormulario(false);
    setEditandoId(null);
    setForm(FORM_VACIO);
  };

  const eliminarProducto = (m: MedicamentoArsenal) => {
    if (!esAdmin) {
      avisar("Acceso restringido: Solo el Administrador puede dar de baja medicamentos.");
      return;
    }
    eliminarMedicamentoCRUD(m.id);
    avisar(`Producto "${m.nombre_generico}" dado de baja del catálogo.`);
  };

  const recetarAPaciente = (m: MedicamentoArsenal) => {
    agregarMedicamentoARecetaDemo(
      m.id,
      30,
      `1 ${m.forma_farmaceutica.toLowerCase()} de ${m.concentracion} cada 12 o 24 hrs según protocolo APS`
    );
    avisar(`"${m.nombre_generico} ${m.concentracion}" agregado a la receta activa de María González (12345678-5).`);
  };

  return (
    <>
      <PageTitle
        icon={<PackagePlus />}
        title="Productos para Recetar y Arsenal Farmacológico"
        subtitle="Catálogo oficial de medicamentos gratuitos APS · Conectado en tiempo real con Recetas y Carros Clínicos"
      />

      <HelpBanner
        titulo="¿Cómo usar el Catálogo de Productos para Recetar? 3 pasos"
        pasos={[
          "Revise los medicamentos registrados y sus existencias en vitrina y bodega central.",
          "Busque cualquier fármaco y presione “Recetar” para cargarlo a la entrega de la paciente.",
          "Con el rol Administrador, gestione el registro de nuevos fármacos, edición de fichas y bajas del arsenal oficial.",
        ]}
      />

      {/* Barra superior de acciones: Registro de Nuevos Fármacos */}
      <div className="card mb-6 space-y-4 border-2 border-[#F5C2C6] bg-gradient-to-r from-white via-[#FCF0F1] to-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#C4121A] text-white">
                <Boxes size={18} aria-hidden />
              </span>
              <p className="text-xl font-extrabold text-[#9E0E15]">
                Arsenal Farmacológico Activo: <span className="rounded-md bg-[#FDE8E8] px-2 py-0.5 text-[#9E0E15] font-black">{meds.length}</span> fármacos registrados
              </p>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Catálogo oficial de medicamentos APS del CESFAM. Disponibles para prescripción médica directa, preparación de dispensación a pacientes y abastecimiento de Carros Clínicos.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {esAdmin ? (
              <button
                type="button"
                onClick={abrirNuevo}
                className="btn bg-emerald-700 text-white shadow hover:bg-emerald-800"
              >
                <Plus size={18} aria-hidden />
                Crear Nuevo Producto
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-400 opacity-80"
                title="Acción restringida: solo el Administrador del sistema puede registrar nuevos medicamentos en el arsenal"
              >
                <Lock size={16} aria-hidden />
                Crear Nuevo Producto (Bloqueado · Solo Admin)
              </button>
            )}
          </div>
        </div>

        {/* Guía Rápida de Operación para el Personal Asistencial */}
        <div className="grid gap-2 rounded-xl border border-[#F5C2C6] bg-[#FCF0F1] p-3 text-xs sm:grid-cols-3">
          <div className="flex items-start gap-2">
            <Store className="mt-0.5 shrink-0 text-[#C4121A]" size={16} aria-hidden />
            <div>
              <strong className="text-[#9E0E15]">¿Qué es Vitrina?</strong>
              <p className="text-slate-600">Stock físico en mesones de farmacia para entrega inmediata en ventanilla.</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Boxes className="mt-0.5 shrink-0 text-[#C4121A]" size={16} aria-hidden />
            <div>
              <strong className="text-[#9E0E15]">¿Qué es Bodega?</strong>
              <p className="text-slate-600">Almacén central del CESFAM. Desde aquí se reponen vitrinas y carros clínicos.</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <FilePlus2 className="mt-0.5 shrink-0 text-emerald-700" size={16} aria-hidden />
            <div>
              <strong className="text-emerald-900">¿Qué hace "Recetar"?</strong>
              <p className="text-slate-600">Añade 30 unidades a la receta de la paciente en curso para retiro en farmacia.</p>
            </div>
          </div>
        </div>

        {/* Buscador y filtro por categoría */}
        <div className="grid gap-3 pt-1 md:grid-cols-3">
          <div className="relative md:col-span-2">
            <Search className="pointer-events-none absolute left-3.5 top-3.5 text-slate-400" size={19} aria-hidden />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por fármaco (ej. Paracetamol, Losartán), concentración, indicación o código CENABAST..."
              className="input pl-11"
            />
          </div>
          <select
            value={filtroCat}
            onChange={(e) => setFiltroCat(e.target.value)}
            aria-label="Filtrar por categoría farmacológica"
            className="input font-semibold"
          >
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c === "TODAS" ? "Todas las categorías farmacológicas" : c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Formulario Modal / Desplegable exclusivo para Administrador */}
      {esAdmin && mostrarFormulario && (
        <section
          aria-label="Formulario de Ficha de Medicamento"
          className="card mb-6 border-2 border-[#C4121A] bg-[#FCF0F1]/30"
        >
          <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
            <h2 className="text-xl font-extrabold text-[#9E0E15]">
              {editandoId !== null ? "Editar Producto Farmacéutico y Stock" : "Crear Nuevo Producto Farmacéutico"}
            </h2>
            <button
              type="button"
              onClick={() => setMostrarFormulario(false)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-200"
              aria-label="Cerrar formulario"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={guardarProducto} className="grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-sm font-bold">Nombre Genérico (DCI) *</span>
              <input
                required
                className="input bg-white"
                placeholder="Ej: Ketorolaco Trometamol"
                value={form.nombre_generico}
                onChange={(e) => setForm({ ...form, nombre_generico: e.target.value })}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-bold">Concentración / Dosis *</span>
              <input
                required
                className="input bg-white"
                placeholder="Ej: 30 mg/mL o 500 mg"
                value={form.concentracion}
                onChange={(e) => setForm({ ...form, concentracion: e.target.value })}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-bold">Forma Farmacéutica</span>
              <select
                className="input bg-white"
                value={form.forma_farmaceutica}
                onChange={(e) => setForm({ ...form, forma_farmaceutica: e.target.value })}
              >
                <option value="Comprimido">Comprimido</option>
                <option value="Cápsula">Cápsula</option>
                <option value="Ampolla">Ampolla</option>
                <option value="Frasco Ampolla">Frasco Ampolla</option>
                <option value="Inhalador">Inhalador</option>
                <option value="Frasco">Frasco</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-bold">Categoría Clínica</span>
              <input
                className="input bg-white"
                placeholder="Ej: Cardiovascular FOFAR"
                value={form.categoria_nombre}
                onChange={(e) => setForm({ ...form, categoria_nombre: e.target.value })}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-bold">Stock en Bodega Central</span>
              <input
                type="number"
                min={0}
                className="input bg-white"
                value={form.stock_bodega}
                onChange={(e) => setForm({ ...form, stock_bodega: Number(e.target.value) })}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-bold">Stock en Vitrina Dispensación</span>
              <input
                type="number"
                min={0}
                className="input bg-white"
                value={form.stock_vitrina}
                onChange={(e) => setForm({ ...form, stock_vitrina: Number(e.target.value) })}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-bold">Vigencia Lote FEFO (Días para vencer)</span>
              <input
                type="number"
                min={1}
                className="input bg-white"
                value={form.dias_para_vencer}
                onChange={(e) => setForm({ ...form, dias_para_vencer: Number(e.target.value) })}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-bold">Umbral Stock Crítico (Alerta)</span>
              <input
                type="number"
                min={1}
                className="input bg-white"
                value={form.stock_critico_alerta}
                onChange={(e) => setForm({ ...form, stock_critico_alerta: Number(e.target.value) })}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-bold">Control Legal ISP</span>
              <select
                className="input bg-white"
                value={form.es_controlado ? form.tipo_controlado : "NO_CONTROLADO"}
                onChange={(e) => {
                  const val = e.target.value as TipoControlISP;
                  setForm({
                    ...form,
                    es_controlado: val !== "NO_CONTROLADO",
                    tipo_controlado: val,
                  });
                }}
              >
                <option value="NO_CONTROLADO">No Controlado (Estándar APS)</option>
                <option value="PSICOTROPICO">Psicotrópico (D.S. 405 ISP - Receta Retenida)</option>
                <option value="ESTUPEFACIENTE">Estupefaciente (D.S. 404 ISP - Receta Retenida)</option>
              </select>
            </label>

            <label className="block md:col-span-3">
              <span className="mb-1 block text-sm font-bold">Descripción Clínica e Indicación para Recetar *</span>
              <textarea
                rows={2}
                required
                className="input bg-white"
                placeholder="Describa para qué patología GES/Crónicos o urgencia se receta este medicamento..."
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              />
            </label>

            <div className="flex flex-wrap items-center gap-6 md:col-span-3">
              <label className="flex cursor-pointer items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={form.esencial_carro_paro}
                  onChange={(e) => setForm({ ...form, esencial_carro_paro: e.target.checked })}
                />
                <span>Recomendado / Esencial para Carro Clínico (Paro o Unidosis)</span>
              </label>

              <label className="flex cursor-pointer items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={form.requiere_cadena_frio}
                  onChange={(e) => setForm({ ...form, requiere_cadena_frio: e.target.checked })}
                />
                <span>Requiere Cadena de Frío (2°C - 8°C)</span>
              </label>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-3 md:col-span-3">
              <button type="button" onClick={() => setMostrarFormulario(false)} className="btn rounded-xl border-2 border-[#C4121A] bg-white text-[#C4121A] hover:bg-[#FDE8E8]">
                Cancelar
              </button>
              <button type="submit" className="btn rounded-xl bg-[#C4121A] text-white hover:bg-[#9E0E15]">
                <CheckCircle2 size={20} aria-hidden />
                {editandoId !== null ? "Guardar Cambios del Producto" : "Crear Producto en el Catálogo"}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Listado de tarjetas de productos estructuradas con jerarquía visual y explicación operativa */}
      <div className="grid gap-5 md:grid-cols-2">
        {medsFiltrados.map((m) => {
          const bod = stockBodegaMed(m);
          const vit = stockVitrinaMed(m);
          const total = stockTotalMed(m);
          const dias = menorDiasMed(m);
          const lotePrincipal = m.lotes[0]?.numero_lote ?? "LOT-FEFO";
          const semaforoNivel = semaforoDeDias(dias, total, m.stock_critico_alerta);

          return (
            <article
              key={m.id}
              className="card flex flex-col justify-between border border-slate-200/90 shadow-sm transition-shadow hover:shadow-md"
            >
              {/* Parte Superior: Identificación y Clasificación Farmacológica */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-[#FDE8E8] px-2 py-0.5 text-xs font-extrabold text-[#9E0E15]">
                        {m.codigo_cenabast}
                      </span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                        {m.categoria_nombre}
                      </span>
                    </div>

                    <h2 className="text-xl font-black text-slate-900">
                      {m.nombre_generico}{" "}
                      <span className="rounded-lg bg-[#FDE8E8] px-2 py-0.5 text-[#9E0E15] font-extrabold">
                        {m.concentracion}
                      </span>
                    </h2>

                    <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-600">
                      <span className="flex items-center gap-1">
                        <Pill size={14} className="text-[#C4121A]" aria-hidden />
                        Forma: <strong className="text-slate-800">{m.forma_farmaceutica}</strong>
                      </span>
                      <span className="flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-amber-900">
                        <CalendarClock size={14} aria-hidden />
                        Lote FEFO: <strong className="font-mono">{lotePrincipal}</strong> (vence en {dias} días)
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 pt-0.5">
                    <Semaforo nivel={semaforoNivel} />
                  </div>
                </div>

                {/* Bloque Clínico: ¿Para qué sirve y cuándo se receta este fármaco en CESFAM? */}
                <div className="rounded-xl border border-[#FCE1E3] bg-gradient-to-br from-[#FCF0F1] to-slate-50/60 p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-[#9E0E15]">
                    <Stethoscope size={15} aria-hidden />
                    <span>Indicación Asistencial y Uso Clínico:</span>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-700">
                    {m.descripcion || "Medicamento del arsenal farmacológico de atención primaria de salud (APS)."}
                  </p>

                  {/* Etiquetas Normativas Específicas */}
                  <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs font-bold">
                    {m.es_controlado && (
                      <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-purple-900">
                        🔒 Receta Retenida ISP ({m.tipo_controlado})
                      </span>
                    )}
                    {m.esencial_carro_paro && (
                      <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-red-900">
                        🚑 Fármaco Crítico Carro de Paro
                      </span>
                    )}
                    {m.requiere_cadena_frio && (
                      <span className="rounded-full bg-cyan-100 px-2.5 py-0.5 text-cyan-900">
                        ❄️ Cadena de Frío (2°C - 8°C)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Parte Inferior: Disponibilidad Física (Vitrina vs Bodega) + Operación */}
              <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500">
                  <span>Disponibilidad Física en CESFAM</span>
                  <span className="text-[11px] font-normal text-slate-400">Bodega vs. Mesón de Entrega</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {/* Vitrina / Ventanilla */}
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-2.5 text-center">
                    <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-slate-600">
                      <Store size={13} className="text-[#C4121A]" aria-hidden />
                      <span>En Ventanilla</span>
                    </div>
                    <p className="my-0.5 text-xl font-black text-slate-900">{vit} <span className="text-xs font-semibold text-slate-500">u.</span></p>
                    <p className="text-[10px] leading-tight text-slate-500">Listo para entrega inmediata</p>

                    {esAdmin && (
                      <div className="mt-1.5 flex justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            ajustarStockMedicamentoCRUD(m.id, 0, -10);
                            avisar(`-10 u. en Vitrina para ${m.nombre_generico}`);
                          }}
                          title="Restar 10 unidades de vitrina"
                          className="rounded bg-slate-200 px-2 py-0.5 text-xs font-extrabold text-slate-700 hover:bg-slate-300"
                        >
                          -10
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            ajustarStockMedicamentoCRUD(m.id, 0, 25);
                            avisar(`+25 u. en Vitrina para ${m.nombre_generico}`);
                          }}
                          title="Sumar 25 unidades a vitrina"
                          className="rounded bg-[#C4121A] px-2 py-0.5 text-xs font-extrabold text-white hover:bg-[#9E0E15]"
                        >
                          +25
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Bodega Central */}
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-2.5 text-center">
                    <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-slate-600">
                      <Boxes size={13} className="text-[#C4121A]" aria-hidden />
                      <span>En Bodega</span>
                    </div>
                    <p className="my-0.5 text-xl font-black text-slate-900">{bod} <span className="text-xs font-semibold text-slate-500">u.</span></p>
                    <p className="text-[10px] leading-tight text-slate-500">Reserva central CESFAM</p>

                    {esAdmin && (
                      <div className="mt-1.5 flex justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            ajustarStockMedicamentoCRUD(m.id, -20, 0);
                            avisar(`-20 u. en Bodega para ${m.nombre_generico}`);
                          }}
                          title="Restar 20 unidades de bodega"
                          className="rounded bg-slate-200 px-2 py-0.5 text-xs font-extrabold text-slate-700 hover:bg-slate-300"
                        >
                          -20
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            ajustarStockMedicamentoCRUD(m.id, 50, 0);
                            avisar(`+50 u. en Bodega para ${m.nombre_generico}`);
                          }}
                          title="Sumar 50 unidades a bodega"
                          className="rounded bg-[#C4121A] px-2 py-0.5 text-xs font-extrabold text-white hover:bg-[#9E0E15]"
                        >
                          +50
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Stock Total Consolidado */}
                  <div className="rounded-xl border border-[#F5C2C6] bg-[#FCF0F1] p-2.5 text-center">
                    <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-[#9E0E15]">
                      <Layers size={13} aria-hidden />
                      <span>Total CESFAM</span>
                    </div>
                    <p className="my-0.5 text-xl font-black text-[#9E0E15]">{total} <span className="text-xs font-semibold text-[#C4121A]">u.</span></p>
                    <p className="text-[10px] font-medium leading-tight text-slate-600">
                      Mínimo: ≤{m.stock_critico_alerta} u.
                    </p>
                  </div>
                </div>

                {/* Zona de Acciones con Explicación Intuitiva para el Usuario */}
                <div className="space-y-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => recetarAPaciente(m)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#C4121A] !py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#9E0E15] hover:shadow"
                  >
                    <FilePlus2 size={18} aria-hidden />
                    Recetar y Cargar a Entrega de Paciente
                  </button>
                  <p className="text-center text-[11px] text-slate-500">
                    Carga 30 unidades a la receta activa para retiro de la paciente en ventanilla de farmacia.
                  </p>

                  {esAdmin && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => abrirEdicion(m)}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-[#C4121A] bg-white !py-2 text-xs font-bold text-[#C4121A] transition hover:bg-[#FDE8E8]"
                        title="Modificar ficha, lote, concentración o descripción"
                      >
                        <Edit3 size={15} aria-hidden />
                        Editar Ficha del Producto
                      </button>
                      <button
                        type="button"
                        onClick={() => eliminarProducto(m)}
                        className="btn-danger flex-1 justify-center !py-2 text-xs font-bold"
                        title="Dar de baja medicamento del arsenal"
                      >
                        <Trash2 size={15} aria-hidden />
                        Dar de Baja
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
};
