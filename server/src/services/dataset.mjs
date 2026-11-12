import {readSalesHistory,readOfficialSale} from '../repositories/salesHistory.mjs';
import {webPaymentSnapshot,configureWebPayment} from './webPayment.mjs';
import {purchaseInventoryView} from './purchaseInventory.mjs';
import {syncProductInitialInventory} from './productInitialInventory.mjs';
import { createHash } from 'node:crypto';
import { schemaName } from '../db/migrate.mjs';
import { readDataset, writeDataset } from '../repositories/dataset.mjs';
import { ApiError, executeCommand } from './commands.mjs';
import { inventoryAvailable,readInventory,inventoryPolicy } from '../repositories/inventory.mjs';
import { inventoryCommands,executeInventoryCommand,syncInventory } from './inventory.mjs';

// Serialización canónica para claves de idempotencia, independiente del orden de propiedades JSON.
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value==='object') return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function createDatasetService(pool, schema='calcquim_sandbox',purpose='synthetic') {
  schema=schemaName(schema);
  if(!['synthetic','operational'].includes(purpose))throw new Error('Purpose no autorizado.');
  const paymentView=async c=>{const p=await webPaymentSnapshot(c);return p.enabled?{webPaymentPolicy:{enabled:true,version:p.policy_version}}:{};};
  const inventoryPending=async c=>await inventoryAvailable(c)?(await c.query("SELECT sale_id AS \"saleId\",ordinal,scope,reason FROM inventory_pending WHERE state='pending' ORDER BY sale_id,ordinal")).rows:[];
  const read=(c,lock=false)=>readDataset(c,lock,purpose==='operational'?'operational':false);
  async function transaction(callback, readOnly=false) {
    let c;
    try {c=await pool.connect();}
    catch {throw new ApiError(503,'DATABASE_UNAVAILABLE','PostgreSQL no está disponible.');}
    try {
      await c.query(readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
      await c.query(`SET LOCAL search_path TO "${schema}", pg_catalog`);
      const value=await callback(c);
      await c.query('COMMIT'); return value;
    } catch(error) {await c.query('ROLLBACK'); throw error;}
    finally {c.release();}
  }
  return {
    salesHistory:q=>transaction(c=>readSalesHistory(c,q,purpose),true),
    officialSale:(id,q)=>transaction(c=>readOfficialSale(c,id,q,purpose),true),
    read:()=>transaction(async c=>({...await read(c),...await paymentView(c),inventoryPending:await inventoryPending(c),inventoryEnabled:await inventoryAvailable(c)?(await inventoryPolicy(c)).sales_enabled:false}),true),
    purchaseInventory:()=>transaction(async c=>purchaseInventoryView(c,(await read(c)).data),true),
    operations:()=>transaction(async c=>{const snapshot=await read(c);return {data:snapshot.data,revision:snapshot.revision,inventory:await readInventory(c,snapshot.data),purchases:await purchaseInventoryView(c,snapshot.data)};},true),
    inventory:()=>transaction(async c=>readInventory(c,(await read(c)).data),true),
    inventoryOperationStatus:key=>transaction(async c=>{
      const row=(await c.query('SELECT request_hash,response FROM idempotency_requests WHERE request_key=$1',[key])).rows[0];
      return row ? {requestHash:row.request_hash,response:row.response} : null;
    },true),
    mobileStatus:key=>transaction(async c=>{
      const row=(await c.query('SELECT response FROM idempotency_requests WHERE request_key=$1',['mobile:'+key])).rows[0];
      const snapshot=await read(c);
      return row?.response?.receipt?{receipt:row.response.receipt,revision:snapshot.revision,generation:snapshot.generation,inventoryPending:(await inventoryPending(c)).filter(p=>p.saleId===row.response.receipt.id)}:{status:'not_found'};
    },true),
    async command({name,args,revision,generation,requestKey,channel='WEB'}) {
      if(name==='createMobileSale'&&channel!=='MOVIL')throw new ApiError(403,'CHANNEL_FORBIDDEN','Canal no autorizado.');
      if (!Number.isSafeInteger(revision)||typeof generation!=='string'||!requestKey||!/^[a-zA-Z0-9:_-]{8,150}$/.test(requestKey)) throw new ApiError(400,'INVALID_PRECONDITION','Se requieren revisión, generación y clave de idempotencia.');
      const hash=createHash('sha256').update(canonical({name,args,generation})).digest('hex');
      return transaction(async c=>{
        const current=await read(c,true);
        if(['createMobileSale','correctMobileSale'].includes(name)&&!(await c.query('SELECT 1 FROM schema_migrations WHERE version=7')).rowCount)throw new ApiError(503,'MOBILE_SCHEMA_PENDING','La integración móvil requiere una migración autorizada.');
        const previous=(await c.query('SELECT * FROM idempotency_requests WHERE request_key=$1',[requestKey])).rows[0];
        if(previous) {
          if(previous.request_hash!==hash) throw new ApiError(409,'IDEMPOTENCY_CONFLICT','La clave ya corresponde a otra operación.');
          // Se devuelve resultado original y estado actual para no regresar la vista a una revisión antigua.
          return {...current,...await paymentView(c),result:previous.response,replayed:true,inventoryPending:await inventoryPending(c),inventoryEnabled:await inventoryAvailable(c)?(await inventoryPolicy(c)).sales_enabled:false};
        }
        if(current.generation!==generation||current.revision!==revision) throw new ApiError(412,'STALE_DATA','Los datos cambiaron. Recarga antes de guardar.');
        let result;
        const before=structuredClone(current.data);
        try {
          if(name==='configureWebPaymentPolicy')result=await configureWebPayment(c,args[0]);
          else if(inventoryCommands.includes(name))result={ok:true,...await executeInventoryCommand(c,current.data,name,args)};
          else {const policy=await webPaymentSnapshot(c);result=executeCommand(current.data,current.counters,name,args,{webPaymentEnabled:channel==='WEB'&&policy.enabled,webPaymentVersion:policy.policy_version});}
        }
        catch(error) {if(error instanceof ApiError) throw error; throw new ApiError(422,'DOMAIN_VALIDATION',error.message);}
        if(name==='configureWebPaymentPolicy'){await c.query('UPDATE dataset_state SET revision=revision+1 WHERE singleton=true');}
        else if(inventoryCommands.includes(name)) { if(JSON.stringify(before)!==JSON.stringify(current.data))await writeDataset(c,current.data,current.counters); else await c.query('UPDATE dataset_state SET revision=revision+1 WHERE singleton=true'); }
        else {await writeDataset(c,current.data,current.counters);await syncProductInitialInventory(c,before,current.data,name,args,{channel});await syncInventory(c,before,current.data,name,args);
          if(name==='voidSale') {
            const sale=current.data.sales.find(s=>s.id===args[0]);
            sale.history=[...(sale.history||[]),{action:'voided',channel,at:new Date().toISOString()}];
            await c.query('UPDATE sales SET record=$2 WHERE id=$1',[String(sale.id),JSON.stringify({...sale,items:[]})]);
          }}
        await c.query('INSERT INTO idempotency_requests(request_key,request_hash,response) VALUES($1,$2,$3)',[requestKey,hash,JSON.stringify(result)]);
        return {...current,...await paymentView(c),revision:current.revision+1,result,replayed:false,inventoryPending:await inventoryPending(c),inventoryEnabled:await inventoryAvailable(c)?(await inventoryPolicy(c)).sales_enabled:false};
      });
    },
  };
}
