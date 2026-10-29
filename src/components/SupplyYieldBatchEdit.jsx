import { useState } from 'react';
import AppModal from './AppModal';
import { Field } from './ProcurementFields';
import SupplyYieldFields from './SupplyYieldFields';
import MoreOptions from './MoreOptions';
import ClassificationBadge from './ClassificationBadge';
import { useProcurement } from '../context/ProcurementContext.js';
import { useCatalog } from '../context/CatalogHooks.js';
import { SOURCING_TYPES, yieldText } from '../utils/procurementUtils.js';
import { UNITS } from '../utils/units.js';
import { conversionHasHistory } from '../services/supplyModel.js';
import { YIELD_FIELDS, yieldRelationRows, filterYieldRelations, changeYieldCategory, toggleYieldSelection, commonYieldChanges, prepareSupplyYieldBatch } from '../services/supplyYieldBatch.js';
import '../styles/components/SupplyYieldBatch.css';

const emptyCommon = { inputQuantity: '', inputUnit: '', outputQuantity: '', outputUnit: '' };
const emptyFilters = { search: '', sourcingType: '', yieldStatus: '', categoryId: '', lineId: '' };

export default function SupplyYieldBatchEdit({ onClose }) {
    const { data, saveSupplyYieldBatch } = useProcurement();
    const { products, categories, productLines } = useCatalog();
    const [sourceId, setSourceId] = useState('');
    const [ids, setIds] = useState([]);
    const [filters, setFilters] = useState(emptyFilters);
    const [common, setCommon] = useState(emptyCommon);
    const [drafts, setDrafts] = useState(new Map());
    const [error, setError] = useState('');
    const [appliedCommon, setAppliedCommon] = useState(null);
    const source = data.supplyItems.find(s => s.id === sourceId);
    const rows = yieldRelationRows(data, products, categories, productLines).filter(row => !source || row.article.id === source.purchasedItemId).map(row => source ? { ...row, relation: { ...row.relation, yield: source.yieldOverrides?.[row.relation.id] || row.relation.yield } } : row);
    const matches = filterYieldRelations(rows, filters);
    const selected = ids.map(id => rows.find(row => row.relation.id === id)).filter(Boolean);
    const request = { sourceId: sourceId || null, rows: ids.map(id => ({ id, changes: drafts.get(id) || {} })) };
    let preview, validation = '';
    if (ids.length) {
        try { preview = prepareSupplyYieldBatch(data, products, request); }
        catch (e) { validation = e.message; }
    }
    const historical = preview?.modifiedIds.filter(id => conversionHasHistory(data, data.supplyConversions.find(c => c.id === id))).length || 0;
    const commonPending = appliedCommon && [...YIELD_FIELDS, 'presentationQuantity'].some(key => common[key] !== appliedCommon[key]);
    const unapplied = (Object.keys(commonYieldChanges(common)).length > 0 || Boolean(common.presentationQuantity)) && (!appliedCommon || commonPending);
    const setFilter = key => e => setFilters({ ...filters, [key]: e.target.value });
    function toggle(id) {
        setIds(toggleYieldSelection(ids, id));
        if (ids.includes(id)) setDrafts(previous => { const next = new Map(previous); next.delete(id); return next; });
        setError('');
    }
    function applyCommon() {
        const changes = { ...commonYieldChanges(common), ...(common.presentationQuantity ? { presentationQuantity: common.presentationQuantity } : {}) };
        if (!ids.length || !Object.keys(changes).length) return setError('Selecciona productos e indica al menos un cambio común.');
        setDrafts(previous => { const next = new Map(previous); ids.forEach(id => next.set(id, { ...next.get(id), ...changes })); return next; });
        setAppliedCommon({ ...common });
        setError('');
    }
    async function submit(e) {
        e.preventDefault();
        if (unapplied) return setError('Aplica los valores comunes a seleccionados antes de guardar.');
        if (!preview?.modified) return setError(validation || 'No hay rendimientos modificados.');
        const result = await saveSupplyYieldBatch(request);
        if (result.ok) onClose(); else setError(result.message);
    }
    const identity = row => <><strong>{row.article.name} → {row.productName}</strong><ClassificationBadge product={row.product} categories={categories} productLines={productLines} /><small>{yieldText(row.relation.yield)}{!row.relation.active ? ' · Abastecimiento inactivo' : ''}</small></>;
    const commonField = (key, label, isUnit = false) => <Field label={label} value={common[key]} onChange={e => setCommon({ ...common, [key]: e.target.value })} {...(!isUnit ? { type: 'number', min: 0, step: 'any', placeholder: 'Sin cambios' } : {})}>{isUnit ? <><option value="">Sin cambios</option>{UNITS.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}</> : undefined}</Field>;
    return <AppModal title="Editar rendimientos por lote" subtitle="Artículo comprado → Producto final" maxWidth="md" onClose={onClose} onSubmit={submit} actions={<><button type="button" className="btn btn-light" onClick={onClose}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={!preview?.modified || Boolean(unapplied)}>Guardar rendimientos</button></>}>
        <div className="yield-batch">
            <Field label="Alcance del rendimiento" value={sourceId} onChange={e => { setSourceId(e.target.value); setIds([]); setDrafts(new Map()); setCommon(emptyCommon); setAppliedCommon(null); setError(''); }}><option value="">Rendimiento base de cada producto</option>{data.supplyItems.map(s => <option key={s.id} value={s.id}>{data.purchasedItems.find(a => a.id === s.purchasedItemId)?.name } · {data.suppliers.find(p => p.id === s.supplierId)?.name } · {s.presentation || 'Presentación'} {s.purchaseQuantity} {s.purchaseUnit}</option>)}</Field>
            {source && <p className="form-text">Rendimiento específico de esta oferta. Sin excepción se utiliza el rendimiento base del producto.</p>}
            <Field label="Buscar rendimientos" placeholder="Artículo, modalidad, producto, categoría o línea" value={filters.search} onChange={setFilter('search')} />
            <div className="form-grid">
                <Field label="Modalidad" value={filters.sourcingType} onChange={setFilter('sourcingType')}><option value="">Todas</option>{Object.entries(SOURCING_TYPES).filter(([id]) => id !== 'READY_TO_USE').map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Field>
                <Field label="Estado del rendimiento" value={filters.yieldStatus} onChange={setFilter('yieldStatus')}><option value="">Todos</option><option value="configured">Configurado</option><option value="pending">Pendiente</option><option value="override">Con excepción por proveedor</option></Field>
                <Field label="Categoría" value={filters.categoryId} onChange={e => setFilters(changeYieldCategory(filters, e.target.value, productLines))}><option value="">Todas</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Field>
                <Field label="Línea" value={filters.lineId} disabled={!filters.categoryId} onChange={setFilter('lineId')}><option value="">Todas</option>{productLines.filter(l => String(l.categoryId) === filters.categoryId).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</Field>
            </div>
            <div className="yield-batch-results" aria-label="Rendimientos encontrados">
                {!matches.length && <p className="form-text">{Object.values(filters).some(Boolean) ? 'No hay rendimientos que coincidan.' : 'Busca o filtra para seleccionar rendimientos.'}</p>}
                {matches.slice(0, 40).map(row => <label className="yield-batch-choice" key={row.relation.id}><input type="checkbox" checked={ids.includes(row.relation.id)} onChange={() => toggle(row.relation.id)} /><span>{identity(row)}</span></label>)}
                {matches.length > 40 && <p className="form-text">Se muestran 40 resultados. Precisa la búsqueda.</p>}
            </div>
            <section aria-label="Rendimiento común">
                <h3>Aplicar a seleccionados</h3><p className="form-text">Deja un campo en blanco o en “Sin cambios” para conservar su valor. Los rendimientos pendientes necesitan los cuatro datos.</p>
                <div className="form-grid">{commonField('inputQuantity', 'Cantidad de insumo')}{commonField('inputUnit', 'Unidad del insumo', true)}{commonField('outputQuantity', 'Cantidad final obtenida')}{commonField('outputUnit', 'Unidad final', true)}</div>
                {source && <Field label="Cantidad de presentaciones de esta oferta (opcional)" type="number" min="0" step="any" value={common.presentationQuantity || ''} onChange={e => setCommon({ ...common, presentationQuantity: e.target.value })} />}
                <button type="button" className="btn btn-outline-primary mt-2" onClick={applyCommon} disabled={!ids.length}>Aplicar a seleccionados</button>
            </section>
            <section aria-label="Rendimientos seleccionados"><h3>{ids.length} rendimientos seleccionados</h3>
                {selected.map(row => {
                    const id = row.relation.id;
                    const draft = drafts.get(id);
                    const next = preview?.next.supplyConversions.find(c => c.id === id);
                    const value = { inputQuantity: '', inputUnit: row.article.unit, outputQuantity: '', outputUnit: row.product.unit, ...row.relation.yield, ...draft };
                    return <div className="yield-batch-selected" key={id} data-relation-id={id}>
                        <div className="yield-batch-identity">{identity(row)}{draft && <p className="mb-0">Nuevo: {next && !validation ? yieldText(source ? preview.next.supplyItems.find(s => s.id === source.id)?.yieldOverrides?.[id] || next.yield : next.yield) : 'Revisa los valores del rendimiento'}</p>}</div>
                        <button type="button" className="btn btn-outline-secondary" onClick={() => toggle(id)} aria-label={`Quitar ${row.article.name} → ${row.productName}`}>Quitar</button>
                        <MoreOptions label={`Ajustar ${row.productName}`}><SupplyYieldFields required={Boolean(draft)} value={value} onChange={rule => { setDrafts(previous => new Map(previous).set(id, Object.fromEntries(YIELD_FIELDS.map(key => [key, rule[key]])))); setError(''); }} /></MoreOptions>
                    </div>;
                })}
            </section>
            {preview && <div className="alert alert-info mb-0" aria-live="polite">{preview.modified} cambiarán; {preview.unchanged} sin cambios o ya tienen este rendimiento.</div>}
            {!!historical && <p className="alert alert-warning mb-0">{historical} configuraciones tienen compras históricas. El rendimiento nuevo se usará en operaciones futuras; las compras anteriores y sus revisiones conservarán sus datos originales.</p>}
            {unapplied && <p className="form-text mb-0">Hay valores comunes pendientes de aplicar.</p>}
            {(validation || error) && <p role="alert" className="alert alert-danger mb-0">{validation || error}</p>}
            <small className="form-text">Solo productos ya vinculados al artículo. Los productos terminados conservan su equivalencia directa y no aparecen aquí.</small>
        </div>
    </AppModal>;
}
