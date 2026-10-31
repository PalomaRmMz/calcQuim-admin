import test from 'node:test';
import assert from 'node:assert/strict';
import { isolatedViteCache } from '../scripts/vite-cache.mjs';
import { mkdtemp, mkdir, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Vite separa cada prueba SSR del navegador y del sandbox',()=>{
    const plugin=isolatedViteCache();
    const browser=plugin.config({server:{}});
    const first=plugin.config({server:{middlewareMode:true}});
    const second=plugin.config({server:{middlewareMode:true}});
    assert.notEqual(first.cacheDir,second.cacheDir);
    assert.notEqual(first.cacheDir,browser.cacheDir);
    assert.notEqual(isolatedViteCache('sandbox').config({}).cacheDir,browser.cacheDir);
    assert.equal(first.optimizeDeps.noDiscovery,true);
    assert.deepEqual(browser.optimizeDeps.entries,['index.html']);
});

test('al cerrar SSR elimina solo su caché generada y conserva las otras instancias',async()=>{
    const root=await mkdtemp(join(tmpdir(),'calcquim-cache-'));
    const plugin=isolatedViteCache(),config=plugin.config({server:{middlewareMode:true}});
    const cacheDir=join(root,config.cacheDir),other=join(root,'node_modules/.vite-admin');
    await mkdir(cacheDir,{recursive:true});await mkdir(other,{recursive:true});
    await writeFile(join(cacheDir,'generated.js'),'export default 1;');
    await writeFile(join(other,'active.js'),'export default 2;');
    plugin.configResolved({root,cacheDir});await plugin.closeBundle();
    await assert.rejects(access(cacheDir),{code:'ENOENT'});
    await access(join(other,'active.js'));
});
