import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForDatabase,optionalMobile} from '../scripts/startup-readiness.mjs';

test('espera a PostgreSQL durante la recuperación al encender Windows',async()=>{
  let time=0,calls=0;
  await waitForDatabase(async()=>{if(++calls<3)throw Object.assign(new Error(),{code:'57P03'});},{now:()=>time,sleep:async ms=>{time+=ms;}});
  assert.equal(calls,3);
});
test('no reintenta credenciales inválidas ni espera indefinidamente',async()=>{
  let calls=0;
  await assert.rejects(waitForDatabase(async()=>{calls++;throw Object.assign(new Error(),{code:'28P01'});}),{code:'28P01'});
  assert.equal(calls,1);
  let time=0;
  await assert.rejects(waitForDatabase(async()=>{throw Object.assign(new Error(),{code:'ECONNREFUSED'});},{timeoutMs:2000,now:()=>time,sleep:async ms=>{time+=ms;}}),{code:'ECONNREFUSED'});
  assert.equal(time,2000);
});
test('un Wi-Fi no disponible permite continuar con el escritorio y deja aviso',async()=>{
  let warned=false;
  assert.equal(await optionalMobile(async()=>{throw new Error('Wi-Fi no disponible');},async()=>{warned=true;}),null);
  assert.equal(warned,true);
  const server={close(){}};
  assert.equal(await optionalMobile(async()=>server,()=>assert.fail()),server);
});
