import test from 'node:test';
import assert from 'node:assert/strict';
import {initialRegularizationPlan} from '../src/services/initialRegularization.mjs';
const event=(seq,kind='estimate',extra={})=>({id:`synthetic-${seq}`,seq:String(seq),product_id:'1',kind,quantity:'12',unit:'litro',occurred_at:`2026-10-29T00:00:0${seq}Z`,reference:{reasonCode:'physical_count'},...extra});
test('clasifica el primer estimate independientemente del motivo, sin asumir entradas como iniciales',()=>{
  const inventory={products:[{productId:1},{productId:2}],movements:[event(2,'prepared',{quantity:'20'}),event(1),event(3,'waste',{product_id:'2',quantity:'-1'})],changes:[]};
  const original=structuredClone(inventory),plan=initialRegularizationPlan({data:{}},inventory);
  assert.equal(plan.candidates.length,1);assert.equal(plan.candidates[0].movementId,'synthetic-1');assert.equal(plan.candidates[0].laterMovements,1);assert.equal(plan.ambiguous[0].code,'NO_ESTIMATE');assert.deepEqual(inventory,original);
});
test('repeticiones se revisan y la clasificación auditada no vuelve a proponerse',()=>{
  const row=event(1),view={products:[{productId:1}],movements:[row,{...row,id:'synthetic-2',seq:'2'}],changes:[]};
  const plan=initialRegularizationPlan({},view);assert.equal(plan.ambiguous[0].code,'MULTIPLE_ESTIMATES');assert.equal(plan.potentialDuplicates.length,1);
  view.movements=[row];view.changes=[{action:'initial_classification',reference:{movementId:row.id,classification:'INVENTARIO_INICIAL'}}];assert.equal(initialRegularizationPlan({},view).candidates.length,0);
});
