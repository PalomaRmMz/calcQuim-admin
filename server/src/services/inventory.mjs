import { randomUUID,createHash } from 'node:crypto';
import { ApiError } from './commands.mjs';
import { normalizeUnit } from '../../../src/utils/units.js';
import { inventoryConvert,inventoryDecimal,inventoryText } from '../../../src/services/inventoryUnits.js';
import { inventoryAvailable,inventoryPolicy,inventoryChange,inventoryAccount,appendInventoryMovement,readInventory } from '../repositories/inventory.mjs';
import { resolveInventoryReason,movementReasonContext } from '../../../src/services/inventoryReasons.js';
import { validDate } from '../../../src/utils/procurementUtils.js';
export const inventoryCommands=['inventoryMovement','inventoryEstimate','inventoryInitial','inventoryCorrectInitial','inventoryCount','inventoryReplenishment','inventoryReverse','inventoryAllocate','inventoryReviewPurchase'];
const fail=(message,code='INVENTORY_VALIDATION')=>{throw new ApiError(422,code,message);};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const findProduct=(data,id)=>{const p=data.products.find(p=>String(p.id)===String(id));if(!p)fail('Selecciona un producto existente.');return p;};
function reason(input,context){try{return resolveInventoryReason(input,context);}catch(error){fail(error.message,'INVENTORY_REASON_INVALID');}}
function uuid(value){if(typeof value!=='string'||!(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).test(value))fail('Identificador de inventario no válido.');return value;}
async function checkBaseline(c,product,event,treatment){
  const anchor=(await c.query('SELECT m.* FROM inventory_accounts a JOIN inventory_movements m ON m.id=a.anchor_id WHERE a.product_id=$1',[String(product.id)])).rows[0];
  if(!anchor){if(treatment==='already_included')fail('No existe una estimación en la que incluir este movimiento.');return {};}
  const day=anchor.recorded_at.toLocaleDateString('en-CA',{timeZone:'America/Mexico_City'});
  const older=Boolean((event.seq!=null&&BigInt(event.seq)<BigInt(anchor.seq))||(event.date&&event.date<day)||(event.createdAt&&Date.parse(event.createdAt)<anchor.recorded_at.getTime()));
  if(!older){if(treatment==='already_included')fail('Indica la fecha original anterior a la estimación; no se omite una operación posterior.');return {};}
  if(!['already_included','apply_now'].includes(treatment))fail('La operación es anterior a la última estimación. Confirma si ya estaba incluida o si debe aplicarse ahora.','INVENTORY_BASELINE_REVIEW_REQUIRED');
  return {baselineTreatment:treatment,baselineAnchorId:anchor.id,...(treatment==='already_included'?{includedInAnchorId:anchor.id}:{})};
}
function quantity(value,from,to){try{return inventoryConvert(value,from,to);}catch(error){fail(error.message);}}
async function movement(c,data,input,kind){
  const product=findProduct(data,input.productId),unit=normalizeUnit(product.unit);
  const value=quantity(input.quantity,input.unit,unit),scaled=inventoryDecimal(value);
  if((kind==='estimate'&&scaled<0n)||(kind!=='estimate'&&scaled===0n))fail('Cantidad no válida para el movimiento.');
  if(['prepared','receipt','return'].includes(kind)&&scaled<=0n)fail('La entrada debe ser positiva.');
  if(kind==='waste'&&scaled>=0n)fail('La merma debe indicarse como cantidad negativa.');
  const occurredAt=kind==='estimate'?new Date().toISOString():input.occurredAt??new Date().toISOString();
  if(typeof occurredAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(occurredAt)||!validDate(occurredAt.slice(0,10))||!Number.isFinite(Date.parse(occurredAt)))fail('Fecha de movimiento no válida.');
  const baseline=kind!=='estimate'?await checkBaseline(c,product,{createdAt:occurredAt},input.baselineTreatment):{};
  if(kind==='adjustment'&&input.reference?.entryType==='positive_adjustment'&&inventoryDecimal(value)<=0n)fail('La entrada por ajuste positivo debe ser mayor que cero.');
  if(kind==='adjustment'&&input.reference?.entryType==='justified_outflow'&&inventoryDecimal(value)>=0n)fail('La salida justificada debe descontar una cantidad.');
  const why=reason(input,kind==='estimate'&&input.reference?.entryType==='physical_count'?'count':kind==='estimate'&&input.reference?.entryType==='initial_inventory'?'initial':movementReasonContext(kind,value,input.reference));
  const ref={...(input.reference?{userReference:input.reference}:{}),...baseline,...why.metadata,...(input.reference?.entryType==='initial_inventory'?{classification:'INVENTARIO_INICIAL'}:{})};
  if(input.purchaseId!=null){
    const purchase=data.procurement.purchases.find(p=>String(p.id)===String(input.purchaseId));
    if(!purchase||purchase.voidedAt)fail('Selecciona una compra vigente.');
    if(kind!=='receipt')fail('La referencia de compra solo corresponde a recepción confirmada.');
    if(!Number.isInteger(input.purchaseOrdinal)||!purchase.items[input.purchaseOrdinal])fail('Selecciona el renglón recibido.');
    Object.assign(ref,{purchaseOrdinal:input.purchaseOrdinal,purchaseFingerprint:digest(purchase),explicitFinishedReceipt:true});
  }
  if(kind==='return'){
    const sale=data.sales.find(s=>String(s.id)===String(input.saleId));
    if(!sale)fail('La devolución debe referir a una venta existente.');
    const outputs=(await c.query("SELECT m.*,abs(m.quantity)::text AS amount,COALESCE((SELECT sum(r.quantity+COALESCE((SELECT sum(v.quantity) FROM inventory_movements v WHERE v.reversal_of=r.id),0)) FROM inventory_movements r WHERE r.sale_id=m.sale_id AND r.product_id=m.product_id AND r.kind='return'),0)::text AS returned FROM inventory_movements m WHERE m.sale_id=$1 AND m.product_id=$2 AND m.kind='sale' AND NOT EXISTS(SELECT 1 FROM inventory_movements r WHERE r.reversal_of=m.id)",[String(sale.id),String(product.id)])).rows;
    if(!outputs.length||scaled>outputs.reduce((s,r)=>s+inventoryDecimal(r.amount),0n)-inventoryDecimal(outputs[0].returned))fail('La devolución excede la salida pendiente de retornar.');
  }
  const id=await appendInventoryMovement(c,product,{kind,quantity:value,certainty:kind==='estimate'?'estimated':'confirmed',reason:why.text,occurredAt,purchaseId:input.purchaseId,saleId:kind==='return'?input.saleId:null,reference:ref});
  if(kind==='estimate')await c.query('UPDATE inventory_accounts SET anchor_id=$2 WHERE product_id=$1',[String(product.id),id]);
  await inventoryChange(c,kind,{movementId:id,productId:product.id,reason:why.text,...why.metadata});return {movementId:id};
}
export async function executeInventoryCommand(c,data,name,args){
  if(!await inventoryAvailable(c))throw new ApiError(503,'INVENTORY_NOT_ENABLED','Inventario pendiente de migración autorizada.');
  if(!Array.isArray(args)||args.length!==1||!args[0]||typeof args[0]!=='object'||Array.isArray(args[0]))fail('Se requiere un formulario de inventario.');
  const input=args[0];
  if(['inventoryInitial','inventoryCount','inventoryCorrectInitial'].includes(name)){
    const product=findProduct(data,input.productId),current=(await readInventory(c,data)).products.find(p=>String(p.productId)===String(product.id));
    if(name==='inventoryInitial'){
      if(current.initialMovementId)fail('El inventario inicial ya está registrado. Utiliza Correcciones o un conteo físico.','INITIAL_ALREADY_EXISTS');
      return movement(c,data,{...input,reasonCode:'initial_inventory',reasonExplanation:'',reference:{entryType:'initial_inventory'}},'estimate');
    }
    if(!current.initialMovementId)fail('Registra primero el inventario inicial.');
    if(name==='inventoryCount'){
      reason(input,'count');
      return movement(c,data,{...input,reference:{entryType:'physical_count',previousQuantity:current.quantity}},'estimate');
    }
    if(!current.initialCorrectionAllowed)fail(current.initialCorrectionBlockedReason,'INITIAL_CORRECTION_REVIEW_REQUIRED');
    if(input.initialMovementId!==current.initialMovementId||input.previousQuantity!==current.initialQuantity)fail('El inventario inicial cambió. Recarga antes de corregir.','INITIAL_CORRECTION_STALE');
    const next=quantity(input.quantity,input.unit,current.unit),delta=inventoryDecimal(next)-inventoryDecimal(current.initialQuantity);
    if(inventoryDecimal(next)<0n||delta===0n)fail('Indica una existencia inicial distinta, mayor o igual que cero.');
    let why;try{why=resolveInventoryReason({...input,reasonCode:'initial_correction',reasonExplanation:''},'initial_correction',{allowLegacy:false});}catch(error){fail(error.message,'INVENTORY_REASON_INVALID');}
    await inventoryChange(c,'initial_correction',{productId:product.id,initialMovementId:current.initialMovementId,originalQuantity:current.initialOriginalQuantity,previousQuantity:current.initialQuantity,nextQuantity:next,difference:inventoryText(delta),previousCurrentQuantity:current.quantity,nextCurrentQuantity:inventoryText(inventoryDecimal(current.quantity)+delta),reason:why.text,...why.metadata});
    return {initialMovementId:current.initialMovementId};
  }
  if(name==='inventoryEstimate')return movement(c,data,input,'estimate');
  if(name==='inventoryMovement'){
    const current=(await readInventory(c,data)).products.find(p=>String(p.productId)===String(input.productId));
    if(!current?.initialMovementId)fail('Registra primero el inventario inicial.','INITIAL_REQUIRED');
    if(!['prepared','receipt','adjustment','waste','return','correction'].includes(input.kind))fail('Tipo de movimiento no válido.');
    return movement(c,data,input,input.kind);
  }
  if(name==='inventoryReplenishment'){
    const product=findProduct(data,input.productId),account=await inventoryAccount(c,product),why=reason(input,'replenishment');
    const minimum=input.minimum==null||input.minimum===''?null:quantity(input.minimum,input.unit,account.unit);
    const batch=input.usualBatch==null||input.usualBatch===''?null:quantity(input.usualBatch,input.unit,account.unit);
    if((minimum!==null&&inventoryDecimal(minimum)<0n)||(batch!==null&&inventoryDecimal(batch)<=0n))fail('Umbral o lote no válido.');
    const previous=(await c.query('SELECT * FROM inventory_replenishment WHERE product_id=$1',[String(product.id)])).rows[0]??null;
    await c.query('INSERT INTO inventory_replenishment(product_id,minimum,usual_batch,unit) VALUES($1,$2,$3,$4) ON CONFLICT(product_id) DO UPDATE SET minimum=EXCLUDED.minimum,usual_batch=EXCLUDED.usual_batch,unit=EXCLUDED.unit',[String(product.id),minimum,batch,account.unit]);
    await inventoryChange(c,'replenishment',{productId:product.id,previous,next:{minimum,batch,unit:account.unit},reason:why.text,...why.metadata});return {};
  }
  if(name==='inventoryReverse'){
    const original=(await c.query('SELECT * FROM inventory_movements WHERE id=$1',[uuid(input.movementId)])).rows[0];
    if(!original||['estimate','reversal','sale'].includes(original.kind)||original.reversal_of)fail('Ese movimiento no se revierte por esta acción; una venta requiere confirmar su retorno físico.');
    const baseline=await checkBaseline(c,findProduct(data,original.product_id),{seq:original.seq,createdAt:original.occurred_at.toISOString()},input.baselineTreatment);
    const why=reason(input,'reversal');
    const id=await appendInventoryMovement(c,findProduct(data,original.product_id),{kind:'reversal',quantity:inventoryText(-inventoryDecimal(original.quantity)),reason:why.text,reversalOf:original.id,reference:{originalMovement:original.id,...baseline,...why.metadata}});
    await inventoryChange(c,'reversal',{movementId:id,originalMovement:original.id,reason:why.text,...why.metadata});return {movementId:id};
  }
  if(name==='inventoryAllocate')return allocate(c,data,input);
  if(name==='inventoryReviewPurchase'){
    const purchase=data.procurement.purchases.find(p=>String(p.id)===String(input.purchaseId));if(!purchase)fail('Compra no encontrada.');
    const why=reason(input,'purchase_review');
    await inventoryChange(c,'purchase_review_confirmed',{purchaseId:purchase.id,purchaseFingerprint:digest(purchase),reason:why.text,...why.metadata});return {};
  }
  fail('Acción de inventario desconocida.');
}
async function allocate(c,data,input){
  const pending=(await c.query('SELECT * FROM inventory_pending WHERE id=$1 FOR UPDATE',[uuid(input.pendingId)])).rows[0];
  const sale=data.sales.find(s=>String(s.id)===pending?.sale_id);
  if(!pending||pending.state!=='pending'||!sale||sale.voidedAt)fail('La asignación no está pendiente.');
  if(!Array.isArray(input.allocations)||!input.allocations.length||input.allocations.length>200)fail('Agrega el desglose físico.');
  const expected=pending.quantity??quantity(input.confirmedQuantity,input.confirmedUnit,pending.unit);
  if(inventoryDecimal(expected)<=0n)fail('Confirma una cantidad física positiva.');
  const seen=new Set(),rows=[];let total=0n;const why=reason(input,'allocation');
  for(const item of input.allocations){
    if(!item||typeof item!=='object'||Array.isArray(item))fail('Formato de desglose no válido.');
    const product=findProduct(data,item.productId),id=String(product.id);
    if(seen.has(id))fail('No repitas un producto en el desglose.');seen.add(id);
    if((pending.scope==='product'&&id!==pending.scope_id)||(pending.scope==='line'&&String(product.lineId)!==pending.scope_id)||(pending.scope==='category'&&String(product.categoryId)!==pending.scope_id))fail('El producto no pertenece al grupo confirmado.');
    const captured=sale.items[pending.ordinal];
    if(captured.eligibleProductIds&&!captured.eligibleProductIds.some(id=>String(id)===String(product.id)))fail('Producto incompatible con la tarifa histórica aplicada.');
    if(pending.scope==='priceGroup'&&!captured.eligibleProductIds)fail('No hay evidencia de compatibilidad histórica.');
    const baseline=await checkBaseline(c,product,{createdAt:pending.created_at.toISOString(),date:sale.date},item.baselineTreatment??input.baselineTreatment);
    const physical=quantity(item.quantity,item.unit,product.unit),common=quantity(item.quantity,item.unit,pending.unit);
    if(inventoryDecimal(physical)<=0n)fail('Las cantidades deben ser positivas.');total+=inventoryDecimal(common);rows.push({product,physical,baseline});
  }
  if(total!==inventoryDecimal(expected))fail('El desglose debe coincidir exactamente con la cantidad física confirmada.');
  for(const row of rows){
    const id=await appendInventoryMovement(c,row.product,{kind:'sale',quantity:inventoryText(-inventoryDecimal(row.physical)),reason:why.text,saleId:sale.id,saleOrdinal:pending.ordinal,originKey:`allocation:${pending.id}:${row.product.id}`,reference:{pendingId:pending.id,physicalQuantityConfirmed:true,...row.baseline,...why.metadata}});
    await c.query('INSERT INTO inventory_allocations(id,pending_id,product_id,quantity,unit,movement_id) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),pending.id,String(row.product.id),row.physical,normalizeUnit(row.product.unit),id]);
  }
  await c.query("UPDATE inventory_pending SET state='resolved' WHERE id=$1",[pending.id]);
  await inventoryChange(c,'allocation',{pendingId:pending.id,confirmedQuantity:expected,unit:pending.unit,reason:why.text,...why.metadata});
  if(sale.origin==='MOVIL') {
    sale.breakdowns={...(sale.breakdowns||{}),[pending.ordinal]:rows.map(row=>({productId:row.product.id,name:row.product.name,quantity:row.physical,unit:row.product.unit}))};
    sale.history=[...(sale.history||[]),{action:'breakdown',channel:'WEB',at:new Date().toISOString(),ordinal:pending.ordinal,allocations:sale.breakdowns[pending.ordinal]}];
  }
  return {};
}
export async function syncInventory(c,before,data,name,args){
  if(!await inventoryAvailable(c))return;
  // La unidad y los IDs con historia no pueden cambiar silenciosamente.
  const accounts=(await c.query('SELECT product_id,unit FROM inventory_accounts')).rows;
  for(const a of accounts){const p=data.products.find(p=>String(p.id)===a.product_id);if(!p||normalizeUnit(p.unit)!==a.unit)fail('El producto tiene historial o configuración de inventario; conserva su ID y unidad.');}
  if(name==='savePurchase'||name==='voidPurchase'){
    for(const p of data.procurement.purchases){const old=before.procurement.purchases.find(x=>x.id===p.id);if(old&&digest(old)!==digest(p)&&(await c.query('SELECT 1 FROM inventory_movements WHERE purchase_id=$1 LIMIT 1',[String(p.id)])).rowCount)await inventoryChange(c,'purchase_review_required',{purchaseId:p.id,purchaseFingerprint:digest(p)});}
  }
  if(!(await inventoryPolicy(c)).sales_enabled)return;
  for(const old of before.sales){
    const current=data.sales.find(s=>s.id===old.id);
    if(!current||(name!=='correctMobileSale'&&(digest(current.items)!==digest(old.items)||current.total!==old.total))||(current.voidedAt!==old.voidedAt&&name!=='voidSale'))fail('No se reescriben ventas con inventario: conserva el original y utiliza la anulación con confirmación física.');
  }
  if(name==='correctMobileSale') {
    const sale=data.sales.find(s=>s.id===args[0]);
    if((await c.query("SELECT 1 FROM inventory_movements WHERE sale_id=$1 AND kind='return' LIMIT 1",[sale.id])).rowCount)fail('La venta tiene devoluciones: requiere revisión física específica antes de corregir.');
    const outputs=(await c.query("SELECT m.* FROM inventory_movements m WHERE sale_id=$1 AND kind='sale' AND NOT EXISTS(SELECT 1 FROM inventory_movements r WHERE r.reversal_of=m.id)",[sale.id])).rows;
    for(const output of outputs) {
      const baseline=await checkBaseline(c,findProduct(data,output.product_id),{seq:output.seq,createdAt:sale.createdAt,date:sale.date},args[1].baselineTreatment);
      await appendInventoryMovement(c,findProduct(data,output.product_id),{kind:'reversal',quantity:inventoryText(-inventoryDecimal(output.quantity)),reason:args[1].reason,saleId:sale.id,saleOrdinal:output.sale_ordinal,reversalOf:output.id,originKey:'correction-reverse:'+output.id,reference:{commercialVersion:sale.commercialVersion,...baseline}});
    }
    await c.query("UPDATE inventory_pending SET state='cancelled' WHERE sale_id=$1 AND state IN ('pending','resolved')",[sale.id]);
    for(const [ordinal,item] of sale.items.entries()) {
      if(item.reference.kind!=='product'||item.entryMode==='amount')await addPending(c,sale,ordinal,item,{scope:item.reference.kind,scopeId:item.reference.id,reason:item.entryMode==='amount'?'amount':'group'});
      else {
        const product=findProduct(data,item.productId);
        const baseline=await checkBaseline(c,product,{createdAt:sale.createdAt,date:sale.date},args[1].baselineTreatment);
        const physical=inventoryConvert(item.quantity,item.unit,product.unit);
        await appendInventoryMovement(c,product,{kind:'sale',quantity:inventoryText(-inventoryDecimal(physical)),reason:args[1].reason,saleId:sale.id,saleOrdinal:ordinal,originKey:'correction:'+sale.id+':'+sale.commercialVersion+':'+ordinal,reference:{commercialVersion:sale.commercialVersion,...baseline}});
      }
    }
    await inventoryChange(c,'commercial_correction',{saleId:sale.id,version:sale.commercialVersion,channel:'WEB',reason:args[1].reason});
  }
  if(name==='createSale'||name==='createMobileSale'){
    const sale=data.sales.find(s=>!before.sales.some(old=>old.id===s.id));if(!sale)return;
    const intents=args[0].inventory??{};
    if(typeof intents!=='object'||Array.isArray(intents)||Object.entries(intents).some(([id,intent])=>!sale.items.some(i=>String(i.productId)===id)||!intent||typeof intent!=='object'||typeof intent.pendingGroup!=='boolean'))fail('La intención de inventario debe referir a renglones de la venta.');
    for(const [ordinal,item]of sale.items.entries()){
      if(item.reference&&item.reference.kind!=='product'){
        await addPending(c,sale,ordinal,item,{scope:item.reference.kind,scopeId:item.reference.id,reason:item.entryMode==='amount'?'amount':'group'});continue;
      }
      const product=findProduct(data,item.productId),intent=intents[String(item.productId)]??{};
      if(intent.pendingGroup){
        const scope=intent.scope;if(!['line','category'].includes(scope))fail('Selecciona línea o categoría para el desglose.');
        const scopeId=scope==='line'?product.lineId:product.categoryId;if(scopeId==null)fail('El producto no pertenece a ese grupo.');
        await addPending(c,sale,ordinal,item,{scope,scopeId,reason:item.entryMode==='amount'?'amount':'group'});
      }else if(item.entryMode==='amount')await addPending(c,sale,ordinal,item,{scope:'product',scopeId:product.id,reason:'amount'});
      else{
        try{await checkBaseline(c,product,{createdAt:sale.createdAt,date:sale.date});}catch(error){if(error.code!=='INVENTORY_BASELINE_REVIEW_REQUIRED')throw error;await addPending(c,sale,ordinal,item,{scope:'product',scopeId:product.id,reason:'quantity_review'});continue;}
        let physical;
        try{physical=inventoryConvert(item.quantity,item.unit,product.unit);}catch{await addPending(c,sale,ordinal,item,{scope:'product',scopeId:product.id,reason:'quantity_review'});continue;}
        await appendInventoryMovement(c,product,{kind:'sale',quantity:inventoryText(-inventoryDecimal(physical)),reason:'Salida por venta con cantidad física',saleId:sale.id,saleOrdinal:ordinal,originKey:`sale:${sale.id}:${ordinal}`,reference:{folio:sale.folio,reasonCode:'sale_known_quantity',reasonCatalogVersion:1,reasonSource:'system'}});
      }
    }
  }
  if(name==='voidSale'){
    const sale=data.sales.find(s=>String(s.id)===String(args[0]));
    if(!['returned','not_returned'].includes(args[1]?.inventoryReturn))fail('Confirma si el producto no salió o regresó físicamente, o si permanece fuera.','PHYSICAL_RETURN_REQUIRED');
    const why=reason(args[1]??{},'sale_void');
    await c.query("UPDATE inventory_pending SET state='cancelled' WHERE sale_id=$1 AND state IN ('pending','resolved')",[String(sale.id)]);
    if(args[1].inventoryReturn==='returned'){
      const outputs=(await c.query("SELECT m.* FROM inventory_movements m WHERE m.sale_id=$1 AND m.kind='sale' AND NOT EXISTS(SELECT 1 FROM inventory_movements r WHERE r.reversal_of=m.id)",[String(sale.id)])).rows;
      for(const output of outputs){
        const treatment=typeof args[1].baselineTreatment==='object'?args[1].baselineTreatment?.[output.product_id]:args[1].baselineTreatment;
        const baseline=await checkBaseline(c,findProduct(data,output.product_id),{seq:output.seq,createdAt:sale.createdAt,date:sale.date},treatment);
        const returned=(await c.query("SELECT 1 FROM inventory_movements WHERE sale_id=$1 AND product_id=$2 AND kind='return' LIMIT 1",[String(sale.id),output.product_id])).rowCount;
        if(returned)fail('Ya hay devoluciones parciales. Registra únicamente el retorno físico restante y anula sin una segunda reposición.');
        await appendInventoryMovement(c,findProduct(data,output.product_id),{kind:'reversal',quantity:inventoryText(-inventoryDecimal(output.quantity)),reason:why.text,saleId:sale.id,saleOrdinal:output.sale_ordinal,reversalOf:output.id,originKey:`void:${output.id}`,reference:{physicalReturnConfirmed:true,...baseline,...why.metadata}});
      }
    }
    await inventoryChange(c,'sale_void',{saleId:sale.id,physicalDisposition:args[1].inventoryReturn,reason:why.text,...why.metadata});
  }
}
async function addPending(c,sale,ordinal,item,{scope,scopeId,reason}){
  let quantity=null;if(item.entryMode!=='amount'){try{quantity=inventoryText(inventoryDecimal(item.quantity));}catch{/* Requiere cantidad física confirmada. */}}
  await c.query('INSERT INTO inventory_pending(id,sale_id,ordinal,product_id,scope,scope_id,quantity,unit,reason,fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[randomUUID(),String(sale.id),ordinal,item.productId==null?null:String(item.productId),scope,String(scopeId),quantity,normalizeUnit(item.unit),reason,digest(item)]);
}
