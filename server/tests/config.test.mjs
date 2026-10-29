import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../src/config.mjs';

test('desarrollo y pruebas usan bases y puertos diferentes sin contraseña predeterminada', () => {
  const dev = readConfig({});
  const testing = readConfig({ NODE_ENV: 'test' });
  assert.equal(dev.host, '127.0.0.1');
  assert.equal(dev.database.host, '127.0.0.1');
  assert.equal(dev.port, 3001);
  assert.equal(testing.port, 3002);
  assert.equal(dev.database.database, 'calcquim_dev');
  assert.equal(testing.database.database, 'calcquim_test');
  assert.equal(dev.databaseConfigured, false);
  assert.equal(dev.database.password, '');
});

test('rechaza interfaces remotas, rol administrador y mezcla de bases', () => {
  for (const env of [
    { HOST: '0.0.0.0' }, { PGHOST: '192.168.1.2' }, { PGHOST: 'localhost' },
    { PGUSER: 'postgres' }, { NODE_ENV: 'production' },
    { NODE_ENV: 'test', PGDATABASE: 'calcquim_dev' }, { PGDATABASE: 'calcquim_test' },
    { PORT: '0' }, { PORT: '65536' }, { PORT: '3001oops' }, { PGPORT: '-1' },
    { PGCONNECT_TIMEOUT_MS: '0' }, { PGQUERY_TIMEOUT_MS: 'Infinity' },
  ]) assert.throws(() => readConfig(env));
});

test('credenciales explícitas y límites se trasladan al pool', () => {
  const config = readConfig({ NODE_ENV: 'test', PGUSER: 'synthetic_test',
    PGPASSWORD: 'synthetic-only', PORT: '3009', PGCONNECT_TIMEOUT_MS: '600', PGQUERY_TIMEOUT_MS: '700' });
  assert.equal(config.databaseConfigured, true);
  assert.equal(config.port, 3009);
  assert.equal(config.database.connectionTimeoutMillis, 600);
  assert.equal(config.database.query_timeout, 700);
  assert.equal(config.database.statement_timeout, 700);
});
