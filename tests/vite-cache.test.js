import test from 'node:test';
import assert from 'node:assert/strict';
import { isolatedViteCache } from '../scripts/vite-cache.mjs';

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
