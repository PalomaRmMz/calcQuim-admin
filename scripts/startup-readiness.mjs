import { setTimeout as delay } from 'node:timers/promises';

// Windows puede aceptar conexiones antes de terminar la recuperación de PostgreSQL.
export async function waitForDatabase(check,{timeoutMs=60000,intervalMs=1000,now=Date.now,sleep=delay}={}) {
  const deadline=now()+timeoutMs;
  for(;;){
    try { await check();return; }
    catch(error){
      if(!['ECONNREFUSED','ECONNRESET','ETIMEDOUT','57P03'].includes(error.code)||now()>=deadline)throw error;
      await sleep(intervalMs);
    }
  }
}

export async function optionalMobile(start,onFailure) {
  try { return await start(); }
  catch(error){await onFailure(error);return null;}
}
