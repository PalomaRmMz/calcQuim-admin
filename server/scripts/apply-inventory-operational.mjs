import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdir,readdir,readFile,writeFile } from 'node:fs/promises';
import pg from 'pg';
import { loadOperationalConfig,requireActivation } from '../src/config/operational.mjs';
import { readDataset } from '../src/repositories/dataset.mjs';
import { canonical } from '../src/services/dataset.mjs';
import { sha256 } from '../src/services/reconciliation.mjs';
import { migrate } from '../src/db/migrate.mjs';
import { verifyPgArchive } from '../src/db/pgTools.mjs';
let pool,c;
const evidence={applied:false,stage:'APPROVAL_REQUIRED',at:new Date().toISOString()};
try{
  if(!process.argv.includes('--authorize-operational')||!process.argv.includes('--closed-window-confirmed'))throw new Error('EXPLICIT_APPROVAL_REQUIRED');
  const activation=await requireActivation();if(!activation.restoreVerified)throw new Error('RECOVERY_REQUIRED');
  const tests=JSON.parse(await readFile(new URL('../artifacts/operational/synthetic-tests.private.json',import.meta.url),'utf8'));
  if(!tests.passed||!tests.inventoryValidated||tests.database!=='calcquim_activation_test'||tests.migrationChecksum!==sha256(await readFile(new URL('../migrations/006_inventory.up.sql',import.meta.url))))throw new Error('SYNTHETIC_VALIDATION_REQUIRED');
  const files=(await readdir(new URL('../migrations/',import.meta.url))).filter(f=>/^\d+_.+\.up\.sql$/.test(f));
  if(files.length!==6||!files.includes('006_inventory.up.sql'))throw new Error('MIGRATION_SCOPE_CHANGED');
  const config=await loadOperationalConfig();pool=new pg.Pool(config.database);c=await pool.connect();
  const identity=(await c.query("SELECT current_database() AS db,host(inet_server_addr()) AS host,current_setting('listen_addresses') AS listeners,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];
  if(identity.db!=='calcquim_operational'||identity.host!=='127.0.0.1'||identity.listeners.split(',').some(v=>!['127.0.0.1','localhost','::1'].includes(v.trim()))||['rolsuper','rolcreatedb','rolcreaterole','rolreplication','rolbypassrls'].some(k=>identity[k]))throw new Error('UNSAFE_DESTINATION');
  await c.query('BEGIN');await c.query('SET LOCAL search_path TO calcquim_operational,pg_catalog');
  // Bloquea los comandos de la aplicación durante respaldo y aplicación; no cambia saldos.
  const before=await readDataset(c,true,'operational'),beforeHash=sha256(canonical(before));
  const versions=(await c.query('SELECT version FROM schema_migrations ORDER BY version')).rows.map(r=>r.version);
  if(JSON.stringify(versions)!=='[1,2,3,4,5]')throw new Error('EXPECTED_SCHEMA_5_REQUIRED');
  evidence.stage='BACKUP';
  const backup=spawnSync(process.execPath,[fileURLToPath(new URL('backup-operational.mjs',import.meta.url))],{windowsHide:true,stdio:'ignore',timeout:300000});
  if(backup.status!==0)throw new Error('BACKUP_FAILED');
  const directory=new URL('../artifacts/operational/backups/',import.meta.url);
  const names=(await readdir(directory)).filter(f=>/^postgres-.*\.private\.json$/.test(f)).sort();
  const manifest=JSON.parse(await readFile(new URL(names.at(-1),directory),'utf8'));
  const dump=new URL(manifest.file,directory),bytes=await readFile(dump);
  if(manifest.snapshotSha256!==beforeHash||manifest.sha256!==sha256(bytes)||manifest.bytes!==bytes.length)throw new Error('BACKUP_NOT_CURRENT');
  verifyPgArchive(fileURLToPath(dump));evidence.backupSha256=manifest.sha256;evidence.recoveryPathVerified=true;
  evidence.stage='MIGRATION';await migrate(pool,'calcquim_operational','up',{client:c});
  if(sha256(canonical(await readDataset(c,false,'operational')))!==beforeHash)throw new Error('BUSINESS_DATA_CHANGED');
  for(const table of ['inventory_accounts','inventory_movements','inventory_pending','inventory_allocations','inventory_replenishment','inventory_changes'])if((await c.query(`SELECT 1 FROM ${table} LIMIT 1`)).rowCount)throw new Error('INVENTORY_MUST_START_UNKNOWN');
  await c.query('COMMIT');evidence.applied=true;evidence.stage='COMPLETE';
  console.log('INVENTORY_SCHEMA_READY: datos previos intactos, sin existencias iniciales. Reiniciar Express en ventana autorizada.');
}catch{
  if(c)await c.query('ROLLBACK');process.exitCode=1;console.error('INVENTORY_ACTIVATION_STOPPED: no habilitar el módulo; revisar autorización, respaldo y evidencia.');
}finally{
  c?.release();await pool?.end();
  const directory=new URL('../artifacts/inventory/',import.meta.url);await mkdir(directory,{recursive:true});await writeFile(new URL(`activation-${Date.now()}.private.json`,directory),JSON.stringify(evidence,null,2),{flag:'wx',mode:0o600});
}
