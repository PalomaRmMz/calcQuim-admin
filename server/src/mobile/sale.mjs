import { calculateItems } from './adminSales.mjs';

export function makeLine(choice, tariff, entryMode, value, id) {
  const text = String(value).replace(',', '.');
  if (!['amount', 'quantity'].includes(entryMode) || !/^\d+(?:\.\d+)?$/.test(text) || !Number.isFinite(Number(text)) || Number(text) <= 0) throw new Error('Escribe un valor positivo.');
  if (!tariff || !choice.tariffs.some(t => t.key === tariff.key) || !Number.isFinite(tariff.price) || tariff.price < 0) throw new Error('Selecciona una tarifa válida.');
  if (entryMode === 'amount' && tariff.price === 0) throw new Error('Una tarifa cero no permite calcular cantidad por importe.');
  if (entryMode === 'amount' && !/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('El importe admite hasta dos decimales.');
  if (entryMode === 'quantity' && !/^\d+(?:\.\d{1,6})?$/.test(text)) throw new Error('La cantidad admite hasta seis decimales.');
  const decimals=entryMode==='amount'?2:6;
  const scaled=raw=>{const [whole,fraction='']=raw.split('.');return BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0'));};
  if(scaled(text)>BigInt(Number.MAX_SAFE_INTEGER)||scaled(String(Number(text)))!==scaled(text)||scaled(Number(text).toFixed(decimals))!==scaled(text))throw new Error('El valor supera la precisión exacta admitida.');
  const result = calculateItems([{ price: tariff.price, unit: tariff.unit, entryMode, quantity: Number(text), requestedAmount: entryMode === 'amount' ? Number(text) : null }])[0];
  if (!Number.isFinite(result.quantity) || !Number.isSafeInteger(Math.round(result.amount * 100)) || result.amount < 0 || (tariff.price > 0 && result.amount === 0)) throw new Error('Valor fuera de rango o menor a un centavo.');
  return { ...result, id, reference: { kind: choice.kind, id: choice.refId }, name: choice.name, context: choice.context, tariffKey: tariff.key, capturedValue: text, eligibleProductIds: [...tariff.productIds] };
}
export const total = lines => lines.reduce((sum, l) => sum + Math.round(l.amount * 100), 0) / 100;
export const money = value => `$${Number(value).toFixed(2)}`;
export const labels = { product: 'Producto', line: 'Línea', priceGroup: 'Grupo de precios', category: 'Categoría' };
export function requestBody(draft, catalog) {
  if (!draft.lines.length) throw new Error('Agrega al menos un renglón.');
  if (draft.generation && draft.generation !== catalog.generation) throw new Error('El catálogo pertenece a otra generación. Revisa el borrador.');
  return { revision: catalog.revision, generation: catalog.generation, payment: draft.payment, items: draft.lines.map(l => ({ reference: l.reference, tariffKey: l.tariffKey, price: l.price, unit: l.unit, entryMode: l.entryMode, value: l.capturedValue })) };
}
