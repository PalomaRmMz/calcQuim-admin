import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
export function runPgTool(name,args,config) {
  if(!['pg_dump','pg_restore'].includes(name))throw new Error('Herramienta no válida.');
  const executable=join(process.env.PG_BIN_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin',`${name}.exe`);
  const result=spawnSync(executable,['-h','127.0.0.1','-p',String(config.port),'-U',config.user,'-d',config.database,...args],{
    env:{...process.env,PGPASSWORD:config.password},timeout:60000,windowsHide:true,
  });
  if(result.status!==0)throw new Error('Herramienta PostgreSQL no completó; no se muestran datos privados.');
}

export function listPgArchive(path) {
  const executable=join(process.env.PG_BIN_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin','pg_restore.exe');
  const result=spawnSync(executable,['--list',path],{timeout:15000,windowsHide:true,encoding:'utf8'});
  if(result.status!==0)throw new Error('No se pudo inspeccionar el índice del respaldo.');
  return result.stdout;
}

export function verifyPgArchive(path) {
  listPgArchive(path);
  const executable=join(process.env.PG_BIN_PATH || 'C:\\Program Files\\PostgreSQL\\18\\bin','pg_restore.exe');
  const result=spawnSync(executable,['--file',process.platform==='win32'?'NUL':'/dev/null',path],{timeout:300000,windowsHide:true,stdio:'ignore'});
  if(result.status!==0)throw new Error('ARCHIVE_READ_FAILED');
}
