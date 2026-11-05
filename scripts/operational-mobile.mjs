import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {mobileRouter} from '../server/src/mobile/router.mjs';
import {createDatasetService} from '../server/src/services/dataset.mjs';
import {localLan,mobileLanApp} from './mobile-lan-access.mjs';
const require=createRequire(new URL('../server/package.json',import.meta.url));
const express=require('express');
export async function startOperationalMobile(database,config){
 const settings=JSON.parse(await readFile(new URL('../../calcQuim/.artifacts/mobile-real-connection.private.json',import.meta.url),'utf8'));
 const evidence=JSON.parse(await readFile(new URL('../../calcQuim/.artifacts/mobile-operational-activation.private.json',import.meta.url),'utf8'));
 if(!evidence.applied||!evidence.backupVerified||config.database.database!=='calcquim_operational'||settings.serverUrl!=='http://127.0.0.1:3016'||typeof settings.credential!=='string'||settings.credential.length<32)throw Error('MOBILE_OPERATIONAL_CONFIG_REQUIRED');
 const lanUrl=new URL(settings.lanUrl),lan=localLan(lanUrl.hostname);
 if(lanUrl.protocol!=='http:'||lanUrl.port!=='3016'||settings.lanSubnet!==lan.cidr)throw Error('MOBILE_LAN_CONFIG_MISMATCH');
 process.env.CALCQUIM_MOBILE_OPERATIONAL_AUTHORIZED='yes';
 const servers=[];
 try{
  for(const host of ['127.0.0.1',lan.host]){
   const service=createDatasetService(database.pool,config.schema,'operational');
   const app=mobileLanApp(express,mobileRouter(service,{mode:'operational',enabled:true,token:settings.credential}),lan);
   const server=app.listen(3016,host);servers.push(server);
   await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  }
 }catch(error){await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));throw error;}
 return {async close(){await Promise.all(servers.map(server=>new Promise(resolve=>{server.close(resolve);server.closeIdleConnections();})));}};
}
