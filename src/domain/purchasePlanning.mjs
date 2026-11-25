import {productActivity, supplierMatches} from './activityScope.mjs';
import {inventoryAttention, requiresInventoryPurchase} from './inventoryAttention.mjs';
import {purchaseInventoryIntent} from './purchaseInventory.mjs';
import {inventoryConvert, inventoryDecimal} from '../services/inventoryUnits.js';
import {getProductDisplayName} from '../utils/catalogUtils.js';
import {validDate} from '../utils/procurementUtils.js';
import {normalizeUnit, unitLabel} from '../utils/units.js';
import {catalogProductPrice} from '../services/catalogValidation.js';
import {wholesaleSettings} from './wholesalePricing.mjs';
import {money} from '../utils/salesUtils.js';

export const planningCostSources = {
    historical: 'Compra histórica', quote: 'Cotización registrada', manual: 'Estimación manual',
    sale: 'Estimado desde precio de venta', missing: 'Sin estimación',
};

const scale = 1000000n;
const same = (a, b) => String(a) === String(b);
const whole = unit => !['litro', 'mililitro', 'kg', 'gramo'].includes(unit);
const knownNumber = value => value == null || value === '' ? null : Number(value);
const cents = value => {
    const number = knownNumber(value);
    const rounded = Math.round(number * 100);
    return number !== null && number >= 0 && Number.isSafeInteger(rounded) &&
        Math.abs(number * 100 - rounded) < 1e-6 ? rounded : null;
};
const compatibleQuantity = (value, from, to) => {
    try { return Number(inventoryConvert(value, from, to)); }
    catch { return null; }
};
const supplyKey = id => 'insumo:' + id;
function registeredInputs(model) {
    const suppliers = new Map(model.suppliers.map(supplier => [String(supplier.id), supplier]));
    return (model.purchasedItems ?? []).filter(item => {
        if (item.active === false || item.sourcingType === 'READY_TO_USE' || !normalizeUnit(item.unit)) return false;
        const sources = (model.supplyItems ?? []).filter(source => same(source.purchasedItemId, item.id));
        return !sources.length || sources.some(source => suppliers.get(String(source.supplierId))?.businessActivity !== 'JARCERIA');
    });
}

function inputPresentations(item, model, unit) {
    const base = {id: '', name: unitLabel(unit), unit, factor: 1, integer: whole(unit)};
    const suppliers = new Map(model.suppliers.map(supplier => [String(supplier.id), supplier]));
    const registered = (model.supplyItems ?? []).filter(source => source.active !== false && same(source.purchasedItemId, item.id))
        .flatMap(source => {
            const factor = compatibleQuantity(source.purchaseQuantity, source.purchaseUnit, unit);
            if (!(factor > 0)) return [];
            return [{id: 'fuente:' + source.id, sourceId: String(source.id), supplierId: String(source.supplierId),
                supplierName: suppliers.get(String(source.supplierId))?.name,
                name: [source.presentation, source.purchaseQuantity + ' ' + unitLabel(source.purchaseUnit)].filter(Boolean).join(' · '),
                unit: 'presentación', factor, integer: true}];
        });
    return [base, ...registered];
}

export function planningRows(data, view) {
    const packs = new Map((view.packInventory?.products ?? []).map(pack => [String(pack.productId), pack]));
    const products = new Map(data.products.map(product => [String(product.id), product]));
    const rows = new Map();
    const preferIndividual = Boolean(wholesaleSettings(data));
    for (const stock of view.products) {
        const id = String(stock.productId), product = products.get(id);
        if (!product || product.active === false) continue;
        const activity = productActivity(product), unit = normalizeUnit(stock.unit);
        const attention = inventoryAttention(stock, packs.get(id));
        const minimum = knownNumber(stock.minimum);
        const status = activity === 'JARCERIA' && attention.key === 'low' && attention.quantity === minimum ? 'atMinimum' : attention.key;
        const hasSalePrice = product.available !== false && !product.pricePending;
        const presentations = (data.procurement.presentations ?? []).filter(p =>
            p.active && same(p.productId, id) && normalizeUnit(p.baseUnit) === unit &&
            normalizeUnit(p.unit) && Number.isFinite(Number(p.factor)) && Number(p.factor) > 0
        ).map(p => ({id: String(p.id), name: p.name, unit: normalizeUnit(p.unit), factor: Number(p.factor),
            integer: p.integerOnly || whole(normalizeUnit(p.unit)),
            saleCents: hasSalePrice && p.saleEnabled !== false && Number(p.price) > 0 ? cents(p.price) : null}));
        if (unit && (!presentations.length || activity === 'LIMPIEZA')) {
            const price = hasSalePrice && normalizeUnit(product.unit) === unit ?
                catalogProductPrice(product, data.priceGroups ?? [], preferIndividual) : null;
            presentations.unshift({id: '', name: unitLabel(unit), unit, factor: 1, integer: whole(unit),
                saleCents: price > 0 ? cents(price) : null});
        }
        const name = getProductDisplayName(product, activity === 'JARCERIA' ?
            data.procurement.hardwareCategories : data.categories, activity === 'JARCERIA' ? [] : data.productLines);
        rows.set(id, {id, name, activity, unit, quantity: attention.quantity, minimum, status, presentations, presentationStock:stock.presentationStock});
    }
    for (const item of registeredInputs(data.procurement)) {
        const id = supplyKey(item.id), unit = normalizeUnit(item.unit);
        rows.set(id, {id, articleId: item.id, name: item.name, activity: 'LIMPIEZA', unit, quantity: null,
            minimum: null, status: 'input', presentations: inputPresentations(item, data.procurement, unit)});
    }
    return [...rows.values()].sort((a,b) => a.name.localeCompare(b.name, 'es'));
}

