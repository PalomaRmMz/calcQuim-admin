const SCALE = 1000000n;
export function inventoryScaled(value, { signed = false, integer = false } = {}) {
  const s = String(value ?? '').trim().replace(',', '.');
  if (!new RegExp(`^${signed ? '-?' : ''}\\d+(?:\\.\\d{1,6})?$`).test(s)) throw new Error('Introduce una cantidad válida; el campo vacío no equivale a cero.');
  const negative = s.startsWith('-'), [a, b = ''] = s.replace('-', '').split('.');
  const n = BigInt(a) * SCALE + BigInt(b.padEnd(6, '0'));
  if (n > BigInt(Number.MAX_SAFE_INTEGER) || (integer && n % SCALE)) throw new Error('Usa una cantidad entera de piezas dentro del rango permitido.');
  return negative ? -n : n;
}
export function inventoryText(n) {
  const sign = n < 0n ? '-' : '', a = n < 0n ? -n : n;
  const b = String(a % SCALE).padStart(6, '0').replace(/0+$/, '');
  return `${sign}${a / SCALE}${b ? '.' + b : ''}`;
}
export function captureQuantity(product, form) {
  if (product.packOptions?.length) {
    const option = product.packOptions.find(p => p.id === form.presentationId);
    if (!option) throw new Error('Selecciona la presentación cerrada autorizada.');
    const closed = inventoryScaled(form.closedPackages, { integer: true });
    const loose = inventoryScaled(form.looseUnits, { integer: true });
    const factor = inventoryScaled(option.factor, { integer: true }) / SCALE;
    if (factor <= 1n) throw new Error('La presentación no tiene un factor autorizado.');
    const quantity = inventoryText(closed * factor + loose);
    inventoryScaled(quantity);
    return { quantity, physicalComposition: { presentationId: option.id, closedPackages: inventoryText(closed), looseUnits: inventoryText(loose) } };
  }
  return { quantity: inventoryText(inventoryScaled(form.quantity, { integer: product.unit === 'pieza' })) };
}
export function captureBody(snapshot, product, form) {
  const captured = captureQuantity(product, form);
  const operation = product.initialMovementId ? 'count' : 'initial';
  const difference = product.quantity === null ? null : inventoryText(inventoryScaled(captured.quantity) - inventoryScaled(product.quantity, { signed: true }));
  if (operation === 'count' && difference !== '0' && !form.reason?.trim()) throw new Error('Indica el motivo del ajuste.');
  return { operation, productId: product.productId, unit: product.unit, ...captured,
    revision: snapshot.revision, generation: snapshot.generation,
    expectedQuantity: product.quantity, expectedInitialMovementId: product.initialMovementId ?? null,
    expectedPackVersion: product.packVersion ?? null,
    reason: form.reason?.trim() || '', zeroConfirmed: form.zeroConfirmed === true };
}
