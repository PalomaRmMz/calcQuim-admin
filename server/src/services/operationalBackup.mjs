import { mkdir,open,readFile,writeFile,copyFile,stat,readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve,relative,isAbsolute,join } from 'node:path';
import { createHash,randomUUID } from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function validateBackupPolicy(value={}){
  const keepDays=value.keepDays??30;
  if(!Number.isInteger(keepDays)||keepDays<7||keepDays>3650)throw new Error('INVALID_RETENTION');
  const secondaryDirectory=value.secondaryDirectory||null;
  if(secondaryDirectory&&(!isAbsolute(secondaryDirectory)||secondaryDirectory.startsWith('\\\\')))throw new Error('LOCAL_ABSOLUTE_SECONDARY_REQUIRED');
  return {keepDays,secondaryDirectory};
}
export async function createOperationalBackup({directory,database,policy={},dump,verify,reference={},projectRoot=null,now=new Date()}){
  policy=validateBackupPolicy(policy);directory=resolve(directory);
  if(database!=='calcquim_operational')throw new Error('OPERATIONAL_DATABASE_REQUIRED');
  if(policy.secondaryDirectory){const secondary=resolve(policy.secondaryDirectory),rel=relative(directory,secondary);if(!rel||(!rel.startsWith('..')&&!isAbsolute(rel)))throw new Error('SECONDARY_MUST_BE_INDEPENDENT');}
  if(policy.secondaryDirectory&&projectRoot){const rel=relative(resolve(projectRoot),resolve(policy.secondaryDirectory));if(!rel||(!rel.startsWith('..')&&!isAbsolute(rel)))throw new Error('SECONDARY_MUST_BE_OUTSIDE_PROJECT');}
  await mkdir(directory,{recursive:true});
  const stamp=now.toISOString().replace(/[:.]/g,'-')+'-'+randomUUID();
  const file=`postgres-${stamp}.dump`,path=join(directory,file),manifestPath=join(directory,`postgres-${stamp}.private.json`);
  await(await open(path,'wx',0o600)).close();
  await dump(path);await verify(path);
  const bytes=await readFile(path);if(!bytes.length)throw new Error('EMPTY_BACKUP');
  const sha256=hash(bytes);
  const manifest={database,file,sha256,bytes:bytes.length,createdAt:now.toISOString(),archiveReadable:true,restoreVerified:false,secondaryVerified:false,...(reference.snapshotSha256?{snapshotSha256:reference.snapshotSha256}:{}),...(reference.inventorySha256?{inventorySha256:reference.inventorySha256,inventorySnapshotVersion:reference.inventorySnapshotVersion??1}:{})};
  if(policy.secondaryDirectory){
    await mkdir(policy.secondaryDirectory,{recursive:true});
    const destination=join(policy.secondaryDirectory,file);
    await copyFile(path,destination,constants.COPYFILE_EXCL);
    if(hash(await readFile(destination))!==sha256)throw new Error('SECONDARY_HASH_MISMATCH');
    manifest.secondaryVerified=true;
    await writeFile(join(policy.secondaryDirectory,`postgres-${stamp}.private.json`),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  }
  await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  // Retención informativa: nunca elimina copias, aunque sean antiguas.
  const cutoff=now.getTime()-policy.keepDays*86400000,candidates=[];
  for(const name of await readdir(directory)){
    if(!/^postgres-.*\.dump$/.test(name)||name===file)continue;
    const info=await stat(join(directory,name));if(info.isFile()&&info.mtimeMs<cutoff)candidates.push(name);
  }
  await writeFile(join(directory,`retention-${stamp}.private.json`),JSON.stringify({keepDays:policy.keepDays,mode:'REPORT_ONLY_NO_DELETIONS',candidates},null,2)+'\n',{flag:'wx',mode:0o600});
  return manifest;
}
