import { useState } from 'react';
import { faBox } from '@fortawesome/free-solid-svg-icons';
import AppModal from './AppModal';
import { Field, UnitField } from './ProcurementFields';
import { prepareQuickProduct } from '../services/finishedProductFlow.js';
import { useCatalog } from '../context/CatalogHooks.js';

export default function QuickPurchaseProduct({ name, drafts, onClose, onCreate }) {
    const catalog = useCatalog();
    const [form, setForm] = useState({ name, categoryId: '', lineId: null, unit: 'litro', price: null, priceGroupId: null });
    const [priceMode, setPriceMode] = useState('none');
    const [error, setError] = useState('');
    const lines = catalog.productLines.filter(l => l.active && l.categoryId === form.categoryId);
    const set = key => e => setForm({ ...form, [key]: e.target.value });
    return <AppModal icon={faBox} title="Crear producto para esta compra" subtitle="Producto terminado: compras lo mismo que vendes." submitLabel="Continuar compra" onClose={onClose} onSubmit={e => {
        e.preventDefault();
        try {
            const product = prepareQuickProduct({ ...form, price: priceMode === 'individual' ? Number(form.price) : null, priceGroupId: priceMode === 'group' ? form.priceGroupId : null }, { ...catalog, products: [...catalog.products, ...drafts] });
            onCreate(product);
        } catch (err) { setError(err.message); }
    }}>
        <div className="form-grid">
            <Field label="Nombre" required value={form.name} onChange={set('name')} />
            <Field label="Categoría" value={form.categoryId} onChange={e => setForm({ ...form, categoryId: Number(e.target.value) || '', lineId: null })}><option value="">Sin categoría</option>{catalog.categories.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Field>
            {lines.length > 0 && <Field label="Línea" value={form.lineId ?? ''} onChange={e => setForm({ ...form, lineId: Number(e.target.value) || null })}><option value="">Sin línea</option>{lines.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</Field>}
            <UnitField label="Unidad" required value={form.unit} onChange={set('unit')} />
            <Field label="Precio de venta" value={priceMode} onChange={e => setPriceMode(e.target.value)}><option value="none">Sin precio por ahora</option><option value="individual">Precio individual</option><option value="group">Grupo de precio</option></Field>
            {priceMode === 'individual' && <Field label="Precio individual" required type="number" min="0" step="any" value={form.price ?? ''} onChange={set('price')} />}
            {priceMode === 'group' && <Field label="Grupo de precio" required value={form.priceGroupId ?? ''} onChange={e => setForm({ ...form, priceGroupId: Number(e.target.value) || null })}><option value="">Selecciona grupo</option>{catalog.priceGroups.filter(g => g.active).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</Field>}
        </div>
        <p className="form-text">Se usará el proveedor de la compra. El producto se guardará al registrar la compra.</p>
        {error && <p role="alert" className="alert alert-danger">{error}</p>}
    </AppModal>;
}
