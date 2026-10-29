import { readFile,writeFile,mkdir,readdir,open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRehearsalConfig } from '../src/config/rehearsal.mjs';
import { migrate } from '../src/db/migrate.mjs';
import { runPgTool,listPgArchive } from '../src/db/pgTools.mjs';
import { previewOriginal } from '../src/services/importPreview.mjs';
import { stageOriginal } from '../src/services/stageImport.mjs';
import { readDataset } from '../src/repositories/dataset.mjs';
import { reconcileDatasets,reconcileRelationalColumns,comparePrivateValues,sourceFreshness,sha256 } from '../src/services/reconciliation.mjs';
import { loadOperationalConfig } from '../src/config/operational.mjs';
import { STORAGE_KEYS } from '../../src/services/catalogStorage.js';

const expectedHash='81658ef730fe5afa1863458ed521f5479621469e9d961fd2006ed2ff586d6f8a';
const expectedBytes=1064726;
const originals=[
  'D:\\ReactApps\\calcQuim-admin\\CalcQuim_Respaldo_Original_2026-10-16T19-47-05-790Z.json',
  'D:\\FullClean H&L\\Downloads\\CalcQuim_Respaldo_Original_2026-10-16T19-47-05-790Z.json',
];
const operational=process.argv.includes('--operational');
if(operational&&!process.argv.includes('--window-confirmed'))throw new Error('CLOSED_WINDOW_CONFIRMATION_REQUIRED');
const schema=operational?'calcquim_operational':'calcquim_test_import_real';
const directory=new URL(operational?'../artifacts/operational/':'../artifacts/real-migration-81658ef7/',import.meta.url);
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const report={sourceHash:expectedHash,expectedBytes,cutoverEnabled:false,stage:'START',completed:false};
let sourcePool,restorePool;
class CheckError extends Error {constructor(code){super(code);this.code=code;}}
const requireCheck=(condition,code)=>{if(!condition)throw new CheckError(code);};

