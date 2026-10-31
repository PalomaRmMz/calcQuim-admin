import { Router, json } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { ApiError } from '../services/commands.mjs';
import { PRICING_VERSION } from './catalog.mjs';
import { commercialChoices } from './commercial.mjs';
const authorized = (provided, expected) => expected.length >= 32 && Buffer.byteLength(provided) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
export function mobileRouter(service, { mode = 'synthetic', token = '', enabled = false } = {}) {
  const r = Router();
  r.use((req, _res, next) => {
    if (!enabled || (mode === 'operational' && process.env.CALCQUIM_MOBILE_OPERATIONAL_AUTHORIZED !== 'yes')) throw new ApiError(403, 'MOBILE_DISABLED', 'Registro móvil pendiente de habilitación autorizada.');
    if (!authorized(req.get('Authorization')?.replace(/^Bearer /, '') || '', token)) throw new ApiError(401, 'MOBILE_AUTH_REQUIRED', 'Credencial móvil inválida.');
    next();
  }, json({ limit: '256kb' }));
  r.get('/catalog', async (_req, res) => {
    const s = await service.read();
    res.json({ commercialOptions: commercialChoices(s.data), commercialOptionsVersion: 'official-relations-v1', data: Object.fromEntries(['categories', 'productLines', 'priceGroups', 'products'].map(k => [k, s.data[k]])), revision: s.revision, generation: s.generation, pricingVersion: PRICING_VERSION, environment:mode, salesEnabled:true, generatedAt: new Date().toISOString() });
  });
  r.get('/sales/status/:key', async (req, res) => {
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(req.params.key)) throw new ApiError(400, 'INVALID_KEY', 'Clave inválida.');
    res.json(await service.mobileStatus(req.params.key));
  });
  r.post('/sales', async (req, res) => {
    const key = req.get('Idempotency-Key');
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(key || '')) throw new ApiError(400, 'INVALID_KEY', 'Clave inválida.');
    const body = req.body;
    if (!body || !Array.isArray(body.items)) throw new ApiError(400, 'INVALID_BODY', 'Venta inválida.');
    const s = await service.command({ name: 'createMobileSale', args: [{ payment: body.payment, items: body.items }], revision: body.revision, generation: body.generation, requestKey: `mobile:${key}`, channel: 'MOVIL' });
    res.json({ receipt: s.result.receipt, revision:s.revision, generation:s.generation });
  });
  return r;
}
