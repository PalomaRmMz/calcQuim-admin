import { calculateHistoricalItems } from './adminSales.mjs';
import { randomUUID } from 'node:crypto';
import { catalogChoices, PRICING_VERSION } from './catalog.mjs';
import { makeLine, total, repriceLines } from './sale.mjs';
import { localDate } from '../../../src/utils/salesUtils.js';
import { WHOLESALE_VERSION, wholesaleEnabled } from '../../../src/domain/wholesalePricing.mjs';

export function createMobileSale(sales, input, catalog, sequence = 0) {
  const expected = wholesaleEnabled(catalog) ? WHOLESALE_VERSION : PRICING_VERSION;
  if (input.pricingVersion != null && input.pricingVersion !== expected) throw new Error('El protocolo de precios cambió. Sincroniza y revisa el borrador antes de confirmar.');
  if (!['Efectivo', 'Transferencia', 'Tarjeta'].includes(input.payment)) throw new Error('Selecciona forma de pago.');
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 200) throw new Error('Agrega entre 1 y 200 renglones.');
  const choices = catalogChoices(catalog);
  let items = input.items.map(row => {
    const choice = choices.find(c => c.kind === row.reference?.kind && String(c.refId) === String(row.reference?.id));
    if (!choice) throw new Error('La referencia comercial ya no está disponible.');
    const tariff = choice.tariffs.find(t => t.key === row.tariffKey);
    if (!tariff || (tariff.pricingVersion!==WHOLESALE_VERSION && tariff.price !== row.price) || tariff.unit !== row.unit) throw new Error('Cambió la tarifa o unidad. Revisa el renglón.');
    const line = makeLine(choice, tariff, row.entryMode, row.value, randomUUID(),row.confirmedQuantity);
    return { ...line, productId: choice.kind === 'product' ? choice.refId : null, group: { id: choice.key, name: choice.name }, pendingBreakdown: choice.kind !== 'product' || row.entryMode === 'amount' };
  });
  items=repriceLines(items);
  items.forEach((line,n)=>{const row=input.items[n];if(line.pricingVersion===WHOLESALE_VERSION&&(row.pricingVersion!==WHOLESALE_VERSION||row.price!==line.price||row.priceTier!==line.priceTier))throw new Error('La tarifa automática del grupo no coincide con la configuración vigente.');});
  const highest = Math.max(sequence, ...sales.map(s => Number(String(s.folio || '').replace(/^V-/, '')) || 0));
  const createdAt = new Date().toISOString();
  const sale = { id: randomUUID(), folio: `V-${String(highest + 1).padStart(5, '0')}`, date: localDate(), createdAt, payment: input.payment, notes: '', origin: 'MOVIL', items, total: total(items), history: [{ action: 'created', channel: 'MOVIL', at: createdAt }] };
  sale.originalReceipt = { id: sale.id, folio: sale.folio, createdAt, status: 'confirmed', version: 1, total: sale.total, items: items.map(receiptItem) };
  return [sale, ...sales];
}

export function correctMobileSale(sales, id, input) {
  const previous = sales.find(s => s.id === id);
  if (!previous || previous.origin !== 'MOVIL' || previous.voidedAt) throw new Error('Selecciona una venta móvil vigente.');
  if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 1000) throw new Error('Escribe el motivo de corrección (máximo 1000 caracteres).');
  if (input.physicalTreatment !== 'apply_difference') throw new Error('Confirma la aplicación de la diferencia física de esta revisión.');
  if (!Array.isArray(input.values) || input.values.length !== previous.items.length) throw new Error('La corrección conserva los renglones y sus referencias originales.');
  const corrected = previous.items.map((old, ordinal) => {
    const tariff = { key: old.tariffKey, price: old.normalPrice ?? old.price, unit: old.unit, productIds: old.eligibleProductIds, ...(old.pricingVersion===WHOLESALE_VERSION?{pricingVersion:old.pricingVersion,wholesalePrice:old.wholesalePrice,amountPolicy:old.amountPolicy,priceSource:old.priceSource,priceSourceId:old.priceSourceId}: {}) };
    const choice = { kind: old.reference.kind, refId: old.reference.id, name: old.name, context: old.context, tariffs: [tariff] };
    const updated = { ...old, ...makeLine(choice, tariff, old.entryMode, input.values[ordinal], old.id,input.confirmedQuantities?.[ordinal]??(String(input.values[ordinal])===String(old.capturedValue)?old.confirmedQuantity:null)) };
    if (!old.pricingVersion) return {...calculateHistoricalItems([{...updated,pricingVersion:undefined}])[0],pricingVersion:undefined};
    return updated;
  });
  const items = corrected.some(row=>row.pricingVersion===WHOLESALE_VERSION)?repriceLines(corrected):corrected;
  const at = new Date().toISOString(), version = (previous.commercialVersion || 1) + 1;
  const updated = { ...previous, items, total: total(items), commercialVersion: version, breakdowns: {},
    revisions: [...(previous.revisions || []), { at, channel: 'WEB', reason: input.reason.trim(), version: version - 1, id: previous.id, date: previous.date, payment: previous.payment, origin: previous.origin, items: previous.items, total: previous.total, breakdowns: previous.breakdowns || {} }],
    history: [...previous.history, { action: 'commercial_correction', channel: 'WEB', at, reason: input.reason.trim(), version }],
  };
  updated.updatedReceipt = { ...previous.originalReceipt, createdAt: at, version, corrected: true, total: updated.total, items: items.map(receiptItem) };
  if (JSON.stringify(items) === JSON.stringify(previous.items)) throw new Error('No hay cambios comerciales.');
  return sales.map(s => s.id === id ? updated : s);
}

function receiptItem(item) {
  const {name,quantity,unit,price,amount,entryMode,discountRate}=item;
  return {name,quantity,unit,price,amount,entryMode,discountRate,...(item.pricingVersion===WHOLESALE_VERSION?{pricingVersion:item.pricingVersion,priceTier:item.priceTier,normalPrice:item.normalPrice,wholesalePrice:item.wholesalePrice,amountPolicy:item.amountPolicy,confirmedQuantity:item.confirmedQuantity,quantityNumerator:item.quantityNumerator,quantityDenominator:item.quantityDenominator}: {})};
}
