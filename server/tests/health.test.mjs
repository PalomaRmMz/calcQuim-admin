import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { startServer } from '../src/runtime.mjs';
import { readConfig } from '../src/config.mjs';
import { createDatabase } from '../src/db/pool.mjs';

async function api(t, check) {
  let closed = false;
  const runtime = await startServer({ port: 0 }, { check, async close() { closed = true; } });
  t.after(() => runtime.close());
  const address = runtime.server.address();
  assert.equal(address.address, '127.0.0.1');
  return { url: `http://127.0.0.1:${address.port}`, runtime, isClosed: () => closed };
}

test('live es 200 sin consultar PostgreSQL y no permite caché', async t => {
  const { url } = await api(t, () => { throw new Error('No debe consultar'); });
  const response = await fetch(`${url}/api/v1/health/live`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-powered-by'), null);
});

test('ready es 200 cuando la dependencia responde correctamente', async t => {
  const { url } = await api(t, async () => true);
  const response = await fetch(`${url}/api/v1/health/ready`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ready', database: 'up' });
});

test('ready es 503 cuando PostgreSQL falla sin filtrar secretos', async t => {
  const { url } = await api(t, async () => { throw new Error('synthetic-password SELECT secret'); });
  const response = await fetch(`${url}/api/v1/health/ready`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: 'not_ready', database: 'unavailable' });
  assert.equal((await fetch(`${url}/api/v1/health/live`)).status, 200);
});

test('ready vuelve a estar disponible sin reiniciar HTTP', async t => {
  let available = false;
  const { url } = await api(t, async () => available);
  assert.equal((await fetch(`${url}/api/v1/health/ready`)).status, 503);
  available = true;
  assert.equal((await fetch(`${url}/api/v1/health/ready`)).status, 200);
});

test('no hay rutas de negocio ni escrituras', async t => {
  const { url } = await api(t, async () => true);
  for (const [path, method] of [['/api/v1/products', 'GET'], ['/api/v1/health/live', 'POST']]) {
    const response = await fetch(`${url}${path}`, { method });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: { code: 'NOT_FOUND' } });
  }
});

test('sin credenciales ready=503, live=200 y cierre libera pool y listener', async () => {
  const database = createDatabase(readConfig({ NODE_ENV: 'test' }));
  const runtime = await startServer({ port: 0 }, database);
  try {
    assert.equal(runtime.server.address().address, '127.0.0.1');
    const url = `http://127.0.0.1:${runtime.server.address().port}`;
    assert.equal((await fetch(`${url}/api/v1/health/ready`)).status, 503);
    assert.equal((await fetch(`${url}/api/v1/health/live`)).status, 200);
  } finally { await runtime.close(); }
  assert.equal(runtime.server.listening, false);
});

test('pg real maneja caída de transporte dentro de tiempo acotado', async t => {
  // Puerto asignado por SO; el servidor sintético cierra sockets sin hablar PostgreSQL.
  // Nunca se usa ni contacta la instalación habitual de PostgreSQL.
  const unavailable = net.createServer(socket => socket.destroy());
  await new Promise(resolve => unavailable.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => unavailable.close(resolve)));
  const config = readConfig({ NODE_ENV: 'test', PGPORT: String(unavailable.address().port),
    PGUSER: 'synthetic_test', PGPASSWORD: 'synthetic-not-a-real-secret',
    PGCONNECT_TIMEOUT_MS: '300', PGQUERY_TIMEOUT_MS: '300' });
  const runtime = await startServer({ port: 0 }, createDatabase(config));
  t.after(() => runtime.close());
  const response = await fetch(`http://127.0.0.1:${runtime.server.address().port}/api/v1/health/ready`,
    { signal: AbortSignal.timeout(3000) });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: 'not_ready', database: 'unavailable' });
});

test('puerto ocupado se rechaza y cierra la dependencia creada', async t => {
  const { runtime } = await api(t, async () => true);
  let closed = false;
  await assert.rejects(startServer({ port: runtime.server.address().port }, {
    async check() { return true; }, async close() { closed = true; },
  }), { code: 'EADDRINUSE' });
  assert.equal(closed, true);
});
