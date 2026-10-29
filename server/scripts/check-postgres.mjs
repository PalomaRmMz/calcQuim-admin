import { loadConfig } from '../src/config.mjs';
import { createDatabase } from '../src/db/pool.mjs';

// Comprobación opt-in real: solo SELECT 1, sin DDL ni datos de negocio.
process.env.NODE_ENV = 'test';
try {
  const config = loadConfig();
  const database = createDatabase(config);
  try {
    if (!await database.check()) throw new Error('unavailable');
    console.log('PostgreSQL de pruebas responde a SELECT 1.');
  } finally { await database.close(); }
} catch {
  console.error('PostgreSQL de pruebas no disponible o sin configuración privada válida.');
  process.exitCode = 1;
}
