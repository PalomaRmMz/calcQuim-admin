import { useState } from "react";
import AppModal from "./AppModal";
import Feedback from "./Feedback";
import { Field } from "./ProcurementFields";
import { useProcurement } from "../context/ProcurementContext.js";

export default function SupplierFormModal({ supplier, onClose }) {
    const { saveSupplier } = useProcurement();
    const [form, setForm] = useState({ name: "", phone: "", address: "", mapsUrl: "", notes: "", active: true, ...supplier });
    const [error, setError] = useState("");
    const change = (key) => (event) => setForm({ ...form, [key]: event.target.value });
    async function submit(event) { event.preventDefault(); const result = await saveSupplier(form); if (!result.ok) setError(result.message); else onClose(); }
    return <AppModal submitLabel={supplier ? "Guardar cambios" : "Crear proveedor"} title={supplier ? "Editar proveedor" : "Nuevo proveedor"} subtitle={supplier ? "Sus datos históricos se conservan al editarlo." : undefined} onClose={onClose} onSubmit={submit}>
        <div className="form-grid"><Field label="Nombre" required autoFocus maxLength={150} value={form.name} onChange={change("name")} /><Field label="Teléfono (opcional)" type="tel" maxLength={40} value={form.phone} onChange={change("phone")} /></div>
        <div className="form-grid"><Field label="Dirección (opcional)" value={form.address} onChange={change("address")} /><Field label="Google Maps (opcional)" type="url" placeholder="https://maps.app.goo.gl/..." value={form.mapsUrl} onChange={change("mapsUrl")} /></div>
        <label className="form-label" htmlFor="supplierNotes">Notas</label><textarea id="supplierNotes" className="form-control" rows={3} maxLength={1000} value={form.notes} onChange={change('notes')} />
        <label className="form-check form-switch mt-3"><input className="form-check-input" type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /><span>Proveedor activo</span></label><Feedback message={error} />
    </AppModal>;
}
