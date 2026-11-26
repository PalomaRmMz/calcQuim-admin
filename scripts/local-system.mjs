import {startupTiming} from './startup-timing.mjs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import { loadOperationalConfig,requireActivation } from '../server/src/config/operational.mjs';
import { startServer } from '../server/src/runtime.mjs';
import { createDatabase } from '../server/src/db/pool.mjs';
import { createDatasetService } from '../server/src/services/dataset.mjs';
import { startOperationalMobile } from './operational-mobile.mjs';
import { waitForDatabase,waitForFrontend,optionalMobile } from './startup-readiness.mjs';
import {lockReleaseTransition,selectedRelease} from './prepared-release.mjs';
import {releaseMigrations,validateReleaseSchema} from '../server/src/db/releaseSchema.mjs';
import {createMaintenance} from '../server/src/services/maintenance.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const directory=new URL('../server/artifacts/launcher/',import.meta.url);
const stateFile=new URL('manager.private.json',directory);
const controlUrl='http://127.0.0.1:3099';
const action=process.argv[2]??'start';
const timing=startupTiming();
const request=async(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(15000)});
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

let api,vite,mobile,control,release,unlock,gate,closing=false,ready=false,stage='activation',mobileWarning=false;
async function close(){
  if(closing)return;closing=true;ready=false;
  await mobile?.close();await vite?.close();await api?.close();
  if(control)await new Promise(resolve=>control.close(resolve));
}
try{
  if(action==='stop'){
    const s=await state();if(!s||!await manager())console.log('No hay un inicio administrado activo. No se cierran procesos externos.');
    else{
      const result=await request(controlUrl+'/stop',{method:'POST',headers:{Authorization:`Bearer ${s.token}`}});
      if(!result.ok)throw Error('OPERATIONS_NOT_DRAINED');
      console.log('Cierre solicitado: solo servidores iniciados por este mecanismo. Los reutilizados permanecen abiertos.');
    }
  }else if(action==='status')console.log(JSON.stringify(await manager()??{managed:false}));
  else if(['maintenance-begin','maintenance-reopen'].includes(action)){
    const current=await manager();
    if(!current?.ready||!current.maintenance)throw Error('MAINTENANCE_PROTOCOL_UNAVAILABLE');
    const stateRecord=await state();
    const response=await request(controlUrl+'/maintenance/'+action.slice('maintenance-'.length),{
      method:'POST',headers:{Authorization:`Bearer ${stateRecord.token}`},
    });
    if(!response.ok)throw Error('MAINTENANCE_PROTOCOL_UNAVAILABLE');
    console.log(JSON.stringify(await response.json()));
  }
  else if(action==='start'){
    await requireActivation();
    stage='manager';
    const startedAt=Date.now();
    if(!await manager()){
      if(await listening(3099))throw new Error('CONTROL_PORT_OCCUPIED');
      const closed=process.argv.includes('--maintenance-closed')?['--maintenance-closed']:[];
      const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'run',...closed],{cwd:root,detached:true,windowsHide:true,stdio:'ignore'});
      await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
      child.unref();
    }
    let status;
    while(Date.now()-startedAt<90000){
      status=await manager();if(status?.ready)break;
      try{
        const failure=JSON.parse(await readFile(new URL('last-error.private.json',directory),'utf8'));
        if(Date.parse(failure.at)>=startedAt){stage=failure.stage;throw Object.assign(new Error('START_FAILED'),{startupFailure:failure});}
      }catch(error){if(error.startupFailure)throw error;}
      await new Promise(resolve=>setTimeout(resolve,500));
    }
    if(!status?.ready)throw new Error('START_FAILED');
    if(status.mobileWarning)console.log('CalcQuim de escritorio disponible. La conexion movil no esta disponible; revisa el Wi-Fi y reinicia CalcQuim para reconectarla.');
    browser();console.log('CalcQuim: http://127.0.0.1:5173. Cerrar con Detener-CalcQuim.cmd.');
  }else if(action==='run'){
    await requireActivation();const config=await loadOperationalConfig();
    stage='control';
    if(config.port===3099||config.port===5173)throw new Error('PORT_CONFLICT');
    unlock=await lockReleaseTransition(root);
    release=await selectedRelease(root);
    if(release&&(await listening(config.port)||await listening(5173)||await listening(3016)))
      throw new Error('RELEASE_PORT_OCCUPIED');
    const moduleFromRelease=name=>import(pathToFileURL(path.join(release.directory,name)).href);
    const runtime=release?await moduleFromRelease('server/src/runtime.mjs'):{startServer};
    if(runtime.maintenanceProtocolVersion===1)gate=createMaintenance({initiallyClosed:process.argv.includes('--maintenance-closed')});
    if(!gate&&process.argv.includes('--maintenance-closed'))throw Error('MAINTENANCE_PROTOCOL_UNAVAILABLE');
    const token=randomBytes(32).toString('hex');
    // Reservar el control antes de iniciar recursos: un segundo gestor no puede duplicarlos.
    control=createServer((req,res)=>{
      if(req.headers.authorization!==`Bearer ${token}`){res.writeHead(403);res.end();return;}
      if(req.method==='POST'&&req.url==='/stop'){
        const state=gate?.status();
        if(state&&(state.closed||state.requests||state.operations)){
          res.writeHead(409);res.end('Mantenimiento sin verificación de cierre.');return;
        }
        res.end('OK');setImmediate(()=>close().catch(()=>{}));
      }
      else if(gate&&ready&&req.method==='POST'&&['/maintenance/begin','/maintenance/reopen'].includes(req.url)){
        res.setHeader('Content-Type','application/json');
        res.end(JSON.stringify(req.url.endsWith('/begin')?gate.begin():gate.reopen()));
      }
      else if(req.method==='GET'&&req.url==='/status'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({managed:true,ready:!!ready&&!closing,ownsExpress:!!api,ownsReact:!!vite,mobileWarning,release:release?.version??null,maintenance:gate?.status()??null}));}
      else{res.writeHead(404);res.end();}
    });
    await new Promise((resolve,reject)=>{control.once('error',reject);control.listen(3099,'127.0.0.1',resolve);});
    await unlock();unlock=null;
    stage='database-api';
    if(release||!await listening(config.port)){
      const operationalConfig={...config,database:{...config.database,max:4,idleTimeoutMillis:5000}};
      const database=createDatabase(operationalConfig);
      try{
        await timing.measure('postgresReadyMs',()=>waitForDatabase(()=>database.pool.query('SELECT 1')));
        if(release){
          const migrations=await releaseMigrations(pathToFileURL(path.join(release.directory,'server','migrations')+path.sep));
          await validateReleaseSchema(database.pool,config.schema,migrations);
        }
      }
      catch(error){await database.close();throw error;}
      api=await timing.measure('expressStartMs',()=>runtime.startServer(operationalConfig,database,{gate}));
      stage='mobile';
      const mobileModules=release?{
        router:(await moduleFromRelease('server/src/mobile/router.mjs')).mobileRouter,
        dataset:(await moduleFromRelease('server/src/services/dataset.mjs')).createDatasetService,
        gate,ApiError:(await moduleFromRelease('server/src/services/commands.mjs')).ApiError,
      }:undefined;
      const startMobile=()=>startOperationalMobile(database,operationalConfig,mobileModules);
      mobile=release?await startMobile():await optionalMobile(startMobile,async()=>{
        mobileWarning=true;
        await mkdir(directory,{recursive:true});
        await writeFile(new URL('mobile-warning.private.json',directory),JSON.stringify({code:'MOBILE_UNAVAILABLE',at:new Date().toISOString()}));
      });
    }
    stage='verify-api';
    const snapshot=await timing.measure('verifyApiMs',()=>verifyApi(config));
    stage='react';
    if(release||!await listening(5173)){
      const args=release?[release.directory,String(config.port)]:[];
      const child=spawn(process.execPath,[fileURLToPath(new URL('./local-frontend.mjs',import.meta.url)),...args],{cwd:root,windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
      const exited=new Promise(resolve=>child.once('exit',resolve));
      vite={async close(){
        let timer;
        try{
          if(child.connected)child.send('stop');
          await Promise.race([exited,new Promise(resolve=>{timer=setTimeout(()=>{child.kill();resolve(exited);},10000);timer.unref();})]);
        }finally{clearTimeout(timer);}
      }};
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('REACT_MISMATCH')),60000);
        const fail=()=>{clearTimeout(timer);reject(new Error('REACT_MISMATCH'));};
        child.once('error',fail);child.once('exit',fail);
        child.once('message',message=>{clearTimeout(timer);message.ready?resolve():reject(new Error('REACT_MISMATCH'));});
      });
    }
    await timing.measure('frontendReadyMs',()=>waitForFrontend(async()=>{
      const main=await(await request(release?'http://127.0.0.1:5173/':'http://127.0.0.1:5173/src/main.jsx')).text();
      const proxy=await request('http://127.0.0.1:5173/api/v1/dataset');const proxied=await proxy.json();
      if((release?main!==await readFile(path.join(release.directory,'dist','index.html'),'utf8'):!/CALCQUIM_OPERATIONAL["']?\s*:\s*true/.test(main))||!proxy.ok||proxied.generation!==snapshot.generation)throw new Error('REACT_MISMATCH');
    }));
    await mkdir(directory,{recursive:true});
    await writeFile(stateFile,JSON.stringify({pid:process.pid,token,startedAt:new Date().toISOString()}),{mode:0o600});
    await writeFile(new URL('last-startup-timing.json',directory),JSON.stringify({at:new Date().toISOString(),...timing.snapshot(),reusedExpress:!api,reusedFrontend:!vite}));ready=true;
    process.on('SIGINT',()=>close());process.on('SIGTERM',()=>close());
  }else throw new Error('INVALID_ACTION');
}catch(error){
  await unlock?.();
  await close();await mkdir(directory,{recursive:true});
  const known=['CONTROL_PORT_OCCUPIED','START_FAILED','PORT_CONFLICT','API_MISMATCH','REACT_MISMATCH','MOBILE_OPERATIONAL_CONFIG_REQUIRED','MOBILE_LAN_CONFIG_MISMATCH','ACTIVATION_NOT_VALIDATED','OPERATIONAL_CONFIG_REQUIRED','OPERATIONS_NOT_DRAINED','MAINTENANCE_PROTOCOL_UNAVAILABLE'];
  const code=known.includes(error.message)?error.message:typeof error.code==='string'&&/^[A-Z0-9_]{1,50}$/.test(error.code)?error.code:'LOCAL_START_STOP_FAILED';
  if(!error.startupFailure)await writeFile(new URL('last-error.private.json',directory),JSON.stringify({code,stage,at:new Date().toISOString()}));
  console.error(`Etapa: ${stage}. Codigo: ${code}.`);
  console.error('No se pudo completar el inicio/cierre. Consulta server/artifacts/launcher/last-error.private.json.');process.exitCode=1;
}
