import React, { useState } from "react";
import { Layout } from "./components/Layout";
import { Toast } from "./components/ui";
import { Dashboard } from "./pages/Dashboard";
import { Dispensacion } from "./pages/Dispensacion";
import { CarrosClinicos } from "./pages/CarrosClinicos";
import { ProductosRecetar } from "./pages/ProductosRecetar";
import { InventarioGeneral } from "./pages/InventarioGeneral";
import { PanelQF } from "./pages/PanelQF";
import { Administracion } from "./pages/Administracion";
import { Registros } from "./pages/Registros";
import { PERMISOS_VISTA, Vista } from "./data/demo";
import { CodigoRolRBAC } from "./types/cesfam";

export const App: React.FC = () => {
  const [rol, setRol] = useState<CodigoRolRBAC>("QF");
  const [vista, setVista] = useState<Vista>("dashboard");
  const [toast, setToast] = useState<string | null>(null);

  const avisar = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3500);
  };
  const vistaSegura: Vista = PERMISOS_VISTA[rol].includes(vista) ? vista : PERMISOS_VISTA[rol][0];

  return (
    <Layout rol={rol} setRol={setRol} vista={vistaSegura} setVista={setVista}>
      {vistaSegura === "dashboard" && <Dashboard avisar={avisar} />}
      {vistaSegura === "dispensacion" && <Dispensacion avisar={avisar} />}
      {vistaSegura === "inventario" && <InventarioGeneral avisar={avisar} />}
      {vistaSegura === "carros" && <CarrosClinicos avisar={avisar} />}
      {vistaSegura === "productos" && <ProductosRecetar rol={rol} setRol={setRol} avisar={avisar} />}
      {vistaSegura === "registros" && <Registros avisar={avisar} />}
      {vistaSegura === "qf" && <PanelQF avisar={avisar} />}
      {vistaSegura === "admin" && <Administracion avisar={avisar} />}
      <Toast msg={toast} />
    </Layout>
  );
};

export default App;
