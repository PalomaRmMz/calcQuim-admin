import test from 'node:test';
import assert from 'node:assert/strict';
import {saleInventoryBaseline} from '../src/services/saleInventoryBaseline.js';
const view={products:[{productId:1,anchorId:'anchor'}],movements:[{id:'anchor',recorded_at:'2026-11-03T18:00:00Z'}]};
test('venta posterior al conteo no pide decidir si estaba incluida',()=>{
    assert.equal(saleInventoryBaseline({date:'2026-11-03',createdAt:'2026-11-03T19:00:00Z'},{created_at:'2026-11-05T18:00:00Z'},1,view).required,false);
});
test('venta anterior usa su captura original aunque el pendiente sea nuevo',()=>{
    const result=saleInventoryBaseline({date:'2026-11-03',createdAt:'2026-11-03T17:00:00Z'},{created_at:'2026-11-05T18:00:00Z'},1,view);
    assert.equal(result.required,true);assert.equal(result.anchorAt,'2026-11-03T18:00:00Z');
});
test('fecha de venta anterior exige revisión, sin conteo no la exige',()=>{
    const sale={date:'2026-11-02',createdAt:'2026-11-05T18:00:00Z'};
    assert.equal(saleInventoryBaseline(sale,{},1,view).required,true);
    assert.equal(saleInventoryBaseline(sale,{},2,view).required,false);
});
