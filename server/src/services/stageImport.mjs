import { previewOriginal } from './importPreview.mjs';
import { comparePrivateValues } from './reconciliation.mjs';
import { readDataset, writeDataset,collections } from '../repositories/dataset.mjs';
import { schemaName } from '../db/migrate.mjs';
import { STORAGE_KEYS } from '../../../src/services/catalogStorage.js';

export async function stageOriginal(pool,schema,text,expectedHash,options={}) {
  schema=schemaName(schema);
  // Nunca se aplica al esquema conectado a React ni a desarrollo.
  if(!schema.startsWith('calcquim_test_import_')&&!(schema==='calcquim_operational'&&options.operational===true&&pool.options.database==='calcquim_operational'))throw new Error('Destino de importación no autorizado.');
  const {report,data,original}=previewOriginal(text);
  if(!report.canTransfer||expectedHash!==report.sha256)throw new Error('Prevalidación o huella no coincidente.');
  const c=await pool.connect();
  try {
    await c.query('BEGIN');await c.query(`SET LOCAL search_path TO "${schema}",pg_catalog`);
    const current=await readDataset(c,true,true);
    const previous=(await c.query('SELECT report,raw_text FROM migration_sources WHERE sha256=$1',[report.sha256])).rows[0];
    if(previous){
      if(previous.raw_text!==text||!comparePrivateValues(data,current.data).equal)throw new Error('El ensayo previo no coincide con el origen; no se sobrescribe.');
      await c.query('COMMIT');return previous.report;
    }
    if((await c.query('SELECT 1 FROM migration_sources LIMIT 1')).rowCount)throw new Error('El destino conserva otro archivo original.');
    for(const field of Object.keys(collections))if((current.data[field]??current.data.procurement[field]).length)throw new Error('El destino no está vacío.');
    const counters={};
    for(const field of ['categories','productLines','priceGroups','products'])counters[field]=Math.max(0,...data[field].map(x=>Number(x.id)));
    counters.sales=Math.max(Number(original.storage[STORAGE_KEYS.salesSequence]??0),0,...data.sales.map(s=>Number(String(s.folio??'').replace(/^V-/,''))||0));
    await writeDataset(c,data,counters);
    const roundTrip=await readDataset(c,false,true);
    if(!comparePrivateValues(roundTrip.data,data).equal)throw new Error('Round-trip no coincide; se revierte todo.');
    const outcome={...report,staged:true,roundTripEqual:true,cutoverEnabled:false};
    await c.query('INSERT INTO migration_sources(sha256,raw_text,report) VALUES($1,$2,$3)',[report.sha256,text,JSON.stringify(outcome)]);
    await c.query("UPDATE dataset_state SET purpose='migration_rehearsal' WHERE singleton=true");
    await c.query('COMMIT');return outcome;
  }catch(error){await c.query('ROLLBACK');throw error;}
  finally{c.release();}
}
