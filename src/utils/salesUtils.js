export const money = (value) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);

export function localDate() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function calculateItems(items) {
    return items.map((item) => {
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
