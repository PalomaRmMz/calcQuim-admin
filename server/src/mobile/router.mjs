import { Router, json } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { ApiError } from '../services/commands.mjs';
import { PRICING_VERSION } from './catalog.mjs';
import { commercialChoices } from './commercial.mjs';
import { wholesaleSettings, WHOLESALE_VERSION } from '../../../src/domain/wholesalePricing.mjs';
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
    const settings=wholesaleSettings(s.data);
    res.json({ commercialOptions: commercialChoices(s.data), commercialOptionsVersion: 'official-relations-v1', data: {...Object.fromEntries(['categories', 'productLines', 'priceGroups', 'products'].map(k => [k, s.data[k]])),...(settings?.version===WHOLESALE_VERSION?{wholesalePricing:settings}: {})}, revision: s.revision, generation: s.generation, pricingVersion: settings?.version===WHOLESALE_VERSION?WHOLESALE_VERSION:PRICING_VERSION, environment:mode, salesEnabled:true, generatedAt: new Date().toISOString() });
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
    if (![PRICING_VERSION,WHOLESALE_VERSION].includes(body.pricingVersion)) throw new ApiError(409,'PRICING_CLIENT_UPDATE_REQUIRED','Actualiza la aplicación y sincroniza el catálogo. No se aceptan descuentos porcentuales anteriores.');
    const s = await service.command({ name: 'createMobileSale', args: [{ payment: body.payment, items: body.items, pricingVersion:body.pricingVersion }], revision: body.revision, generation: body.generation, requestKey: `mobile:${key}`, channel: 'MOVIL' });
    res.json({ receipt: s.result.receipt, inventoryPending:s.inventoryPending.filter(p=>p.saleId===s.result.receipt.id), revision:s.revision, generation:s.generation });
  });
  return r;
}
