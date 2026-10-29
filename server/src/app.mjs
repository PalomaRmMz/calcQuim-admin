import express from 'express';
import { healthRouter } from './routes/health.mjs';
import { createHealthService } from './services/health.mjs';
import { dataRouter } from './routes/data.mjs';
import { ApiError } from './services/commands.mjs';

export function createApp(database, dataService = null, mode='synthetic') {
  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');
  app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api/v1/health', healthRouter(createHealthService(database)));
  if (dataService) {
    app.use('/api/v1', (req,res,next) => {
      const host=req.hostname;
      if(!['127.0.0.1','localhost'].includes(host)) return res.status(403).json({error:{code:'LOCAL_ONLY'}});
      if(!['GET','HEAD'].includes(req.method)) {
        const origin=req.get('Origin');
        if(req.get('X-CalcQuim-Mode')!==mode||(origin&&!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin))) return res.status(403).json({error:{code:mode==='synthetic'?'SANDBOX_HEADER_REQUIRED':'OPERATIONAL_HEADER_REQUIRED'}});
      }
      next();
    },express.json({limit:'20mb'}),dataRouter(dataService));
  }
  app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND' } }));
  // Express requiere cuatro argumentos para reconocer el middleware de error.
  app.use((_error, _req, res, next) => {
    if (res.headersSent) return next(_error);
    if(_error instanceof ApiError) return res.status(_error.status).json({error:{code:_error.code,message:_error.message}});
    const mapping = { '23505':[409,'DUPLICATE'], '23503':[409,'REFERENCE_IN_USE'], '23514':[422,'INTEGRITY_ERROR'], '42P01':[503,'SCHEMA_NOT_READY'], '3F000':[503,'SCHEMA_NOT_READY'], 'ECONNREFUSED':[503,'DATABASE_UNAVAILABLE'], '28P01':[503,'DATABASE_UNAVAILABLE'], '57014':[503,'QUERY_TIMEOUT'], '57P01':[503,'DATABASE_UNAVAILABLE'], 'ETIMEDOUT':[503,'DATABASE_UNAVAILABLE'], '40P01':[409,'RETRYABLE_CONFLICT'], '40001':[409,'RETRYABLE_CONFLICT'] };
    if(mapping[_error.code]) { const [status,code]=mapping[_error.code];return res.status(status).json({error:{code}}); }
    if(_error.type==='entity.too.large') return res.status(413).json({error:{code:'PAYLOAD_TOO_LARGE'}});
    if(_error.type==='entity.parse.failed') return res.status(400).json({error:{code:'INVALID_JSON'}});
    res.status(500).json({ error: { code: 'INTERNAL_ERROR' } });
  });
  return app;
}