async function verifyOriginals() {
  const buffers=await Promise.all(originals.map(path=>readFile(path)));
  for(const buffer of buffers)requireCheck(buffer.length===expectedBytes&&sha256(buffer)===expectedHash,'ORIGINAL_HASH_OR_SIZE_MISMATCH');
  return buffers[0];
}
async function databaseSafety(pool,database,{allowApplicationSchema=false}={}) {
  const c=await pool.connect();
  try {
    const r=(await c.query("SELECT current_database() AS database,host(inet_server_addr()) AS address,current_setting('listen_addresses') AS listeners,current_setting('server_version') AS version,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];
    requireCheck(r.database===database&&r.address==='127.0.0.1','DATABASE_IDENTITY_MISMATCH');
    requireCheck(!['rolsuper','rolcreatedb','rolcreaterole','rolreplication','rolbypassrls'].some(k=>r[k]),'ROLE_NOT_RESTRICTED');
    requireCheck(r.listeners.split(',').every(v=>['127.0.0.1','::1','localhost'].includes(v.trim())),'POSTGRES_NOT_LOOPBACK');
    const namespaces=(await c.query("SELECT nspname FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname NOT IN ('public','information_schema')")).rows;
    requireCheck(namespaces.every(n=>allowApplicationSchema&&n.nspname===schema),'UNEXPECTED_DATABASE_OBJECTS');
    const publicObjects=(await c.query("SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','S','v','m','f')")).rows[0].count;
    requireCheck(publicObjects===0,'PUBLIC_SCHEMA_NOT_EMPTY');
    return {database,version:r.version,restrictedRole:true,loopback:true,applicationSchemaExists:namespaces.some(n=>n.nspname===schema)};
  }finally{c.release();}
}
async function verifyMigrationVersions(pool) {
  const files=(await readdir(new URL('../migrations/',import.meta.url))).filter(f=>/^\d+_.+\.up\.sql$/.test(f)).sort();
  const applied=(await pool.query(`SELECT version,checksum FROM "${schema}".schema_migrations ORDER BY version`)).rows;
  requireCheck(files.length===applied.length,'EXISTING_SCHEMA_VERSION_REVIEW_REQUIRED');
  for(const [i,file]of files.entries())requireCheck(applied[i].version===Number(file.split('_')[0])&&applied[i].checksum===sha256(await readFile(new URL(`../migrations/${file}`,import.meta.url))),'MIGRATION_CHECKSUM_MISMATCH');
  return applied.map(r=>r.version);
}
async function inspect(pool,expected,text) {
  const c=await pool.connect();
  try {
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await c.query(`SET LOCAL search_path TO "${schema}",pg_catalog`);
    const purpose=(await c.query('SELECT purpose FROM dataset_state WHERE singleton=true')).rows[0].purpose;
    const snapshot=await readDataset(c,false,purpose==='operational'&&operational?'operational':true);
    const comparison=reconcileDatasets(expected,snapshot.data);
    const relational=await reconcileRelationalColumns(c,expected);
    const archived=(await c.query('SELECT raw_text,sha256 FROM migration_sources')).rows;
    const archiveExact=archived.length===1&&archived[0].raw_text===text&&archived[0].sha256===expectedHash&&sha256(archived[0].raw_text)===expectedHash;
    await c.query('COMMIT');
    return {comparison,relational,archiveExact,purpose,snapshot};
  }catch(error){await c.query('ROLLBACK');throw error;}
  finally{c.release();}
}
async function writeEvidence() {
  await mkdir(directory,{recursive:true,mode:0o700});
  const destination=new URL(`validation-${stamp}.private.json`,directory);
  await writeFile(destination,JSON.stringify(report,null,2),{flag:'wx',mode:0o600});
  return fileURLToPath(destination);
}
try {
  report.stage='VERIFY_ORIGINALS';
  const bytes=await verifyOriginals();
  report.originalCopies={verified:2,hashesMatch:true,sizesMatch:true};
  await mkdir(directory,{recursive:true,mode:0o700});
  const privatePath=new URL('original.private.json',directory);
  try{await writeFile(privatePath,bytes,{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}
  const privateBytes=await readFile(privatePath);
  requireCheck(sha256(privateBytes)===expectedHash,'PRIVATE_COPY_MISMATCH');
  const text=privateBytes.toString('utf8');
  requireCheck(sha256(text)===expectedHash,'UTF8_ROUNDTRIP_MISMATCH');
  report.stage='VALIDATE_IN_MEMORY';
  const {report:preview,data,original}=previewOriginal(text);
  report.preview=preview;
  report.storageStates=Object.fromEntries(['categories','productLines','priceGroups','products','procurement','purchases','sales','salesSequence'].map(name=>{
    const key=STORAGE_KEYS[name];let state='absent';
    if(Object.hasOwn(original.storage,key)){
      const value=original.storage[key];state=value===null?'null':typeof value==='string'?(value==='[]'?'empty_array':value==='null'?'encoded_null':'stored_json'):'invalid_type';
    }return [name,state];
  }));
  requireCheck(preview.canTransfer&&preview.sha256===expectedHash,'SOURCE_REVIEW_REQUIRED');
  report.freshness=sourceFreshness(original,data);
  report.sourcePreflight=reconcileDatasets(data,data);
  requireCheck(report.sourcePreflight.equal,'SOURCE_AUDIT_FAILED');
  report.stage='RESTRICTED_CONNECTIONS';
  const config=operational?(await loadOperationalConfig()).database:await loadRehearsalConfig('calcquim_migration_check');
  const restoreConfig=operational?(await loadOperationalConfig('calcquim_operational_restore')).database:await loadRehearsalConfig('calcquim_migration_restore');
  sourcePool=new pg.Pool(config);restorePool=new pg.Pool(restoreConfig);
  report.sourceDatabase=await databaseSafety(sourcePool,config.database,{allowApplicationSchema:true});
  report.restoreDatabase=await databaseSafety(restorePool,restoreConfig.database,{allowApplicationSchema:true});
  report.stage='SCHEMA';
  if(!report.sourceDatabase.applicationSchemaExists)await migrate(sourcePool,schema);
  report.migrations=await verifyMigrationVersions(sourcePool);
  report.stage='IMPORT';
  const existingPurpose=(await sourcePool.query(`SELECT purpose FROM ${schema}.dataset_state WHERE singleton=true`)).rows[0].purpose;
  if(operational&&existingPurpose==='operational') {
    const prior=await inspect(sourcePool,data,text);requireCheck(prior.comparison.equal&&prior.relational.equal&&prior.archiveExact,'EXISTING_OPERATIONAL_CHANGED');
    report.import={previouslyPrepared:true};
  }else report.import=await stageOriginal(sourcePool,schema,text,expectedHash,{operational});
  report.stage='RECONCILIATION';
  const loaded=await inspect(sourcePool,data,text);
  report.reconciliation={...loaded.comparison,relational:loaded.relational,archiveExact:loaded.archiveExact};
  requireCheck(loaded.comparison.equal&&loaded.relational.equal&&loaded.archiveExact&&['migration_rehearsal',...(operational?['operational']:[])].includes(loaded.purpose),'DATABASE_RECONCILIATION_FAILED');
  report.stage='IDEMPOTENCY';
  if(!(operational&&existingPurpose==='operational'))await stageOriginal(sourcePool,schema,text,expectedHash,{operational});
  const repeated=await inspect(sourcePool,data,text);
  report.idempotent=comparePrivateValues(loaded.snapshot,repeated.snapshot).equal;
  requireCheck(report.idempotent,'IDEMPOTENCY_FAILED');
  if(operational&&loaded.purpose!=='operational')await sourcePool.query(`UPDATE ${schema}.dataset_state SET purpose='operational' WHERE singleton=true AND purpose='migration_rehearsal'`);
  report.stage='PG_DUMP';
  const dump=new URL(`postgres-${stamp}.dump`,directory);
  await(await open(dump,'wx',0o600)).close();
  // Copia completa de la base aislada; las verificaciones anteriores descartaron datos ajenos.
  runPgTool('pg_dump',['--no-owner','--no-acl','-Fc','-f',fileURLToPath(dump)],config);
  report.dump={file:`postgres-${stamp}.dump`,sha256:sha256(await readFile(dump)),fullIsolatedDatabase:true};
  requireCheck(comparePrivateValues(loaded.snapshot,(await inspect(sourcePool,data,text)).snapshot).equal,'SOURCE_CHANGED_DURING_DUMP');
  report.stage='PG_RESTORE';
  if(!report.restoreDatabase.applicationSchemaExists){
    // --schema filtra la entrada CREATE SCHEMA en este archivo de base completa.
    // El índice explícito incluye esa creación y todos sus objetos, sin tocar public.
    const index=listPgArchive(fileURLToPath(dump));
    const selected=index.split('\n').filter(line=>line.startsWith(';')||new RegExp(`\\s${schema}(?:\\s|$)`).test(line)||/\b(ENCODING|STDSTRINGS|SEARCHPATH)\b/.test(line));
    requireCheck(selected.some(line=>new RegExp(`\\bSCHEMA\\s+-\\s+${schema}\\s`).test(line)),'ARCHIVE_SCHEMA_ENTRY_MISSING');
    const list=new URL(`restore-${stamp}.list`,directory);
    await writeFile(list,selected.join('\n')+'\n',{flag:'wx',mode:0o600});
    report.restoreScope='COMPLETE_APPLICATION_SCHEMA_INCLUDING_CREATE_SCHEMA';
    report.restoreArchiveEntries=selected.filter(line=>/^\d+;/.test(line)).length;
    runPgTool('pg_restore',['--no-owner','--no-acl','--exit-on-error','--single-transaction','--use-list',fileURLToPath(list),fileURLToPath(dump)],restoreConfig);
    report.restorePerformed=true;
  }else report.restorePerformed=false;
  report.restoreMigrations=await verifyMigrationVersions(restorePool);
  const restored=await inspect(restorePool,data,text);
  report.restoration={...restored.comparison,relational:restored.relational,archiveExact:restored.archiveExact,
    fullSnapshotEqual:comparePrivateValues(loaded.snapshot,restored.snapshot).equal,
    reusedExistingWithoutReplacement:!report.restorePerformed};
  requireCheck(restored.comparison.equal&&restored.relational.equal&&restored.archiveExact&&report.restoration.fullSnapshotEqual,'RESTORED_DATABASE_RECONCILIATION_FAILED');
  await verifyOriginals();
  report.originalCopies.unchangedAfter=true;
  report.completed=true;report.stage='COMPLETE';
  if(operational)report.operationalPrepared=true;
}catch(error){
  report.completed=false;
  report.error={code:error instanceof CheckError?error.code:/^[A-Z0-9]{5}$/.test(error.code??'')?error.code:'CHECK_FAILED'};
  process.exitCode=1;
}finally{
  await sourcePool?.end();await restorePool?.end();
  const evidence=await writeEvidence();
  // Solo metadatos y agregados no privados. Nunca imprimir error.message, dataset o SQL.
  console.log(JSON.stringify({completed:report.completed,stage:report.stage,error:report.error,counts:report.reconciliation?.counts??report.preview?.counts,
    idempotent:report.idempotent,restored:report.restoration?.equal,originalsUnchanged:report.originalCopies?.unchangedAfter,
    evidence,cutoverEnabled:false},null,2));
}
