import { randomUUID } from 'node:crypto';
import { catalogChoices } from './catalog.mjs';
import { makeLine, total } from './sale.mjs';
import { localDate } from '../../../src/utils/salesUtils.js';

export function createMobileSale(sales, input, catalog, sequence = 0) {
  if (!['Efectivo', 'Transferencia', 'Tarjeta'].includes(input.payment)) throw new Error('Selecciona forma de pago.');
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 200) throw new Error('Agrega entre 1 y 200 renglones.');
  const choices = catalogChoices(catalog);
  const items = input.items.map(row => {
    const choice = choices.find(c => c.kind === row.reference?.kind && String(c.refId) === String(row.reference?.id));
    if (!choice) throw new Error('La referencia comercial ya no está disponible.');
    const tariff = choice.tariffs.find(t => t.key === row.tariffKey);
    if (!tariff || tariff.price !== row.price || tariff.unit !== row.unit) throw new Error('Cambió la tarifa o unidad. Revisa el renglón.');
    const line = makeLine(choice, tariff, row.entryMode, row.value, randomUUID());
    return { ...line, productId: choice.kind === 'product' ? choice.refId : null, group: { id: choice.key, name: choice.name }, pendingBreakdown: choice.kind !== 'product' || row.entryMode === 'amount' };
  });
  const highest = Math.max(sequence, ...sales.map(s => Number(String(s.folio || '').replace(/^V-/, '')) || 0));
  const createdAt = new Date().toISOString();
  const sale = { id: randomUUID(), folio: `V-${String(highest + 1).padStart(5, '0')}`, date: localDate(), createdAt, payment: input.payment, notes: '', origin: 'MOVIL', items, total: total(items), history: [{ action: 'created', channel: 'MOVIL', at: createdAt }] };
  sale.originalReceipt = { id: sale.id, folio: sale.folio, createdAt, status: 'confirmed', version: 1, total: sale.total, items: items.map(({ name, quantity, unit, price, amount, entryMode, discountRate }) => ({ name, quantity, unit, price, amount, entryMode, discountRate })) };
  return [sale, ...sales];
}

export function correctMobileSale(sales, id, input) {
  const previous = sales.find(s => s.id === id);
  if (!previous || previous.origin !== 'MOVIL' || previous.voidedAt) throw new Error('Selecciona una venta móvil vigente.');
  if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 1000) throw new Error('Escribe el motivo de corrección (máximo 1000 caracteres).');
  if (input.physicalTreatment !== 'apply_difference') throw new Error('Confirma la aplicación de la diferencia física de esta revisión.');
  if (!Array.isArray(input.values) || input.values.length !== previous.items.length) throw new Error('La corrección conserva los renglones y sus referencias originales.');
  const items = previous.items.map((old, ordinal) => {
    const tariff = { key: old.tariffKey, price: old.price, unit: old.unit, productIds: old.eligibleProductIds };
    const choice = { kind: old.reference.kind, refId: old.reference.id, name: old.name, context: old.context, tariffs: [tariff] };
    return { ...old, ...makeLine(choice, tariff, old.entryMode, input.values[ordinal], old.id) };
  });
  const at = new Date().toISOString(), version = (previous.commercialVersion || 1) + 1;
  const updated = { ...previous, items, total: total(items), commercialVersion: version, breakdowns: {},
    revisions: [...(previous.revisions || []), { at, channel: 'WEB', reason: input.reason.trim(), version: version - 1, id: previous.id, date: previous.date, payment: previous.payment, origin: previous.origin, items: previous.items, total: previous.total, breakdowns: previous.breakdowns || {} }],
    history: [...previous.history, { action: 'commercial_correction', channel: 'WEB', at, reason: input.reason.trim(), version }],
  };
  updated.updatedReceipt = { ...previous.originalReceipt, createdAt: at, version, corrected: true, total: updated.total, items: items.map(({ name, quantity, unit, price, amount, entryMode, discountRate }) => ({ name, quantity, unit, price, amount, entryMode, discountRate })) };
  if (JSON.stringify(items) === JSON.stringify(previous.items)) throw new Error('No hay cambios comerciales.');
  return sales.map(s => s.id === id ? updated : s);
}
