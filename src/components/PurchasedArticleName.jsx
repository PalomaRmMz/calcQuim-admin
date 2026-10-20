import { useMemo } from 'react';
import { Field } from './ProcurementFields';
import { similarPurchasedItems } from '../utils/supplyContext.js';
import { SOURCING_TYPES } from '../utils/procurementUtils.js';

// Explicit reuse keeps a typed draft separate from the canonical article.
export default function PurchasedArticleName({ name, onNameChange, items, context, existingId, onReuse, onNew, label = 'Artículo comprado', autoFocus = false }) {
    const existing = items.find(a => a.id === existingId);
    const matches = useMemo(() => existing ? [] : similarPurchasedItems(items, name), [items, name, existing]);
    const metadata = a => <span className="d-block small text-muted">{SOURCING_TYPES[a.sourcingType]} · {a.unit} · {context.byArticle.get(a.id)?.length || 0} productos relacionados · {new Set((context.sourcesByArticle.get(a.id) || []).map(s => s.supplierId)).size} proveedores · {context.sourcesByArticle.get(a.id)?.length || 0} ofertas de proveedor{!a.active && ' · Inactivo'}</span>;
    return <section className="mb-3" aria-label={label} style={{ overflowWrap: 'anywhere' }}>
        {existing ? <div className="alert alert-info mb-0"><strong>Artículo existente: {existing.name}</strong>{metadata(existing)}<p className="small my-2">Se conservan sus datos y productos relacionados. Solo se agregará lo nuevo.</p><button type="button" className="btn btn-outline-secondary btn-sm" onClick={onNew}>Volver al nombre capturado</button></div> : <>
            <Field label={label} required autoFocus={autoFocus} value={name} onChange={e => onNameChange(e.target.value)} placeholder="Ej. Base Fabuloso" />
            <p className="form-text mb-2">Escribe el nombre de lo que compras. Un mismo artículo puede abastecer varios productos y tener varios proveedores.</p>
            {matches.length > 0 && <aside className="border rounded p-2" aria-label="Artículos similares"><strong className="small">Revisa los artículos existentes antes de crear otro</strong><p className="form-text mb-2">La coincidencia de nombre no fusiona artículos. Elige uno solo si es el mismo material.</p><div style={{ maxHeight: '14rem', overflowY: 'auto' }}>{matches.map(a => <div key={a.id} className="border-top py-2"><strong>{a.name}</strong>{metadata(a)}<button type="button" disabled={!a.active} className="btn btn-outline-primary btn-sm mt-1" onClick={() => onReuse(a)}>Usar artículo existente</button></div>)}</div></aside>}
        </>}
    </section>;
}
