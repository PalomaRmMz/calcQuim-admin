import { createHash } from 'node:crypto';
import { captureQuantity, inventoryScaled, inventoryText } from './inventory-quantity.mjs';
import { inventoryError as fail, inventorySnapshot, hardwareInventoryProduct } from './inventory-snapshot.mjs';
const canonical = v => Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object'
  ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v);
const validKey = k => typeof k === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(k);

export function installMobileInventoryCapture(router, service, { writeEnabled, principal }) {
  const can = permission => writeEnabled && principal?.permissions?.includes(permission);
  const permit = permission => {
    if (!can(permission) || !/^[a-zA-Z0-9_-]{1,32}$/.test(principal?.id || '') || !principal?.name)
      fail(403, 'INVENTORY_PERMISSION_REQUIRED', 'No tienes permiso para registrar este inventario.');
  };
  const statusKey = key => `mobile-inventory:${principal.id}:${key}`;
  router.get('/inventory/products/:id/history', async (req, res) => {
    const s = await inventorySnapshot(service), p = hardwareInventoryProduct(s, req.params.id);
    res.json({ productId: p.productId, name: p.name, generatedAt: new Date().toISOString(), history:
      s.inventory.movements.filter(m => String(m.product_id) === String(p.productId)).map(m => {
        const observations = m.reference?.observations || '';
        let audit = null, note = observations;
        if (observations.startsWith('ANDROID_INVENTORY ')) {
          const [first, ...rest] = observations.split('\n');
          try { audit = JSON.parse(first.slice('ANDROID_INVENTORY '.length)); note = rest.join('\n'); } catch {}
        }
        const source = m.reference?.userReference;
        return { id: m.id, kind: m.kind, quantity: m.quantity, unit: m.unit, reason: m.reason,
          occurredAt: m.occurred_at, recordedAt: m.recorded_at, note, audit,
          entryType: source?.entryType ?? null, previousQuantity: source?.previousQuantity ?? null,
          composition: source?.source?.physicalComposition ?? null };
      }) });
  });
  router.get('/inventory/operations/:key', async (req, res) => {
    permit(can('inventory:initial') ? 'inventory:initial' : 'inventory:count');
    if (!validKey(req.params.key)) fail(400, 'INVALID_KEY', 'Identificador de operación no válido.');
    const saved = await service.inventoryOperationStatus(statusKey(req.params.key));
    res.json(saved ? { status: 'confirmed', operationId: req.params.key, movementId: saved.response.movementId } : { status: 'not_found' });
  });
  router.post('/inventory/operations', async (req, res) => {
    const b = req.body, key = req.get('Idempotency-Key');
    if (!b || !['initial','count'].includes(b.operation)) fail(400, 'INVALID_OPERATION', 'Selecciona inicial o conteo.');
    permit(`inventory:${b.operation}`);
    if (!validKey(key)) fail(400, 'INVALID_KEY', 'Identificador de operación no válido.');
    const allowed = ['operation','productId','unit','quantity','physicalComposition','revision','generation','expectedQuantity','expectedInitialMovementId','expectedPackVersion','reason','zeroConfirmed'];
    if (Object.keys(b).some(k => !allowed.includes(k)) || !Number.isSafeInteger(b.revision) || typeof b.generation !== 'string' || !b.generation ||
        !['string','number'].includes(typeof b.productId) || typeof b.unit !== 'string' || typeof b.reason !== 'string' || b.reason.length > 1000 ||
        !Object.hasOwn(b, 'expectedQuantity') || !Object.hasOwn(b, 'expectedInitialMovementId') || !Object.hasOwn(b, 'expectedPackVersion'))
      fail(400, 'INVALID_BODY', 'El formulario de inventario no es válido.');
    let quantity;
    try { quantity = inventoryText(inventoryScaled(b.quantity)); } catch (e) { fail(422, 'INVALID_QUANTITY', e.message); }
    if (quantity === '0' && b.zeroConfirmed !== true) fail(422, 'ZERO_CONFIRMATION_REQUIRED', 'Confirma expresamente el inventario en cero.');
    if (b.physicalComposition && (typeof b.physicalComposition !== 'object' || Array.isArray(b.physicalComposition) ||
        Object.keys(b.physicalComposition).some(k => !['presentationId','closedPackages','looseUnits'].includes(k))))
      fail(422, 'INVALID_COMPOSITION', 'Utiliza la presentación autorizada; no envíes un factor arbitrario.');
    const audit = { operationId: key, responsibleId: principal.id, responsible: principal.name, channel: 'ANDROID' };
    const args = [{ activity: 'JARCERIA', productId: b.productId, unit: b.unit, quantity,
      ...(b.physicalComposition ? { physicalComposition: b.physicalComposition } : {}),
      reasonCode: b.operation === 'initial' ? 'initial_inventory' : 'physical_count',
      observations: `ANDROID_INVENTORY ${JSON.stringify(audit)}\n${b.reason.trim()}`,
      expectedQuantity: b.expectedQuantity, expectedInitialMovementId: b.expectedInitialMovementId,
      expectedPackVersion: b.expectedPackVersion }];
    const name = b.operation === 'initial' ? 'inventoryInitial' : 'inventoryCount';
    const hash = createHash('sha256').update(canonical({ name, args, generation: b.generation })).digest('hex');
    const saved = await service.inventoryOperationStatus(statusKey(key));
    if (saved) {
      if (saved.requestHash !== hash) fail(409, 'IDEMPOTENCY_CONFLICT', 'La clave ya corresponde a otro conteo.');
      return res.json({ status: 'confirmed', operationId: key, movementId: saved.response.movementId, replayed: true });
    }
    const s = await inventorySnapshot(service), p = hardwareInventoryProduct(s, b.productId);
    if (s.generation !== b.generation || s.revision !== b.revision || p.quantity !== b.expectedQuantity ||
        p.initialMovementId !== b.expectedInitialMovementId || p.packVersion !== b.expectedPackVersion) {
      // A concurrent duplicate can commit between the first status read and snapshot.
      // Its idempotency record commits atomically with that new revision.
      const committed = await service.inventoryOperationStatus(statusKey(key));
      if (committed) {
        if (committed.requestHash !== hash) fail(409, 'IDEMPOTENCY_CONFLICT', 'La clave ya corresponde a otro conteo.');
        return res.json({ status: 'confirmed', operationId: key, movementId: committed.response.movementId, replayed: true });
      }
      fail(412, 'STALE_INVENTORY', 'Las existencias cambiaron. Consulta el saldo actualizado y revisa nuevamente el conteo.');
    }
    if (b.unit !== p.unit) fail(422, 'INVALID_UNIT', 'Conserva la unidad del artículo.');
    if (!p.captureAvailable) fail(422, 'PRESENTATION_REVIEW_REQUIRED', 'Las presentaciones físicas requieren revisión en Admin antes de contar.');
    if (b.physicalComposition && !p.packOptions.length) fail(422, 'INVALID_COMPOSITION', 'El artículo no tiene una presentación cerrada autorizada.');
    if (b.operation === 'initial' && p.initialMovementId) fail(422, 'INITIAL_ALREADY_EXISTS', 'El inventario inicial ya está registrado. Realiza un conteo.');
    if (b.operation === 'count' && !p.initialMovementId) fail(422, 'INITIAL_REQUIRED', 'Registra primero el inventario inicial.');
    let expected;
    try { expected = captureQuantity(p, b.physicalComposition ? { ...b.physicalComposition } : { quantity }); }
    catch (e) { fail(422, 'INVALID_COMPOSITION', e.message); }
    if (expected.quantity !== quantity) fail(422, 'INVALID_COMPOSITION', 'El equivalente no coincide con las cantidades físicas.');
    if (b.operation === 'count' && p.quantity !== quantity && !b.reason.trim()) fail(422, 'REASON_REQUIRED', 'Indica el motivo del ajuste.');
    const result = await service.command({ name, args, revision: b.revision, generation: b.generation, requestKey: statusKey(key), channel: 'MOVIL' });
    res.json({ status: 'confirmed', operationId: key, movementId: result.result.movementId, revision: result.revision, generation: result.generation, replayed: result.replayed });
  });
}
