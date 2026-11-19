// Explicitly gated, two-line atomic repair using existing purchase-inventory commands.
// Default writes target only the restored database, never production.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import pg from '../server/node_modules/pg/lib/index.js';
import {loadOperationalConfig} from '../server/src/config/operational.mjs';
const out=path.resolve('artifacts/cierre-operativo');
const paths=JSON.parse(await readFile(path.join(out,'local-paths.private.json')));
const restore=JSON.parse(await readFile(path.join(paths.privateDir,'restore-target.private.json')));
const manifest=JSON.parse(await readFile(path.join(out,'integration-manifest.json')));
const proposal=JSON.parse(await readFile('artifacts/cierre-inventarios/reparacion-propuesta.json'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const source=path.join(out,'candidate');
for(const f of manifest.files)assert.equal(sha(await readFile(path.join(source,f.path))),f.sha256,'Candidate source changed: '+f.path);
const moduleAt=rel=>import(pathToFileURL(path.join(source,rel)));
const {readDataset}=await moduleAt('server/src/repositories/dataset.mjs');
const {executeInventoryCommand}=await moduleAt('server/src/services/inventory.mjs');
const {readInventory,inventoryChange}=await moduleAt('server/src/repositories/inventory.mjs');
const {canonical}=await moduleAt('server/src/services/dataset.mjs');
const {inventoryDecimal}=await moduleAt('src/services/inventoryUnits.js');
const operation='nexo-close-20261111-40l-v1',purchaseId='36d95c7c-9e39-4928-b916-ee76471e70eb';
const mode=process.argv.find(a=>a.startsWith('--mode='))?.split('=')[1]??'rehearse';
assert.ok(['rehearse','apply','revert'].includes(mode));
const operational=process.argv.includes('--target=operational');
if(operational){assert.notEqual(mode,'rehearse');assert.ok(process.argv.includes('--authorized-maintenance'),'Separately authorized maintenance window required');assert.equal(process.env.NEXO_HISTORICAL_REPAIR_AUTHORIZATION,operation,'Explicit repair authorization required');}
const config=operational?(await loadOperationalConfig()).database:restore;
assert.equal(config.host,'127.0.0.1');assert.equal(config.port,operational?5432:55441);if(operational)assert.equal(config.database,'calcquim_operational');else assert.match(config.database,/^nexo_close_restore(?:_\d+)?$/);
const pool=new pg.Pool({...config,max:1,application_name:operational?'nexo-authorized-historical-repair':'nexo-isolated-repair-rehearsal'});
const evidence=async()=>{const c=await pool.connect();try{await c.query('BEGIN READ ONLY');await c.query('SET LOCAL search_path TO calcquim_operational,pg_catalog');const snapshot=await readDataset(c,false,'operational'),view=await readInventory(c,snapshot.data);const rows=(await c.query('SELECT item_id,state,actual_quantity::text,version FROM purchase_inventory WHERE purchase_id=$1 ORDER BY ordinal',[purchaseId])).rows;const counts=(await c.query("SELECT (SELECT count(*) FROM inventory_movements)::int AS movements,(SELECT count(*) FROM inventory_changes)::int AS audit,(SELECT count(*) FROM idempotency_requests)::int AS requests")).rows[0];await c.query('ROLLBACK');return {stock:Object.fromEntries(['59','31'].map(id=>[id,view.products.find(p=>String(p.productId)===id).quantity])),rows,counts,revision:snapshot.revision};}finally{c.release();}};
async function batch(action,{injectFailure=false}={}){
 const c=await pool.connect();
 const key=operation+':'+action,requestHash=sha(canonical({operation,action,entries:proposal.entries.map(e=>e.observed)}));
 try{
  await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='2s'");await c.query('SET LOCAL search_path TO calcquim_operational,pg_catalog');
  const identity=(await c.query('SELECT current_database() db,inet_server_port() port')).rows[0];assert.equal(identity.db,config.database);assert.equal(identity.port,config.port);
  if(operational){const others=(await c.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND (state IS NULL OR state<>'idle' OR xact_start IS NOT NULL)")).rows[0].n;assert.equal(others,0,'Active or uninspectable clients: stop');}
  const current=await readDataset(c,true,'operational');
  const previous=(await c.query('SELECT request_hash,response FROM idempotency_requests WHERE request_key=$1',[key])).rows[0];
  if(previous){assert.equal(previous.request_hash,requestHash);await c.query('COMMIT');return {...previous.response,replayed:true};}
  const result={operation,action,movementIds:[],rowVersions:[],stockBefore:null,stockAfter:null};
  const before=await readInventory(c,current.data);result.stockBefore=Object.fromEntries(['59','31'].map(id=>[id,before.products.find(p=>String(p.productId)===id).quantity]));
  let applied;
  if(action==='revert'){applied=(await c.query('SELECT response FROM idempotency_requests WHERE request_key=$1',[operation+':apply'])).rows[0]?.response;assert.ok(applied,'No repair to reverse');}
  else{
   const uncertain=(await c.query("SELECT count(*)::int n FROM inventory_movements WHERE product_id IN ('59','31') AND recorded_at >= '2026-11-11T00:00:00-06:00'::timestamptz AND (quantity>0 OR kind='estimate')")).rows[0].n;
   assert.equal(uncertain,0,'New positive entries/counts require a new review');
   const manual=(await c.query("SELECT count(*)::int n FROM inventory_changes WHERE reference->>'purchaseId'=$1 AND action ~ '(included|recognized|receipt|prepared)'",[purchaseId])).rows[0].n;assert.equal(manual,0,'Possible prior incorporation');
  }
  for(const [index,{observed:o}]of proposal.entries.entries()){
   const row=(await c.query('SELECT *,quantity::text,actual_quantity::text FROM purchase_inventory WHERE purchase_id=$1 AND item_id=$2 FOR UPDATE',[purchaseId,o.item_id])).rows[0];assert.ok(row);
   for(const field of ['product_id','fingerprint','quantity','nature'])assert.equal(row[field],o[field]);
   const purchase=current.data.procurement.purchases.find(p=>p.id===purchaseId);assert.ok(purchase&&!purchase.voidedAt);assert.equal(purchase.date,'2026-11-11');assert.deepEqual(purchase.items[row.ordinal],row.source);
   if(action==='apply'){assert.equal(row.state,'reconcile');assert.equal(row.version,o.version);assert.equal(row.actual_quantity,null);}
   else{assert.equal(row.state,'applied');assert.equal(Number(row.actual_quantity),20);assert.equal(row.version,applied.rowVersions[index]);const last=(await c.query('SELECT id FROM inventory_movements WHERE product_id=$1 ORDER BY seq DESC LIMIT 1',[o.product_id])).rows[0];assert.equal(last.id,applied.movementIds[index],'Later movements: stop automatic reversal');}
   const input={purchaseId,itemId:o.item_id,activity:'LIMPIEZA',...(action==='apply'?{action:'receive'}:{quantity:'20',unit:'litro'}),reason:action==='apply'?`Reparación autorizada ${operation}: terminado comprado el 11/11/2026 sin entrada previa`:`Compensación autorizada de la reparación ${operation}; conservar compra y auditoría`};
   const response=await executeInventoryCommand(c,current.data,action==='apply'?'resolvePurchaseInventory':'returnPurchaseInventory',[input]);assert.ok(response.movementId);result.movementIds.push(response.movementId);result.rowVersions.push((await c.query('SELECT version FROM purchase_inventory WHERE purchase_id=$1 AND item_id=$2',[purchaseId,o.item_id])).rows[0].version);
   if(injectFailure&&index===0)throw Error('INJECTED_FAILURE_AFTER_FIRST_LINE');
  }
  const after=await readInventory(c,current.data);result.stockAfter=Object.fromEntries(['59','31'].map(id=>[id,after.products.find(p=>String(p.productId)===id).quantity]));
  for(const id of ['59','31'])assert.equal(inventoryDecimal(result.stockAfter[id])-inventoryDecimal(result.stockBefore[id]),(action==='apply'?20n:-20n)*1000000n);
  await inventoryChange(c,'historical_purchase_repair',{operation,action,purchaseId,movementIds:result.movementIds,stockBefore:result.stockBefore,stockAfter:result.stockAfter,channel:'WEB',reason:'Operación extraordinaria autorizada; dos renglones atómicos'});
  await c.query('UPDATE dataset_state SET revision=revision+1 WHERE singleton=true');
  await c.query('INSERT INTO idempotency_requests(request_key,request_hash,response) VALUES($1,$2,$3)',[key,requestHash,JSON.stringify(result)]);
  await c.query('COMMIT');return {...result,replayed:false};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
try{
 if(mode==='rehearse'){
  const before=await evidence();await assert.rejects(batch('apply',{injectFailure:true}),/INJECTED_FAILURE/);assert.deepEqual(await evidence(),before);
  const applied=await batch('apply'),after=await evidence();assert.equal((await batch('apply')).replayed,true);assert.deepEqual(await evidence(),after);
  const reversed=await batch('revert'),restored=await evidence();assert.deepEqual(restored.stock,before.stock);assert.ok(restored.rows.every(r=>r.state==='returned'));assert.equal((await batch('revert')).replayed,true);assert.deepEqual(await evidence(),restored);
  await writeFile(path.join(out,'repair-rehearsal.json'),JSON.stringify({productionModified:false,isolatedPort:55441,atomicFailureRollback:true,applyOnceAndReplay:true,compensatingReversal:true,reversalReplay:true,before,applied,reversed,afterReversal:restored,purchasePreserved:true},null,2),{flag:'wx'});
  console.log('Repair rehearsal passed: atomic rollback, +20/+20 once, replay, -20/-20 compensation and replay.');
 }else{const result=await batch(mode);await writeFile(path.join(paths.privateDir,`authorized-${mode}-${Date.now()}.private.json`),JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify({action:mode,replayed:result.replayed,movementIds:result.movementIds}));}
}finally{await pool.end();}
