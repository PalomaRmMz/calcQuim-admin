import { yieldText, yieldValid } from '../utils/procurementUtils.js';
import { convertQuantity } from '../utils/units.js';
export function articleYieldSummary(data, articleId) {
    const relations = data.supplyConversions.filter(c => c.purchasedItemId === articleId && c.active);
    const configured = relations.filter(c => yieldValid(c.yield));
    const canonical = (quantity, unit) => {
        const base = ['litro', 'kg'].find(u => convertQuantity(1, unit, u) !== null) || unit;
        return [base, Number(convertQuantity(quantity, unit, base).toPrecision(12))];
    };
    const signature = rule => JSON.stringify([canonical(rule.inputQuantity, rule.inputUnit), canonical(rule.outputQuantity, rule.outputUnit)]);
    const distinct = new Set(configured.map(c => signature(c.yield)));
    const label = !configured.length ? 'Pendiente' : configured.length < relations.length ? `Parcial · ${configured.length}/${relations.length}` : distinct.size > 1 ? 'Variable' : yieldText(configured[0].yield);
    return { label, relations, overrides: data.supplyItems.some(s => s.purchasedItemId === articleId && relations.some(c => s.yieldOverrides?.[c.id])) };
}
