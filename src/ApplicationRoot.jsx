import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router";
import { CatalogProvider } from "./context/CatalogContext";
import ProcurementProvider from "./context/ProcurementProvider";
import { DataAdministrationContext } from "./context/DataAdministrationContext.js";
import { completePendingReset, resetCalcQuimData } from "./services/dataReset.js";
import { STORAGE_KEYS } from "./services/catalogStorage.js";
import Sidebar from "./layout/Sidebar";
import Header from "./layout/Header";
import DataManagementPage from "./pages/DataManagementPage";
import App from "./App";

function AdministrationLayout() {
    const [collapsed, setCollapsed] = useState(false);
    const [mobile, setMobile] = useState(false);
    return <div className="app-layout">{mobile && <div className="sidebar-overlay" onClick={() => setMobile(false)} aria-hidden="true" />}<Sidebar activeModule="/administracion" collapsed={collapsed} setCollapsed={setCollapsed} mobileMenuOpen={mobile} setMobileMenuOpen={setMobile} /><main className={`main-content ${collapsed ? "main-content-expanded" : ""}`}><Header title="Datos y respaldos" subtitle="Administración de datos de CalcQuim" onOpenMenu={() => setMobile(true)} /><DataManagementPage /></main></div>;
}

export default function ApplicationRoot() {
    const { pathname } = useLocation();
    const [runtime, setRuntime] = useState(() => {
        try { return { generation: completePendingReset() || "initial", notice: "", error: "" }; }
        catch { return { generation: "blocked", notice: "", error: "No se pudo completar el restablecimiento pendiente o acceder al almacenamiento. Revisa los permisos y vuelve a intentar eliminar los datos." }; }
    });
    function resetData(confirmation) {
        try {
            const generation = resetCalcQuimData(confirmation);
            setRuntime({ generation, notice: "Todos los datos se eliminaron. CalcQuim está listo para comenzar de cero.", error: "" });
            return { ok: true };
        } catch (error) {
            const message = `No se pudo completar el restablecimiento: ${error.message} Si ya comenzó, se completará al volver a abrir CalcQuim o al reintentar.`;
            setRuntime(current => ({ ...current, error: message }));
            return { ok: false, message };
        }
    }
    useEffect(() => {
        const synchronize = event => {
            if (![STORAGE_KEYS.resetEpoch, STORAGE_KEYS.resetPending].includes(event.key)) return;
            if (localStorage.getItem(STORAGE_KEYS.resetPending) !== null) {
                setRuntime({ generation: "resetting", notice: "", error: "Se están restableciendo los datos en otra pestaña." });
            } else setRuntime({ generation: localStorage.getItem(STORAGE_KEYS.resetEpoch) || "initial", notice: "Los datos se restablecieron en otra pestaña.", error: "" });
        };
        window.addEventListener("storage", synchronize);
        return () => window.removeEventListener("storage", synchronize);
    }, []);
    // This route intentionally bypasses business providers and their startup
    // migrations. It stays usable even with an invalid procurement envelope.
    const administration = pathname.replace(/\/$/, "") === "/administracion/datos" || Boolean(runtime.error);
    if (pathname === "/datos" || pathname.replace(/\/$/, "") === "/administracion") return <Navigate to="/administracion/datos" replace />;
    return <DataAdministrationContext.Provider value={{ resetData, notice: runtime.notice, error: runtime.error }}><div key={runtime.generation}>{administration ? <AdministrationLayout /> : <CatalogProvider><ProcurementProvider><App /></ProcurementProvider></CatalogProvider>}</div></DataAdministrationContext.Provider>;
}
