import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import pg from 'pg';
import { loadConfig } from '../src/config.mjs';
import { migrate } from '../src/db/migrate.mjs';
import { startServer } from '../src/runtime.mjs';
process.env.NODE_ENV='test';
test('colección Postman completa contra API y PostgreSQL real aislado',async()=>{
  const config=loadConfig(),pool=new pg.Pool(config.database);
  const schema=`calcquim_test_${randomUUID().replaceAll('-','')}`;
  let runtime;
  try {
    await migrate(pool,schema);
    runtime=await startServer({...config,port:0,persistenceEnabled:true,schema});
    const collection=JSON.parse(await readFile(new URL('../postman/CalcQuim-persistence.postman_collection.json',import.meta.url),'utf8'));
    const values=new Map([['baseUrl',`http://127.0.0.1:${runtime.server.address().port}`]]);
    const replace=text=>String(text).replaceAll('{{$guid}}',()=>randomUUID()).replace(/\{\{([^}]+)\}\}/g,(_,k)=>{assert.ok(values.has(k),`Variable ${k} requerida`);return values.get(k);});
    let assertions=0;
    for(const item of collection.item) {
      const headers=new Map(item.request.header.map(h=>[h.key,h.value]));
      const body={raw:item.request.body?.raw,update(raw){this.raw=raw;}};
      const pm={
        collectionVariables:{get:k=>values.get(k),set:(k,v)=>values.set(k,v)},variables:{replaceIn:replace},
        request:{method:item.request.method,body,headers:{get:k=>headers.get(k),upsert:({key,value})=>headers.set(key,value)}},
        test:(name,fn)=>{try{fn();assertions++;}catch{throw new Error(`${item.name}: ${name}`);}},
      };
      const context=vm.createContext({pm});
      for(const event of [...collection.event,...item.event].filter(e=>e.listen==='prerequest'))vm.runInContext(event.script.exec.join('\n'),context,{timeout:1000});
      const response=await fetch(replace(item.request.url),{method:item.request.method,headers:Object.fromEntries(headers),...(body.raw?{body:replace(body.raw)}:{})});
      const json=await response.json();pm.response={code:response.status,json:()=>json};
      for(const event of item.event.filter(e=>e.listen==='test'))vm.runInContext(event.script.exec.join('\n'),context,{timeout:1000});
    }
    assert.ok(assertions>=25);
  }finally{await runtime?.close();assert.match(schema,/^calcquim_test_[a-f0-9]{32}$/);await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await pool.end();}
});
