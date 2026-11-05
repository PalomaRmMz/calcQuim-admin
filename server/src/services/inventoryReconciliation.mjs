import {createHash,randomUUID} from 'node:crypto';
import {inventoryConvert,inventoryDecimal,inventoryText} from '../../../src/services/inventoryUnits.js';
import {exactSaleQuantity,checkBaseline,allocate,addPending} from './inventory.mjs';
import {appendInventoryMovement,inventoryChange} from '../repositories/inventory.mjs';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function planInventoryReconciliation(data,view,{cutoff,confirmations={}}={}) {
  if(!cutoff||!Number.isFinite(Date.parse(cutoff)))throw new Error('Corte de auditoría obligatorio.');
  const rows=[];
  for(const sale of data.sales.filter(s=>Date.parse(s.createdAt??s.date)<=Date.parse(cutoff)))for(const[itemOrdinal,item]of sale.items.entries()) {
    if(item.lineType==='service')continue;
    const key=String(sale.id)+':'+itemOrdinal;
    const all=view.movements.filter(m=>m.sale_id===String(sale.id)&&m.sale_ordinal===itemOrdinal);
    const active=all.filter(m=>m.kind==='sale'&&!view.movements.some(r=>r.reversal_of===m.id));
    const pending=view.pending.find(p=>p.sale_id===String(sale.id)&&p.ordinal===itemOrdinal&&p.state!=='cancelled');
    const product=data.products.find(p=>String(p.id)===String(item.productId));
    const account=view.products.find(p=>String(p.productId)===String(item.productId));
    const group=(item.reference&&!['product','presentation'].includes(item.reference.kind))||(pending&&pending.scope!=='product');
    const row={key,saleId:sale.id,ordinal:itemOrdinal,folio:sale.folio,date:sale.date,origin:sale.origin??'WEB',productId:product?.id??null,fingerprint:digest(item),movementIds:active.map(m=>m.id).sort(),pendingId:pending?.id??null,anchorId:account?.anchorId??null,status:'review',operation:null,quantity:null,unit:product?.unit??item.unit};
    if(sale.voidedAt){
      const disposition=view.changes.find(c=>c.action==='sale_void'&&String(c.reference.saleId)===String(sale.id))?.reference.physicalDisposition;
      row.status=disposition==='returned'&&!active.length||disposition==='not_returned'&&active.length?'correct':'review';row.reason='void_requires_physical_evidence';
    }else if(group){
      if(pending?.state==='pending'&&!active.length){row.status='pending_group';row.reason='specific_products_not_identified';}
      else if(pending?.state==='resolved'&&active.length){
        const event=view.changes.find(c=>c.action==='allocation'&&c.reference.pendingId===pending.id);
        try {const expected=inventoryDecimal(pending.quantity??event?.reference.confirmedQuantity),actual=active.reduce((s,m)=>s-inventoryDecimal(inventoryConvert(m.quantity,m.unit,pending.unit)),0n);row.status=expected===actual&&active.every(m=>m.reference.pendingId===pending.id)?'correct':'inconsistent';}catch{row.status='review';}
      }else if(active.length){row.status='inconsistent';row.reason='group_movement_without_allocation_evidence';}
      else if(item.reference){row.status='pending_group';row.operation='create_pending';row.reason='missing_group_pending';}
    }else if(product){
      let expected=exactSaleQuantity(item,product,sale.origin);
      const confirmation=confirmations[key];
      if(confirmation){
        if(confirmation.physicalConfirmed!==true)throw new Error('La cantidad histórica requiere confirmación física expresa.');
        expected=inventoryConvert(confirmation.quantity,confirmation.unit,product.unit);
        if(inventoryDecimal(expected)<=0n)throw new Error('Cantidad física no válida.');
        row.confirmation=confirmation;
      }
      row.quantity=expected;
      if(active.length){
        if(active.length!==1||active.some(m=>m.product_id!==String(product.id))){row.status='inconsistent';row.reason='duplicate_or_wrong_product';}
        else if(expected!=null&&inventoryDecimal(active[0].quantity)!==-inventoryDecimal(expected)){row.status='inconsistent';row.reason='wrong_quantity';}
        else if(expected==null&&!active[0].reference?.physicalQuantityConfirmed&&!active[0].reference?.physicalConfirmation){row.status='review';row.reason='physical_quantity_not_proven';}
        else if(pending?.state==='pending'){row.status='inconsistent';row.reason='charged_but_still_pending';}
        else {row.status='correct';row.reason=expected==null?'explicit_physical_allocation':'known_product_quantity';}
      }else{
        row.status='specific_missing';row.reason=expected==null?'physical_quantity_required':'missing_output';
        if(expected!=null){
          const anchor=view.movements.find(m=>m.id===account?.anchorId);
          const older=anchor&&(Date.parse(sale.createdAt??sale.date)<Date.parse(anchor.recorded_at)||sale.date<new Date(anchor.recorded_at).toLocaleDateString('en-CA',{timeZone:'America/Mexico_City'}));
          if(older&&!['already_included','apply_now'].includes(confirmation?.baselineTreatment))row.reason='baseline_decision_required';
          else row.operation=pending?'allocate_specific':'insert_output';
        }
      }
    }
    rows.push(row);
  }
  const counts=rows.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{});
  const plan={version:1,cutoff,rows,counts,pendingSales:new Set(rows.filter(r=>r.status!=='correct').map(r=>r.saleId)).size,pendingRows:rows.filter(r=>r.status!=='correct').length,ready:rows.filter(r=>r.operation).length};
  return {...plan,planHash:digest(plan)};
}
// Caller must hold the dataset_state lock in a transaction and compare a fresh
// plan with the approved dry-run. No commercial table is rewritten here.
export async function applyInventoryReconciliation(c,data,plan,{expectedPlanHash,runId,reason}={}) {
  if(!runId||typeof reason!=='string'||!reason.trim())throw new Error('Faltan identificador y motivo de conciliación.');
  const previous=(await c.query("SELECT reference FROM inventory_changes WHERE action='historical_reconciliation_run' AND reference->>'runId'=$1",[runId])).rows[0];
  if(previous){if(previous.reference.planHash!==expectedPlanHash)throw new Error('El identificador ya corresponde a otro plan.');return {...previous.reference,replayed:true};}
  if(plan.planHash!==expectedPlanHash)throw new Error('El plan cambió; repite el dry-run antes de aplicar.');
  let applied=0;
  for(const row of plan.rows.filter(r=>r.operation)){
    const sale=data.sales.find(s=>String(s.id)===String(row.saleId)),item=sale.items[row.ordinal];
    if(digest(item)!==row.fingerprint||sale.voidedAt)throw new Error('La venta cambió.');
    if(row.operation==='create_pending')await addPending(c,sale,row.ordinal,item,{scope:item.reference.kind,scopeId:item.reference.id,reason:item.entryMode==='amount'?'amount':'group'});
    else if(row.operation==='allocate_specific')await allocate(c,data,{pendingId:row.pendingId,confirmedQuantity:row.quantity,confirmedUnit:row.unit,allocations:[{productId:row.productId,quantity:row.quantity,unit:row.unit}],baselineTreatment:row.confirmation?.baselineTreatment,reason});
    else {
      const product=data.products.find(p=>String(p.id)===String(row.productId));
      const baseline=await checkBaseline(c,product,{createdAt:sale.createdAt,date:sale.date},row.confirmation?.baselineTreatment);
      await appendInventoryMovement(c,product,{kind:'sale',quantity:inventoryText(-inventoryDecimal(row.quantity)),reason,saleId:sale.id,saleOrdinal:row.ordinal,originKey:'reconciliation:v1:'+row.key,reference:{runId,planHash:plan.planHash,saleFingerprint:row.fingerprint,physicalConfirmation:row.confirmation??null,...baseline}});
    }
    const originKey=row.operation==='allocate_specific'?`allocation:${row.pendingId}:${row.productId}`:'reconciliation:v1:'+row.key;
    const movementIds=row.operation==='create_pending'?[]:(await c.query('SELECT id FROM inventory_movements WHERE origin_key=$1',[originKey])).rows.map(m=>m.id);
    const pendingId=row.pendingId??(row.operation==='create_pending'?(await c.query("SELECT id FROM inventory_pending WHERE sale_id=$1 AND ordinal=$2 AND state='pending'",[String(sale.id),row.ordinal])).rows[0]?.id:null);
    await inventoryChange(c,'historical_reconciliation_row',{runId,planHash:plan.planHash,saleId:sale.id,ordinal:row.ordinal,operation:row.operation,quantity:row.quantity,unit:row.unit,fingerprint:row.fingerprint,pendingId,movementIds});applied++;
  }
  const result={runId,planHash:plan.planHash,applied,remaining:plan.pendingRows-plan.rows.filter(r=>r.operation&&r.operation!=='create_pending').length};
  await inventoryChange(c,'historical_reconciliation_run',result);
  if(applied)await c.query('UPDATE dataset_state SET revision=revision+1 WHERE singleton=true');
  return result;
}
export const reconciliationRunId=()=>randomUUID();
