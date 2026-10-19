import React from "react";
import { CodigoRolRBAC } from "../types/cesfam";

interface NavbarProps {
  rolActivo: CodigoRolRBAC;
  onCambiarRol: (rol: CodigoRolRBAC) => void;
}

export const NavbarInstitucional: React.FC<NavbarProps> = ({ rolActivo, onCambiarRol }) => {
  return (
    <header
      style={{
        background: "linear-gradient(90deg, #8A0C13 0%, #C4121A 100%)",
        color: "#ffffff",
        padding: "16px 28px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: "4px solid #e11d48",
      }}
    >
      <div>
        <div style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "1px", opacity: 0.9 }}>
          Ministerio de Salud de Chile (MINSAL) · Red Pública de Atención Primaria (APS)
        </div>
        <h1 style={{ margin: "4px 0 0 0", fontSize: "20px", fontWeight: 700 }}>
          Sistema Web de Gestión para Farmacia Asistencial CESFAM
        </h1>
      </div>

      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <span
          style={{
            background: "#0f766e",
            padding: "4px 10px",
            borderRadius: "999px",
            fontSize: "12px",
            fontWeight: 600,
          }}
        >
          100% Gratuito FONASA · CERO Ventas/POS
        </span>
        <span
          style={{
            background: "#1e293b",
            padding: "4px 10px",
            borderRadius: "999px",
            fontSize: "12px",
          }}
        >
          ALCOA+ DAG SHA-256 · HL7 FHIR R4
        </span>
        <select
          aria-label="Selector de Rol RBAC"
          value={rolActivo}
          onChange={(e) => onCambiarRol(e.target.value as CodigoRolRBAC)}
          style={{
            padding: "6px 12px",
            borderRadius: "6px",
            border: "1px solid #93c5fd",
            background: "#0f172a",
            color: "#ffffff",
            fontWeight: 600,
          }}
        >
          <option value="QF">Rol RBAC: Químico Farmacéutico (D.T.)</option>
          <option value="TECNICO">Rol RBAC: Técnico en Farmacia (TENS)</option>
          <option value="CLINICO">Rol RBAC: Personal Clínico (Enfermería)</option>
          <option value="ADMIN">Rol RBAC: Administrador CESFAM</option>
        </select>
      </div>
    </header>
  );
};
