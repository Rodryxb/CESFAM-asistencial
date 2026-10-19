import React, { useState } from "react";
import { AlertTriangle, Calendar, CheckCircle2, ChevronDown, ChevronUp, Lightbulb } from "lucide-react";
import { SemaforoFEFO } from "../types/cesfam";

/** Semáforo textual: nunca solo color; siempre icono + texto (estilo cápsula médica limpia). */
export const Semaforo: React.FC<{ nivel: SemaforoFEFO }> = ({ nivel }) => {
  const cfg = {
    VERDE: {
      t: "Stock Seguro",
      c: "bg-emerald-100 text-emerald-800 border-emerald-300",
      i: <CheckCircle2 size={15} aria-hidden />,
    },
    AMARILLO: {
      t: "Próximo a Vencer",
      c: "bg-amber-100 text-amber-900 border-amber-300",
      i: <AlertTriangle size={15} aria-hidden />,
    },
    ROJO: {
      t: "Stock Crítico",
      c: "bg-orange-400 text-slate-950 border-2 border-orange-600 font-black shadow-sm",
      i: <AlertTriangle size={15} className="fill-slate-950 text-orange-200" aria-hidden />,
    },
  }[nivel];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${cfg.c}`}>
      {cfg.i}
      {cfg.t}
    </span>
  );
};

/** Tarjeta superior con instrucciones de 3 pasos, plegable para mantener limpieza visual estilo clínico. */
export const HelpBanner: React.FC<{ titulo: string; pasos: [string, string, string] }> = ({ titulo, pasos }) => {
  const [abierto, setAbierto] = useState(true);

  return (
    <section
      aria-label="Ayuda rápida"
      className="mb-5 rounded-xl border border-[#F5C2C6] bg-[#FCF0F1] px-4 py-3 transition-all"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-extrabold text-[#1C0D0F]">
          <Lightbulb size={17} className="text-[#C4121A]" aria-hidden />
          <span>{titulo}</span>
        </h2>
        <button
          type="button"
          onClick={() => setAbierto(!abierto)}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold text-[#C4121A] hover:bg-[#FBE6E8]"
        >
          {abierto ? (
            <>
              Ocultar guía <ChevronUp size={14} aria-hidden />
            </>
          ) : (
            <>
              Ver pasos <ChevronDown size={14} aria-hidden />
            </>
          )}
        </button>
      </div>
      {abierto && (
        <ol className="mt-2.5 grid gap-2.5 md:grid-cols-3">
          {pasos.map((p, i) => (
            <li
              key={i}
              className="flex items-start gap-2.5 rounded-lg border border-[#FCE1E3] bg-white px-3 py-2 text-xs text-slate-700 shadow-sm"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#C4121A] text-[11px] font-extrabold text-white">
                {i + 1}
              </span>
              <span className="leading-snug">{p}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};

export const PageTitle: React.FC<{ icon: React.ReactNode; title: string; subtitle?: string }> = ({
  icon,
  title,
  subtitle,
}) => {
  const ahora = new Date();
  const fechaFormateada = ahora.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const horaFormateada = ahora.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <header className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
      <div className="flex items-center gap-3.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FCEAEB] text-[#C4121A] shadow-inner">
          {icon}
        </span>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#1C0D0F]">{title}</h1>
          {subtitle && <p className="text-sm font-medium text-[#9E0E15]">{subtitle}</p>}
        </div>
      </div>

      {/* Pastilla de Fecha y Hora idéntica a la imagen de referencia */}
      <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2 text-xs shadow-sm">
        <Calendar size={18} className="text-[#C4121A]" aria-hidden />
        <div>
          <p className="font-bold capitalize text-[#1C0D0F]">{fechaFormateada}</p>
          <p className="text-[11px] text-slate-500">{horaFormateada} hrs.</p>
        </div>
      </div>
    </header>
  );
};

export const Toast: React.FC<{ msg: string | null }> = ({ msg }) =>
  msg ? (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 flex max-w-sm items-center gap-2.5 rounded-xl border border-emerald-400 bg-emerald-50 px-4 py-3.5 text-sm font-bold text-emerald-950 shadow-xl"
    >
      <CheckCircle2 className="shrink-0 text-emerald-600" size={20} aria-hidden />
      <span>{msg}</span>
    </div>
  ) : null;
