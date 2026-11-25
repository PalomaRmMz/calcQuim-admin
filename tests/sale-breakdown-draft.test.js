import test from 'node:test';
import assert from 'node:assert/strict';
import {breakdownProductLabels,buildSaleBreakdownRows,compatibleSaleProducts,initialBreakdownDraft} from '../src/services/saleBreakdownDraft.js';
import {saleCommercialReview} from '../src/services/saleAuditView.mjs';
const products=[{id:1,name:'A',unit:'litro'},{id:2,name:'B',unit:'litro'}];
const sale={date:'2026-11-05',createdAt:'2026-11-05T18:00:00Z',items:[{name:'Grupo A',eligibleProductIds:[1,2]},{name:'Grupo B',eligibleProductIds:[2]}]};
const pending=[{id:'a',ordinal:0,scope:'priceGroup',quantity:'3',unit:'litro'},{id:'b',ordinal:1,scope:'priceGroup',quantity:'2',unit:'litro'}];
const view={products:[],movements:[]};
test('distingue opciones Lavatrastes Limón y solo aplica el SKU elegido',()=>{
    const candidates=[{id:1,name:'Limón',brand:'Salvo',lineId:3,categoryId:4,unit:'litro'},{id:2,name:'Limón',brand:'Axion',lineId:3,categoryId:4,unit:'litro'}];
    const item={name:'Lavatrastes',eligibleProductIds:[1,2]};
    const row={...pending[0],quantity:null};
    const allowed=compatibleSaleProducts(row,item,[...candidates,candidates[0]]);
    const labels=breakdownProductLabels(allowed,[],[{id:3,categoryId:4,name:'Lavatrastes'}],[{productId:2,name:'Botella de 1 L',active:true}]);
    assert.equal(allowed.length,2);
    assert.match(labels.get('1'),/Lavatrastes Limón.*Salvo/);
    assert.match(labels.get('2'),/Lavatrastes Limón.*Axion.*Botella de 1 L/);
    const draft=initialBreakdownDraft(row,item,allowed);
    assert.equal(draft.allocations[0].productId,'');
    draft.physical='3';
    draft.allocations[0]={productId:'2',quantity:'3'};
    assert.deepEqual(buildSaleBreakdownRows({...sale,items:[item]},[row],{a:draft},allowed,view)[0].allocations,[{productId:2,quantity:'3',unit:'litro'}]);
});
test('solo identifica revisiones registradas o diferencias reales pendientes',()=>{
    assert.deepEqual(saleCommercialReview({commerceVersion:'fullclean-commerce-v1',history:[{action:'created'}]}),{reviewed:false,pending:false});
    assert.deepEqual(saleCommercialReview({history:[{action:'commercial_correction'}]}),{reviewed:true,pending:false});
    assert.equal(saleCommercialReview({monetarySettlement:{status:'not_recorded',differenceCents:-600}}).pending,true);
    assert.equal(saleCommercialReview({monetarySettlement:{status:'not_recorded',differenceCents:0}}).pending,false);
});
test('precarga cantidades y producto único; guarda dos renglones juntos',()=>{
    const a=initialBreakdownDraft(pending[0],sale.items[0],products),b=initialBreakdownDraft(pending[1],sale.items[1],products);
    assert.equal(a.allocations[0].quantity,'3');assert.equal(a.allocations[0].productId,'');assert.equal(b.allocations[0].productId,'2');
    a.allocations[0].productId='1';
    const rows=buildSaleBreakdownRows(sale,pending,{a,b},products,view);
    assert.equal(rows.length,2);assert.equal(rows[0].allocations[0].quantity,'3');
});
test('permite repartir un grupo y dejar otro para después',()=>{
    const a={enabled:true,allocations:[{productId:'1',quantity:'1'},{productId:'2',quantity:'2'}]};
    assert.equal(buildSaleBreakdownRows(sale,pending,{a,b:{enabled:false}},products,view).length,1);
    a.allocations[1].quantity='1';
    assert.throws(()=>buildSaleBreakdownRows(sale,pending,{a,b:{enabled:false}},products,view),/deben sumar 3/);
});
test('no permite productos incompatibles ni repetidos; identifica el renglón inválido',()=>{
    const a={enabled:true,allocations:[{productId:'9',quantity:'3'}]};
    assert.throws(()=>buildSaleBreakdownRows(sale,pending,{a},products,view),e=>e.pendingId==='a');
    a.allocations=[{productId:'1',quantity:'1'},{productId:'1',quantity:'2'}];
    assert.throws(()=>buildSaleBreakdownRows(sale,pending,{a},products,view),/No repitas/);
});
