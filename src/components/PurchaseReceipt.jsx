import { useState } from 'react';
import { prepareReceiptPhoto } from '../services/purchaseReceipt.js';

export function ReceiptViewer({ receipt }) {
    if (!receipt) return null;
    return <details className="sale-notes"><summary>Ver foto del ticket</summary><img src={receipt.dataUrl} alt="Ticket de esta compra" style={{ display: 'block', maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', margin: '12px auto' }} /><a className="btn btn-outline-secondary btn-sm" href={receipt.dataUrl} download="ticket-compra.jpg">Descargar foto</a></details>;
}

export default function PurchaseReceipt({ value, onChange, onBusy }) {
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    async function select(event) {
        const file = event.target.files[0];
        event.target.value = '';
        if (!file) return;
        setBusy(true); onBusy(true); setError('');
        try { onChange(await prepareReceiptPhoto(file)); }
        catch (e) { setError(e.message); }
        finally { setBusy(false); onBusy(false); }
    }
    return <section className="sale-section mt-3" aria-label="Foto del ticket">
        <h3 className="h6">Foto del ticket <small className="text-muted">(opcional)</small></h3>
        <p className="form-text">Adjunta una foto como comprobante. Se guarda con esta compra y en el respaldo JSON.</p>
        <label className="form-label" htmlFor="purchaseReceiptFile">{value ? 'Cambiar foto' : 'Seleccionar foto'}</label>
        <input id="purchaseReceiptFile" className="form-control" type="file" accept="image/jpeg,image/png,image/webp" onChange={select} disabled={busy} />
        {busy && <p role="status">Preparando foto…</p>}
        {value && <><ReceiptViewer receipt={value} /><button className="btn btn-outline-danger btn-sm mt-2" type="button" disabled={busy} onClick={() => onChange(null)}>Quitar foto de esta versión</button></>}
        {error && <p className="text-danger mt-2" role="alert">{error}</p>}
    </section>;
}
