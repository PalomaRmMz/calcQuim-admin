import { toggleArticleSelection } from '../services/purchasedItemBatch.js';
import { useState } from 'react';
import AppModal from './AppModal';
import { Field } from './ProcurementFields';
import { useProcurement } from '../context/ProcurementContext.js';
import { normalizeText } from '../utils/catalogUtils.js';
import { SOURCING_TYPES } from '../utils/procurementUtils.js';
import { UNITS, unitLabel } from '../utils/units.js';
import { preparePurchasedItemBatch, purchasedItemDependencies } from '../services/purchasedItemBatch.js';



export default function PurchasedItemBatchEdit({ products, onClose }) {
    const { data, savePurchasedItemsBatch } = useProcurement();
    const [ids, setIds] = useState([]);
    const [search, setSearch] = useState('');
    const [mode, setMode] = useState('');
    const [status, setStatus] = useState('');
    const [values, setValues] = useState({ sourcingType: '', unit: '', active: '' });
    const [names, setNames] = useState({});
    const [error, setError] = useState('');
    const changes = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== '').map(([key, value]) => [key, key === 'active' ? value === 'true' : value]));
    const request = { ids, changes, names: Object.fromEntries(Object.entries(names).filter(([id]) => ids.some(selected => String(selected) === id))) };
    let preview, validation = '';
    if (ids.length) { try { preview = preparePurchasedItemBatch(data, request); } catch (e) { validation = e.message; } }
    const matches = data.purchasedItems.filter(a => a.sourcingType !== 'READY_TO_USE').filter(a => {
        const sources = data.supplyItems.filter(s => s.purchasedItemId === a.id);
        const context = [a.name, SOURCING_TYPES[a.sourcingType], ...sources.map(s => data.suppliers.find(p => p.id === s.supplierId)?.name), ...data.supplyConversions.filter(c => c.purchasedItemId === a.id).map(c => products.find(p => p.id === c.outputProductId)?.displayName)].join(' ');
        return (!mode || a.sourcingType === mode) && (!status || String(a.active) === status) && normalizeText(context).includes(normalizeText(search));
    });
    const common = key => e => setValues({ ...values, [key]: e.target.value });
    return <AppModal title="Editar artículos comprados por lote" maxWidth="md" onClose={onClose} onSubmit={e => { e.preventDefault(); if (!preview?.modified) return setError(validation || 'Selecciona artículos y cambios.'); const result = savePurchasedItemsBatch(request); if (result.ok) onClose(); else setError(result.message); }} actions={<><button type="button" className="btn btn-light" onClick={onClose}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={!preview?.modified}>Guardar cambios</button></>}>
        <p>{ids.length} artículos seleccionados</p>
        <Field label="Buscar artículos" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre, modalidad, producto o proveedor" />
        <div className="form-grid mt-3"><Field label="Filtrar modalidad" value={mode} onChange={e => setMode(e.target.value)}><option value="">Todas</option>{Object.entries(SOURCING_TYPES).filter(([id]) => id !== 'READY_TO_USE').map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Field><Field label="Filtrar estado" value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos</option><option value="true">Activo</option><option value="false">Inactivo</option></Field></div>
        {!search.trim() && !mode && !status ? <p className="form-text">Busca o filtra para seleccionar artículos.</p> : <div className="sale-section mt-3" style={{ maxHeight: 200, overflowY: 'auto' }}>{matches.slice(0, 50).map(a => <label key={a.id} className="d-flex gap-2 p-2"><input type="checkbox" checked={ids.includes(a.id)} onChange={() => setIds(toggleArticleSelection(ids, a.id))} />{a.name} · {SOURCING_TYPES[a.sourcingType]} · {unitLabel(a.unit)} · {a.active ? 'Activo' : 'Inactivo'}</label>)}{matches.length > 50 && <p>Se muestran 50 resultados. Precisa la búsqueda.</p>}{!matches.length && <p>Sin coincidencias.</p>}</div>}
        <h3 className="mt-3">Aplicar a seleccionados</h3><div className="form-grid"><Field label="Modalidad" value={values.sourcingType} onChange={common('sourcingType')}><option value="">Sin cambios</option>{Object.entries(SOURCING_TYPES).filter(([id]) => id !== 'READY_TO_USE').map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Field><Field label="Unidad" value={values.unit} onChange={common('unit')}><option value="">Sin cambios</option>{UNITS.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}</Field><Field label="Estado" value={values.active} onChange={common('active')}><option value="">Sin cambios</option><option value="true">Activo</option><option value="false">Inactivo</option></Field></div>
        {!!ids.length && <><h3 className="mt-3">Artículos seleccionados</h3>{ids.map(id => { const a = data.purchasedItems.find(a => a.id === id); if (!a) return <p key={id}>Artículo inexistente</p>; const dependencies = purchasedItemDependencies(data, id); return <section className="sale-section mb-2" key={id}><div className="d-flex align-items-end gap-2"><Field label={`Nombre de ${a.name}`} value={names[id] ?? a.name} onChange={e => setNames({ ...names, [id]: e.target.value })} /><button type="button" className="btn btn-outline-secondary" onClick={() => setIds(ids.filter(value => value !== id))}>Quitar {a.name}</button></div><small>{SOURCING_TYPES[a.sourcingType]} · {unitLabel(a.unit)} · {a.active ? 'Activo' : 'Inactivo'}</small>{!!dependencies.length && <p className="form-text">Modalidad y unidad bloqueadas: {dependencies.join(', ')}.</p>}</section>; })}</>}
        <div className="alert alert-info mt-3" aria-live="polite">Modalidad: {SOURCING_TYPES[values.sourcingType] || 'Sin cambios'} · Unidad: {values.unit ? unitLabel(values.unit) : 'Sin cambios'} · Estado: {values.active === '' ? 'Sin cambios' : values.active === 'true' ? 'Activo' : 'Inactivo'}{preview && <p className="mb-0">{preview.modified} artículos serán modificados; {preview.unchanged} ya tienen esos valores.</p>}</div>
        {(validation || error) && <p className="alert alert-danger" role="alert">{validation || error}</p>}
    </AppModal>;
}
