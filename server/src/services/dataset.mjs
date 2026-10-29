import { createHash } from 'node:crypto';
import { schemaName } from '../db/migrate.mjs';
import { readDataset, writeDataset } from '../repositories/dataset.mjs';
import { ApiError, executeCommand } from './commands.mjs';

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
    read:()=>transaction(c=>read(c),true),
    async command({name,args,revision,generation,requestKey}) {
      if (!Number.isSafeInteger(revision)||typeof generation!=='string'||!requestKey||!/^[a-zA-Z0-9:_-]{8,150}$/.test(requestKey)) throw new ApiError(400,'INVALID_PRECONDITION','Se requieren revisión, generación y clave de idempotencia.');
      const hash=createHash('sha256').update(canonical({name,args,generation})).digest('hex');
      return transaction(async c=>{
        const current=await read(c,true);
        const previous=(await c.query('SELECT * FROM idempotency_requests WHERE request_key=$1',[requestKey])).rows[0];
        if(previous) {
          if(previous.request_hash!==hash) throw new ApiError(409,'IDEMPOTENCY_CONFLICT','La clave ya corresponde a otra operación.');
          // Se devuelve resultado original y estado actual para no regresar la vista a una revisión antigua.
          return {...current,result:previous.response,replayed:true};
        }
        if(current.generation!==generation||current.revision!==revision) throw new ApiError(412,'STALE_DATA','Los datos cambiaron. Recarga antes de guardar.');
        let result;
        try {result=executeCommand(current.data,current.counters,name,args);}
        catch(error) {if(error instanceof ApiError) throw error; throw new ApiError(422,'DOMAIN_VALIDATION',error.message);}
        await writeDataset(c,current.data,current.counters);
        await c.query('INSERT INTO idempotency_requests(request_key,request_hash,response) VALUES($1,$2,$3)',[requestKey,hash,JSON.stringify(result)]);
        return {...current,revision:current.revision+1,result,replayed:false};
      });
    },
  };
}
