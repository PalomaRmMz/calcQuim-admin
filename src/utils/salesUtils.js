import { calculateWholesaleItems, WHOLESALE_VERSION } from '../domain/wholesalePricing.mjs';
export const money = (value) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);

export function localDate() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function calculateHistoricalItems(items) {
    const aggregate = calculateWholesaleItems(items);
    return aggregate.map((item) => {
        if (item.commerceVersion || item.pricingVersion === WHOLESALE_VERSION) return item;
        if (item.pricingVersion === NORMAL_PRICING_VERSION) return calculateItems([item])[0];
        const isLiter = ["litro", "litros", "l"].includes(String(item.unit).trim().toLowerCase());
        if (item.entryMode === "amount") {
            const amountCents = Math.round(Number(item.requestedAmount) * 100);
            const wholesaleThreshold = Math.round(item.price * 10 * 100) - Math.round(Math.round(item.price * 10 * 100) * 0.15);
            const discountRate = isLiter && amountCents >= wholesaleThreshold ? 0.15 : 0;
            const quantity = item.price > 0 ? amountCents / 100 / (item.price * (1 - discountRate)) : NaN;
            const subtotalCents = Math.round(amountCents / (1 - discountRate));
            return { ...item, quantity, subtotal: subtotalCents / 100, discountRate, discount: (subtotalCents - amountCents) / 100, amount: amountCents / 100 };
        }
        const quantity = Number(item.quantity);
        const subtotalCents = Math.round(item.price * quantity * 100);
        const discountRate = isLiter && quantity >= 10 ? 0.15 : 0;
        const discountCents = Math.round(subtotalCents * discountRate);
        return {
            ...item,
            quantity,
            subtotal: subtotalCents / 100,
            discountRate,
            discount: discountCents / 100,
            amount: (subtotalCents - discountCents) / 100,
        };
    });
}

export const NORMAL_PRICING_VERSION = 'admin-sales-normal-v1';
// Only newly captured drafts pass here. Stored receipts are never recalculated.
export function calculateItems(items) {
    return calculateWholesaleItems(items).map(item => {
        if (item.commerceVersion || item.pricingVersion === WHOLESALE_VERSION) return item;
        const amountCents = item.entryMode === 'amount'
            ? Math.round(Number(item.requestedAmount) * 100)
            : Math.round(Number(item.price) * Number(item.quantity) * 100);
        const quantity = item.entryMode === 'amount'
            ? (item.price > 0 ? amountCents / 100 / item.price : NaN)
            : Number(item.quantity);
        return {...item, pricingVersion:NORMAL_PRICING_VERSION, quantity,
            subtotal:amountCents/100, amount:amountCents/100, discountRate:0, discount:0,
            priceTier:'normal', pricingWarning:'Mayoreo sin activar: se conserva el precio normal.'};
    });
}
