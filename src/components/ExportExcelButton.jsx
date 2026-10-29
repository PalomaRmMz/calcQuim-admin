import { useContext, useState } from "react";
import { PersistenceContext } from '../context/PersistenceContext.js';
import { collectExportSnapshot } from "../services/exportSnapshot.js";

export default function ExportExcelButton({ scope = "full", children = "Exportar Excel", onBusy, disabled = false, primary = false }) {
    const persistence = useContext(PersistenceContext);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    const [failed, setFailed] = useState(false);
    async function download() {
        if (busy) return;
        setBusy(true); onBusy?.(true); setMessage(""); setFailed(false);
        try {
            // Capture synchronously, before loading the XLSX chunk or any await.
            const snapshot = persistence ? persistence.exportSnapshot() : collectExportSnapshot();
            const [{ buildProductsExportData, buildProcurementExportData, buildFullBackupExportData }, { exportWorkbook }] = await Promise.all([import("../services/dataExport.js"), import("../services/excelExport.js")]);
            const build = { products: buildProductsExportData, procurement: buildProcurementExportData, full: buildFullBackupExportData }[scope];
            const result = await exportWorkbook(build(snapshot));
            setMessage(`Archivo generado: ${result.fileName}.${result.issueCount ? ` Revisa INCONSISTENCIAS (${result.issueCount}) antes de eliminar datos.` : ""}`);
        } catch (error) {
            setFailed(true);
            setMessage(error.message || "No se pudo generar el archivo Excel. Los datos no se modificaron.");
        } finally { setBusy(false); onBusy?.(false); }
    }
    return <div><button type="button" className={`btn ${primary ? "btn-primary" : "btn-outline-secondary"}`} onClick={download} disabled={busy || disabled} aria-busy={busy}>{busy ? "Generando Excel…" : children}</button>{message && <p role={failed ? "alert" : "status"} className={`small mt-2 mb-0 ${failed ? "text-danger" : "text-muted"}`} style={{ maxWidth: 440 }}>{message}</p>}</div>;
}
