import {createHash} from 'node:crypto';
import {canonical} from './dataset.mjs';
import {inventoryChange,readInventory} from '../repositories/inventory.mjs';
export const regularizationHash=value=>createHash('sha256').update(canonical(JSON.parse(JSON.stringify(value)))).digest('hex');
export function initialRegularizationPlan(dataset,inventory){
  const candidates=[],ambiguous=[],potentialDuplicates=[];
  for(const product of inventory.products){
    const rows=inventory.movements.filter(m=>m.product_id===String(product.productId)).sort((a,b)=>BigInt(a.seq)<BigInt(b.seq)?-1:1);
    if(!rows.length)continue;
    const estimates=rows.filter(m=>m.kind==='estimate'),first=estimates[0];
    if(!first){ambiguous.push({productId:product.productId,code:'NO_ESTIMATE'});continue;}
    if(estimates.length>1)ambiguous.push({productId:product.productId,code:'MULTIPLE_ESTIMATES'});
    const seen=new Set();
    for(const row of rows){const signature=regularizationHash([row.kind,row.quantity,row.unit,row.occurred_at,row.sale_id,row.purchase_id]);if(seen.has(signature))potentialDuplicates.push({productId:product.productId,movementId:row.id});seen.add(signature);}
    const classified=first.reference.classification==='INVENTARIO_INICIAL'||inventory.changes.some(c=>c.action==='initial_classification'&&c.reference.movementId===first.id&&c.reference.classification==='INVENTARIO_INICIAL');
    if(!classified)candidates.push({productId:product.productId,movementId:first.id,original:JSON.parse(JSON.stringify(first)),laterMovements:rows.filter(m=>BigInt(m.seq)>BigInt(first.seq)).length});
  }
  return {version:1,datasetSha256:regularizationHash(dataset),inventorySha256:regularizationHash(inventory),candidates,ambiguous,potentialDuplicates};
}
// El llamador debe mantener una transacción y el bloqueo de dataset_state.
export async function applyInitialRegularization(c,dataset,inventory,plan){
  const planHash=regularizationHash(plan);
  const done=plan.candidates.filter(item=>inventory.changes.some(event=>event.action==='initial_classification'&&event.reference.movementId===item.movementId&&event.reference.regularizationPlanSha256===planHash));
  if(plan.candidates.length&&done.length===plan.candidates.length)return {applied:0,replayed:true};
  if(plan.ambiguous.length||plan.potentialDuplicates.length)throw new Error('REGULARIZATION_REVIEW_REQUIRED');
  if(regularizationHash(initialRegularizationPlan(dataset,inventory))!==planHash)throw new Error('REGULARIZATION_PLAN_STALE');
  for(const item of plan.candidates)await inventoryChange(c,'initial_classification',{productId:item.productId,movementId:item.movementId,classification:'INVENTARIO_INICIAL',reason:'Regularización de inventario inicial',original:item.original,regularizationPlanSha256:planHash});
  const after=await readInventory(c,dataset.data);
  if(regularizationHash(after.movements)!==regularizationHash(inventory.movements)||regularizationHash(after.products)!==regularizationHash(inventory.products))throw new Error('REGULARIZATION_BALANCE_CHANGED');
  if(plan.candidates.length)await c.query('UPDATE dataset_state SET revision=revision+1 WHERE singleton=true');
  return {applied:plan.candidates.length,replayed:false};
}