export function provisionalQuantity(row, presentation) {
    if (!presentation || row.minimum === null || !(requiresInventoryPurchase(row.status) || row.status === 'atMinimum')) return '';
    const target = Math.max(0, row.minimum - row.quantity);
    const liters = row.activity === 'LIMPIEZA' ? compatibleQuantity(presentation.factor, row.unit, 'litro') : null;
    const step = liters && !presentation.integer ? 1 / liters : 1;
    const desired = Math.max(step, Math.ceil(target / presentation.factor / step - 1e-9) * step);
    if (liters && liters > 20) return '';
    const limit = liters ? Math.floor(20 / liters / step + 1e-9) * step : Infinity;
    return String(Number(Math.min(desired, limit).toFixed(6)));
}

export function historicalPlanningCosts(data, today) {
    const history = new Map(), model = data.procurement;
    const products = new Map(data.products.map(p => [String(p.id), p]));
    const inputs = new Map(registeredInputs(model).map(item => [String(item.id), item]));
    const sourceArticles = new Map((model.supplyItems ?? []).map(source => [String(source.id), source.purchasedItemId]));
    for (const purchase of model.purchases) {
        if (purchase.voidedAt || !validDate(purchase.date) || purchase.date > today) continue;
        for (const item of purchase.items) {
            const input = inputs.get(String(item.purchasedItemId ?? sourceArticles.get(String(item.supplyItemId))));
            if (input && !item.commercialPurchase) {
                const baseQuantity = compatibleQuantity(item.quantity, item.unit, input.unit);
                const paid = cents(item.total), key = supplyKey(input.id);
                if (baseQuantity > 0 && paid !== null) {
                    if (!history.has(key)) history.set(key, []);
                    history.get(key).push({supplierId: String(purchase.supplierId), date: purchase.date,
                        timestamp: purchase.updatedAt ?? purchase.createdAt ?? '', paid, baseQuantity, baseUnit: input.unit,
                        sourceId: String(item.supplyItemId)});
                }
                continue;
            }
            const ids = item.commercialPurchase ? [item.productId] :
                (item.conversionSnapshots ?? [item]).map(c => c.productId ?? c.outputProductId);
            const candidates = [...new Set(ids.filter(id => id != null).map(String))];
            const product = candidates.length === 1 ? products.get(candidates[0]) : null;
            if (!product) continue;
            const intent = purchaseInventoryIntent(item, [product]), paid = cents(item.total);
            if (intent.nature !== 'finished' || !intent.quantity || paid === null) continue;
            const key = String(product.id);
            if (!history.has(key)) history.set(key, []);
            history.get(key).push({
                supplierId: String(purchase.supplierId), date: purchase.date, timestamp: purchase.updatedAt ?? purchase.createdAt ?? '',
                paid, baseQuantity: Number(intent.quantity), baseUnit: intent.unit,
                presentationId: item.commercialPurchase?.presentationId, presentationQuantity: Number(item.commercialPurchase?.quantity),
                presentationUnit: item.commercialPurchase?.unit,
            });
        }
    }
    return history;
}

export function planningQuantity(value, presentation) {
    try {
        const amount = inventoryDecimal(value);
        return amount > 0n && amount <= BigInt(Number.MAX_SAFE_INTEGER) &&
            (!presentation?.integer || amount % scale === 0n) ? amount : null;
    } catch { return null; }
}

