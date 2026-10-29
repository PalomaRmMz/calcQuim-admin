import pg from 'pg';
import { loadConfig } from '../src/config.mjs';
import { startServer } from '../src/runtime.mjs';

// Solo metadatos de sesión y SELECT 1 mediante el backend existente.
// No crear objetos ni consultar tablas de negocio. No imprimir errores del driver.
const mode = process.argv[2];
let client;
let runtime;
let stage = 'CONFIGURATION';
try {
  if (!['development', 'test'].includes(mode)) throw new Error('mode');
  process.env.NODE_ENV = mode;
  const config = loadConfig();
  const expected = mode === 'test'
    ? { database: 'calcquim_test', user: 'calcquim_app_test' }
    : { database: 'calcquim_dev', user: 'calcquim_app' };
  if (!config.databaseConfigured || config.database.database !== expected.database || config.database.user !== expected.user) {
    throw new Error('configuration');
  }
  stage = 'CONNECTION';
  client = new pg.Client(config.database);
  await client.connect();
  stage = 'SESSION_METADATA';
  const { rows: [session] } = await client.query(`
    SELECT current_database() AS database, current_user AS username,
           host(inet_server_addr()) AS address,
           current_setting('server_version') AS version,
           current_setting('listen_addresses') AS listeners,
           rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
    FROM pg_roles WHERE rolname = current_user
  `);
  if (session.database !== expected.database || session.username !== expected.user || session.address !== '127.0.0.1') {
    throw new Error('identity');
  }
  console.log(`Conexión ${mode}: ${session.username}@${session.database}, 127.0.0.1, PostgreSQL ${session.version}.`);
  const privileged = ['rolsuper', 'rolcreatedb', 'rolcreaterole', 'rolreplication', 'rolbypassrls'].some(key => session[key]);
  // Puerto efímero para no interferir con un Express ya iniciado.
  stage = 'HTTP';
  runtime = await startServer({ ...config, port: 0 });
  const address = runtime.server.address();
  if (address.address !== '127.0.0.1') throw new Error('binding');
  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/health/ready`,
    { signal: AbortSignal.timeout(5000) });
  const body = await response.json();
  if (response.status !== 200 || body.status !== 'ready' || body.database !== 'up') throw new Error('readiness');
  console.log('GET /api/v1/health/ready: 200, database=up; Express solo en 127.0.0.1.');
  stage = 'ROLE_PRIVILEGES';
  if (privileged) throw new Error('privileges');
  console.log('Rol de aplicación sin privilegios administrativos directos.');
  stage = 'POSTGRES_LOOPBACK';
  if (session.listeners.split(',').some(value => !['127.0.0.1', '::1', 'localhost'].includes(value.trim()))) {
    throw new Error('listeners');
  }
  console.log('PostgreSQL configurado para escuchar solo en loopback.');
} catch (error) {
  const safeCodes = new Set(['28P01', '28000', '3D000', '42501', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET']);
  const code = safeCodes.has(error.code) ? error.code : 'CHECK_FAILED';
  console.error(`Verificación pendiente: etapa=${stage}, código=${code}. No se muestran credenciales ni detalles privados.`);
  process.exitCode = 1;
} finally {
  try { await runtime?.close(); } catch { process.exitCode = 1; }
  try { await client?.end(); } catch { process.exitCode = 1; }
}
