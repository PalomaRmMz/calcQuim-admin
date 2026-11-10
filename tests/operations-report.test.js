import test from 'node:test';
import assert from 'node:assert/strict';
import {operationsReport} from '../src/domain/operationsReport.mjs';
const fixture=()=>({data:{products:[{id:1,name:'Líquido QA',unit:'litro',price:20,active:true},{id:2,name:'Escoba QA',unit:'pieza',activity:'JARCERIA',active:true}],categories:[],productLines:[],sales:[{id:'sale',folio:'QA',date:'2026-11-06',createdAt:'2026-11-06T15:00:00Z',items:[{productId:1,name:'Líquido QA',quantity:2,unit:'litro',amount:40,activity:'LIMPIEZA',lineType:'physical'}]}],procurement:{purchases:[{id:'buy',date:'2026-11-05',total:100,activity:'LIMPIEZA',items:[]}]}},inventory:{products:[{productId:1,name:'Líquido QA',unit:'litro',quantity:'3',minimum:'5',usualBatch:'20'},{productId:2,name:'Escoba QA',unit:'pieza',quantity:null,minimum:null,usualBatch:null}],movements:[{id:'out',sale_id:'sale',sale_ordinal:0,product_id:'1',kind:'sale',quantity:'-2'}],pending:[]},purchases:{enabled:true,rows:[{purchase_id:'buy',item_id:'i',product_id:'1',activity:'LIMPIEZA',state:'applied',nature:'finished',source:{total:100,quantity:10,unit:'litro'},actual_quantity:'10',unit:'litro',date:'2026-11-05',updated_at:'2026-11-05T12:00:00Z',supplierId:'s',supplierName:'Proveedor QA',productName:'Líquido QA',name:'Líquido QA',voided:false}]}});
test('margins use prior paid costs, stock thresholds overlap and units stay separated',()=>{
 const input=fixture(),before=structuredClone(input),r=operationsReport(input,{activity:'GENERAL',from:'2026-11-01',to:'2026-11-06'});
 assert.equal(r.margins[0].estimatedCost,20);assert.equal(r.margins[0].estimatedMargin,20);assert.equal(r.margins[0].marginPercent,50);
 assert.equal(r.inventorySummary.low,1);assert.equal(r.inventorySummary.unknown,1);assert.equal(r.inventorySummary.unconfigured,1);
 assert.deepEqual(r.trends,[{month:'2026-11',purchases:100,sales:40}]);assert.equal(r.rotation.find(p=>p.unit==='pieza').quantity,0);assert.deepEqual(input,before);
});
test('missing, future and voided acquisition costs never become valid margin zeroes',()=>{
 for(const change of [s=>s.purchases.rows=[],s=>s.purchases.rows[0].updated_at='2026-11-07T00:00:00Z',s=>s.purchases.rows[0].voided=true,s=>s.purchases.rows[0].removed=true,s=>s.inventory.movements=[]]){
  const f=fixture();change(f);const r=operationsReport(f,{from:'2026-11-01',to:'2026-11-06'});assert.equal(r.margins[0].estimatedMargin,null);assert.equal(r.marginCoverage.unknown,1);
 }
});
test('pending breakdowns and returns preserve uncertainty; no cross-activity totals',()=>{
 const f=fixture();f.inventory.pending=[{state:'pending',product_id:'1',scope:'product',scope_id:'1'}];f.inventory.movements.push({id:'return',kind:'return',sale_id:'sale',product_id:'1',quantity:'1'});
 const r=operationsReport(f,{from:'2026-11-01',to:'2026-11-06'});assert.equal(r.rotation[0].quantity,null);assert.equal(r.margins[0].estimatedMargin,null);
 const hardware=operationsReport(f,{activity:'JARCERIA',from:'2026-11-01',to:'2026-11-06'});assert.equal(hardware.margins.length,0);assert.equal(hardware.supplierCosts.length,0);assert.equal(hardware.trends.length,0);
 assert.throws(()=>operationsReport(f,{from:'2026-11-07',to:'2026-11-01'}));
});
test('real preparation yield only exists after confirmation, with pending purchase visibility',()=>{
 const f=fixture();f.purchases.rows[0]={...f.purchases.rows[0],nature:'input',state:'prepare',actual_quantity:null,source:{quantity:1,unit:'litro',total:100},intent:{expectedOutput:20,expectedUnit:'litro'}};
 let r=operationsReport(f,{from:'2026-11-01',to:'2026-11-06'});assert.equal(r.preparations[0].actual,null);assert.equal(r.preparations[0].realYield,null);assert.equal(r.pendingPurchases.length,1);assert.equal(r.supplierCosts.length,0);
 f.purchases.rows[0].state='applied';f.purchases.rows[0].actual_quantity='18';r=operationsReport(f,{from:'2026-11-01',to:'2026-11-06'});assert.equal(r.preparations[0].realYield,18);assert.equal(r.preparations[0].achievement,90);
});
test('unclassified historic income belongs only to the general financial trend and preserves uncertain rotation',()=>{
 const f=fixture();f.data.sales.push({id:'legacy',date:'2026-11-06',items:[{name:'Venta resumida',amount:30}]});
 const general=operationsReport(f,{activity:'GENERAL',from:'2026-11-01',to:'2026-11-06'}),cleaning=operationsReport(f,{activity:'LIMPIEZA',from:'2026-11-01',to:'2026-11-06'});
 assert.equal(general.trends[0].sales,70);assert.equal(cleaning.trends[0].sales,40);assert.equal(cleaning.businessUnclassifiedRevenue,30);assert.equal(cleaning.rotation[0].quantity,null);
});
