import { Router } from 'express';
import { createHealthController } from '../controllers/health.mjs';

export function healthRouter(service) {
  const router = Router();
  const controller = createHealthController(service);
  router.get('/live', controller.live);
  router.get('/ready', controller.ready);
  return router;
}
