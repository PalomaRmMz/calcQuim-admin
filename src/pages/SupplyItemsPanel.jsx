import { articleYieldSummary } from '../services/articleYieldSummary.js';
import PurchasedItemBatchEdit from '../components/PurchasedItemBatchEdit';
import SupplyYieldBatchEdit from '../components/SupplyYieldBatchEdit';
import { useState } from 'react';
import ActionMenu from '../components/ActionMenu';
import { useCatalog } from '../context/CatalogHooks.js';
import { useProcurement } from '../context/ProcurementContext.js';
import { getProductDisplayName, getProductChoiceLabel } from '../utils/catalogUtils.js';
import { categoryStyle } from '../utils/categoryColors.js';
import { SOURCING_TYPES, supplyPresentation, yieldText } from '../utils/procurementUtils.js';
import { joinedSupply, migrateSupplyModel } from '../services/supplyModel.js';
import { procurementAnalytics } from '../utils/purchaseAnalytics.js';
import StatusBadge from '../components/StatusBadge';
import '../styles/components/SupplyDetail.css';
import ClassificationBadge from '../components/ClassificationBadge';
import { money } from '../utils/salesUtils.js';
import ContentPanel from '../components/ContentPanel';
import DataTable from '../components/DataTable';
import AppModal from '../components/AppModal';
import SupplyPriceSection from '../components/SupplyPriceSection';
import { PurchasedItemForm, SourceForm, ConversionForm, ProductSupplyBatchForm } from '../components/PurchasedItemForms';

