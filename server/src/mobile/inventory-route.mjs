import { inventorySnapshot, hardwareInventoryProduct } from './inventory-snapshot.mjs';
import { installMobileInventoryCapture } from './inventory-capture.mjs';
// Mount after the existing mobileRouter authentication middleware.
export function installMobileInventoryRoute(router, service, { mode = 'synthetic', writeEnabled = false, principal = null } = {}) {
  router.get('/inventory', async (_req, res) => {
    const snapshot = await inventorySnapshot(service);
    const { data, inventory, revision, generation } = snapshot;
    const hardware = new Set(data.products.filter(p => p.activity === 'JARCERIA').map(p => String(p.id)));
    const packs = inventory.packInventory?.products || [];
    res.json({
      enabled: inventory.enabled, environment: mode, revision, generation,
      permissions: { initial: !!(writeEnabled && principal?.permissions?.includes('inventory:initial')), count: !!(writeEnabled && principal?.permissions?.includes('inventory:count')) },
      generatedAt: new Date().toISOString(),
      products: inventory.products.filter(p => hardware.has(String(p.productId))).map(p => {
        const pack = packs.find(row => String(row.productId) === String(p.productId));
        const details = hardwareInventoryProduct(snapshot, p.productId);
        return {
          productId: p.productId, name: p.name, unit: p.unit, status: p.status,
          quantity: p.quantity, minimum: p.minimum, low: p.low,
          categoryId: details.categoryId, categoryName: details.categoryName,
          initialMovementId: details.initialMovementId, packVersion: details.packVersion, packOptions: details.packOptions,
          captureAvailable: details.captureAvailable,
          composition: pack ? {
            known: pack.known === true, presentationId: pack.presentationId ?? null,
            factor: pack.factor ?? null, closedPackages: pack.known ? pack.closedPackages : null,
            looseUnits: pack.known ? pack.looseUnits : null,
          } : null,
        };
      }),
    });
  });
  installMobileInventoryCapture(router, service, { writeEnabled, principal });
  return router;
}
