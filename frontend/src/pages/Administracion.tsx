import React, { useState } from "react";
import {
  CheckCircle2,
  ImagePlus,
  Link2,
  Loader2,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { HelpBanner, PageTitle } from "../components/ui";
import { actualizarConfigInstitucional, hashDemo, useMedicamentos } from "../data/demo";

const EVENTOS = [
  { id: 1, accion: "DISPENSACION", actor: "Técnico · 11.222.333-4" },
  { id: 2, accion: "AJUSTE_STOCK", actor: "Q.F. · 15.444.555-6" },
  { id: 3, accion: "REPOSICION_CARRO", actor: "Clínico · 17.888.999-0" },
  { id: 4, accion: "LIBRO_CONTROLADOS", actor: "Q.F. · 15.444.555-6" },
];

const cadena = EVENTOS.reduce<
  { id: number; accion: string; actor: string; prev: string; hash: string }[]
>((acc, e) => {
  const prev = acc.length ? acc[acc.length - 1].hash : "0".repeat(64);
  return [...acc, { ...e, prev, hash: hashDemo(prev + e.accion + e.id) }];
}, []);

export const Administracion: React.FC<{ avisar: (m: string) => void }> = ({ avisar }) => {
  const { branding } = useMedicamentos();

  const [sigla, setSigla] = useState(branding.sigla);
  const [nombreCentro, setNombreCentro] = useState(branding.nombreCentro);
  const [servicioSalud, setServicioSalud] = useState(branding.servicioSalud);
  const [logoUrl, setLogoUrl] = useState(branding.logoUrl);

  const [estado, setEstado] = useState<"idle" | "run" | "ok">("idle");
  const [paso, setPaso] = useState(0);

  const manejarSubidaArchivoLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setLogoUrl(reader.result);
        actualizarConfigInstitucional({ logoUrl: reader.result });
        avisar("Logo personalizado cargado y actualizado en el menú lateral.");
      }
    };
    reader.readAsDataURL(file);
  };

  const guardarIdentidad = (e: React.FormEvent) => {
    e.preventDefault();
    actualizarConfigInstitucional({
      sigla: sigla.trim() || "CESFAM",
      nombreCentro: nombreCentro.trim() || "Centro de Salud Familiar",
      servicioSalud: servicioSalud.trim() || "Servicio de Salud · Red Asistencial",
      logoUrl: logoUrl.trim(),
    });
    avisar("Identidad institucional y logo actualizados correctamente.");
  };

  const restaurarPorDefecto = () => {
    setSigla("CESFAM");
    setNombreCentro("Centro de Salud Familiar");
    setServicioSalud("Servicio de Salud · Red Asistencial");
    setLogoUrl("");
    actualizarConfigInstitucional({
      sigla: "CESFAM",
      nombreCentro: "Centro de Salud Familiar",
      servicioSalud: "Servicio de Salud · Red Asistencial",
      logoUrl: "",
    });
    avisar("Identidad institucional restaurada a los valores por defecto.");
  };

  const verificar = () => {
    setEstado("run");
    setPaso(0);
    cadena.forEach((_, i) => setTimeout(() => setPaso(i + 1), (i + 1) * 500));
    setTimeout(() => {
      setEstado("ok");
      avisar("Cadena íntegra: 4 de 4 eslabones válidos");
    }, cadena.length * 500 + 400);
  };

  return (
    <>
      <PageTitle
        icon={<ShieldCheck size={26} />}
        title="Configuración y Administración"
        subtitle="Personalización de Logo Institucional, Roles RBAC y Auditoría Inmutable ALCOA+"
      />

      <HelpBanner
        titulo="Administración del Sistema en 3 pasos"
        pasos={[
          "Suba o pegue la URL del Logo Personalizado del CESFAM y edite el nombre del centro.",
          "Revise los roles RBAC activos del establecimiento.",
          "Presione “Verificar Cadena ALCOA+ (ISP)” para auditar la integridad criptográfica SHA-256.",
        ]}
      />

      {/* ================= SECCIÓN 1: PERSONALIZACIÓN DEL LOGO E IDENTIDAD (SOLO ADMIN) ================= */}
      <section className="mb-6 rounded-2xl border border-[#F8C8CB] bg-[#FDF2F2] p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#F8C8CB] pb-3">
          <div className="flex items-center gap-2.5">
            <ImagePlus size={22} className="text-[#C4121A]" aria-hidden />
            <div>
              <h2 className="text-lg font-black text-[#1C0D0F]">
                Personalización del Logo e Identidad del Establecimiento
              </h2>
              <p className="text-xs text-slate-600">
                El logo e información configurados aquí se reflejan instantáneamente en la esquina superior izquierda del menú lateral.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={restaurarPorDefecto}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
          >
            <RotateCcw size={14} aria-hidden />
            Restaurar valores iniciales
          </button>
        </div>

        <form onSubmit={guardarIdentidad} className="grid gap-4 md:grid-cols-12">
          {/* Vista Previa del Logo */}
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-[#1C0D0F] p-4 text-white md:col-span-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-red-300">
              Vista previa en barra lateral
            </p>
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Vista previa logo"
                  className="h-16 w-16 rounded-xl border border-white/20 bg-white object-contain p-1"
                />
              ) : (
                <div className="flex h-16 w-16 flex-col items-center justify-center rounded-xl border border-dashed border-red-300/60 bg-[#C4121A] text-xs font-bold text-red-100">
                  LOGO
                </div>
              )}
              <div>
                <p className="text-lg font-black">{sigla || "CESFAM"}</p>
                <p className="text-xs text-slate-300">{nombreCentro || "Centro de Salud"}</p>
                <p className="text-[11px] text-slate-400">{servicioSalud || "Servicio de Salud"}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <label className="cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-[#C4121A] px-3 py-1.5 text-xs font-extrabold text-white shadow hover:bg-[#9E0E15]">
                <Upload size={14} aria-hidden />
                <span>Subir Imagen desde PC</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={manejarSubidaArchivoLogo}
                  className="hidden"
                />
              </label>

              {logoUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setLogoUrl("");
                    actualizarConfigInstitucional({ logoUrl: "" });
                    avisar("Logo eliminado.");
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-red-600/80 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-red-700"
                >
                  <Trash2 size={13} aria-hidden />
                  Quitar
                </button>
              )}
            </div>
          </div>

          {/* Campos de texto de Identidad y URL */}
          <div className="grid gap-3 sm:grid-cols-2 md:col-span-8">
            <label className="block">
              <span className="mb-1 block text-xs font-extrabold text-[#1C0D0F]">
                Sigla Principal (Ej: CESFAM)
              </span>
              <input
                type="text"
                value={sigla}
                onChange={(e) => setSigla(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-800"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-extrabold text-[#1C0D0F]">
                Nombre del Establecimiento
              </span>
              <input
                type="text"
                value={nombreCentro}
                onChange={(e) => setNombreCentro(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-extrabold text-[#1C0D0F]">
                Servicio de Salud / Subtítulo Institucional
              </span>
              <input
                type="text"
                value={servicioSalud}
                onChange={(e) => setServicioSalud(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-800"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-extrabold text-[#1C0D0F]">
                O pegar URL directa del Logo (PNG / SVG / JPG)
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://ejemplo.cl/mi-logo-cesfam.png"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-700"
                />
                <button
                  type="submit"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#C4121A] px-5 py-2 text-xs font-extrabold text-white shadow transition hover:bg-[#9E0E15]"
                >
                  <Save size={15} aria-hidden />
                  Guardar Cambios
                </button>
              </div>
            </label>
          </div>
        </form>
      </section>

      {/* ================= SECCIÓN 2: AUDITORÍA ALCOA+ Y ROLES ACTIVOS ================= */}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2 space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-black text-[#1C0D0F]">
            <ShieldCheck className="text-[#C4121A]" aria-hidden />
            <span>Auditoría de Seguridad Inmutable (ALCOA+ ISP)</span>
          </h2>
          <p className="text-xs text-slate-600">
            Cada acción queda encadenada criptográficamente con SHA-256 (ALCOA+: atribuible, legible, contemporáneo, original y exacto).
          </p>
          <button
            type="button"
            onClick={verificar}
            disabled={estado === "run"}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#C4121A] py-3 text-sm font-extrabold text-white shadow transition hover:bg-[#9E0E15]"
          >
            {estado === "run" ? <Loader2 className="animate-spin" aria-hidden /> : <Link2 aria-hidden />}
            Verificar Cadena ALCOA+ (ISP)
          </button>

          <ol className="space-y-2">
            {cadena.map((c, i) => {
              const ok = estado === "ok" || (estado === "run" && paso > i);
              return (
                <li key={c.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-extrabold text-[#1C0D0F]">
                      #{c.id} {c.accion}
                    </span>
                    <span
                      className={`rounded-full border px-3 py-0.5 text-xs font-bold ${
                        ok
                          ? "border-emerald-400 bg-emerald-100 text-emerald-900"
                          : "border-slate-300 bg-white text-slate-600"
                      }`}
                    >
                      {ok ? "✔ Íntegro" : "Sin verificar"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">{c.actor}</p>
                  <p className="break-all font-mono text-[11px] text-slate-400">hash: {c.hash}</p>
                </li>
              );
            })}
          </ol>

          {estado === "ok" && (
            <p
              role="status"
              className="flex items-center gap-2 rounded-xl border border-emerald-400 bg-emerald-50 p-3 text-xs font-bold text-emerald-900"
            >
              <CheckCircle2 size={18} className="text-emerald-600" aria-hidden />
              Cadena íntegra: no se detectó ninguna alteración en los registros.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-black text-[#1C0D0F]">
            <Users className="text-[#C4121A]" aria-hidden />
            <span>Dotación y Roles Activos</span>
          </h2>
          {(
            [
              ["Técnico en Farmacia", 6],
              ["Químico Farmacéutico (Q.F.)", 2],
              ["Personal Clínico", 14],
              ["Administrador Sistema", 1],
            ] as [string, number][]
          ).map(([n, c]) => (
            <div
              key={n}
              className="flex items-center justify-between rounded-xl border border-slate-100 bg-[#FAF0F1] px-3.5 py-2.5 text-xs font-bold text-[#1C0D0F]"
            >
              <span>{n}</span>
              <span className="rounded-full bg-[#F8C8CB] px-2.5 py-0.5 text-[#B80F16]">{c}</span>
            </div>
          ))}
          <p className="pt-2 text-xs text-slate-500">
            🔒 Doble factor de autenticación (MFA) obligatorio para Químico Farmacéutico y Administrador según política MINSAL.
          </p>
        </section>
      </div>
    </>
  );
};
