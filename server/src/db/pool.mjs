import pg from 'pg';

export function createDatabase(config) {
  // Sin credenciales completas no abrir sockets ni usar defaults privados de pg.
  const pool = config.databaseConfigured ? new pg.Pool(config.database) : null;
  // pg emite errores de clientes inactivos fuera de query(). No exponer detalles.
  pool?.on('error', () => {});
  return {
    pool,
    async check() {
      if (!pool) return false;
      try {
        const result = await pool.query('SELECT 1 AS ok');
        return result.rows[0]?.ok === 1;
      } catch {
        return false;
      }
    },
    async close() { await pool?.end(); },
  };
}
