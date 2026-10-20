import PurchasedArticleName from './PurchasedArticleName';
import { buildSupplyContext } from '../utils/supplyContext.js';
import SourceReferencePrice from './SourceReferencePrice';
import SourcePurchaseFields from './SourcePurchaseFields';
import SupplyProductSelection, { SupplyProductIdentity } from './SupplyProductSelection';
import PurchasedItemSetupForm from './PurchasedItemSetupForm';
import { categoryStyle } from '../utils/categoryColors.js';
import { useMemo, useState } from 'react';
import AppModal from './AppModal';
import { Field, UnitField } from './ProcurementFields';
import SupplyYieldFields from './SupplyYieldFields';
import Feedback from './Feedback';
import { useProcurement } from '../context/ProcurementContext.js';
import { useCatalog } from '../context/CatalogHooks.js';
import { SOURCING_TYPES } from '../utils/procurementUtils.js';
import { sourceHasHistory, conversionHasHistory } from '../services/supplyModel.js';
import FormLabel from './FormLabel';
import { normalizeText, getProductChoiceLabel, getProductDisplayName } from '../utils/catalogUtils.js';
import { localDate } from '../utils/salesUtils.js';


const emptyRule = unit => ({ inputQuantity: '', inputUnit: unit, outputQuantity: '', outputUnit: 'litro' });
function ArticleFields({ value, onChange, showName = true, transformable = false }) {
    const set = key => e => onChange({ ...value, [key]: e.target.value });
    return <><div className="form-grid">{showName && <Field label="Artículo comprado" required value={value.name} onChange={set('name')} />}<Field label="Modalidad" required value={value.sourcingType} onChange={set('sourcingType')}>{Object.entries(SOURCING_TYPES).filter(([id]) => !transformable || id !== 'READY_TO_USE').map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Field><UnitField label="Unidad del artículo" required value={value.unit} onChange={set('unit')} /></div></>;
}
export function PurchasedItemForm({ article, initialProductId, onClose }) {
    return article ? <EditPurchasedItemForm article={article} onClose={onClose} /> : <PurchasedItemSetupForm initialProductId={initialProductId} onClose={onClose} />;
}
function EditPurchasedItemForm({ article, onClose }) {
    const { savePurchasedItem } = useProcurement();
    const [form, setForm] = useState(article || { name: '', materialReference: '', sourcingType: 'BASE', unit: 'litro', active: true });
    const [error, setError] = useState('');
    return <AppModal submitLabel={article ? 'Guardar cambios' : 'Crear artículo'} title={article ? 'Editar artículo comprado' : 'Nuevo artículo comprado'} onClose={onClose} onSubmit={e => { e.preventDefault(); const result = savePurchasedItem(form); if (result.ok) onClose(); else setError(result.message); }}><ArticleFields value={form} onChange={setForm} /><label className="mt-3"><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Activo</label><p className="form-text">No se agrega al catálogo de ventas. Después puedes agregar proveedores y productos finales.</p><Feedback message={error} /></AppModal>;
}

export function SourceForm({ article, source, initialSupplierId, onClose }) {
    const { data, saveSources } = useProcurement();
    const [selected, setSelected] = useState(source ? [source.supplierId] : initialSupplierId != null ? [initialSupplierId] : []);
    const hasHistory = Boolean(source && sourceHasHistory(data, source.id));
    const [createNew, setCreateNew] = useState(false);
    const [form, setForm] = useState(source || { purchaseQuantity: '', purchaseUnit: article.unit, presentation: '', active: true });
    const [costs, setCosts] = useState({});
    const [error, setError] = useState('');
    function submit(e) {
        e.preventDefault();
        if (!selected.length) return setError('Selecciona al menos un proveedor.');
        const sources = selected.map(supplierId => ({ ...form, id: createNew ? undefined : source?.id, purchasedItemId: article.id, supplierId, purchaseQuantity: form.purchaseQuantity === '' ? null : form.purchaseQuantity }));
        const quotes = selected.map(supplierId => costs[supplierId] === '' || costs[supplierId] == null ? null : { price: costs[supplierId], priceQuantity: form.purchaseQuantity || 1, priceUnit: form.purchaseUnit, quotedAt: localDate() });
        const result = saveSources(sources, quotes);
        if (result.ok) onClose(); else setError(result.message);
    }
    return <AppModal title={source ? 'Editar proveedor y presentación' : 'Agregar proveedores y presentación'} submitLabel={createNew || !source ? 'Agregar proveedor y presentación' : 'Guardar cambios'} subtitle={article.name} onClose={onClose} onSubmit={submit}>
        {hasHistory && <div className="alert alert-warning"><p>Este proveedor y presentación tienen costos o compras anteriores. Para cambiar sus datos agrega otra oferta; el historial anterior se conserva.</p><label><input type="checkbox" checked={createNew} onChange={e => { setCreateNew(e.target.checked); setForm(e.target.checked ? { ...source, active: true } : source); setSelected([source.supplierId]); }} /> Agregar como nuevo proveedor o presentación</label></div>}
        {!source && <p>Selecciona proveedores y una presentación común. Puedes agregar otra presentación después.</p>}
        {source ? <Field label="Proveedor" required disabled={hasHistory && !createNew} value={selected[0] || ''} onChange={e => setSelected([data.suppliers.find(s => String(s.id) === e.target.value)?.id])}><option value="">Selecciona proveedor</option>{data.suppliers.filter(s => s.active || s.id === source.supplierId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Field> : <FormLabel required>Proveedores (elige al menos uno)</FormLabel>}
        {!data.suppliers.some(s => s.active) && <p>No hay proveedores activos. Crea uno en Compras → Proveedores.</p>}
        {data.suppliers.filter(s => source ? selected.includes(s.id) : s.active).map(s => <div className="d-flex gap-3 align-items-center mb-2" key={s.id}><label hidden={Boolean(source)}><input type="checkbox" required={!source && !selected.length && s.id === data.suppliers.find(entry => entry.active)?.id} aria-required={!source && !selected.length} checked={selected.includes(s.id)} onChange={e => setSelected(e.target.checked ? [...selected, s.id] : selected.filter(id => id !== s.id))} /> {s.name}</label>{selected.includes(s.id) && <Field label={`Costo informado de ${s.name} (opcional)`} type="number" min="0" step="any" value={costs[s.id] ?? ''} onChange={e => setCosts({ ...costs, [s.id]: e.target.value })} />}</div>)}
        <SourcePurchaseFields value={form} onChange={setForm} finished={article.sourcingType === 'READY_TO_USE'} disabled={hasHistory && !createNew} />
        <p className="form-text">Costo por el contenido indicado; si está pendiente, por una unidad. No genera compra.</p><Feedback message={error} />
    </AppModal>;
}

export function ConversionForm({ article, products, conversion, onClose }) {
    const { categories, productLines } = useCatalog();
    const [search, setSearch] = useState('');
    const { data, configureSupplyBatch, saveSupplyConversion } = useProcurement();
    const [selected, setSelected] = useState(conversion ? [conversion.outputProductId] : []);
    const [mode, setMode] = useState(conversion?.yield ? 'common' : 'pending');
    const [rule, setRule] = useState(conversion?.yield || emptyRule(article.unit));
    const [rules, setRules] = useState({});
    const [active, setActive] = useState(conversion?.active !== false);
    const [error, setError] = useState('');
    const available = products.filter(p => !data.supplyConversions.some(c => c.id !== conversion?.id && c.purchasedItemId === article.id && c.outputProductId === p.id));
    const hasHistory = conversion && conversionHasHistory(data, conversion);
    const choice = product => getProductChoiceLabel(product, products, categories, productLines);
    const matches = available.filter(product => selected.includes(product.id) || normalizeText(choice(product)).includes(normalizeText(search)));
    function submit(e) {
        e.preventDefault();
        if (!selected.length) return setError('Selecciona productos finales.');
        const rows = selected.map(outputProductId => ({ outputProductId, active, yield: mode === 'pending' ? null : mode === 'common' ? rule : rules[outputProductId] || emptyRule(article.unit) }));
        const result = conversion ? saveSupplyConversion({ ...rows[0], id: conversion.id, purchasedItemId: article.id }) : configureSupplyBatch({ mode: 'shared', purchasedItemId: article.id, rows });
        if (result.ok) onClose(); else setError(result.message);
    }
    return <AppModal submitLabel={conversion ? 'Guardar cambios' : 'Agregar productos'} title={conversion ? 'Editar producto y rendimiento' : 'Agregar productos finales al artículo'} subtitle={article.name} onClose={onClose} onSubmit={submit} maxWidth="md">
        {hasHistory && <p className="alert alert-warning">Este producto y rendimiento ya se usaron en registros históricos. El cambio se aplicará a partir de ahora; los registros anteriores conservarán sus datos originales.</p>}
        {conversion && <Field label="Producto final" required value={selected[0] ?? ''} onChange={e => setSelected([products.find(p => String(p.id) === e.target.value)?.id])}><option value="">Selecciona producto</option>{available.map(p => <option key={p.id} value={p.id}>{choice(p)} ({p.unit})</option>)}</Field>}
        {conversion && products.find(p => p.id === selected[0]) && <div className="mb-3"><SupplyProductIdentity product={products.find(p => p.id === selected[0])} /></div>}
        {!conversion && <FormLabel required>Productos finales (elige al menos uno)</FormLabel>}
        {!conversion && <Field label="Buscar producto final" value={search} onChange={event => setSearch(event.target.value)} />}
        {!conversion && matches.map(p => <div key={p.id} className="mb-2"><label className="category-accent" style={categoryStyle(categories.find(c => c.id === p.categoryId))}><input type="checkbox" required={!selected.length && p.id === matches[0]?.id} aria-required={!selected.length} checked={selected.includes(p.id)} onChange={e => setSelected(e.target.checked ? [...selected, p.id] : selected.filter(id => id !== p.id))} /> {selected.includes(p.id) ? <SupplyProductIdentity product={p} /> : choice(p)} ({p.unit})</label>{selected.includes(p.id) && mode === 'individual' && article.sourcingType !== 'READY_TO_USE' && <SupplyYieldFields value={rules[p.id] || { ...emptyRule(article.unit), outputUnit: p.unit }} onChange={value => setRules({ ...rules, [p.id]: value })} />}</div>)}
        {!conversion && !matches.length && <p className="form-text">No hay productos disponibles que coincidan. Ajusta la búsqueda o revisa los productos ya configurados.</p>}
        {article.sourcingType === 'READY_TO_USE' ? <p>Producto terminado: equivalencia directa de unidades, sin transformación.</p> : <><Field label="Rendimiento" value={mode} onChange={e => setMode(e.target.value)}><option value="pending">Pendiente</option><option value="common">{conversion ? "Configurar rendimiento" : "Mismo para todos"}</option>{!conversion && <option value="individual">Capturar individualmente</option>}</Field>{mode === 'common' && <SupplyYieldFields value={rule} onChange={setRule} />}</>}
        {conversion && <label><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Abastecimiento activo para este producto (desmarca para retirarlo de las alternativas vigentes)</label>}<p className="form-text">Cada producto conserva su propio rendimiento. Cambiarlo no modifica compras anteriores.</p><Feedback message={error} />
    </AppModal>;
}

export function ProductSupplyBatchForm({ products, initialProductId, single = false, articleBatch = false, onClose }) {
    const { data, configureProductBatch } = useProcurement();
    const { categories, productLines } = useCatalog();
    const [mode, setMode] = useState(articleBatch ? 'shared' : 'individual');
    const context = useMemo(() => buildSupplyContext(data), [data]);
    const contextProduct = products.find(p => p.id === initialProductId);
    const [selected, setSelected] = useState(initialProductId != null ? [initialProductId] : []);
    const [article, setArticle] = useState({ name: '', sourcingType: 'HYDRONEO', unit: 'litro', active: true });
    const [existing, setExisting] = useState(null);
    const [supplierId, setSupplier] = useState('');
    const [supplierMode, setSupplierMode] = useState(single ? 'common' : 'later');
    const [common, setCommon] = useState({ purchaseQuantity: '', purchaseUnit: 'litro', presentation: '', price: '' });
    const [individual, setIndividual] = useState(false);
    const [values, setValues] = useState({});
    const [yieldMode, setYieldMode] = useState('pending');
    const [rule, setRule] = useState(emptyRule('litro'));
    const [error, setError] = useState('');
    const displayName = p => getProductDisplayName(p, categories, productLines);
    const withSupplier = supplierMode === 'later' ? 0 : supplierMode === 'common' ? (supplierId ? selected.length : 0) : selected.filter(id => values[id]?.supplierId).length;
    const chosenArticle = (mode === 'shared' && data.purchasedItems.find(a => a.id === existing)) || article;
    const rowArticle = id => (mode === 'shared' ? chosenArticle : data.purchasedItems.find(a => a.id === values[id]?.existingId)) || article;
    const rowArticleId = id => mode === 'shared' ? existing : values[id]?.existingId;
    const hasRelation = id => context.byProduct.get(id)?.some(r => r.article.id === rowArticleId(id));
    const newArticles = mode === 'shared' ? Number(selected.length > 0 && existing == null) : selected.filter(id => values[id]?.existingId == null).length;
    const reusedArticles = new Set(selected.map(rowArticleId).filter(id => id != null)).size;
    const repeatedNames = mode === 'individual' ? selected.filter(id => values[id]?.existingId == null && normalizeText(values[id]?.name)).map(id => normalizeText(values[id].name)) : [];
    const hasRepeatedNames = new Set(repeatedNames).size < repeatedNames.length;
    const changeRow = (id, changes) => setValues({ ...values, [id]: { ...values[id], ...changes } });
    const sourceFields = (value, onChange) => <><SourcePurchaseFields value={value} onChange={onChange} finished={!articleBatch} /><SourceReferencePrice value={value} onChange={onChange} /></>;
    function submit(e) {
        e.preventDefault();
        if (!selected.length) return setError('Selecciona productos finales.');
        if (initialProductId != null && !contextProduct) return setError('El producto de origen ya no existe.');
        const rows = selected.map(outputProductId => ({ outputProductId, purchasedItemId: mode === 'individual' ? values[outputProductId]?.existingId : undefined, supplierId: data.suppliers.find(s => String(s.id) === String(values[outputProductId]?.supplierId))?.id, article: { ...article, name: values[outputProductId]?.name || '' }, source: individual && mode === 'individual' ? values[outputProductId]?.source || common : common, yield: yieldMode === 'pending' ? null : yieldMode === 'common' ? rule : values[outputProductId]?.yield || null }));
        const result = configureProductBatch({ finished: !articleBatch, quotedAt: localDate(), mode, supplierMode, article, purchasedItemId: mode === 'shared' ? existing ?? undefined : undefined, supplierId: data.suppliers.find(s => String(s.id) === String(supplierId))?.id, rows });
        if (result.ok) onClose(); else setError(result.message);
    }
    return <AppModal title={articleBatch ? 'Agregar artículos comprados por lote' : single ? 'Agregar producto terminado' : 'Configurar productos terminados por lote'} onClose={onClose} onSubmit={submit} submitLabel={!articleBatch ? "Guardar abastecimiento" : mode === "shared" && existing != null ? "Agregar productos" : "Crear artículos y agregar productos"} maxWidth="lg">
        <p className="form-text">{articleBatch ? "Configura artículos que se transforman en productos finales." : "Configura productos que el proveedor vende ya terminados. No registra compras."}</p>{articleBatch && <>
            <Field label="Organización de los artículos" value={mode} onChange={e => { setMode(e.target.value); setSupplierMode('later'); setYieldMode('pending'); }}><option value="shared">Un mismo artículo para varios productos</option><option value="individual">Un artículo por producto</option></Field>
            <p className="form-text">Si compras la misma Base para varios productos, captura su nombre una sola vez. Usa un artículo por producto cuando sean materiales distintos.</p>
            {mode === 'shared' && <PurchasedArticleName name={article.name} onNameChange={name => setArticle({ ...article, name })} items={data.purchasedItems} context={context} existingId={existing} autoFocus onReuse={a => { setExisting(a.id); setYieldMode('pending'); }} onNew={() => { setExisting(null); setYieldMode('pending'); }} />}
            {(mode === 'individual' || existing == null) && <ArticleFields transformable value={article} showName={false} onChange={setArticle} />}
            {mode === 'individual' && <p className="form-text">Captura o reutiliza el artículo dentro de cada producto seleccionado. Modalidad y unidad se aplican a los artículos nuevos; los existentes conservan las suyas.</p>}
        </>}<h3 className="h6 mt-4">Productos finales</h3>
        {initialProductId != null && !articleBatch ? <section className="batch-article">{contextProduct ? <SupplyProductIdentity product={contextProduct} /> : <Feedback message="El producto de origen ya no existe." />}</section> : <SupplyProductSelection supplyContext={articleBatch ? context : undefined} articleId={mode === 'shared' ? existing : undefined} articleIds={mode === 'individual' ? Object.fromEntries(selected.map(id => [id, values[id]?.existingId])) : undefined} lockRelated={false} products={products} selected={selected} onChange={setSelected} single={single} required>{p => <>{articleBatch && mode === 'individual' && <PurchasedArticleName label={`Artículo comprado para ${displayName(p)}`} name={values[p.id]?.name || ''} onNameChange={name => changeRow(p.id, { name })} items={data.purchasedItems} context={context} existingId={values[p.id]?.existingId} onReuse={a => changeRow(p.id, { existingId: a.id, yield: undefined })} onNew={() => changeRow(p.id, { existingId: undefined, yield: undefined })} />}{supplierMode === 'individual' && <Field label="Proveedor" required value={values[p.id]?.supplierId || ''} onChange={e => changeRow(p.id, { supplierId: e.target.value })}><option value="">Selecciona proveedor</option>{data.suppliers.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Field>}{individual && mode === 'individual' && supplierMode !== 'later' && sourceFields(values[p.id]?.source || common, source => changeRow(p.id, { source }))}{articleBatch && yieldMode === 'individual' && !hasRelation(p.id) && rowArticle(p.id).sourcingType !== 'READY_TO_USE' && <SupplyYieldFields value={values[p.id]?.yield || { ...emptyRule(data.purchasedItems.find(a => a.id === values[p.id]?.existingId)?.unit || chosenArticle.unit), outputUnit: p.unit }} onChange={value => changeRow(p.id, { yield: value })} />}</>}</SupplyProductSelection>}
        {(selected.length > 0 || !articleBatch) && <>
        <h3 className="h6 mt-4">Proveedores y presentación</h3>
        {!single && <Field label="Cómo configurar proveedores" value={supplierMode} onChange={e => setSupplierMode(e.target.value)}><option value="later">Configurar después</option><option value="common">Mismo proveedor para todos</option>{mode === 'individual' && <option value="individual">Proveedor diferente por producto</option>}</Field>}
        {supplierMode === 'later' ? <p className="form-text">Puedes agregar el proveedor después. Se crean únicamente artículos y sus productos relacionados.</p> : <>
            {supplierMode === 'common' && <Field label="Proveedor" required value={supplierId} onChange={e => setSupplier(e.target.value)}><option value="">Selecciona proveedor</option>{data.suppliers.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Field>}
            {!single && mode === 'individual' && <label className="mb-3"><input type="checkbox" checked={individual} onChange={e => setIndividual(e.target.checked)} /> Configurar presentación y costo por artículo</label>}
            {(!individual || mode === 'shared') && <>{sourceFields(common, setCommon)}</>}
        </>}
        {articleBatch && chosenArticle.sourcingType !== 'READY_TO_USE' && <section className="source-yield-explained"><h3 className="source-purchase-heading">¿Cuánto producto final obtienes?</h3><p className="form-text">Define la cantidad de insumo que usas y el producto que produces, independientemente del tamaño del envase.</p><Field label="Cómo configurar el rendimiento" value={yieldMode} onChange={e => setYieldMode(e.target.value)}><option value="pending">Pendiente</option><option value="common">Mismo para todos</option><option value="individual">Individual</option></Field>{yieldMode === 'common' && <SupplyYieldFields value={rule} onChange={setRule} showSummary />}</section>}
        </>}
        {articleBatch && hasRepeatedNames && <Feedback variant="warning" message="Hay nombres de artículos nuevos repetidos en el lote. Si es el mismo material, elige Un mismo artículo para varios productos y captura su nombre una sola vez. Los nombres iguales no se fusionan automáticamente." />}
        {selected.length > 0 && <div className="batch-review mt-4" role="status"><h3 className="h6">Revisión</h3><p>{selected.length} productos seleccionados{articleBatch && <> · {newArticles} artículos nuevos · {reusedArticles} artículos reutilizados · {selected.filter(id => !hasRelation(id)).length} productos por agregar · {selected.filter(hasRelation).length} productos ya configurados</>} · {withSupplier} con proveedor · {selected.length - withSupplier} sin proveedor</p><p className="form-text">{articleBatch && 'Los productos ya configurados conservan su estado y rendimiento. '}Si alguna fila es inválida, no se guardará ninguna.</p></div>}
        <Feedback message={error} />
    </AppModal>;
}