export function planningOffers(row, presentation, quantity, model, history, today) {
    if (!presentation) return [];
    const latest = new Map();
    for (const observation of history.get(row.id) ?? []) {
        const base = compatibleQuantity(observation.baseQuantity, observation.baseUnit, row.unit);
        if (!base) continue;
        if (presentation.sourceId && presentation.sourceId !== observation.sourceId) continue;
        if (presentation.id && !presentation.sourceId && (!same(observation.presentationId, presentation.id) ||
            normalizeUnit(observation.presentationUnit) !== presentation.unit ||
            Math.abs(base - observation.presentationQuantity * presentation.factor) > 1e-6)) continue;
        const denominator = presentation.id && !presentation.sourceId ? observation.presentationQuantity : base;
        const unitCents = observation.paid / denominator * (presentation.sourceId ? presentation.factor : 1);
        if (!Number.isFinite(unitCents)) continue;
        const previous = latest.get(observation.supplierId);
        if (!previous || observation.date + observation.timestamp > previous.date + previous.timestamp) {
            latest.set(observation.supplierId, {...observation, unitCents, source: planningCostSources.historical});
        }
    }
    const offers = [];
    for (const supplier of model.suppliers) {
        if (supplier.active === false || !supplierMatches(supplier, row.activity, {includeUnclassified: row.activity === 'LIMPIEZA'})) continue;
        const id = String(supplier.id);
        if (presentation.supplierId && presentation.supplierId !== id) continue;
        const sources = (model.supplyItems ?? []).filter(s => s.active && same(s.supplierId, id) && (row.articleId != null ?
            same(s.purchasedItemId, row.articleId) && (!presentation.sourceId || same(s.id, presentation.sourceId)) : (
            s.sourcingType === 'READY_TO_USE' && same(s.outputProductId, row.id) ||
            (model.purchasedItems ?? []).some(a => a.active && a.sourcingType === 'READY_TO_USE' && same(a.id, s.purchasedItemId)) &&
            (model.supplyConversions ?? []).some(c => c.active && same(c.purchasedItemId, s.purchasedItemId) && same(c.outputProductId, row.id))
        )));
        const formats = sources.filter(s => s.purchaseQuantity != null).map(s =>
            [s.presentation, s.purchaseQuantity + ' ' + unitLabel(s.purchaseUnit)].filter(Boolean).join(' · '));
        const terms = (model.supplierPurchaseTiers?.[id] ?? []).filter(t => !t.presentationId || same(t.presentationId, presentation.id));
        let cost = latest.get(id);
        if (!cost && (!presentation.id || presentation.sourceId)) {
            const sourceIds = new Set(sources.map(s => String(s.id)));
            for (const quote of model.supplierPrices ?? []) {
                if (!sourceIds.has(String(quote.supplyItemId)) || !same(quote.supplierId, id) ||
                    !validDate(quote.quotedAt) || quote.quotedAt > today ||
                    quote.validUntil && (!validDate(quote.validUntil) || quote.validUntil < today)) continue;
                const snapshot = quote.snapshot;
                const product = {id: row.id, unit: row.unit, activity: row.activity};
                const quotedQuantity = row.articleId != null ?
                    (snapshot?.purchasedItemId == null || same(snapshot.purchasedItemId, row.articleId) ?
                        compatibleQuantity(quote.priceQuantity, quote.priceUnit, row.unit) : null) :
                    Number(snapshot && purchaseInventoryIntent({...snapshot, quantity: quote.priceQuantity, unit: quote.priceUnit}, [product]).quantity);
                const paid = cents(quote.price);
                if (quotedQuantity > 0 && paid !== null && (!cost || quote.quotedAt > cost.date ||
                    quote.quotedAt === cost.date && (quote.createdAt ?? '') > cost.timestamp)) {
                    cost = {date: quote.quotedAt, timestamp: quote.createdAt ?? '', unitCents: paid / quotedQuantity *
                        (presentation.sourceId ? presentation.factor : 1), source: planningCostSources.quote};
                }
            }
        }
        const tier = terms.filter(t => presentation.id && t.presentationId && quantity >= t.minimumQuantity &&
            cents(t.costPerPresentation) !== null && t.evidence && validDate(t.quotedAt) && t.quotedAt <= today)
            .sort((a,b) => b.minimumQuantity - a.minimumQuantity)[0];
        if (tier && !cost) {
            cost = {date: tier.quotedAt, unitCents: cents(tier.costPerPresentation), source: planningCostSources.quote};
        }
        offers.push({id, name: supplier.name, ...cost, formats: [...new Set(formats)], tiers: [...new Set(terms.map(t => t.minimumQuantity))]});
    }
    return offers.sort((a,b) => (a.unitCents ?? Infinity) - (b.unitCents ?? Infinity) || a.name.localeCompare(b.name, 'es'));
}

