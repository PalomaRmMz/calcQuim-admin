import SupplyCoverage from './SupplyCoverage';
import { useState } from 'react';
import { useCatalog } from '../context/CatalogHooks.js';
import { getProductChoiceLabel, getProductDisplayName, normalizeText } from '../utils/catalogUtils.js';
import { categoryStyle } from '../utils/categoryColors.js';
import { Field } from './ProcurementFields';
import FormLabel from './FormLabel';
import { supplySelectionLines, compatibleSupplyLine, visibleSupplyProducts } from '../utils/supplyProductSelection.js';

export function SupplyProductIdentity({ product }) {
    const { categories, productLines } = useCatalog();
    const category = categories.find(c => String(c.id) === String(product.categoryId));
    return <><span>{getProductDisplayName(product, categories, productLines)}</span><span className="classification-label category-accent ms-2" style={categoryStyle(category)} data-product-category={product.categoryId ?? ''}>{category?.name || (product.categoryId == null ? 'Sin categoría' : 'Categoría no disponible')}</span></>;
}

export default function SupplyProductSelection({ products, selected, onChange, single = false, required = false, children, supplyContext, articleId, articleIds, lockRelated = true }) {
    const { categories, productLines } = useCatalog();
    const [supplyFilter, setSupplyFilter] = useState('');
    const [search, setSearch] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [lineId, setLineId] = useState('');
    const category = p => categories.find(c => String(c.id) === String(p.categoryId));
    const lines = supplySelectionLines(productLines, categoryId);
    const query = normalizeText(search);
    const hasCriteria = Boolean(query || categoryId || lineId || supplyFilter);
    const visible = visibleSupplyProducts(products, selected, categories, productLines, { search, categoryId, lineId, supplyFilter, supplyContext, articleId });
    return <>
        <div className="form-grid">
            <Field label="Buscar productos finales" value={search} onChange={e => setSearch(e.target.value)} />
            <Field label="Categoría" value={categoryId} onChange={e => { setCategoryId(e.target.value); setLineId(compatibleSupplyLine(productLines, e.target.value, lineId)); }}><option value="">Todas las categorías</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Field>
            <Field label="Línea" disabled={!categoryId || !lines.length} value={lineId} onChange={e => setLineId(e.target.value)}><option value="">{!categoryId ? 'Selecciona una categoría' : lines.length ? 'Todas las líneas' : 'Sin líneas disponibles'}</option>{lines.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</Field>
            {supplyContext && <Field label="Abastecimiento" value={supplyFilter} onChange={e => setSupplyFilter(e.target.value)}><option value="">Todos</option><option value="none">Sin abastecimiento</option><option value="some">Con abastecimiento</option>{articleId != null && <option value="related">Ya relacionado con este artículo</option>}</Field>}
        </div>
        <FormLabel required={required}>Productos finales ({required ? 'elige al menos uno' : 'opcional'})</FormLabel>
        <p className="form-text">Los seleccionados permanecen visibles al cambiar la búsqueda o los filtros.</p>
        {visible.map(p => <section key={p.id} data-product-id={p.id} className={`batch-article mt-2 ${selected.includes(p.id) ? 'is-selected' : ''}`} style={categoryStyle(category(p))}>
            <label className="category-accent"><input type="checkbox" disabled={lockRelated && articleId != null && supplyContext?.byProduct.get(p.id)?.some(r => r.article.id === articleId)} required={required && !selected.length && p.id === visible[0]?.id} checked={selected.includes(p.id)} onChange={e => onChange(e.target.checked ? single ? [p.id] : [...selected, p.id] : selected.filter(id => id !== p.id))} /> {selected.includes(p.id) ? getProductDisplayName(p, categories, productLines) : getProductChoiceLabel(p, products, categories, productLines)}</label>
            <span className="classification-label category-accent ms-2" data-product-category={p.categoryId ?? ''}>{category(p)?.name || (p.categoryId == null ? 'Sin categoría' : 'Categoría no disponible')}</span>
            {supplyContext && <SupplyCoverage routes={supplyContext.byProduct.get(p.id)} selected={selected.includes(p.id)} articleId={articleIds?.[p.id] ?? articleId} />}
            {selected.includes(p.id) && children?.(p)}
        </section>)}
        {!visible.length && <p className="form-text">{hasCriteria ? 'No hay productos que coincidan. Ajusta la búsqueda o los filtros.' : 'Busca un producto o selecciona una categoría o línea para ver resultados.'}</p>}
    </>;
}
