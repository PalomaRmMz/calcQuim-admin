import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {migrate,schemaName} from '../db/migrate.mjs';
import {WHOLESALE_VERSION} from '../../../src/domain/wholesalePricing.mjs';

async function inspect(c) {
  const versions=(await c.query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows;
  if(![7,8].includes(versions.length)||versions.some((v,n)=>v.version!==n+1))throw new Error('ACTIVATION_REQUIRES_SCHEMA_007_OR_008');
  for(const row of versions){
    const dir=new URL('../../migrations/',import.meta.url),files=await readdir(dir),file=files.find(f=>f.startsWith(String(row.version).padStart(3,'0')+'_')&&f.endsWith('.up.sql'));
    if(!file||createHash('sha256').update(await readFile(new URL(file,dir))).digest('hex')!==row.checksum)throw new Error('MIGRATION_CHECKSUM_MISMATCH');
  }
  const state=(await c.query('SELECT revision,generation,metadata FROM dataset_state WHERE singleton=true')).rows[0];
  if(state.metadata.wholesalePricing?.version===WHOLESALE_VERSION&&(versions.at(-1).version!==8||state.metadata.wholesalePricingSchema!==2))throw new Error('INCONSISTENT_WHOLESALE_METADATA');
  const counts={};for(const table of ['products','sales','sale_items','inventory_movements'])counts[table]=(await c.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
  return {schemaVersion:versions.at(-1).version,revision:state.revision,generation:state.generation,ready:state.metadata.wholesalePricingSchema===2,active:state.metadata.wholesalePricing?.version===WHOLESALE_VERSION,counts};
}
async function transaction(pool,schema,write,fn){
  schema=schemaName(schema);const c=await pool.connect();
  try{
    await c.query(write?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const database=(await c.query('SELECT current_database() AS db')).rows[0].db;
    if(!(database==='calcquim_operational'&&schema==='calcquim_operational')&&!(database==='calcquim_activation_test'&&schema.startsWith('calcquim_test_')))throw new Error('ACTIVATION_TARGET_FORBIDDEN');
    await c.query(`SET LOCAL search_path TO "${schema}",pg_catalog`);
    if(write){await c.query("SET LOCAL lock_timeout='1500ms'");await c.query('SELECT singleton FROM dataset_state WHERE singleton=true FOR UPDATE');}
    const result=await fn(c);await c.query('COMMIT');return result;
  }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}
export const inspectWholesaleActivation=(pool,schema)=>transaction(pool,schema,false,inspect);
export function activateWholesale(pool,schema,{clientsReady=false,runId}={}){
  if(!clientsReady||!runId)throw new Error('COMPATIBLE_CLIENTS_AND_RUN_ID_REQUIRED');
  return transaction(pool,schema,true,async c=>{
    const before=await inspect(c);if(before.active)return {...before,replayed:true};
    const files=await readdir(new URL('../../migrations/',import.meta.url));
    if(files.some(file=>file.endsWith('.up.sql')&&Number(file.split('_')[0])>8))throw new Error('ONLY_MIGRATION_008_AUTHORIZED_BY_THIS_RELEASE');
    // Lock dataset_state BEFORE taking DDL locks: all commands use that order.
    if(before.schemaVersion===7)await migrate(pool,schema,'up',{client:c});
    const settings={version:WHOLESALE_VERSION,amountPolicy:'wholesale-threshold',aggregationVersion:'official-price-group-v1'};
    await c.query("UPDATE dataset_state SET metadata=jsonb_set(metadata,'{wholesalePricing}',$1::jsonb),revision=revision+1 WHERE singleton=true",[JSON.stringify(settings)]);
    await c.query('INSERT INTO inventory_changes(action,reference) VALUES($1,$2)',['wholesale_activation',JSON.stringify({runId,fromSchema:before.schemaVersion,toSchema:8,settings})]);
    return {...await inspect(c),replayed:false};
  });
}
export function recoverUnusedWholesale(pool,schema,{runId}={}){
  if(!runId)throw new Error('RECOVERY_RUN_ID_REQUIRED');
  return transaction(pool,schema,true,async c=>{
    const before=await inspect(c);if(before.schemaVersion===7)return {...before,replayed:true};
    // The SQL refuses removal after any configured rate or v2 sale exists.
    await c.query(await readFile(new URL('../../migrations/008_wholesale.down.sql',import.meta.url),'utf8'));
    await c.query('DELETE FROM schema_migrations WHERE version=8');
    await c.query('UPDATE dataset_state SET revision=revision+1 WHERE singleton=true');
    await c.query('INSERT INTO inventory_changes(action,reference) VALUES($1,$2)',['wholesale_unused_recovery',JSON.stringify({runId,fromSchema:8,toSchema:7})]);
    return {...await inspect(c),replayed:false};
  });
}
