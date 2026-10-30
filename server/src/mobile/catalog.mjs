import { normalizeUnit } from './adminUnits.mjs';
import { normalizeText } from './text.mjs';
export { normalizeText } from './text.mjs';
const same = (a, b) => String(a) === String(b);
export const PRICING_VERSION = 'admin-sales-v1';
export function validateCatalog(snapshot) {
  if (!snapshot || typeof snapshot.generation !== 'string' || !Number.isSafeInteger(snapshot.revision)) throw new Error('Catálogo sin revisión oficial.');
  for (const field of ['products', 'categories', 'productLines', 'priceGroups']) {
    if (!Array.isArray(snapshot.data?.[field])) throw new Error('Catálogo incompleto.');
    const ids = new Set();
    for (const row of snapshot.data[field]) {
      if (row.id == null || !row.name?.trim() || ids.has(String(row.id))) throw new Error('Identificadores de catálogo inválidos.');
      ids.add(String(row.id));
    }
  }
  if (snapshot.pricingVersion !== PRICING_VERSION) throw new Error('Motor de precios incompatible; actualiza la aplicación.');
  return snapshot;
}
export function productPrice(product, groups) {
  if (!product) return null;
  const group = groups.find(g => same(g.id, product.priceGroupId));
  const value = product.priceGroupId != null ? (group?.active === false ? null : group?.price) : product.price;
  return value == null || String(value).trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0 ? null : Number(value);
}
export function catalogChoices(data) {
  if (!data) return [];
  const { products, categories, productLines, priceGroups } = data;
  const available = products.filter(p => p.active && p.available !== false && normalizeUnit(p.unit) && productPrice(p, priceGroups) !== null);
  const make = (kind, entity, members, context) => {
    const tariffs = new Map();
    for (const p of members) {
      const price = productPrice(p, priceGroups), unit = normalizeUnit(p.unit), key = `${price}:${unit}`;
      if (!tariffs.has(key)) tariffs.set(key, { key, price, unit, productIds: [] });
      tariffs.get(key).productIds.push(p.id);
    }
    return { key: `${kind}:${entity.id}`, kind, refId: entity.id, name: entity.name, context, tariffs: [...tariffs.values()] };
  };
  return [
    ...available.map(p => {
      const c = categories.find(c => same(c.id, p.categoryId)), l = productLines.find(l => same(l.id, p.lineId));
      const g = priceGroups.find(g => same(g.id, p.priceGroupId));
      const prefix = l?.name || (c?.useAsProductPrefix ? c.name : '');
      return make('product', { ...p, name: [prefix, p.name].filter(Boolean).join(' ') }, [p], [c?.name, l?.name, g?.name || 'Precio individual'].filter(Boolean).join(' · '));
    }),
    ...productLines.filter(l => l.active).map(l => make('line', l, available.filter(p => same(p.lineId, l.id)), categories.find(c => same(c.id, l.categoryId))?.name)),
    ...priceGroups.filter(g => g.active !== false).map(g => make('priceGroup', g, available.filter(p => same(p.priceGroupId, g.id)), 'Tarifa oficial de grupo')),
    ...categories.filter(c => c.active).map(c => make('category', c, available.filter(p => same(p.categoryId, c.id)), 'Selecciona una tarifa si hay varias')),
  ].filter(choice => choice.tariffs.length);
}
export function searchChoices(choices, query, usage = {}) {
  const text = normalizeText(query), words = text.split(' ').filter(Boolean);
  const score = c => (normalizeText(c.name) === text && text ? 100000 : 0) + (usage[c.key]?.count || 0) * 10 + (usage[c.key]?.at ? Date.parse(usage[c.key].at) / 1e13 : 0);
  return choices.filter(c => words.every(w => normalizeText(`${c.name} ${c.context}`).includes(w)))
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name, 'es'));
}
