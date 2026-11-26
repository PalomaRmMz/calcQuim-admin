import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {lockReleaseTransition,sealRelease,selectedRelease,selectOfflineRelease,verifyRelease} from '../scripts/prepared-release.mjs';
import {releaseMigrations,validateMigrationLedger,validateReleaseSchema} from '../server/src/db/releaseSchema.mjs';
import {migrate,sqlChecksum} from '../server/src/db/migrate.mjs';

test('el ledger exige identidades y checksums exactos, incluso si el total coincide',async()=>{
  const expected=await releaseMigrations();
  const correct=[...expected].map(([version,migration])=>({version,checksum:migration.checksum}));
  assert.doesNotThrow(()=>validateMigrationLedger(expected,correct));
  const [first,...others]=correct;
  assert.throws(()=>validateMigrationLedger(expected,others),/faltante/);
  assert.throws(()=>validateMigrationLedger(expected,[{...first,version:99999},...others]),/desconocida/);
  assert.throws(()=>validateMigrationLedger(expected,[{...first,checksum:'0'.repeat(64)},...others]),/Checksum/);
  assert.throws(()=>validateMigrationLedger(expected,[...correct,first]),/repetida/);
  const original=expected.get(first.version).sql.replaceAll('\r\n','\n');
  assert.doesNotThrow(()=>validateMigrationLedger(expected,[{...first,checksum:sqlChecksum(original.replaceAll('\n','\r\n'))},...others]));
});

test('selección y reversión cambian un solo puntero e impiden archivos alterados, puertos activos o falta de drenaje',async t=>{
  const root=await mkdtemp(path.join(tmpdir(),'nexo-release-control-'));
  const base=path.join(root,'artifacts','web-releases');
  async function make(version){
    const directory=path.join(base,version);
    for(const name of ['dist','server/src','server/migrations','server/node_modules','src'])
      await mkdir(path.join(directory,name),{recursive:true});
    for(const name of ['dist/index.html','server/src/runtime.mjs','server/package.json','server/package-lock.json','package.json','package-lock.json'])
      await writeFile(path.join(directory,name),version);
    await sealRelease(directory,version);
    return directory;
  }
  await make('anterior');
  const current=await make('candidata');
  const server=createServer((_req,res)=>res.end('QA')).listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>{if(server.listening)server.close();});
  const ports=[server.address().port];
  const offline={ports,verifyWindow:async()=>{}};
  await assert.rejects(selectOfflineRelease(root,'candidata',offline),/Servicio activo/);
  await new Promise(resolve=>server.close(resolve));
  await assert.rejects(selectOfflineRelease(root,'candidata',{ports,verifyWindow:async()=>{throw Error('Sin evidencia de drenaje');}}),/Sin evidencia/);
  assert.equal(await selectedRelease(root),null);
  const unlock=await lockReleaseTransition(root);
  try {await assert.rejects(selectOfflineRelease(root,'candidata',offline),{code:'EEXIST'});}
  finally {await unlock();}
  assert.deepEqual(await selectOfflineRelease(root,'anterior',offline),{previous:null,selected:'anterior'});
  assert.deepEqual(await selectOfflineRelease(root,'candidata',offline),{previous:'anterior',selected:'candidata'});
  assert.equal((await selectedRelease(root)).version,'candidata');
  assert.equal(await readFile(path.join(current,'dist/index.html'),'utf8'),'candidata');
  assert.deepEqual(await selectOfflineRelease(root,'anterior',offline),{previous:'candidata',selected:'anterior'});
  await writeFile(path.join(current,'dist/index.html'),'alterado');
  await assert.rejects(verifyRelease(root,'candidata'),/manifiesto/);
  assert.equal((await selectedRelease(root)).version,'anterior');
});

const target=process.env.NEXO_ISOLATED_TEST_DATABASE;
test('PostgreSQL aislado rechaza ledgers faltantes, desconocidos y alterados',{skip:!target},async t=>{
  const {config,dataDirectory}=JSON.parse(target);
  assert.match(config.database,/^nexo_synthetic_[a-f0-9]{12}$/);
  assert.equal(config.host,'127.0.0.1');
  assert.ok(config.port>1024&&config.port!==5432);
  const pg=(await import('../server/node_modules/pg/lib/index.js')).default;
  const pool=new pg.Pool(config);
  t.after(()=>pool.end());
  const {rows:[identity]}=await pool.query("SELECT current_database() AS db,current_setting('data_directory') AS directory,inet_server_port() AS port");
  assert.equal(identity.db,config.database);
  assert.equal(path.resolve(identity.directory).toLowerCase(),path.resolve(dataDirectory).toLowerCase());
  assert.equal(identity.port,config.port);
  const schema='calcquim_test_'+randomUUID().replaceAll('-','');
  await migrate(pool,schema);
  const migrations=await releaseMigrations(),client=await pool.connect();
  try {
    await validateReleaseSchema(client,schema,migrations);
    const version=migrations.keys().next().value;
    for (const [sql,expected] of [
      [`DELETE FROM "${schema}".schema_migrations WHERE version=${version}`,/faltante/],
      [`UPDATE "${schema}".schema_migrations SET checksum='alterado' WHERE version=${version}`,/Checksum/],
      [`UPDATE "${schema}".schema_migrations SET version=99999 WHERE version=${version}`,/desconocida/],
    ]) {
      await client.query('BEGIN');
      try {await client.query(sql);await assert.rejects(validateReleaseSchema(client,schema,migrations),expected);}
      finally {await client.query('ROLLBACK');}
    }
    await validateReleaseSchema(client,schema,migrations);
  } finally {client.release();}
});
