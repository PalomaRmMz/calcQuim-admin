import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

export const rehearsalDatabases=['calcquim_migration_check','calcquim_migration_restore'];
export function readRehearsalConfig(values,database) {
  if(!rehearsalDatabases.includes(database))throw new Error('REHEARSAL_DATABASE_REQUIRED');
  if(values.PGHOST!=='127.0.0.1'||values.PGUSER!=='calcquim_migration_app'||!values.PGPASSWORD)throw new Error('RESTRICTED_LOCAL_CREDENTIALS_REQUIRED');
  const port=Number(values.PGPORT??5432);
  if(!/^\d+$/.test(String(values.PGPORT??5432))||port<1||port>65535)throw new Error('INVALID_LOCAL_PORT');
  return {host:'127.0.0.1',port,user:values.PGUSER,password:values.PGPASSWORD,database,
    max:2,connectionTimeoutMillis:2000,query_timeout:15000,statement_timeout:15000,idleTimeoutMillis:5000,ssl:false,application_name:'calcquim-real-rehearsal'};
}
export async function loadRehearsalConfig(database) {
  // No cargar las credenciales de dev/test ni las de administrador.
  const text=await readFile(new URL('../../.env.migration',import.meta.url),'utf8');
  return readRehearsalConfig(parseEnv(text),database);
}
