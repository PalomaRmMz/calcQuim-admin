// Entorno efímero para probar la interfaz real sin escribir en la base operativa.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile } from 'node:fs/promises';
import pg from 'pg';
import { loadOperationalConfig } from '../src/config/operational.mjs';
import { migrate } from '../src/db/migrate.mjs';
import { createDatasetService } from '../src/services/dataset.mjs';
import { startServer } from '../src/runtime.mjs';

const config={...await loadOperationalConfig('calcquim_activation_test'),mode:'test',port:0};
if(config.database.database!=='calcquim_activation_test')throw new Error('SYNTHETIC_DATABASE_REQUIRED');
const schema='calcquim_test_ui_'+randomUUID().replaceAll('-',''),token=randomUUID();
const pool=new pg.Pool(config.database);
let runtime,control,closing=false;
const file=new URL('../artifacts/inventory/ui-fixture.private.json',import.meta.url);
async function close(){
  if(closing)return;closing=true;
  await runtime?.close();runtime=null;
  if(!/^calcquim_test_ui_[a-f0-9]{32}$/.test(schema))throw new Error('UNSAFE_TEST_SCHEMA');
  await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await pool.end();
  if(control){control.closeIdleConnections();await new Promise(resolve=>control.close(resolve));}
  await writeFile(file,JSON.stringify({active:false,cleanedSyntheticSchema:true,at:new Date().toISOString()}));
}
try{
  await migrate(pool,schema);const service=createDatasetService(pool,schema);let snapshot=await service.read();
  const command=async(name,...args)=>{snapshot=await service.command({name,args,revision:snapshot.revision,generation:snapshot.generation,requestKey:randomUUID()});};
  await command('addCategory',{name:'Categoría A sintética',active:true});
  await command('addCategory',{name:'Categoría B sintética',active:true});
  await command('addProductLine',{name:'Línea A sintética',categoryId:1,active:true});
  await command('addProductLine',{name:'Línea B sintética',categoryId:2,active:true});
  for(const [name,categoryId,lineId]of [['Producto A sintético',1,1],['Producto B sintético',1,1],['Producto C sintético',2,2]])await command('addProduct',{name,categoryId,lineId,unit:'litro',price:10,active:true,available:true});
  runtime=await startServer({...config,schema});const apiPort=runtime.server.address().port;
  control=createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json');
    if(req.headers.authorization!==`Bearer ${token}`){res.writeHead(403);res.end('{}');return;}
    try{
      if(req.method==='POST'&&req.url==='/restart'){await runtime.close();runtime=await startServer({...config,port:apiPort,schema});res.end(JSON.stringify({restarted:true}));}
      else if(req.method==='POST'&&req.url==='/stop'){res.end(JSON.stringify({stopping:true}));setImmediate(()=>close().catch(()=>{process.exitCode=1;}));}
      else if(req.url==='/status')res.end(JSON.stringify({active:true,syntheticOnly:true}));
      else{res.writeHead(404);res.end('{}');}
    }catch{res.writeHead(500);res.end(JSON.stringify({error:'SYNTHETIC_TEST_CONTROL_FAILED'}));}
  });
  await new Promise((resolve,reject)=>{control.once('error',reject);control.listen(0,'127.0.0.1',resolve);});
  await mkdir(new URL('../artifacts/inventory/',import.meta.url),{recursive:true});
  await writeFile(file,JSON.stringify({active:true,database:'calcquim_activation_test',schema,api:`http://127.0.0.1:${apiPort}`,control:`http://127.0.0.1:${control.address().port}`,token}),{mode:0o600});
  process.on('SIGINT',()=>close());process.on('SIGTERM',()=>close());
  console.log('SYNTHETIC_UI_READY: configuración temporal en la carpeta privada de pruebas.');
}catch{await close();process.exitCode=1;console.error('SYNTHETIC_UI_SETUP_FAILED');}
