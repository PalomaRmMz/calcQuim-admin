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

// Vite may accept HTTP before its first module transformation finishes.
// Retry transport failures only; a wrong environment or dataset must still fail.
export async function waitForFrontend(check,{timeoutMs=60000,intervalMs=500,now=Date.now,sleep=delay}={}) {
  const deadline=now()+timeoutMs;
  for(;;){
    try{return await check();}
    catch(error){
      const transient=['AbortError','TimeoutError'].includes(error.name)||['ECONNREFUSED','ECONNRESET','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT'].includes(error.cause?.code||error.code);
      if(!transient||now()>=deadline)throw error;
      await sleep(intervalMs);
    }
  }
}
