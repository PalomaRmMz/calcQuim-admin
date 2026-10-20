import { useMemo, useState } from "react";
import { Link } from "react-router";
import ContentPanel from "../components/ContentPanel";
import Feedback from "../components/Feedback";
import ExportExcelButton from "../components/ExportExcelButton";
import ResetDataModal from "../components/ResetDataModal";
import { useDataAdministration } from "../context/DataAdministrationContext.js";
import { collectExportSnapshot } from "../services/exportSnapshot.js";
import { auditCalcQuim } from "../services/dataAudit.js";
import RawBackupButton from "../components/RawBackupButton.jsx";
import ImportBackupModal from '../components/ImportBackupModal.jsx';
import '../styles/components/Administration.css';

export default function DataManagementPage() {
    const { resetData, notice, error } = useDataAdministration();
    const [confirming, setConfirming] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [importing, setImporting] = useState(false);
    const [inventory] = useState(() => {
        try { return collectExportSnapshot(); }
        catch { return null; }
    });
    const auditIssues = useMemo(() => inventory ? [...inventory.issues, ...auditCalcQuim(inventory)] : [], [inventory]);
    const counts = inventory ? [["Productos", inventory.products.length], ["Ventas", inventory.sales.length], ["Compras", inventory.procurement.purchases.length], ["Proveedores", inventory.procurement.suppliers.length], ["Abastecimiento", inventory.procurement.supplyItems.length], ["Costos del proveedor", inventory.procurement.supplierPrices.length]] : [];
    return <>
        <Feedback message={notice} variant="success" /><Feedback message={error} />
        <ContentPanel title="Respaldo de CalcQuim" subtitle="Descarga un respaldo JSON para poder restaurar tus datos; usa Excel para consultarlos.">
            <p className="alert alert-warning">Los datos viven en este navegador y dispositivo. Si se borran sus datos o usas otro navegador, no aparecerán aquí. Guarda periódicamente el respaldo JSON fuera de la carpeta del proyecto.</p>
            <p>Incluye registros activos e inactivos, historial, revisiones, ventas y datos del comparador. Los filtros de las tablas no limitan la exportación.</p>
            <div className="data-inventory">{counts.map(([label, count]) => <div key={label}><strong>{count}</strong><span>{label}</span></div>)}</div>
            {inventory && <details className="mb-3"><summary>Revisar inconsistencias ({auditIssues.length})</summary>
                {auditIssues.map((issue, index) => <p key={index} className="mb-1">{issue.severity || "REVISAR"} · {issue.entity} {issue.id}: {issue.problem}</p>)}
                <p className="form-text">Diagnóstico de los datos al abrir esta pantalla. No corrige ni elimina registros. Revisa los pendientes antes de capturar datos reales.</p>
            </details>}
            {inventory?.issues.length > 0 && <p className="alert alert-warning">Hay datos que no se pudieron interpretar. El Excel incluirá los registros legibles y una hoja INCONSISTENCIAS. Revísalo antes de borrar.</p>}
            <RawBackupButton primary />
            <div className="mt-3"><ExportExcelButton scope="full" onBusy={setExporting}>Exportar todos los datos</ExportExcelButton></div>
            <p className="form-text">Excel sirve para consultar y analizar información. No se puede importar para restaurar CalcQuim.</p>
            <p className="form-text">El respaldo original conserva todos los campos guardados. Puedes restaurar un archivo JSON desde Importar respaldo.</p>
            <button type="button" className="btn btn-outline-primary" disabled={exporting} onClick={() => setImporting(true)}>Importar respaldo</button>
            <p className="form-text mt-3">La exportación solo lee los datos. No repara relaciones ni modifica la información guardada.</p>
        </ContentPanel>
        <section className="data-danger-zone" aria-labelledby="dangerTitle"><h2 id="dangerTitle">Zona de peligro</h2><p>Eliminar todos los datos de CalcQuim. Esta acción elimina de forma permanente la información almacenada en este dispositivo.</p><button type="button" className="btn btn-outline-danger" disabled={exporting} onClick={() => setConfirming(true)}>Eliminar todos los datos</button></section>
        <p className="mt-4"><Link to="/productos">Ir a Productos</Link></p>
        {confirming && <ResetDataModal onClose={() => setConfirming(false)} onReset={resetData} />}
        {importing && <ImportBackupModal onClose={() => setImporting(false)} />}
    </>;
}
