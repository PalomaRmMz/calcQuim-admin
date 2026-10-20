import { buildSupplyContext } from '../utils/supplyContext.js';
import PurchasedArticleName from './PurchasedArticleName';
import SupplyCoverage from './SupplyCoverage';
import { useMemo, useState } from 'react';
import { faBoxesStacked } from '@fortawesome/free-solid-svg-icons';
import AppModal from './AppModal';
import { Field, UnitField } from './ProcurementFields';
import SupplyProductSelection, { SupplyProductIdentity } from './SupplyProductSelection';
import SupplyYieldFields from './SupplyYieldFields';
import Feedback from './Feedback';
import { useCatalog } from '../context/CatalogHooks.js';
import { useProcurement } from '../context/ProcurementContext.js';
import { SOURCING_TYPES } from '../utils/procurementUtils.js';
import { localDate } from '../utils/salesUtils.js';

export default function PurchasedItemSetupForm({ initialProductId, onClose }) {
    const { products } = useCatalog();
    const { data, savePurchasedItemSetup } = useProcurement();
    const [existingArticleId, setExistingArticleId] = useState(null);
    const context = useMemo(() => buildSupplyContext(data), [data]);
    const [article, setArticle] = useState({ name: '', sourcingType: 'BASE', unit: 'litro', active: true });
    const [selected, setSelected] = useState(initialProductId != null ? [initialProductId] : []);
    const [supplierMode, setSupplierMode] = useState('later');
    const [source, setSource] = useState({ supplierId: '', purchaseQuantity: '', purchaseUnit: 'litro', presentation: '', price: '' });
    const [rules, setRules] = useState({});
    const [error, setError] = useState('');
    const [draftSelection, setDraftSelection] = useState([]);
    const chosenArticle = data.purchasedItems.find(a => a.id === existingArticleId) || article;
    const product = products.find(p => p.id === initialProductId);
    const set = key => e => setArticle({ ...article, [key]: e.target.value });
    const setSourceField = key => e => setSource({ ...source, [key]: e.target.value });
    const rule = p => rules[p.id]?.yield || { inputQuantity: '', inputUnit: chosenArticle.unit, outputQuantity: '', outputUnit: p.unit };
    const relationFields = p => context.byProduct.get(p.id)?.some(r => r.article.id === existingArticleId) ? null : <div className="mt-2"><Field label={`Rendimiento para ${p.name}`} value={rules[p.id]?.mode || 'pending'} onChange={e => setRules({ ...rules, [p.id]: { ...rules[p.id], mode: e.target.value } })}><option value="pending">Configurar después</option><option value="now">Configurar ahora</option></Field>{rules[p.id]?.mode === 'now' && <SupplyYieldFields value={rule(p)} onChange={value => setRules({ ...rules, [p.id]: { mode: 'now', yield: value } })} />}</div>;
    return <AppModal title={existingArticleId == null ? 'Nuevo artículo comprado' : 'Usar artículo existente'} icon={faBoxesStacked} maxWidth="md" submitLabel={existingArticleId == null ? 'Crear artículo' : 'Guardar nuevas alternativas'} onClose={onClose} onSubmit={e => {
        e.preventDefault();
        if (initialProductId != null && !product) return setError('El producto de origen ya no existe.');
        const result = savePurchasedItemSetup({ existingArticleId, article: chosenArticle, supplierMode, source: { ...source, supplierId: data.suppliers.find(s => String(s.id) === String(source.supplierId))?.id }, quotedAt: localDate(), relations: selected.map(id => ({ outputProductId: id, yield: rules[id]?.mode === 'now' ? rules[id].yield || rule(products.find(p => p.id === id)) : null })) });
        if (result.ok) onClose(); else setError(result.message);
    }}>
        <p className="form-text">Configura lo que compras y, si lo conoces, qué productos obtienes. No registra una compra.</p>
        <PurchasedArticleName name={article.name} onNameChange={name => setArticle({ ...article, name })} items={data.purchasedItems} context={context} existingId={existingArticleId} autoFocus
            onReuse={a => { setDraftSelection(selected); setExistingArticleId(a.id); setRules({}); setSelected([...new Set([...selected, ...(context.byArticle.get(a.id) || []).map(c => c.outputProductId)])]); }}
            onNew={() => { setExistingArticleId(null); setSelected(draftSelection); setRules({}); }} />
        {existingArticleId == null && <div className="form-grid"><Field label="Modalidad" required value={article.sourcingType} onChange={set('sourcingType')}>{Object.entries(SOURCING_TYPES).filter(([id]) => id !== 'READY_TO_USE').map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Field><UnitField label="Unidad del artículo" required value={article.unit} onChange={e => { setArticle({ ...article, unit: e.target.value }); setSource({ ...source, purchaseUnit: e.target.value }); }} /><label className="form-check form-switch align-self-center"><input className="form-check-input" type="checkbox" checked={article.active} onChange={e => setArticle({ ...article, active: e.target.checked })} />Activo</label></div>}
        <h3 className="h6 mt-3">{initialProductId != null ? 'Producto final' : 'Productos finales relacionados'}</h3>
        {product ? <section className="batch-article"><SupplyProductIdentity product={product} /><SupplyCoverage routes={context.byProduct.get(product.id)} selected articleId={existingArticleId} />{relationFields(product)}</section> : initialProductId == null ? <SupplyProductSelection supplyContext={context} articleId={existingArticleId} products={products.filter(p => p.active || selected.includes(p.id))} selected={selected} onChange={setSelected}>{relationFields}</SupplyProductSelection> : <Feedback message="El producto de origen ya no existe." />}
        <h3 className="h6 mt-3">Proveedor y presentación</h3>
        <Field label="Proveedor" value={supplierMode} onChange={e => setSupplierMode(e.target.value)}><option value="later">Configurar después</option><option value="now">Configurar ahora</option></Field>
        {supplierMode === 'now' && <><div className="form-grid"><Field label="Proveedor del artículo" required value={source.supplierId} onChange={setSourceField('supplierId')}><option value="">Selecciona proveedor</option>{data.suppliers.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Field><UnitField label="Unidad de compra" required value={source.purchaseUnit} onChange={setSourceField('purchaseUnit')} /><Field label="Contenido (opcional)" type="number" min="0" data-positive="true" step="any" value={source.purchaseQuantity} onChange={setSourceField('purchaseQuantity')} /><Field label="Presentación (opcional)" value={source.presentation} onChange={setSourceField('presentation')} /><Field label="Costo informado (opcional)" type="number" min="0" step="any" value={source.price} onChange={setSourceField('price')} /></div><p className="form-text">Costo por el contenido indicado; si está pendiente, por una unidad. No genera compra.</p></>}
        <Feedback message={error} />
    </AppModal>;
}
