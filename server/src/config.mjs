import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

function integer(value, fallback, min, max, name) {
  const text = String(value ?? fallback);
  if (!/^\d+$/.test(text) || Number(text) < min || Number(text) > max) {
    throw new Error(`Configuración inválida: ${name}.`);
  }
  return Number(text);
}

export function readConfig(env = process.env) {
  const mode = env.NODE_ENV ?? 'development';
  if (!['development', 'test'].includes(mode)) throw new Error('NODE_ENV debe ser development o test en esta fase.');
  if (env.HOST && env.HOST !== '127.0.0.1') throw new Error('Express solo admite 127.0.0.1.');
  if (env.PGHOST && env.PGHOST !== '127.0.0.1') throw new Error('PostgreSQL solo admite 127.0.0.1.');
  const database = env.PGDATABASE || (mode === 'test' ? 'calcquim_test' : 'calcquim_dev');
  // Un proceso de prueba nunca debe conectarse a la base de desarrollo.
  if (mode === 'test' && !database.endsWith('_test')) throw new Error('La base de pruebas debe terminar en _test.');
  if (mode === 'development' && database.endsWith('_test')) throw new Error('Desarrollo no debe utilizar una base _test.');
  const user = env.PGUSER || '';
  if (user.toLowerCase() === 'postgres') throw new Error('Utiliza un rol de aplicación, no postgres.');
  const password = env.PGPASSWORD || '';
  return {
    persistenceEnabled: env.CALCQUIM_PERSISTENCE === 'sandbox',
    schema: env.CALCQUIM_SCHEMA || 'calcquim_sandbox',
    mode,
    host: '127.0.0.1',
    port: integer(env.PORT, mode === 'test' ? 3002 : 3001, 1, 65535, 'PORT'),
    databaseConfigured: Boolean(user.trim() && password),
    database: {
      host: '127.0.0.1',
      port: integer(env.PGPORT, 5432, 1, 65535, 'PGPORT'),
      database, user, password,
      max: 2,
      connectionTimeoutMillis: integer(env.PGCONNECT_TIMEOUT_MS, 1500, 100, 10000, 'PGCONNECT_TIMEOUT_MS'),
      query_timeout: integer(env.PGQUERY_TIMEOUT_MS, 1500, 100, 10000, 'PGQUERY_TIMEOUT_MS'),
      statement_timeout: integer(env.PGQUERY_TIMEOUT_MS, 1500, 100, 10000, 'PGQUERY_TIMEOUT_MS'),
      idleTimeoutMillis: 10000,
      ssl: false,
      application_name: 'calcquim-health',
    },
  };
}

export function loadConfig() {
  // Elegir archivo ANTES de cargarlo. NODE_ENV=test debe venir del proceso.
  const mode = process.env.NODE_ENV ?? 'development';
  if (!['development', 'test'].includes(mode)) throw new Error('NODE_ENV no admitido.');
  const path = fileURLToPath(new URL(`../.env.${mode}`, import.meta.url));
  if (existsSync(path)) loadEnvFile(path);
  if ((process.env.NODE_ENV ?? 'development') !== mode) throw new Error('NODE_ENV no coincide con el archivo seleccionado.');
  return readConfig();
}
