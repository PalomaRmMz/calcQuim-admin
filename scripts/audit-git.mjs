import { execFileSync } from 'node:child_process';
import { readFile,mkdir,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname } from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const git=(...args)=>execFileSync('git',['-c','core.quotepath=false',...args],{cwd:root,encoding:'utf8',windowsHide:true});
const paths=(...args)=>git(...args,'-z').split('\0').filter(Boolean);
const tracked=paths('ls-files'),untracked=paths('ls-files','--others','--exclude-standard'),modified=paths('diff','--name-only'),staged=paths('diff','--cached','--name-only');
const candidates=[...new Set([...modified,...untracked,...staged])].sort();
const findings=[];
function scan(path,text,location){
  const reasons=[];
  if((/(^|\/)(node_modules|dist|coverage|artifacts|\.postman)\//.test(path)||/\.(private\.json|dump|backup|log)$/.test(path)||/(^|\/)\.env(?:\.|$)/.test(path))&&!path.endsWith('.example'))reasons.push('PRIVATE_OR_GENERATED_PATH');
  if(/postgres(?:ql)?:\/\/[^\s:/]+:[^\s@]+@/.test(text)||/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))reasons.push('CONNECTION_OR_PRIVATE_KEY');
  if(/^[\t ]*PGPASSWORD[\t ]*=[\t ]*(?![\t ]*(?:#|$|""[\t ]*$|''[\t ]*$))[^\r\n]+/m.test(text))reasons.push('NONEMPTY_PASSWORD_ASSIGNMENT');
  if(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]{150,}/.test(text))reasons.push('EMBEDDED_IMAGE');
  if(/^-- PostgreSQL database dump\r?$/m.test(text))reasons.push('SQL_DATABASE_DUMP');
  if(/(?:ghp_[A-Za-z0-9]{30,}|AKIA[A-Z0-9]{16}|sk-proj-[A-Za-z0-9_-]{30,})/.test(text))reasons.push('TOKEN_PATTERN');
  if(reasons.length)findings.push({path,location,reasons});
}
for(const path of [...new Set([...tracked,...untracked])]){
  try{const bytes=await readFile(new URL('../'+path,import.meta.url));scan(path,bytes.toString('utf8'),'working_tree');}
  catch(error){if(error.code!=='ENOENT')throw error;}
}
for(const path of tracked){try{scan(path,git('show',':'+path),'index');}catch{findings.push({path,location:'index',reasons:['UNREADABLE_INDEX']});}}
// Comparar valores privados exactos sin mostrarlos ni guardarlos en la evidencia.
const privatePaths=['.env.development','server/.env.development','server/.env.test','server/.env.migration','server/.env.operational'];
const secrets=[];
for(const path of privatePaths){try{const text=await readFile(new URL('../'+path,import.meta.url),'utf8');for(const match of text.matchAll(/^[\t ]*(?:PGPASSWORD|[A-Z_]*(?:TOKEN|SECRET))[\t ]*=[\t ]*(.*)$/gm)){const value=match[1].trim().replace(/^(['"])(.*)\1$/,'$2');if(value.length>=6)secrets.push(value);}}catch(error){if(error.code!=='ENOENT')throw error;}}
for(const path of [...new Set([...tracked,...untracked])]){try{const text=await readFile(new URL('../'+path,import.meta.url),'utf8');if(secrets.some(s=>text.includes(s)))findings.push({path,location:'working_tree',reasons:['EXACT_PRIVATE_VALUE_MATCH']});}catch(error){if(error.code!=='ENOENT')throw error;}}
for(const path of staged){const text=git('show',':'+path);if(secrets.some(s=>text.includes(s)))findings.push({path,location:'index',reasons:['EXACT_PRIVATE_VALUE_MATCH']});}
const ignoredChecks=['server/.env.operational','server/.env.development','server/.env.test','server/.env.migration','server/artifacts/operational/activation.private.json','sample.private.json','server/backups/test.sql','server/private.dump','CalcQuim_Respaldo_Original_2026-10-16T19-47-05-790Z.json','.postman/resources.yaml'];
const unprotected=ignoredChecks.filter(path=>{try{git('check-ignore',path);return false;}catch{return true;}});
const required=['server/migrations/001_core.up.sql','server/package-lock.json','server/backup.policy.example.json','server/.env.example','server/test.env.example','server/operational.env.example','server/postman/CalcQuim-persistence.postman_collection.json'];
const wronglyIgnored=required.filter(path=>{try{git('check-ignore',path);return true;}catch{return false;}});
const report={at:new Date().toISOString(),branch:git('branch','--show-current').trim(),tracked:tracked.length,staged:staged.length,modified:modified.length,newFiles:untracked.length,candidateCount:candidates.length,candidates,candidateGroups:Object.fromEntries([...new Set(candidates.map(p=>p.includes('/')?p.split('/')[0]:'root'))].map(group=>[group,candidates.filter(p=>(p.includes('/')?p.split('/')[0]:'root')===group).length])),extensions:Object.fromEntries([...new Set(candidates.map(extname))].map(ext=>[ext,candidates.filter(p=>extname(p)===ext).length])),findings,unprotected,wronglyIgnored,passed:!findings.length&&!unprotected.length&&!wronglyIgnored.length};
const directory=new URL('../server/artifacts/git-audit/',import.meta.url);await mkdir(directory,{recursive:true});
await writeFile(new URL(`audit-${Date.now()}.private.json`,directory),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({...report,candidates:undefined},null,2));if(!report.passed)process.exitCode=1;
