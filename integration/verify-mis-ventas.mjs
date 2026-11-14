import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const mobile=new URL('file:///D:/ReactApps/calcQuim/'),admin=new URL('../',import.meta.url),stage=new URL('integration/official-sales-prepared/',mobile);
const hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await readFile(new URL('manifest.json',stage),'utf8'));
const babel=createRequire(new URL('package.json',mobile))('@babel/core');
for(const f of manifest.files){assert.equal(hash(await readFile(new URL(f.path,f.repository==='admin'?admin:mobile))),f.originalSha256,'Operational drift: '+f.path);const url=new URL(f.repository+'/'+f.path,stage);assert.equal(hash(await readFile(url)),f.preparedSha256);await babel.transformFileAsync(fileURLToPath(url),{cwd:fileURLToPath(mobile)});}
const {Pool}=createRequire(new URL('server/package.json',admin))('pg');
const {loadOperationalConfig}=await import(new URL('server/src/config/operational.mjs',admin));
const {createDatasetService,canonical}=await import(new URL('server/src/services/dataset.mjs',admin));
const cfg=await loadOperationalConfig(),pool=new Pool({...cfg.database,options:'-c default_transaction_read_only=on'});
try{const state=await createDatasetService(pool,cfg.schema,'operational').operations();const commercialHash=hash(canonical(state));assert.equal(commercialHash,'d1e92a484a77c0a39e778f32ea291311e1c952e6418e9ec9a09719a779ad9b82');
const services=[];for(const port of [3003,5173]){const r=await fetch('http://127.0.0.1:'+port+'/api/v1/health/ready');assert.equal(r.status,200);services.push({port,status:r.status});}
const result={at:new Date().toISOString(),published:false,publicationAuthorized:false,files:manifest.files.length,compiled:manifest.files.length,operationalSourcesUnchanged:true,commercialHash,revision:state.revision,sales:state.data.sales.length,purchases:state.data.procurement?.purchases?.length,services};await writeFile(new URL('.artifacts/mis-ventas/package-verification.json',mobile),JSON.stringify(result,null,2));console.log(JSON.stringify(result));}finally{await pool.end();}
