import React, { useState } from "react";
import { CodigoRolRBAC } from "../types/cesfam";
import { validarRutChilenoModulo11 } from "../utils/rutModulo11";

interface DashboardProps {
  rolActivo: CodigoRolRBAC;
}

export const DashboardOperacional: React.FC<DashboardProps> = ({ rolActivo }) => {
  const [rutBusqueda, setRutBusqueda] = useState("7654321-6");
  const validacionRut = validarRutChilenoModulo11(rutBusqueda);

  return (
    <main style={{ padding: "24px 28px", fontFamily: "system-ui, sans-serif", background: "#f8fafc" }}>
      {/* Banner Normativo Sector Público */}
      <section
        style={{
          background: "#eff6ff",
          borderLeft: "5px solid #1d4ed8",
          padding: "14px 18px",
          borderRadius: "8px",
          marginBottom: "24px",
        }}
      >
        <strong>Modo Institucional Activo ({rolActivo}):</strong> Operación exclusiva de Farmacia Asistencial
        CESFAM bajo Código Sanitario, Ley N° 21.198 (CENABAST), Decreto 404/405 ISP (Controlados) y Norma
        ALCOA+. Exclusiones aplicadas: CERO ventas comerciales, POS, boletas, Isapres ni precios.
      </section>

      {/* Validador Módulo 11 de RUT Chileno */}
      <section
        style={{
          background: "#ffffff",
          padding: "18px",
          borderRadius: "10px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          marginBottom: "24px",
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: "17px", color: "#0f172a" }}>
          1. Verificación de Paciente Beneficiario FONASA (Algoritmo Módulo 11 + Bus HL7 FHIR R4)
        </h2>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text"
            value={rutBusqueda}
            onChange={(e) => setRutBusqueda(e.target.value)}
            placeholder="Ingrese RUT (ej: 7654321-6)"
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              minWidth: "240px",
            }}
          />
          <span
            style={{
              padding: "6px 12px",
              borderRadius: "6px",
              fontWeight: 600,
              fontSize: "13px",
              background: validacionRut.esValido ? "#dcfce7" : "#fee2e2",
              color: validacionRut.esValido ? "#166534" : "#991b1b",
            }}
          >
            {validacionRut.esValido
              ? `RUT Válido Módulo 11: ${validacionRut.rutNormalizado} (FONASA Tramo A/B - Gratuidad 100%)`
              : validacionRut.mensajeError}
          </span>
        </div>
      </section>

      {/* Grid de Servicios Críticos: Motor FEFO y Predicción de Demanda a 90 días CENABAST */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "24px" }}>
        <section
          style={{
            background: "#ffffff",
            padding: "18px",
            borderRadius: "10px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: "17px", color: "#0f172a" }}>
            2. Motor Automático FEFO (First Expired, First Out) y Semáforo de Lotes
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>Medicamento</th>
                <th style={{ padding: "8px" }}>Lote</th>
                <th style={{ padding: "8px" }}>Vencimiento</th>
                <th style={{ padding: "8px" }}>Semáforo / Estado FEFO</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: "8px" }}>Losartán 50 mg</td>
                <td style={{ padding: "8px" }}>LOT-LOS-2024-VENC</td>
                <td style={{ padding: "8px" }}>Expirado (-12d)</td>
                <td style={{ padding: "8px", color: "#dc2626", fontWeight: 700 }}>
                  ROJO · BLOQUEADO POR FEFO
                </td>
              </tr>
              <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#fefce8" }}>
                <td style={{ padding: "8px" }}>Losartán 50 mg</td>
                <td style={{ padding: "8px" }}>LOT-LOS-2026-AMAR</td>
                <td style={{ padding: "8px" }}>+45 días</td>
                <td style={{ padding: "8px", color: "#ca8a04", fontWeight: 700 }}>
                  AMARILLO · 1° PRIORIDAD FEFO
                </td>
              </tr>
              <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: "8px" }}>Losartán 50 mg</td>
                <td style={{ padding: "8px" }}>LOT-LOS-2027-VERD</td>
                <td style={{ padding: "8px" }}>+270 días</td>
                <td style={{ padding: "8px", color: "#16a34a", fontWeight: 700 }}>
                  VERDE · RESERVA BODEGA
                </td>
              </tr>
              <tr>
                <td style={{ padding: "8px" }}>Diazepam 10 mg [Controlado ISP]</td>
                <td style={{ padding: "8px" }}>LOT-DIAZ-2026-AMAR</td>
                <td style={{ padding: "8px" }}>+75 días</td>
                <td style={{ padding: "8px", color: "#ca8a04", fontWeight: 700 }}>
                  AMARILLO · EXIGE RECETA RETENIDA + FIRMA Q.F.
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section
          style={{
            background: "#ffffff",
            padding: "18px",
            borderRadius: "10px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: "17px", color: "#0f172a" }}>
            3. Predicción de Demanda a 90 Días (Cruza Cuotas GES/Crónicos vs Stock Actual)
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>Fármaco (CENABAST)</th>
                <th style={{ padding: "8px" }}>Stock Hábil</th>
                <th style={{ padding: "8px" }}>Demanda 90d</th>
                <th style={{ padding: "8px" }}>Riesgo / Sugerencia CENABAST</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#fff7ed" }}>
                <td style={{ padding: "8px" }}>Insulina NPH 100 UI/mL</td>
                <td style={{ padding: "8px" }}>14 frascos</td>
                <td style={{ padding: "8px" }}>30 frascos (GES #07)</td>
                <td style={{ padding: "8px", color: "#c2410c", fontWeight: 800 }}>
                  CRÍTICO · Pedir 30 u. a CENABAST
                </td>
              </tr>
              <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: "8px" }}>Losartán Potásico 50 mg</td>
                <td style={{ padding: "8px" }}>450 comp.</td>
                <td style={{ padding: "8px" }}>900 comp. (GES #21)</td>
                <td style={{ padding: "8px", color: "#ea580c", fontWeight: 700 }}>
                  ALTO · Pedir 600 u. a CENABAST
                </td>
              </tr>
              <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: "8px" }}>Metformina 850 mg</td>
                <td style={{ padding: "8px" }}>300 comp.</td>
                <td style={{ padding: "8px" }}>720 comp. (GES #07)</td>
                <td style={{ padding: "8px", color: "#ea580c", fontWeight: 700 }}>
                  ALTO · Pedir 600 u. a CENABAST
                </td>
              </tr>
              <tr>
                <td style={{ padding: "8px" }}>Paracetamol 500 mg</td>
                <td style={{ padding: "8px" }}>1.600 comp.</td>
                <td style={{ padding: "8px" }}>500 comp. (APS)</td>
                <td style={{ padding: "8px", color: "#16a34a", fontWeight: 700 }}>
                  ÓPTIMO · Autonomía &gt; 90 días
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
};
