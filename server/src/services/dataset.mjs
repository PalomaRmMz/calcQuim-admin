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
    read:()=>transaction(async c=>({...await read(c),inventoryEnabled:await inventoryAvailable(c)?(await inventoryPolicy(c)).sales_enabled:false}),true),
    inventory:()=>transaction(async c=>readInventory(c,(await read(c)).data),true),
    mobileStatus:key=>transaction(async c=>{
      const row=(await c.query('SELECT response FROM idempotency_requests WHERE request_key=$1',['mobile:'+key])).rows[0];
      const snapshot=await read(c);
      return row?.response?.receipt?{receipt:row.response.receipt,revision:snapshot.revision,generation:snapshot.generation}:{status:'not_found'};
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
          return {...current,result:previous.response,replayed:true,inventoryEnabled:await inventoryAvailable(c)?(await inventoryPolicy(c)).sales_enabled:false};
        }
        if(current.generation!==generation||current.revision!==revision) throw new ApiError(412,'STALE_DATA','Los datos cambiaron. Recarga antes de guardar.');
        let result;
        const before=structuredClone(current.data);
        try {
          if(inventoryCommands.includes(name))result={ok:true,...await executeInventoryCommand(c,current.data,name,args)};
          else result=executeCommand(current.data,current.counters,name,args);
        }
        catch(error) {if(error instanceof ApiError) throw error; throw new ApiError(422,'DOMAIN_VALIDATION',error.message);}
        if(inventoryCommands.includes(name)) { if(JSON.stringify(before.sales)!==JSON.stringify(current.data.sales))await writeDataset(c,current.data,current.counters); else await c.query('UPDATE dataset_state SET revision=revision+1 WHERE singleton=true'); }
        else {await writeDataset(c,current.data,current.counters);await syncInventory(c,before,current.data,name,args);
          if(name==='voidSale') {
            const sale=current.data.sales.find(s=>s.id===args[0]);
            sale.history=[...(sale.history||[]),{action:'voided',channel,at:new Date().toISOString()}];
            await c.query('UPDATE sales SET record=$2 WHERE id=$1',[String(sale.id),JSON.stringify({...sale,items:[]})]);
          }}
        await c.query('INSERT INTO idempotency_requests(request_key,request_hash,response) VALUES($1,$2,$3)',[requestKey,hash,JSON.stringify(result)]);
        return {...current,revision:current.revision+1,result,replayed:false,inventoryEnabled:await inventoryAvailable(c)?(await inventoryPolicy(c)).sales_enabled:false};
      });
    },
  };
}
