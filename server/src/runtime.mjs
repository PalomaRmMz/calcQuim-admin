import { createApp } from './app.mjs';
import { createDatabase } from './db/pool.mjs';
import { createDatasetService } from './services/dataset.mjs';

export async function startServer(config, database = createDatabase(config)) {
  const operational=config.mode==='operational';
  const permitted=operational?config.database?.database==='calcquim_operational'&&config.database.user==='calcquim_operational_app'&&config.schema==='calcquim_operational':['calcquim_dev','calcquim_test','calcquim_activation_test'].includes(config.database?.database);
  if(config.persistenceEnabled&&!permitted) {
    await database.close();throw new Error('Persistencia limitada a desarrollo/pruebas.');
  }
  // Invariante de infraestructura, independiente de cualquier config inyectada.
  const service = config.persistenceEnabled && database.pool ? createDatasetService(database.pool,config.schema,operational?'operational':'synthetic') : null;
  if(operational) {
    try {
      const identity=(await database.pool.query("SELECT current_database() AS db,host(inet_server_addr()) AS host,current_setting('listen_addresses') AS listeners,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];
      if(identity.db!=='calcquim_operational'||identity.host!=='127.0.0.1'||identity.listeners.split(',').some(v=>!['127.0.0.1','localhost','::1'].includes(v.trim()))||['rolsuper','rolcreatedb','rolcreaterole','rolreplication','rolbypassrls'].some(k=>identity[k]))throw new Error('Unsafe operational connection');
      await service.read();
    }catch(error){await database.close();throw error;}
  }
  const server = createApp(database,service,operational?'operational':'synthetic').listen(config.port, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  } catch (error) {
    await database.close();
    throw error;
  }
  return {
    server,
    async close() {
      await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeIdleConnections();
      });
      await database.close();
    },
  };
}
