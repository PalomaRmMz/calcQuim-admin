import {createHash,randomUUID} from 'node:crypto';
import {lstat,mkdir,open,readFile,readdir,realpath,rename,rm,writeFile} from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';

const hash = data=>createHash('sha256').update(data).digest('hex');
const versionPattern = /^[a-z0-9][a-z0-9-]{0,79}$/;
const directoryFor = root=>path.join(root,'artifacts','web-releases');
const selectionFor = root=>path.join(directoryFor(root),'selected.json');
const entries = ['dist','server/src','server/migrations','server/node_modules','server/package.json','server/package-lock.json','src','package.json','package-lock.json'];

async function inventory(directory) {
  const files = {};
  async function visit(name) {
    const filename = path.join(directory,name);
    const stat = await lstat(filename);
    if (stat.isSymbolicLink()) throw new Error('Enlace no permitido: '+name);
    if (stat.isDirectory()) {
      for (const child of (await readdir(filename)).sort()) await visit(name+'/'+child);
    } else if (stat.isFile()) files[name] = hash(await readFile(filename));
    else throw new Error('Tipo de archivo no permitido: '+name);
  }
  for (const name of entries) await visit(name);
  return files;
}

export async function sealRelease(directory,version) {
  if (!versionPattern.test(version) || path.basename(directory)!==version) throw new Error('Identidad de versión inválida.');
  const files = await inventory(directory);
  if (!files['dist/index.html'] || !files['server/src/runtime.mjs']) throw new Error('Entrega incompleta.');
  const manifest = {version,files};
  await writeFile(path.join(directory,'release.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  return manifest;
}

export async function verifyRelease(root,version) {
  if (!versionPattern.test(version)) throw new Error('Identidad de versión inválida.');
  const directory = path.join(directoryFor(root),version);
  if (path.relative(await realpath(directoryFor(root)),await realpath(directory))!==version)
    throw new Error('Ubicación de versión inválida.');
  const raw = await readFile(path.join(directory,'release.json'));
  const manifest = JSON.parse(raw);
  const found = await inventory(directory);
  if (manifest.version!==version || !found['dist/index.html'] || !found['server/src/runtime.mjs'] ||
    Object.keys(found).length!==Object.keys(manifest.files).length ||
    Object.entries(found).some(([file,digest])=>manifest.files[file]!==digest))
    throw new Error('La entrega no coincide con su manifiesto.');
  return {version,directory,digest:hash(raw)};
}

export async function selectedRelease(root) {
  let raw;
  try {raw=await readFile(selectionFor(root),'utf8');}
  catch (error) {if (error.code==='ENOENT') return null;throw error;}
  const record=JSON.parse(raw);
  if (record.version===null) return null;
  const release=await verifyRelease(root,record.version);
  if (record.digest!==release.digest) throw new Error('Cambió el manifiesto seleccionado.');
  return release;
}

export async function lockReleaseTransition(root) {
  const directory=directoryFor(root);
  await mkdir(directory,{recursive:true});
  const lock=path.join(directory,'transition.lock');
  const handle=await open(lock,'wx');
  return async()=>{
    await handle.close();
    await rm(lock);
  };
}

async function assertOffline(ports) {
  await Promise.all([...new Set(ports)].map(port=>new Promise((resolve,reject)=>{
    const socket=net.connect({host:'127.0.0.1',port});
    socket.once('connect',()=>{socket.destroy();reject(new Error('Servicio activo en el puerto '+port));});
    socket.once('error',error=>error.code==='ECONNREFUSED'?resolve():reject(error));
    socket.setTimeout(1500,()=>{socket.destroy();reject(new Error('Estado del puerto indeterminado: '+port));});
  })));
}

export async function selectOfflineRelease(root,version,{ports,verifyWindow}) {
  if(!ports.length||ports.some(port=>!Number.isInteger(port)||port<1||port>65535)||typeof verifyWindow!=='function')
    throw new Error('Faltan puertos o verificación de la ventana de activación.');
  const unlock=await lockReleaseTransition(root);
  try {
    const previous=await selectedRelease(root);
    const next=version===null?null:await verifyRelease(root,version);
    await assertOffline(ports);
    await verifyWindow({previous,next});
    await assertOffline(ports);
    const destination=selectionFor(root);
    const temporary=destination+'.'+randomUUID()+'.tmp';
    await writeFile(temporary,JSON.stringify({version:next?.version??null,digest:next?.digest??null,
      previousVersion:previous?.version??null},null,2)+'\n',{flag:'wx'});
    await rename(temporary,destination);
    return {previous:previous?.version??null,selected:next?.version??null};
  } finally {await unlock();}
}