export function plannedPurchaseLine(row, draft, model, history, today) {
    const presentation = row.presentations.find(p => p.id === draft.presentationId) ?? row.presentations[0];
    const input = draft.quantity ?? provisionalQuantity(row, presentation);
    const quantity = presentation ? planningQuantity(input, presentation) : null;
    const offers = planningOffers(row, presentation, quantity === null ? 0 : Number(quantity) / Number(scale), model, history, today);
    const supplier = draft.supplierId === undefined ?
        offers.find(o => o.source === planningCostSources.historical) ?? offers.find(o => o.unitCents != null) ??
            (presentation?.supplierId ? offers[0] : undefined) :
        offers.find(o => o.id === draft.supplierId);
    const manual = cents(draft.cost);
    const unitCents = supplier?.unitCents ?? manual ?? presentation?.saleCents ?? null;
    const source = supplier?.source ?? (manual !== null ? planningCostSources.manual :
        unitCents !== null ? planningCostSources.sale : planningCostSources.missing);
    const amount = quantity === null || unitCents === null ? null : Math.round(Number(quantity) * unitCents / Number(scale) + 1e-9);
    return {presentation, input, quantity, offers, supplier, unitCents,
        supplierName: draft.supplierId === 'manual' ? draft.supplierName?.trim() : supplier?.name,
        source,
        amount: Number.isSafeInteger(amount) ? amount : null};
}

export const planningActivities = {LIMPIEZA: 'Limpieza', JARCERIA: 'Jarcería'};

export function purchasePlanSummary(selected) {
    const amounts = {LIMPIEZA: 0, JARCERIA: 0};
    const bySource = {known: 0, sale: 0, manual: 0};
    const groups = new Map();
    let missingCosts = 0, missingQuantities = 0, missingAmounts = 0;
    for (const {row, line} of selected) {
        amounts[row.activity] += line.amount ?? 0;
        const bucket = line.source === planningCostSources.sale ? 'sale' :
            line.source === planningCostSources.manual ? 'manual' : 'known';
        bySource[bucket] += line.amount ?? 0;
        if (line.unitCents === null) missingCosts++;
        if (line.quantity === null) missingQuantities++;
        if (line.amount === null) missingAmounts++;
        const key = line.supplier?.id ?? null;
        if (!groups.has(key)) groups.set(key, {name: line.supplier?.name ?? 'Proveedor por definir',
            amount: 0, pending: 0, items: []});
        const group = groups.get(key);
        group.amount += line.amount ?? 0;
        if (line.amount === null) group.pending++;
        const presentation = line.presentation;
        const format = presentation?.sourceId ? '× ' + presentation.name :
            presentation?.id ? unitLabel(presentation.unit) + ' (' + presentation.name + ')' : unitLabel(presentation?.unit);
        const price = line.amount === null ? 'Por determinar' : money(line.amount / 100) +
            (line.source === planningCostSources.sale ? ' (ref. venta)' : line.source === planningCostSources.manual ? ' (manual)' : '');
        group.items.push('• ' + row.name + ' — ' + line.input + ' ' + format + ' — ' + price);
    }
    const total = amounts.LIMPIEZA + amounts.JARCERIA;
    const budgetLabel = (amount, pending, count) => pending === count ? 'Por determinar' :
        money(amount / 100) + (pending ? ' (parcial · ' + pending + ' pendiente' + (pending === 1 ? '' : 's') + ')' : '');
    const supplierGroups = [...groups.values()].map(group => ({
        ...group, subtotal: budgetLabel(group.amount, group.pending, group.items.length),
    }));
    const message = !missingQuantities && selected.length ? ['*COMPRAS PLANEADAS*',
        ...supplierGroups.map(group => '*' + group.name + '*\n' + group.items.join('\n') + '\nSubtotal estimado: ' + group.subtotal),
        '*TOTAL ESTIMADO: ' + budgetLabel(total, missingAmounts, selected.length) + '*',
        'Nota: Presupuesto aproximado, sujeto a precios y disponibilidad del proveedor.',
    ].join('\n\n') : '';
    return {amounts, bySource, missingCosts, missingQuantities, missingAmounts, supplierGroups, message};
}
