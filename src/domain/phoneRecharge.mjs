export const PHONE_RECHARGE = 'phoneRecharge';
export const RECHARGE_ACTIVITY = 'RECARGAS';
export const RECHARGE_NAME = 'Recarga telefónica';
export const RECHARGE_KEY = 'phone-recharge';
export const isRecharge = item => item?.lineType === PHONE_RECHARGE;
export const hasPhysicalSaleLine = item => item.lineType !== 'service' && !isRecharge(item);

export function makeRechargeLine(value, id) {
  const text = typeof value === 'string' || typeof value === 'number'
    ? String(value).trim().replace(',', '.') : '';
  if (!/^\d{1,13}(?:\.\d{1,2})?$/.test(text)) {
    throw Error('Captura un importe positivo con hasta dos decimales.');
  }
  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (cents <= 0) throw Error('El importe de la recarga debe ser positivo.');
  const capturedValue = (cents / 100).toFixed(2);
  return {
    id, reference: { kind: PHONE_RECHARGE, id: RECHARGE_KEY },
    name: RECHARGE_NAME, lineType: PHONE_RECHARGE, activity: RECHARGE_ACTIVITY,
    entryMode: 'amount', capturedValue, amount: cents / 100,
  };
}

export function validateRechargeLine(item) {
  const canonical = makeRechargeLine(item.capturedValue, item.id);
  if (Object.keys(item).length !== Object.keys(canonical).length ||
      Object.entries(canonical).some(([key, value]) => key === 'reference'
        ? item.reference?.kind !== value.kind || item.reference?.id !== value.id ||
          Object.keys(item.reference).length !== 2
        : item[key] !== value)) throw Error('Renglón de recarga inválido.');
}

export function rechargeOnlyCorrection(sale, input) {
  if (!sale.items.some(isRecharge) || !Array.isArray(input.values) ||
      input.values.length !== sale.items.length) return false;
  if (input.serviceOptions != null &&
      (!Array.isArray(input.serviceOptions) || input.serviceOptions.some(Boolean))) return false;
  return sale.items.every((item, ordinal) => {
    if (isRecharge(item)) return true;
    if (String(input.values[ordinal]) !== String(item.capturedValue)) return false;
    const recordedQuantity = item.webPhysicalQuantity?.quantity ?? item.confirmedQuantity ?? '';
    const submittedQuantity = item.webPhysicalQuantity
      ? input.webPhysicalQuantities?.[ordinal] : input.confirmedQuantities?.[ordinal];
    return String(submittedQuantity ?? recordedQuantity) === String(recordedQuantity);
  });
}
