import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import test from 'node:test';
import express from '../server/node_modules/express/index.js';
import {createMaintenance} from '../server/src/services/maintenance.mjs';
import {runMaintenanceTransition} from '../scripts/maintenance-transition.mjs';

const deferred=()=>{
  let resolve;
  const promise=new Promise(done=>{resolve=done;});
  return {promise,resolve};
};
const proven=epoch=>({epoch,webLegacyResolved:true,mobileQueuesResolved:true});

test('HTTP Web y móvil drenan sus escrituras admitidas, incluso si el cliente pierde la respuesta',async t=>{
  const gate=createMaintenance();
  const wait=deferred(),entered=deferred();
  const committed=new Map();
  class ApiError extends Error{}
  let admitted=0;
  const service=gate.protect({async command(key){
    if(committed.has(key))return committed.get(key);
    if(++admitted===2)entered.resolve();
    await wait.promise;
    const value={folio:key};
    committed.set(key,value);
    return value;
  }},ApiError);
  const app=express();
  app.post('/session',express.json(),gate.session);
  for(const root of ['/api/v1','/api/mobile/v1']){
    app.use(root,gate.ingress);
    app.post(root+'/sales/:key',async(req,res)=>res.json(await service.command(req.params.key)));
    app.get(root+'/sales/:key',(req,res)=>res.json(committed.get(req.params.key)??{status:'not_found'}));
  }
  const server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const origin='http://127.0.0.1:'+server.address().port;
  const save=(channel,key,signal)=>fetch(origin+'/api/'+channel+'/v1/sales/'+key,{method:'POST',signal});
  const webSave=(key,signal)=>fetch(origin+'/api/v1/sales/'+key,{method:'POST',signal});
  const session=(id,acknowledge)=>fetch(origin+'/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,acknowledge})});
  const tabs=[randomUUID(),randomUUID()];
  for(const id of tabs)assert.equal((await session(id)).status,200);
  const connection=new AbortController();
  const web=webSave('WEB1',connection.signal).catch(error=>error.name);
  const mobile=save('mobile','MOV1');
  await entered.promise;
  const {epoch}=gate.begin();
  assert.equal(gate.status().operations,2);
  connection.abort();
  assert.equal(await web,'AbortError');
  for(const rejected of [await webSave('WEB2'),await save('mobile','MOV2')]){
    assert.equal(rejected.status,503);
    assert.equal((await rejected.json()).error.code,'MAINTENANCE_WRITE_CLOSED');
  }
  assert.throws(()=>gate.assertDrained(proven(epoch)),/drenaje/);
  wait.resolve();
  assert.equal((await mobile).status,200);
  assert.deepEqual(await (await fetch(origin+'/api/v1/sales/WEB1')).json(),{folio:'WEB1'});
  await session(tabs[0],epoch);
  assert.throws(()=>gate.assertDrained(proven(epoch)),/drenaje/);
  await session(tabs[1],epoch);
  assert.throws(()=>gate.assertDrained({...proven(epoch),mobileQueuesResolved:false}),/drenaje/);
  assert.equal(gate.seal(proven(epoch)).unresolved,0);
  assert.equal((await session(randomUUID())).status,503);
  gate.reopen();
  assert.deepEqual(await (await webSave('WEB1')).json(),{folio:'WEB1'});
  assert.equal(committed.size,2);
  assert.equal(admitted,2);
});

for(const failure of ['start','verify',null]){
  test('transición con '+(failure??'arranque sano'),async()=>{
    const gate=createMaintenance(),steps=[];
    const result=await runMaintenanceTransition({
      gate,preflight:async()=>steps.push('preflight'),waitForCoverage:async epoch=>proven(epoch),
      stopPrevious:async()=>steps.push('stop previous'),select:async version=>steps.push('select '+version),
      start:async(_version,options)=>{
        assert.equal(options.initiallyClosed,true);
        steps.push('start');
        if(failure==='start')throw Error('fallo backend');
        return {reopen:async()=>steps.push('open candidate')};
      },
      verify:async()=>{steps.push('verify');if(failure==='verify')throw Error('incompatibilidad');},
      stopCandidate:async()=>steps.push('stop candidate'),reopenPrevious:async()=>steps.push('open previous'),
    });
    assert.equal(result.rolledBack,Boolean(failure));
    assert.equal(steps.at(-1),failure?'open previous':'open candidate');
    if(failure)assert.deepEqual(steps.slice(-3),['stop candidate','select previous','open previous']);
  });
}

test('una sesión no verificable impide detener servicios y se reabren las escrituras',async()=>{
  const gate=createMaintenance();
  await assert.rejects(runMaintenanceTransition({
    gate,preflight:async()=>{},waitForCoverage:async epoch=>({epoch}),
    stopPrevious:async()=>assert.fail('No debe detener'),
  }),/drenaje/);
  assert.equal(gate.status().closed,false);
});

test('una respuesta incierta al reabrir no inicia una reversión potencialmente disruptiva',async()=>{
  const gate=createMaintenance();
  await assert.rejects(runMaintenanceTransition({
    gate,preflight:async()=>{},waitForCoverage:async epoch=>proven(epoch),
    stopPrevious:async()=>{},select:async()=>{},verify:async()=>{},
    start:async()=>({reopen:async()=>{throw Error('respuesta perdida al reabrir');}}),
    stopCandidate:async()=>assert.fail('Ya pudieron entrar escrituras'),
  }),/respuesta perdida/);
});
