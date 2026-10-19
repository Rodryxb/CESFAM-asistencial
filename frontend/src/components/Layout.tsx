import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Boxes,
  ChevronDown,
  ClipboardList,
  Contrast,
  FlaskConical,
  ImagePlus,
  LayoutDashboard,
  Lock,
  Menu,
  PackagePlus,
  Pill,
  Settings,
  ShieldCheck,
  Truck,
  Type,
  Unlock,
  UserCircle2,
  X,
} from "lucide-react";
import { CodigoRolRBAC } from "../types/cesfam";
import {
  PERMISOS_VISTA,
  ROLES,
  stockTotalMed,
  useMedicamentos,
  Vista,
} from "../data/demo";

interface ItemMenu {
  vista: Vista;
  label: string;
  icon: React.ReactNode;
  grupo: "farmacia" | "general";
}

const MENU_ITEMS: ItemMenu[] = [
  {
    vista: "dashboard",
    label: "Reportes y Dashboard",
    icon: <LayoutDashboard size={17} aria-hidden />,
    grupo: "farmacia",
  },
  {
    vista: "dispensacion",
    label: "Entrega de Medicamentos",
    icon: <Pill size={17} aria-hidden />,
    grupo: "farmacia",
  },
  {
    vista: "inventario",
    label: "Consulta de Stock",
    icon: <Boxes size={17} aria-hidden />,
    grupo: "farmacia",
  },
  {
    vista: "carros",
    label: "Solicitar stock / confirmar",
    icon: <Truck size={17} aria-hidden />,
    grupo: "farmacia",
  },
  {
    vista: "productos",
    label: "Productos para Recetar",
    icon: <PackagePlus size={17} aria-hidden />,
    grupo: "farmacia",
  },
  {
    vista: "registros",
    label: "Registros",
    icon: <ClipboardList size={17} aria-hidden />,
    grupo: "farmacia",
  },
  {
    vista: "qf",
    label: "Panel Químico Farmacéutico",
    icon: <FlaskConical size={18} aria-hidden />,
    grupo: "general",
  },
  {
    vista: "admin",
    label: "Configuración y Admin",
    icon: <Settings size={18} aria-hidden />,
    grupo: "general",
  },
];

const PROFESIONAL_POR_ROL: Record<CodigoRolRBAC, { nombre: string; cargo: string }> = {
  QF: { nombre: "María González", cargo: "Químico Farmacéutico" },
  TECNICO: { nombre: "Camila Torres", cargo: "Técnico en Farmacia" },
  CLINICO: { nombre: "Alejandra Rojas", cargo: "Personal Clínico" },
  ADMIN: { nombre: "Rodrigo Admin", cargo: "Administrador Sistema" },
};

interface Props {
  rol: CodigoRolRBAC;
  setRol: (r: CodigoRolRBAC) => void;
  vista: Vista;
  setVista: (v: Vista) => void;
  children: React.ReactNode;
}

