import { supplyPresentation, yieldText } from './procurementUtils.js';

// IDs remain option values; people choose the article, supplier and package.
export function costOfferLabel(row) {
    const reference = row.catalogue || row.lastPurchase || row.lastQuote;
    return [reference?.snapshot?.name || 'Artículo sin nombre', reference?.supplierName || reference?.supplierNameSnapshot || 'Proveedor sin nombre', reference?.snapshot ? supplyPresentation(reference.snapshot) : 'Presentación pendiente'].join(' · ');
}

export function yieldOfferLabel(source, supplierName, rule, valid) {
    return `${supplierName || 'Proveedor sin nombre'} · ${supplyPresentation(source)}: ${yieldText(rule)}${valid ? '' : ' · Configuración inválida'}`;
}
