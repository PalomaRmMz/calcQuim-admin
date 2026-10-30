import { useEffect, useState } from 'react';
import ContentPanel from './ContentPanel';
import { fetchGeneralCatalog, generalCatalogWorkbook } from '../services/generalCatalogReport.js';

export default function GeneralCatalogReport() {
    const [snapshot, setSnapshot] = useState(null);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    useEffect(() => {
        let active = true;
        fetchGeneralCatalog().then(value => { if (active) setSnapshot(value); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, []);
    async function download() {
        setExporting(true); setError(''); setMessage('');
        try {
            const fresh = await fetchGeneralCatalog();
            setSnapshot(fresh);
            const { exportWorkbook } = await import('../services/excelExport.js');
            const result = await exportWorkbook(generalCatalogWorkbook(fresh));
            setMessage(`Archivo generado: ${result.fileName}`);
        } catch (e) { setError(e.message || 'No se pudo generar el archivo Excel.'); }
        finally { setExporting(false); }
    }
    return <section aria-label="Reporte de catálogo general" aria-busy={loading || exporting}>
        <ContentPanel title="Catálogo general" subtitle="Catálogo completo y vigente de PostgreSQL: productos, categorías, líneas y grupos de precios, con identificadores y relaciones originales.">
            {loading && <p role="status">Consultando catálogo…</p>}
            {snapshot && <div className="report-metrics">{[['Productos', 'products'], ['Categorías', 'categories'], ['Líneas', 'productLines'], ['Grupos de precios', 'priceGroups']].map(([label, key]) => <div className="report-metric" key={key}><span>{label}</span><strong>{snapshot.data[key].length}</strong></div>)}</div>}
            <p className="text-muted">Cada descarga consulta nuevamente la base de datos. Los precios sin resolución se muestran como «No determinado».</p>
            <button type="button" className="btn btn-primary" disabled={loading || exporting} onClick={download}>{exporting ? 'Generando Excel…' : 'Exportar a Excel'}</button>
            {message && <p role="status" className="alert alert-success mt-3">{message}</p>}
            {error && <p role="alert" className="alert alert-danger mt-3">{error}</p>}
        </ContentPanel>
    </section>;
}