export const Layout: React.FC<Props> = ({ rol, setRol, vista, setVista, children }) => {
  const { meds, branding } = useMedicamentos();
  const [contraste, setContraste] = useState(false);
  const [grande, setGrande] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [farmaciaExpandido, setFarmaciaExpandido] = useState(true);

  const permitidas = PERMISOS_VISTA[rol];

  useEffect(() => {
    document.documentElement.classList.toggle("alto-contraste", contraste);
  }, [contraste]);

  useEffect(() => {
    document.documentElement.classList.toggle("fuente-grande", grande);
  }, [grande]);

  const cambiarRol = (r: CodigoRolRBAC) => {
    setRol(r);
    if (!PERMISOS_VISTA[r].includes(vista)) {
      setVista(PERMISOS_VISTA[r][0]);
    }
  };

  const [campanaAbierta, setCampanaAbierta] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const [claveInput, setClaveInput] = useState("");
  const [errorClave, setErrorClave] = useState(false);

  // Medicamentos exclusivamente en Stock Crítico (igual al KPI "Quiebres / Stock Crítico")
  const medsCriticos = useMemo(() => {
    return meds.filter(
      (m) =>
        stockTotalMed(m) <= m.stock_critico_alerta ||
        m.lotes.every((l) => l.dias_para_vencer <= 0)
    );
  }, [meds]);

  const totalCriticos = medsCriticos.length;

  const itemsFarmacia = MENU_ITEMS.filter(
    (m) => m.grupo === "farmacia" && permitidas.includes(m.vista)
  );
  const itemsGeneral = MENU_ITEMS.filter(
    (m) => m.grupo === "general" && permitidas.includes(m.vista)
  );

  const profActual = PROFESIONAL_POR_ROL[rol];

  return (
    <div className="flex min-h-screen flex-col bg-[#F7EDEE] md:flex-row">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-3"
      >
        Saltar al contenido
      </a>

      {/* ================= SIDEBAR IZQUIERDO INSTITUCIONAL INACAP ================= */}
      <aside
        aria-label="Menú lateral institucional"
        className={`${
          menuAbierto ? "flex" : "hidden"
        } w-full flex-col justify-between bg-[#1A0B0E] text-white shadow-xl print:hidden md:flex md:w-64 md:shrink-0 lg:w-72`}
      >
        <div>
          {/* Bloque Superior: Logo Personalizable (Editable por Admin) + Identidad CESFAM */}
          <div className="border-b border-white/10 p-5">
            <div className="flex items-center gap-3.5">
              {branding.logoUrl ? (
                <img
                  src={branding.logoUrl}
                  alt={branding.sigla}
                  className="h-14 w-14 shrink-0 rounded-xl border border-white/20 bg-white object-contain p-1 shadow-md"
                />
              ) : (
                <div
                  className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-red-300/60 bg-gradient-to-br from-[#C4121A] to-[#7A0B10] text-center shadow-inner"
                  title="Espacio para logo institucional personalizable por el Admin"
                >
                  <ImagePlus size={20} className="text-red-200" aria-hidden />
                  <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-red-100">
                    Logo
                  </span>
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-xl font-black tracking-wide text-white">
                  {branding.sigla}
                </p>
                <p className="truncate text-xs font-medium text-slate-300">
                  {branding.nombreCentro}
                </p>
                <p className="truncate text-[11px] text-slate-400">
                  {branding.servicioSalud}
                </p>
              </div>
            </div>

            {rol === "ADMIN" && (
              <button
                type="button"
                onClick={() => {
                  setVista("admin");
                  setMenuAbierto(false);
                }}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-200 transition hover:bg-red-500/20"
              >
                <ImagePlus size={14} aria-hidden />
                Personalizar Logo y Nombre (Admin)
              </button>
            )}
          </div>

          {/* Navegación Principal estilo clínico desplegable */}
          <nav aria-label="Menú principal" className="p-3.5 space-y-4">
            {/* Grupo Desplegable: Farmacia */}
            {itemsFarmacia.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setFarmaciaExpandido(!farmaciaExpandido)}
                  aria-expanded={farmaciaExpandido}
                  className="flex w-full items-center justify-between rounded-xl bg-[#C4121A] px-4 py-3 text-left text-sm font-extrabold text-white shadow-sm transition hover:bg-[#D91821]"
                >
                  <span className="flex items-center gap-2.5">
                    <Pill size={18} aria-hidden />
                    <span>Farmacia</span>
                  </span>
                  <ChevronDown
                    size={17}
                    className={`transition-transform ${farmaciaExpandido ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                </button>

                {farmaciaExpandido && (
                  <ul className="mt-1.5 space-y-1">
                    {itemsFarmacia.map((m) => {
                      const activo = vista === m.vista;
                      return (
                        <li key={m.vista}>
                          <button
                            type="button"
                            onClick={() => {
                              setVista(m.vista);
                              setMenuAbierto(false);
                            }}
                            aria-current={activo ? "page" : undefined}
                            className={`flex w-full items-center gap-3 rounded-r-xl py-2.5 pl-4 pr-3 text-left text-sm font-medium transition ${
                              activo
                                ? "border-l-4 border-[#FF4D56] bg-[#3B1115] font-bold text-white"
                                : "border-l-4 border-transparent text-slate-300 hover:bg-white/5 hover:text-white"
                            }`}
                          >
                            <span className={activo ? "text-[#FF4D56]" : "text-slate-400"}>
                              {m.icon}
                            </span>
                            <span>{m.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {/* Módulos Generales (Reportes, Panel QF, Configuración/Admin) */}
            <ul className="space-y-1 border-t border-white/10 pt-3">
              {itemsGeneral.map((m) => {
                const activo = vista === m.vista;
                return (
                  <li key={m.vista}>
                    <button
                      type="button"
                      onClick={() => {
                        setVista(m.vista);
                        setMenuAbierto(false);
                      }}
                      aria-current={activo ? "page" : undefined}
                      className={`flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm font-medium transition ${
                        activo
                          ? "bg-[#C4121A] font-bold text-white shadow-sm"
                          : "text-slate-300 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      <span className={activo ? "text-white" : "text-slate-400"}>{m.icon}</span>
                      <span>{m.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        {/* Pie del Sidebar: Certificación Normativa ISP + Versión */}
        <div className="space-y-2.5 p-4">
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#2B0E12] px-3.5 py-3">
            <ShieldCheck size={24} className="shrink-0 text-emerald-400" aria-hidden />
            <div>
              <p className="text-xs font-extrabold text-emerald-400">Sistema Seguro</p>
              <p className="text-[11px] text-slate-300">Cumple con normativa ISP</p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#2B0E12]/70 py-2 text-center text-xs font-medium text-slate-400">
            Versión 1.0.0
          </div>
        </div>
      </aside>

      {/* ================= COLUMNA DERECHA: TOPBAR + HOJA CLÍNICA + FOOTER ================= */}
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div>
          {/* Topbar Superior Clara con Accesibilidad y Perfil / Selector de Rol */}
          <header className="border-b border-slate-300/80 bg-[#EFE2E4] px-4 py-2.5 print:hidden lg:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Izquierda: Botón móvil + Controles de Accesibilidad discretos */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-[#1A0B0E] p-2 text-white md:hidden"
                  aria-label={menuAbierto ? "Cerrar menú" : "Abrir menú"}
                  onClick={() => setMenuAbierto(!menuAbierto)}
                >
                  {menuAbierto ? <X size={20} /> : <Menu size={20} />}
                </button>

                <button
                  type="button"
                  aria-pressed={contraste}
                  onClick={() => setContraste(!contraste)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                    contraste
                      ? "border-black bg-yellow-300 text-black"
                      : "border-slate-300 bg-white/80 text-[#1C0D0F] hover:bg-white"
                  }`}
                >
                  <Contrast size={15} aria-hidden />
                  <span>Alto Contraste: {contraste ? "SÍ" : "NO"}</span>
                </button>

                <div
                  role="group"
                  aria-label="Tamaño de letra"
                  className="inline-flex items-center rounded-lg border border-slate-300 bg-white/80 p-0.5 text-xs"
                >
                  <span className="flex items-center gap-1 px-2 font-semibold text-slate-600">
                    <Type size={13} aria-hidden />
                    Letra:
                  </span>
                  {(["Normal", "Grande"] as const).map((t) => {
                    const act = grande === (t === "Grande");
                    return (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={act}
                        onClick={() => setGrande(t === "Grande")}
                        className={`rounded-md px-2.5 py-1 font-bold transition ${
                          act
                            ? "bg-[#C4121A] text-white"
                            : "text-slate-600 hover:bg-slate-200/70"
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Derecha: Campana de Stock Crítico (visible solo si hay stock crítico) + Perfil RBAC */}
              <div className="flex items-center gap-4">
                {totalCriticos > 0 && (
                  <>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setCampanaAbierta(!campanaAbierta)}
                        title={`${totalCriticos} medicamento(s) en Stock Crítico`}
                        aria-label={`Ver ${totalCriticos} alertas de stock crítico`}
                        className="relative rounded-full p-1.5 text-[#1C0D0F] transition hover:bg-white/60"
                      >
                        <Bell size={21} aria-hidden />
                        <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-white bg-orange-400 text-[10px] font-black text-slate-950 shadow">
                          {totalCriticos}
                        </span>
                      </button>

                      {campanaAbierta && (
                        <div className="absolute right-0 top-10 z-50 w-72 rounded-2xl border-2 border-orange-300 bg-white p-3.5 shadow-2xl">
                          <div className="mb-2 flex items-center justify-between border-b border-orange-100 pb-2">
                            <span className="flex items-center gap-1.5 text-xs font-black text-orange-950">
                              <AlertTriangle size={15} className="text-orange-600" aria-hidden />
                              Alerta de Stock Crítico ({totalCriticos})
                            </span>
                            <button
                              type="button"
                              onClick={() => setCampanaAbierta(false)}
                              className="text-xs font-bold text-slate-400 hover:text-slate-700"
                            >
                              Cerrar
                            </button>
                          </div>
                          <ul className="max-h-48 space-y-1.5 overflow-y-auto text-xs">
                            {medsCriticos.map((m) => (
                              <li
                                key={m.id}
                                className="flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50/90 px-2.5 py-1.5"
                              >
                                <span className="font-bold text-slate-950">
                                  {m.nombre_generico} {m.concentracion}
                                </span>
                                <span className="rounded-md bg-orange-400 px-1.5 py-0.5 font-mono text-[11px] font-black text-slate-950 shadow-xs">
                                  {stockTotalMed(m)}/{m.stock_critico_alerta} u.
                                </span>
                              </li>
                            ))}
                          </ul>
                          <button
                            type="button"
                            onClick={() => {
                              setCampanaAbierta(false);
                              setVista("inventario");
                            }}
                            className="mt-2.5 w-full rounded-xl border-2 border-orange-600 bg-orange-400 py-2 text-center text-xs font-black text-slate-950 shadow-sm transition hover:bg-orange-300"
                          >
                            Ir a Consulta de Stock Crítico
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="h-6 w-px bg-slate-300" aria-hidden />
                  </>
                )}

                {/* Perfil de Usuario + Selector interactivo de Rol RBAC */}
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1A0B0E] text-white shadow-sm">
                    <UserCircle2 size={24} aria-hidden />
                  </div>
                  <div className="leading-tight">
                    <p className="text-sm font-extrabold text-[#1C0D0F]">{profActual.nombre}</p>
                    <div className="flex items-center gap-1">
                      <label htmlFor="selector-rol-rbac" className="sr-only">
                        Cambiar Rol de Usuario
                      </label>
                      <select
                        id="selector-rol-rbac"
                        value={rol}
                        onChange={(e) => cambiarRol(e.target.value as CodigoRolRBAC)}
                        className="cursor-pointer bg-transparent text-xs font-semibold text-[#C4121A] focus:outline-none hover:underline"
                        title="Selector rápido de Rol RBAC para demostración"
                      >
                        {ROLES.map((r) => (
                          <option key={r.codigo} value={r.codigo}>
                            {r.nombre} (Cambiar rol)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="h-6 w-px bg-slate-300" aria-hidden />

                {/* Botón de Bloqueo Asistencial de Terminal / Cierre CESFAM */}
                <button
                  type="button"
                  onClick={() => {
                    setBloqueado(true);
                    setClaveInput("");
                    setErrorClave(false);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition hover:border-[#C4121A] hover:bg-[#FDF2F2] hover:text-[#C4121A]"
                  title="Bloquear pantalla por cierre de turno o receso asistencial (Ley 19.628 / Seguridad TI)"
                >
                  <Lock size={14} className="text-[#C4121A]" aria-hidden />
                  <span className="hidden sm:inline">Bloquear Pantalla</span>
                </button>
              </div>
            </div>
          </header>

          {/* Contenedor Principal tipo Hoja Clínica Blanca */}
          <main id="contenido" className="p-3 sm:p-5 lg:p-6 print:m-0 print:p-0">
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-6 lg:p-7 print:m-0 print:border-none print:p-0 print:shadow-none">
              {children}
            </div>
          </main>
        </div>

        {/* Footer Institucional Inferior */}
        <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-6 py-3 text-xs text-slate-600 print:hidden">
          <div className="flex items-center gap-2">
            <strong className="font-extrabold text-[#1C0D0F]">{branding.sigla}</strong>
            <span className="text-slate-300">|</span>
            <span>Salud más cerca de las personas</span>
          </div>
          <div className="font-medium text-slate-500">
            Sistema de Gestión Farmacia Asistencial v1.0
          </div>
        </footer>
      </div>

      {/* MODAL DE BLOQUEO DE PANTALLA ASISTENCIAL (CIERRE CESFAM / RECESO) */}
      {bloqueado && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Terminal Bloqueado por Cierre o Receso Asistencial"
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md"
        >
          <div className="w-full max-w-md rounded-3xl border-2 border-red-500/40 bg-white p-6 shadow-2xl sm:p-8">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 text-[#C4121A] shadow-inner">
                <Lock size={36} aria-hidden />
              </div>
              <span className="inline-block rounded-full bg-red-100 px-3 py-1 text-xs font-black uppercase tracking-wider text-red-800">
                CESFAM Cerrado / Terminal Bloqueado
              </span>
              <h2 className="mt-2 text-xl font-black text-slate-900">
                Protección de Datos Clínicos
              </h2>
              <p className="mt-1.5 text-xs text-slate-600">
                Sesión suspendida para evitar accesos no autorizados a fichas de pacientes y stock de farmacia (Ley N° 19.628 y Criterio 2.1.5.10).
              </p>
            </div>

            {/* Datos del turno suspendido */}
            <div className="my-5 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
              <div className="flex justify-between py-0.5">
                <span className="font-medium text-slate-500">Funcionario en turno:</span>
                <span className="font-black text-slate-900">{profActual.nombre}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-medium text-slate-500">Cargo / Rol:</span>
                <span className="font-extrabold text-[#C4121A]">{profActual.cargo}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-medium text-slate-500">Establecimiento:</span>
                <span className="font-semibold text-slate-700">{branding.nombreCentro}</span>
              </div>
            </div>

            {/* Formulario de Desbloqueo */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                // Acepta "1234", "cesfam", "admin" o presionar Desbloquear para facilitar la demo académica
                if (
                  claveInput.trim() === "1234" ||
                  claveInput.trim().toLowerCase() === "cesfam" ||
                  claveInput.trim().toLowerCase() === "admin" ||
                  claveInput.trim() === ""
                ) {
                  setBloqueado(false);
                  setClaveInput("");
                  setErrorClave(false);
                } else {
                  setErrorClave(true);
                }
              }}
              className="space-y-3"
            >
              <div>
                <label htmlFor="input-clave-desbloqueo" className="block text-xs font-bold text-slate-700 mb-1">
                  Ingrese PIN de Funcionario o Clave:
                </label>
                <input
                  id="input-clave-desbloqueo"
                  type="password"
                  value={claveInput}
                  onChange={(e) => {
                    setClaveInput(e.target.value);
                    if (errorClave) setErrorClave(false);
                  }}
                  placeholder="PIN (por defecto: 1234 o dejar vacío para demo)"
                  className={`w-full rounded-xl border px-3.5 py-2.5 text-center text-sm font-black tracking-widest focus:outline-none ${
                    errorClave
                      ? "border-red-500 bg-red-50 text-red-900 focus:ring-2 focus:ring-red-400"
                      : "border-slate-300 bg-white text-slate-900 focus:border-[#C4121A] focus:ring-2 focus:ring-red-200"
                  }`}
                  autoFocus
                />
                {errorClave && (
                  <p className="mt-1 text-center text-xs font-bold text-red-600">
                    PIN incorrecto. (Use 1234 o presione Desbloquear)
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#C4121A] py-2.5 text-sm font-black text-white shadow-md transition hover:bg-[#9E0E15] active:scale-95"
              >
                <Unlock size={16} aria-hidden />
                Desbloquear y Reanudar Turno
              </button>

              <p className="text-center text-[11px] text-slate-400">
                Simulación asistencial para recesos, cambio de turno y cierre de CESFAM.
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
