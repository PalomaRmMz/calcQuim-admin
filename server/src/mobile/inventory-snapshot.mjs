import { ApiError } from '../services/commands.mjs';
export const inventoryError = (status, code, message) => { throw new ApiError(status, code, message); };
export async function inventorySnapshot(service) {
  for (let i = 0; i < 3; i++) {
    const before = service.read ? await service.read() : null;
    const s = await service.operations();
    const after = before ? await service.read() : null;
    if (!before || (before.revision === s.revision && after.revision === s.revision && before.generation === after.generation))
      return { ...s, generation: before?.generation ?? s.generation };
  }
  inventoryError(409, 'INVENTORY_BUSY', 'El inventario está cambiando. Actualiza antes de continuar.');
}
export function hardwareInventoryProduct(s, id) {
  const p = s.data.products.find(p => String(p.id) === String(id));
  if (!p || p.activity !== 'JARCERIA') inventoryError(422, 'HARDWARE_ONLY', 'Solo se permite inventario de Jarcería.');
  const row = s.inventory.products.find(r => String(r.productId) === String(id));
  if (!row) inventoryError(503, 'INVENTORY_UNAVAILABLE', 'Inventario no disponible.');
  const pack = s.inventory.packInventory?.products.find(r => String(r.productId) === String(id));
  return { ...row, categoryId: p.hardwareCategoryId ?? null, categoryName: s.data.procurement?.hardwareCategories?.find(c => String(c.id) === String(p.hardwareCategoryId))?.name || 'Sin categoría',
    captureAvailable: !pack || (pack.options || []).length > 0,
    initialMovementId: row.initialMovementId ?? null, packVersion: pack?.version ?? null,
    packOptions: (pack?.options || []).map(o => ({ id: o.id, name: o.name, factor: String(o.factor), unit: o.unit })),
    composition: pack ? { known: pack.known === true, presentationId: pack.presentationId ?? null,
      factor: pack.factor ?? null, closedPackages: pack.known ? pack.closedPackages : null, looseUnits: pack.known ? pack.looseUnits : null } : null };
}
