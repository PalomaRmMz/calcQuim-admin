import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import pg from '../server/node_modules/pg/lib/index.js';
import {loadOperationalConfig,requireActivation} from '../server/src/config/operational.mjs';
import {releaseMigrations,validateReleaseSchema} from '../server/src/db/releaseSchema.mjs';
import {readDataset} from '../server/src/repositories/dataset.mjs';
import {canonical} from '../server/src/services/dataset.mjs';
import {readInventory,inventorySnapshot} from '../server/src/repositories/inventory.mjs';
import {purchaseInventoryView,purchaseInventorySnapshot} from '../server/src/services/purchaseInventory.mjs';
import {verifyRelease} from './prepared-release.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const [candidate,rollback]=process.argv.slice(2);
assert.ok(candidate && rollback && candidate!==rollback,'Indica la versión candidata y la versión anterior.');
const versions=await Promise.all([verifyRelease(root,candidate),verifyRelease(root,rollback)]);
const proof=JSON.parse(await readFile(path.join(root,'artifacts/nexo-release-backup-proof.private.json'),'utf8'));
assert.equal(proof.restored,true);
assert.match(proof.file,/^postgres-[a-zA-Z0-9-]+\.dump$/);
const backup=path.join(root,'server/artifacts/operational/backups',proof.file);
const manifest=JSON.parse(await readFile(backup.replace(/\.dump$/,'.private.json'),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const digest=value=>sha(canonical(value));
assert.equal(manifest.database,'calcquim_operational');
assert.equal(manifest.sha256,proof.sha256);
assert.equal(sha(await readFile(backup)),proof.sha256);
await requireActivation();
const config=await loadOperationalConfig();
const client=new pg.Client({...config.database,options:'-c default_transaction_read_only=on'});
await client.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  for(const version of versions) {
    const migrations=await releaseMigrations(pathToFileURL(path.join(version.directory,'server','migrations')+path.sep));
    await validateReleaseSchema(client,config.schema,migrations);
  }
  await client.query('SET LOCAL search_path TO calcquim_operational, pg_catalog');
  const snapshot=await readDataset(client,false,'operational');
  assert.equal(digest(snapshot),manifest.snapshotSha256,'El conjunto de datos cambió desde el respaldo.');
  assert.equal(digest(inventorySnapshot(await readInventory(client,snapshot.data),manifest.inventorySnapshotVersion)),manifest.inventorySha256,'El inventario cambió desde el respaldo.');
  assert.equal(digest(purchaseInventorySnapshot(await purchaseInventoryView(client,snapshot.data),manifest.purchaseInventorySnapshotVersion)),manifest.purchaseInventorySha256,'El seguimiento de compras cambió desde el respaldo.');
  await client.query('ROLLBACK');
}finally {await client.end();}
console.log(JSON.stringify({candidate,rollback,verifiedBackup:proof.backup,manifests:versions.map(v=>v.digest),selected:false}));
