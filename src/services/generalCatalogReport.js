import { catalogProductPrice, parseCatalogPrice } from './catalogValidation.js';

const column = (key, label, width = 25, type = 'text') => ({ key, label, width, type });
const state = value => value == null ? '' : value ? 'Activo' : 'Inactivo';
const same = (a, b) => a != null && b != null && String(a) === String(b);
const id = value => value == null ? '' : String(value);

// Use the same price resolution as the catalog and retain the full source records.
export function generalCatalogWorkbook(snapshot) {
    const { products, categories, productLines, priceGroups } = snapshot.data;
    const capturedAt = new Date(snapshot.generatedAt);
    const common = [column('generatedAt', 'Generado (hora de Ciudad de México)', 32), column('record', 'Registro original (JSON)', 60)];
    const generatedAt = capturedAt.toLocaleString('es-MX', { timeZone: 'America/Mexico_City', hour12: false });
    const rows = entries => entries.map(entry => ({ ...entry, generatedAt }));
    const named = (entries, value) => entries.find(e => same(e.id, value))?.name ?? '';
    return { scope: 'generalCatalog', capturedAt, issueCount: 0, sheets: [
        { name: 'Productos', columns: [column('id', 'ID producto'), column('name', 'Nombre exacto', 40), column('categoryId', 'ID categoría'), column('category', 'Categoría', 35), column('lineId', 'ID línea'), column('line', 'Línea', 35), column('priceGroupId', 'ID grupo de precio'), column('group', 'Grupo de precio', 35), column('effectivePrice', 'Precio vigente (MXN)', 24, 'money'), column('unit', 'Unidad de comercialización'), column('status', 'Estado'), column('available', 'Disponible'), column('priceRule', 'Origen del precio', 35), ...common], rows: rows(products.map(p => ({ ...p, id: id(p.id), categoryId: id(p.categoryId), lineId: id(p.lineId), priceGroupId: id(p.priceGroupId), category: named(categories, p.categoryId), line: named(productLines, p.lineId), group: named(priceGroups, p.priceGroupId), effectivePrice: catalogProductPrice(p, priceGroups) ?? 'No determinado', status: state(p.active), available: p.available == null ? '' : p.available ? 'Sí' : 'No', priceRule: p.priceGroupId != null ? 'Grupo asignado (requiere activo)' : 'Precio individual', record: JSON.stringify(p) }))) },
        { name: 'Categorías', columns: [column('id', 'ID categoría'), column('name', 'Nombre exacto', 40), column('color', 'Color'), column('order', 'Orden'), column('status', 'Estado'), ...common], rows: rows(categories.map(c => ({ ...c, id: id(c.id), status: state(c.active), record: JSON.stringify(c) }))) },
        { name: 'Líneas de productos', columns: [column('id', 'ID línea'), column('name', 'Nombre exacto', 40), column('categoryId', 'ID categoría'), column('category', 'Categoría asociada', 35), column('order', 'Orden'), column('status', 'Estado'), column('prefix', 'Usar como prefijo'), ...common], rows: rows(productLines.map(l => ({ ...l, id: id(l.id), categoryId: id(l.categoryId), category: named(categories, l.categoryId), status: state(l.active), prefix: l.useAsProductPrefix == null ? '' : l.useAsProductPrefix ? 'Sí' : 'No', record: JSON.stringify(l) }))) },
        { name: 'Grupos de precios', columns: [column('id', 'ID grupo'), column('name', 'Nombre exacto', 40), column('price', 'Precio registrado (MXN)', 25, 'money'), column('effectivePrice', 'Precio vigente (MXN)', 25, 'money'), column('units', 'Unidades de productos asignados', 35), column('productIds', 'IDs de productos asignados', 45), column('status', 'Estado'), column('rule', 'Regla de asignación', 55), ...common], rows: rows(priceGroups.map(g => { const assigned = products.filter(p => same(p.priceGroupId, g.id)); return { ...g, id: id(g.id), price: parseCatalogPrice(g.price) ?? 'No determinado', effectivePrice: g.active === false ? 'No determinado' : parseCatalogPrice(g.price) ?? 'No determinado', units: [...new Set(assigned.map(p => p.unit))].join('; '), productIds: assigned.map(p => id(p.id)).join('; '), status: state(g.active), rule: 'Asignación explícita por product.priceGroupId; precio por unidad del producto. Sin escalas de volumen en el modelo actual.', record: JSON.stringify(g) }; })) },
    ] };
}

export async function fetchGeneralCatalog(fetcher = fetch) {
    const response = await fetcher('/api/v1/reports/general-catalog', { cache: 'no-store' });
    // Existing Express instances may still be running the previous route table.
    // The dataset endpoint uses the same read-only, repeatable-read transaction.
    if (response.status === 404) {
        const existing = await fetcher('/api/v1/dataset', { cache: 'no-store' });
        if (!existing.ok) throw new Error('No se pudo consultar el catálogo actual en PostgreSQL.');
        const snapshot = await existing.json();
        return { ...snapshot, data: Object.fromEntries(['products', 'categories', 'productLines', 'priceGroups'].map(key => [key, snapshot.data[key]])), generatedAt: new Date().toISOString() };
    }
    if (!response.ok) throw new Error('No se pudo consultar el catálogo actual en PostgreSQL.');
    return response.json();
}
