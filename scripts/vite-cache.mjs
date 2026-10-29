import { randomUUID } from 'node:crypto';

// Las instancias SSR paralelas de las pruebas no deben reemplazar los archivos
// optimizados que está sirviendo el navegador operativo.
export function isolatedViteCache(environment='admin') {
  return {
    name:'calcquim-isolated-cache',
    config(config) {
      if(config.server?.middlewareMode)return {
        cacheDir:`node_modules/.vite-tests/${randomUUID()}`,
        optimizeDeps:{noDiscovery:true,include:[],entries:[]},
      };
      return {
        cacheDir:`node_modules/.vite-${environment}`,
        optimizeDeps:{entries:['index.html']},
      };
    },
  };
}
