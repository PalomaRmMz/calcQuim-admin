import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadOperationalConfig,requireActivation } from '../server/src/config/operational.mjs';
import { startServer } from '../server/src/runtime.mjs';
import { createDatabase } from '../server/src/db/pool.mjs';
import { createDatasetService } from '../server/src/services/dataset.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const directory=new URL('../server/artifacts/launcher/',import.meta.url);
const stateFile=new URL('manager.private.json',directory);
const controlUrl='http://127.0.0.1:3099';
const action=process.argv[2]??'start';
const request=async(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(5000)});
async function state(){try{return JSON.parse(await readFile(stateFile,'utf8'));}catch{return null;}}
async function manager(){const s=await state();if(!s)return null;try{const r=await request(controlUrl+'/status',{headers:{Authorization:`Bearer ${s.token}`}});return r.ok?await r.json():null;}catch{return null;}}
function browser(){spawn('explorer.exe',['http://127.0.0.1:5173'],{windowsHide:true,stdio:'ignore'}).unref();}
async function listening(port){try{const net=await import('node:net');return await new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port});s.once('connect',()=>{s.destroy();resolve(true);});s.once('error',()=>resolve(false));s.setTimeout(1500,()=>{s.destroy();resolve(true);});});}catch{return true;}}
async function verifyApi(config){
  const r=await request(`http://127.0.0.1:${config.port}/api/v1/dataset`);
  if(!r.ok)throw new Error('API_MISMATCH');
  const actual=await r.json();const database=createDatabase(config);
  try{const expected=await createDatasetService(database.pool,config.schema,'operational').read();if(actual.generation!==expected.generation||actual.revision!==expected.revision)throw new Error('API_MISMATCH');return actual;}
  finally{await database.close();}
}

let api,vite,control,closing=false;
async function close(){
  if(closing)return;closing=true;
  await vite?.close();await api?.close();
  if(control)await new Promise(resolve=>control.close(resolve));
}
try{
  if(action==='stop'){
    const s=await state();if(!s||!await manager())console.log('No hay un inicio administrado activo. No se cierran procesos externos.');
    else{await request(controlUrl+'/stop',{method:'POST',headers:{Authorization:`Bearer ${s.token}`}});console.log('Cierre solicitado: solo servidores iniciados por este mecanismo. Los reutilizados permanecen abiertos.');}
  }else if(action==='status')console.log(JSON.stringify(await manager()??{managed:false}));
  else if(action==='start'){
    await requireActivation();
    if(!await manager()){
      if(await listening(3099))throw new Error('CONTROL_PORT_OCCUPIED');
      spawn(process.execPath,[fileURLToPath(import.meta.url),'run'],{cwd:root,detached:true,windowsHide:true,stdio:'ignore'}).unref();
      let ready=false;
      for(let i=0;i<60;i++){await new Promise(resolve=>setTimeout(resolve,500));if(await manager()){ready=true;break;}}
      if(!ready)throw new Error('START_FAILED');
    }
    browser();console.log('CalcQuim: http://127.0.0.1:5173. Cerrar con Detener-CalcQuim.cmd.');
  }else if(action==='run'){
    await requireActivation();const config=await loadOperationalConfig();
    if(config.port===3099||config.port===5173)throw new Error('PORT_CONFLICT');
    const token=randomBytes(32).toString('hex');
    // Reservar el control antes de iniciar recursos: un segundo gestor no puede duplicarlos.
    control=createServer((req,res)=>{
      if(req.headers.authorization!==`Bearer ${token}`){res.writeHead(403);res.end();return;}
      if(req.method==='POST'&&req.url==='/stop'){res.end('OK');setImmediate(()=>close().catch(()=>{}));}
      else if(req.method==='GET'&&req.url==='/status'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({managed:true,ready:!!ready,ownsExpress:!!api,ownsReact:!!vite}));}
      else{res.writeHead(404);res.end();}
    });
    let ready=false;
    await new Promise((resolve,reject)=>{control.once('error',reject);control.listen(3099,'127.0.0.1',resolve);});
    if(!await listening(config.port))api=await startServer(config);
    const snapshot=await verifyApi(config);
    if(!await listening(5173)){
      const {createServer}=await import('vite');
      vite=await createServer({root,configFile:fileURLToPath(new URL('../vite.config.js',import.meta.url)),customLogger:{hasWarned:false,info(){},warn(){},warnOnce(){},error(){},clearScreen(){},hasErrorLogged(){return false;}}});
      await vite.listen();
    }
    const main=await(await request('http://127.0.0.1:5173/src/main.jsx')).text();
    const proxy=await request('http://127.0.0.1:5173/api/v1/dataset');const proxied=await proxy.json();
    if(!/CALCQUIM_OPERATIONAL["']?\s*:\s*true/.test(main)||!proxy.ok||proxied.generation!==snapshot.generation)throw new Error('REACT_MISMATCH');
    await mkdir(directory,{recursive:true});
    await writeFile(stateFile,JSON.stringify({pid:process.pid,token,startedAt:new Date().toISOString()}),{mode:0o600});ready=true;
    process.on('SIGINT',()=>close());process.on('SIGTERM',()=>close());
  }else throw new Error('INVALID_ACTION');
}catch{
  await close();await mkdir(directory,{recursive:true});
  await writeFile(new URL('last-error.private.json',directory),JSON.stringify({code:'LOCAL_START_STOP_FAILED',at:new Date().toISOString()}));
  console.error('No se completó el inicio/cierre. Revisa puertos, activación y credenciales privadas. No se cerraron servidores externos.');process.exitCode=1;
}
