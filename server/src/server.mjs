import { loadConfig } from './config.mjs';
import { startServer } from './runtime.mjs';
import { loadOperationalConfig,requireActivation } from './config/operational.mjs';
import { existsSync } from 'node:fs';

try {
  if (process.argv.includes('--sandbox')) process.env.CALCQUIM_PERSISTENCE = 'sandbox';
  const operational=process.argv.includes('--operational')||existsSync(new URL('../artifacts/operational/activation.private.json',import.meta.url));
  if(operational&&process.argv.includes('--sandbox'))throw new Error('Operativo activo: no mezclar configuraciones.');
  if(operational)await requireActivation();
  const config = operational?await loadOperationalConfig():loadConfig();
  const runtime = await startServer(config);
  console.log(`CalcQuim API: http://127.0.0.1:${config.port} (${config.mode})`);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 5000);
    deadline.unref();
    try { await runtime.close(); }
    catch { process.exitCode = 1; }
    finally { clearTimeout(deadline); }
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} catch {
  console.error('No se pudo iniciar CalcQuim API. Revisa configuración y disponibilidad del puerto local.');
  process.exitCode = 1;
}
