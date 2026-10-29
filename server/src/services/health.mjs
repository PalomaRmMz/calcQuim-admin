export function createHealthService(database) {
  return {
    live() { return { status: 'ok' }; },
    async ready() {
      try {
        if (await database.check()) return { statusCode: 200, body: { status: 'ready', database: 'up' } };
      } catch { /* La respuesta pública nunca incluye errores del driver. */ }
      return { statusCode: 503, body: { status: 'not_ready', database: 'unavailable' } };
    },
  };
}
