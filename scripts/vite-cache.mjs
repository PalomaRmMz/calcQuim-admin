import { randomUUID } from 'node:crypto';
import { lstat, rm } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';

// Las instancias SSR paralelas de las pruebas no deben reemplazar los archivos
// optimizados que está sirviendo el navegador operativo.
export function isolatedViteCache(environment='admin') {
  let generatedCacheDir, ownedCache;
  return {
    name:'calcquim-isolated-cache',
    config(config) {
      if(config.server?.middlewareMode){
        generatedCacheDir=`node_modules/.vite-tests/${randomUUID()}`;
        return {
        cacheDir:generatedCacheDir,
        optimizeDeps:{noDiscovery:true,include:[],entries:[]},
      };}
      return {
        cacheDir:`node_modules/.vite-${environment}`,
        optimizeDeps:{entries:['index.html']},
      };
    },
    configResolved(config) {
      if(generatedCacheDir && resolve(config.cacheDir)===resolve(config.root,generatedCacheDir)) ownedCache=resolve(config.cacheDir);
    },
    async closeBundle() {
      // Only this SSR instance's generated UUID directory, never the browser cache.
      if(!ownedCache || basename(dirname(ownedCache))!=='.vite-tests' || !/^[a-f0-9-]{36}$/.test(basename(ownedCache)))return;
      try {
        if((await lstat(ownedCache)).isSymbolicLink() || (await lstat(dirname(ownedCache))).isSymbolicLink())return;
        await rm(ownedCache,{recursive:true,force:true});
      }catch(error){if(error.code!=='ENOENT')throw error;}
    },
  };
}
