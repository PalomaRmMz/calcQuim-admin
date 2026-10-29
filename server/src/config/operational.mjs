import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
export const operationalDatabases=['calcquim_operational','calcquim_operational_restore','calcquim_activation_test'];
export function readOperationalConfig(values,database='calcquim_operational') {
  if(!operationalDatabases.includes(database)||values.PGHOST!=='127.0.0.1'||values.PGUSER!=='calcquim_operational_app'||!values.PGPASSWORD)throw new Error('OPERATIONAL_CONFIG_REQUIRED');
  const port=Number(values.PGPORT??5432),httpPort=Number(values.PORT??3003);
  if(![port,httpPort].every(n=>Number.isInteger(n)&&n>=1&&n<=65535))throw new Error('INVALID_PORT');
  return {mode:'operational',host:'127.0.0.1',port:httpPort,persistenceEnabled:true,schema:database==='calcquim_activation_test'?'calcquim_test_activation':'calcquim_operational',databaseConfigured:true,
    database:{host:'127.0.0.1',port,database,user:values.PGUSER,password:values.PGPASSWORD,max:2,connectionTimeoutMillis:2000,query_timeout:15000,statement_timeout:15000,idleTimeoutMillis:5000,ssl:false,application_name:'calcquim-operational'}};
}
export async function loadOperationalConfig(database) {
  return readOperationalConfig(parseEnv(await readFile(new URL('../../.env.operational',import.meta.url),'utf8')),database);
}
export async function requireActivation() {
  const marker=JSON.parse(await readFile(new URL('../../artifacts/operational/activation.private.json',import.meta.url),'utf8'));
  if(marker.database!=='calcquim_operational'||marker.validated!==true||marker.restoreVerified!==true)throw new Error('ACTIVATION_NOT_VALIDATED');
  return marker;
}