const costText = cost => cost ? `${money(cost.price)} / ${cost.priceQuantity} ${cost.priceUnit} · ${cost.date}` : 'Sin registro';
export default function SupplyItemsPanel() {
    const { data: storedData, analytics: storedAnalytics, setSupplyActive, integrityIssues = [] } = useProcurement();
    const { products: rawProducts, categories, productLines } = useCatalog();
    const products = rawProducts.map(p => ({ ...p, displayName: getProductDisplayName(p, categories, productLines) }));
    const productLabel = p => p ? getProductChoiceLabel(p, products, categories, productLines) : 'Producto inexistente';
    const data = storedData.supplyModelVersion === 2 ? storedData : migrateSupplyModel(storedData, products);
    const analytics = storedData === data ? storedAnalytics : procurementAnalytics(data, products);
    const [view, setView] = useState('products');
    const [selectedId, setSelected] = useState(null);
    const [productId, setProduct] = useState(null);
    const [form, setForm] = useState(null);
    const [type, setType] = useState('');
    const [supplier, setSupplier] = useState('');
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const article = data.purchasedItems.find(a => a.id === selectedId);
    const product = products.find(p => p.id === productId);
    const sources = a => data.supplyItems.filter(s => s.purchasedItemId === a.id);
    const conversions = a => data.supplyConversions.filter(c => c.purchasedItemId === a.id);
    const latestFor = (a, field) => sources(a).map(s => analytics.bySupply.get(s.id)?.[field]).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date))[0];
    const articles = data.purchasedItems.filter(a => a.sourcingType !== 'READY_TO_USE' && (!type || a.sourcingType === type) && (!status || String(a.active) === status) && (!supplier || sources(a).some(s => String(s.supplierId) === supplier)));
    const articleColumns = [
        { accessorKey: 'name', header: 'Artículo comprado', size: 180 },
        { accessorKey: 'materialReference', header: 'Referencia interna' },
        { id: 'mode', header: 'Modalidad', size: 105, accessorFn: a => SOURCING_TYPES[a.sourcingType] },
        { id: 'suppliers', header: 'Proveedores', size: 165, accessorFn: a => [...new Set(sources(a).map(s => analytics.supplierMap.get(s.supplierId)?.name))].join(', ') || 'Sin proveedor' },
        { id: 'presentations', header: 'Presentaciones', accessorFn: a => [...new Set(sources(a).map(s => supplyPresentation(joinedSupply(data, s))))].join(', ') || 'Pendiente' },
        { id: 'products', header: 'Productos finales relacionados', size: 180, accessorFn: a => conversions(a).map(c => products.find(p => p.id === c.outputProductId)?.displayName || 'Producto inexistente').join(', ') || 'Sin productos relacionados' },
        { id: 'yield', header: 'Rendimiento', size: 170, accessorFn: a => articleYieldSummary(data, a.id).label, Cell: ({ row }) => {
            const summary = articleYieldSummary(data, row.original.id);
            return <div><strong>{summary.label}</strong>{summary.overrides && <small className="d-block">Excepción por proveedor</small>}<details><summary>Ver rendimientos</summary>{summary.relations.map(c => <div key={c.id}>{products.find(p => p.id === c.outputProductId)?.displayName}: {yieldText(c.yield)}{sources(row.original).filter(s => s.yieldOverrides?.[c.id]).map(s => <div key={s.id}>{analytics.supplierMap.get(s.supplierId)?.name } · {s.presentation}: {s.yieldOverrides[c.id].presentationQuantity ? `${s.yieldOverrides[c.id].presentationQuantity} presentación(es) ? ` : ''}{yieldText(s.yieldOverrides[c.id])}</div>)}</div>)}</details></div>;
        } },
        { id: 'paid', header: 'Última compra', accessorFn: a => costText(latestFor(a, 'lastPurchase')) },
        { id: 'quote', header: 'Último costo informado', accessorFn: a => costText(latestFor(a, 'lastQuote')) },
        { id: 'state', header: 'Estado', size: 95, accessorFn: a => a.active ? 'Activo' : 'Inactivo', Cell: ({ row }) => <StatusBadge active={row.original.active} /> },
        { id: 'actions', header: 'Acciones', size: 120, enableSorting: false, Cell: ({ row }) => <button className="btn btn-outline-secondary" onClick={() => setSelected(row.original.id)}>Ver artículo</button> },
    ];
    const productColumns = [
        { accessorKey: 'displayName', header: 'Producto final', Cell: ({ row }) => <span className="category-accent" style={categoryStyle(categories.find(c => c.id === row.original.categoryId))}>{productLabel(row.original)}</span> },
        { id: 'category', header: 'Categoría', accessorFn: p => categories.find(c => c.id === p.categoryId)?.name || 'Sin categoría' },
        { id: 'line', header: 'Línea', accessorFn: p => productLines.find(l => l.id === p.lineId)?.name || 'Sin línea', Cell: ({ row }) => <ClassificationBadge product={row.original} categories={categories} productLines={productLines} /> },
        { id: 'options', header: 'Opciones', accessorFn: p => analytics.byProduct.get(p.id)?.alternatives.length || 0 },
        { id: 'suppliers', header: 'Proveedores', accessorFn: p => new Set(analytics.byProduct.get(p.id)?.alternatives.map(r => r.supplierId)).size },
        { id: 'paid', header: 'Última compra', accessorFn: p => costText(analytics.byProduct.get(p.id)?.lastPurchase) },
        { id: 'quote', header: 'Último costo informado', accessorFn: p => costText(analytics.byProduct.get(p.id)?.lastQuote) },
        { id: 'best', header: 'Mejor costo conocido', accessorFn: p => { const best = analytics.byProduct.get(p.id)?.best; return best ? `${money(best.cost)} / ${p.unit}` : 'Sin costo comparable'; } },
        { id: 'actions', header: 'Acciones', Cell: ({ row }) => <button className="btn btn-outline-secondary" onClick={() => setProduct(row.original.id)}>Ver abastecimiento</button> },
    ];
    return <>
        <div className="supply-perspective mb-3" role="group" aria-label="Perspectiva de abastecimiento"><button aria-pressed={view === 'products'} className={`btn btn-${view === 'products' ? 'primary' : 'outline-primary'}`} onClick={() => setView('products')}>Por producto final</button><button aria-pressed={view === 'articles'} className={`btn btn-${view === 'articles' ? 'primary' : 'outline-primary'}`} onClick={() => setView('articles')}>Por artículo comprado</button></div>
        {integrityIssues.length > 0 && <details className="alert alert-warning"><summary>{integrityIssues.length} observaciones por revisar</summary><ul>{integrityIssues.map((text, i) => <li key={i}>{text}</li>)}</ul></details>}
        <ContentPanel title={view === 'products' ? 'Abastecimiento por producto final' : 'Abastecimiento por artículo comprado'} action={<div className="d-flex flex-wrap gap-2">{view === 'products' && <button className="btn btn-primary" onClick={() => setForm({ kind: 'batch', single: true })}>Agregar producto terminado</button>}<button className={`btn ${view === 'products' ? 'btn-outline-secondary' : 'btn-primary'}`} onClick={() => setForm({ kind: view === 'products' ? 'batch' : 'article' })}>{view === 'products' ? 'Configurar productos terminados por lote' : 'Nuevo artículo comprado'}</button>{view === 'articles' && <ActionMenu label="Acciones por lote" actions={[{ label: 'Agregar artículos por lote', onClick: () => setForm({ kind: 'batch', articleBatch: true }) }, { label: 'Editar artículos por lote', onClick: () => setForm({ kind: 'editArticles' }) }, { label: 'Editar rendimientos por lote', onClick: () => setForm({ kind: 'editYields' }) }]} />}</div>}>
            {view === 'articles' && <div className="filter-bar"><label>Modalidad<select className="form-select" value={type} onChange={e => setType(e.target.value)}><option value="">Todas</option>{Object.entries(SOURCING_TYPES).filter(([id]) => id !== 'READY_TO_USE').map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label>Proveedor<select className="form-select" value={supplier} onChange={e => setSupplier(e.target.value)}><option value="">Todos</option>{data.suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Estado<select className="form-select" value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos</option><option value="true">Activo</option><option value="false">Inactivo</option></select></label></div>}
            <DataTable pinActions mobileCards mobilePrimaryColumns={view === 'articles' ? ['name', 'mode', 'yield', 'state', 'actions'] : ['displayName', 'options', 'best', 'actions']} mobileSecondaryColumns={view === 'articles' ? ['products', 'suppliers', 'presentations'] : ['line', 'suppliers']} mobileDetailsLabel={view === 'articles' ? 'Productos, proveedores y presentaciones' : 'Clasificación y proveedores'} columnOrder={view === 'articles' ? ['name', 'mode', 'products', 'yield', 'suppliers', 'state', 'actions', 'presentations', 'materialReference', 'paid', 'quote'] : undefined} emptyMessage={view === "products" ? "No hay productos finales que coincidan. Registra lo que vendes en Productos o ajusta la búsqueda." : "No hay artículos comprados que coincidan. Usa Nuevo artículo comprado o ajusta los filtros."} key={view} columnVisibility={view === 'products' ? { category: false, paid: false, quote: false } : { materialReference: false, presentations: false, paid: false, quote: false }} columns={view === 'products' ? productColumns : articleColumns} data={view === 'products' ? products : articles} searchPlaceholder={view === 'products' ? 'Buscar producto final...' : 'Buscar artículo, referencia o proveedor...'} />
        </ContentPanel>
        {product && <AppModal title={product.displayName} subtitle="Proveedores, compras y costos de este producto" maxWidth="lg" onClose={() => setProduct(null)}><button className="btn btn-primary mb-3" onClick={() => setForm({ kind: 'batch', productId: product.id })}>Agregar producto terminado</button><button className="btn btn-outline-secondary mb-3 ms-2" onClick={() => setForm({ kind: 'article', productId: product.id })}>Agregar artículo transformable</button>{!(analytics.byProduct.get(product.id)?.alternatives.length) && <p>Este producto todavía no tiene ofertas de proveedores. Agrega una alternativa o configura el proveedor de un artículo relacionado.</p>}{data.supplyConversions.filter(c => c.outputProductId === product.id && c.active && !data.supplyItems.some(s => s.purchasedItemId === c.purchasedItemId && s.active)).map(c => <section className="sale-section mb-3" key={c.id}><h3>{data.purchasedItems.find(a => a.id === c.purchasedItemId)?.name}</h3><p>Proveedor pendiente · {yieldText(c.yield)}</p><button className="btn btn-outline-secondary" onClick={() => { setProduct(null); setSelected(c.purchasedItemId); }}>Configurar proveedor del artículo</button></section>)}{(analytics.byProduct.get(product.id)?.alternatives || []).map(r => {
            const finished = r.display.snapshot.sourcingType === 'READY_TO_USE';
            const source = data.supplyItems.find(s => s.id === r.supplyItemId);
            const sourceArticle = data.purchasedItems.find(a => a.id === source?.purchasedItemId);
            return <section className="sale-section mb-3" key={r.id}>
                <h3>{analytics.supplierMap.get(r.supplierId)?.name}</h3>
                <p>{supplyPresentation(r.display.snapshot)} {finished ? '\u00b7 Producto terminado, sin transformaci\u00f3n' : `\u00b7 ${r.display.snapshot.name}`}</p>
                <p><strong>{r.effectiveCost == null ? 'Sin costo comparable' : `${money(r.effectiveCost)} / ${product.unit}`}</strong>{r.reference && <small className="d-block text-muted">{r.reference.source} · {r.reference.date}</small>}</p>
                {finished ? <><SupplyPriceSection supplyId={r.supplyItemId} /><button className="btn btn-outline-secondary mt-2" onClick={() => setForm({ kind: 'source', article: sourceArticle, source })}>Editar proveedor y forma de compra</button></> : <button className="btn btn-outline-secondary" onClick={() => { setProduct(null); setSelected(source?.purchasedItemId); }}>Ver insumo y rendimientos</button>}
            </section>;
        })}</AppModal>}
        {article && <AppModal title={article.name} subtitle={`${SOURCING_TYPES[article.sourcingType]} · ${article.materialReference || 'Artículo comprado'}`} maxWidth="md" onClose={() => setSelected(null)}>
            <div className="supply-detail">
                <button className="btn btn-outline-secondary" onClick={() => setForm({ kind: 'article', article })}>Editar artículo</button>
                <div className="section-heading"><h3>Productos finales relacionados</h3><button className="btn btn-outline-secondary" onClick={() => setForm({ kind: 'conversion', article })}>Agregar productos finales</button></div>
                {!conversions(article).length && <p className="text-muted">Relaciona un producto final para indicar qué puedes obtener de este artículo.</p>}
                {conversions(article).map(c => <div className="supply-relation" key={c.id}><div><strong>{productLabel(products.find(p => p.id === c.outputProductId))}</strong><p>{article.sourcingType === 'READY_TO_USE' ? 'Sin transformación' : yieldText(c.yield)} <StatusBadge active={c.active} activeText="Activa" inactiveText="Inactiva" /></p></div><button className="btn btn-outline-secondary" onClick={() => setForm({ kind: 'conversion', article, conversion: c })}>Editar producto y rendimiento</button></div>)}
                <div className="section-heading"><h3>Proveedores</h3><button className="btn btn-primary" onClick={() => setForm({ kind: 'source', article })}>Agregar proveedor</button></div>
                {!sources(article).length && <p className="text-muted">No hay proveedores configurados. Agrega uno para poder registrar compras.</p>}
                {sources(article).map(source => <section className="supply-offer" key={source.id}>
                    <div className="supply-offer-header"><div><h3>{analytics.supplierMap.get(source.supplierId)?.name}</h3><p>{supplyPresentation(joinedSupply(data, source))}</p></div><StatusBadge active={source.active} /></div>
                    <SupplyPriceSection supplyId={joinedSupply(data, source).id} additionalActions={<ActionMenu label="Más acciones del proveedor" actions={[{ label: 'Editar proveedor y presentación', onClick: () => setForm({ kind: 'source', article, source }) }, { label: source.active ? 'Inactivar' : 'Activar', onClick: () => { const result = setSupplyActive(source.id, !source.active); setError(result.ok ? '' : result.message); } }]} />} />
                </section>)}
                {error && <p role="alert">{error}</p>}
            </div>
        </AppModal>}
        {form?.kind === 'editArticles' && <PurchasedItemBatchEdit products={products} onClose={() => setForm(null)} />}
        {form?.kind === 'editYields' && <SupplyYieldBatchEdit onClose={() => setForm(null)} />}
        {form?.kind === 'article' && <PurchasedItemForm initialProductId={form.productId} article={form.article} onClose={() => setForm(null)} />}
        {form?.kind === 'source' && <SourceForm article={form.article} source={form.source} onClose={() => setForm(null)} />}
        {form?.kind === 'conversion' && <ConversionForm article={form.article} conversion={form.conversion} products={products} onClose={() => setForm(null)} />}
        {form?.kind === 'batch' && <ProductSupplyBatchForm products={products} single={form.single || form.productId != null} initialProductId={form.productId} articleBatch={form.articleBatch} onClose={() => setForm(null)} />}
    </>;
}
