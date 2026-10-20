import { useState } from 'react';
import AppModal from './AppModal';
import { prepareBackupImport, captureImportBaseline, applyBackupImport } from '../services/backupImport.js';
import { downloadRawBackup } from '../services/rawBackup.js';

export default function ImportBackupModal({ onClose }) {
    const [preview, setPreview] = useState(null);
    const [baseline, setBaseline] = useState(null);
    const [name, setName] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    async function select(event) {
        setPreview(null); setConfirmed(false); setError('');
        const file = event.target.files[0];
        if (!file) return;
        try {
            if (file.size > 50 * 1024 * 1024) throw new Error('El archivo supera el límite de 50 MB.');
            const parsed = prepareBackupImport(await file.text());
            setBaseline(captureImportBaseline(localStorage)); setPreview(parsed); setName(file.name);
        } catch (e) { setError(e.message); }
    }
    function submit(event) {
        event.preventDefault();
        if (!preview || !confirmed || busy) return;
        setBusy(true);
        try {
            downloadRawBackup();
            applyBackupImport(preview, baseline);
            window.location.reload();
        } catch (e) { setError(e.message); setBusy(false); }
    }
    return <AppModal title="Importar respaldo" subtitle="Restaurar datos de este dispositivo" onClose={onClose} onSubmit={submit} actions={<><button type="button" className="btn btn-light" onClick={onClose} disabled={busy}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={!preview || !confirmed || busy}>{busy ? 'Restaurando…' : 'Restaurar respaldo'}</button></>}>
        <label className="form-label" htmlFor="backupImportFile">Archivo de respaldo JSON de CalcQuim</label>
        <input id="backupImportFile" className="form-control" type="file" accept=".json,application/json" onChange={select} disabled={busy} />
        <p className="form-text">Selecciona un respaldo original o corregido. No admite archivos Excel.</p>
        {preview && <><p className="mt-3"><strong>{name}</strong></p><div className="data-inventory">{Object.entries(preview.counts).map(([label, count]) => <div key={label}><strong>{count}</strong><span>{label}</span></div>)}</div>
            <div className="alert alert-warning mt-3">Los datos del archivo reemplazarán los actuales; no se combinan. Se descargará un respaldo de seguridad antes de restaurar. La aplicación se recargará al terminar.</div>
            <label className="d-flex gap-2 align-items-start"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={busy} />Entiendo que los registros posteriores a este respaldo no estarán en los datos restaurados.</label></>}
        {error && <p role="alert" className="alert alert-danger mt-3">{error}</p>}
    </AppModal>;
}
