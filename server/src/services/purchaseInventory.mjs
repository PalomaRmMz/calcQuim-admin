import {enablePackInventory} from '../repositories/packInventory.mjs';
import {webActivationPlan} from './webActivationPlan.mjs';
import {jarceriaInitialPolicy} from '../../../src/domain/webBusinessDecisions.mjs';
import {saveCommerce} from './commerce.mjs';
import {officialServices} from '../../../src/domain/officialLaundryServices.mjs';
import {createHash} from 'node:crypto';
import {ApiError} from './commands.mjs';
import {checkBaseline} from './inventoryBaseline.mjs';
import {appendInventoryMovement,inventoryChange,purchaseAutomationPolicy} from '../repositories/inventory.mjs';
import {purchaseInventoryIntent} from '../../../src/domain/purchaseInventory.mjs';
import {inventoryConvert,inventoryDecimal,inventoryText} from '../../../src/services/inventoryUnits.js';
import {productActivity} from '../../../src/domain/activityScope.mjs';
import {localDate} from '../../../src/utils/salesUtils.js';
const fail=message=>{throw new ApiError(422,'PURCHASE_INVENTORY_VALIDATION',message);};
const fingerprint=item=>createHash('sha256').update(JSON.stringify(item)).digest('hex');
const lotKey=row=>`${row.purchase_id}:${row.item_id}`;
const product=(data,id)=>data.products.find(p=>String(p.id)===String(id));
const why=input=>{if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.trim().length>1000)fail('Explica el motivo (hasta 1000 caracteres).');return input.reason.trim();};
export async function purchaseInventoryAvailable(c){return (await c.query("SELECT to_regclass('purchase_inventory') IS NOT NULL AS ok")).rows[0].ok;}
export function purchaseInventorySnapshot(view,version=1){
 if(version!==1)throw Error('PURCHASE_INVENTORY_SNAPSHOT_VERSION_UNSUPPORTED');
 const fields=['purchase_id','item_id','ordinal','product_id','activity','state','nature','source','fingerprint','quantity','unit','actual_quantity','version','historical','updated_at'];
 return JSON.parse(JSON.stringify({available:view.available,enabled:view.enabled,rows:view.rows.map(row=>Object.fromEntries(fields.map(key=>[key,row[key]]))),events:view.events||[]}));
}
export async function purchaseInventoryView(c,data){
 if(!await purchaseInventoryAvailable(c))return {enabled:false,available:false,rows:[]};
 const rows=(await c.query('SELECT *,quantity::text,actual_quantity::text FROM purchase_inventory ORDER BY purchase_id,ordinal')).rows;
 const events=(await c.query("SELECT * FROM inventory_changes WHERE action LIKE 'purchase_inventory_%' ORDER BY seq DESC")).rows;
 return {available:true,enabled:!!(await purchaseAutomationPolicy(c)).enabled,rows:rows.map(row=>{
  const purchase=data.procurement.purchases.find(p=>String(p.id)===row.purchase_id);
  return {...row,manualInclusion:events.some(e=>e.action==='purchase_inventory_manual_included'&&e.reference.purchaseId===row.purchase_id&&e.reference.itemId===row.item_id),name:row.source.name,date:purchase?.date,supplierId:purchase?.supplierId,supplierName:purchase?.supplierNameSnapshot,voided:!!purchase?.voidedAt,removed:!purchase?.items.some(i=>String(i.id)===row.item_id),productName:product(data,row.product_id)?.name??null,intent:purchaseInventoryIntent(row.source,data.products)};
 }),events};
}
async function audit(c,row,action,reason,extra={}){await inventoryChange(c,'purchase_inventory_'+action,{purchaseId:row.purchase_id,itemId:row.item_id,productId:row.product_id,version:row.version,reason,...extra});}
async function update(c,row,patch){
 Object.assign(row,patch);row.version++;
 await c.query('UPDATE purchase_inventory SET state=$3,product_id=$4,quantity=$5,unit=$6,actual_quantity=$7,source=$8,fingerprint=$9,version=$10,ordinal=$11,nature=$12,updated_at=now() WHERE purchase_id=$1 AND item_id=$2',[row.purchase_id,row.item_id,row.state,row.product_id,row.quantity,row.unit,row.actual_quantity,JSON.stringify(row.source),row.fingerprint,row.version,row.ordinal,row.nature]);
}
async function activeEntries(c,row){return (await c.query("SELECT m.*,quantity::text FROM inventory_movements m WHERE reference->>'purchaseLotKey'=$1 AND kind IN ('receipt','prepared') AND NOT EXISTS(SELECT 1 FROM inventory_movements r WHERE r.reversal_of=m.id)",[lotKey(row)])).rows;}
async function entered(c,row){return (await c.query("SELECT COALESCE(sum(quantity),0)::text AS quantity FROM inventory_movements WHERE reference->>'purchaseLotKey'=$1",[lotKey(row)])).rows[0].quantity;}
async function apply(c,data,row,quantity,kind,reason,baseline={}){
 const p=product(data,row.product_id);if(!p)fail('Concilia el producto de destino.');
 const q=inventoryConvert(quantity,row.unit,p.unit);if(inventoryDecimal(q)<=0n)fail('Confirma una cantidad positiva.');
 const id=await appendInventoryMovement(c,p,{kind,quantity:q,purchaseId:row.purchase_id,reason,originKey:`purchase:${lotKey(row)}:${row.version}:${kind}`,reference:{purchaseLotKey:lotKey(row),purchaseOrdinal:row.ordinal,itemId:row.item_id,itemFingerprint:row.fingerprint,sourceSnapshot:row.source,reasonSource:'system',...baseline}});
 await update(c,row,{state:'applied',actual_quantity:q});await audit(c,row,kind,reason,{movementId:id,quantity:q,unit:p.unit,...baseline});return id;
}
async function register(c,data,purchase,item,ordinal,historical){
 const intent=purchaseInventoryIntent(item,data.products),row={purchase_id:String(purchase.id),item_id:String(item.id),ordinal,product_id:intent.productId==null?null:String(intent.productId),activity:purchase.activity??intent.activity,nature:intent.nature,state:historical?'reconcile':intent.nature==='input'&&intent.productId?'prepare':'reconcile',source:item,fingerprint:fingerprint(item),quantity:intent.quantity,unit:intent.unit,actual_quantity:null,version:1,historical};
 await c.query('INSERT INTO purchase_inventory(purchase_id,item_id,ordinal,product_id,activity,nature,state,source,fingerprint,quantity,unit,historical) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[row.purchase_id,row.item_id,ordinal,row.product_id,row.activity,row.nature,row.state,JSON.stringify(item),row.fingerprint,row.quantity,row.unit,historical]);
 // Recepciones previas inequívocas se reconocen; los ajustes sin referencia no se adivinan.
 const previous=(await c.query("SELECT m.* FROM inventory_movements m WHERE purchase_id=$1 AND reference->>'purchaseOrdinal'=$2 AND kind IN ('receipt','prepared') AND NOT EXISTS(SELECT 1 FROM inventory_movements r WHERE r.reversal_of=m.id)",[row.purchase_id,String(ordinal)])).rows;
 if(previous.length){await update(c,row,{state:'included',actual_quantity:null});await audit(c,row,'recognized','Movimiento histórico ya registrado',{evidenceMovementIds:previous.map(m=>m.id)});return row;}
 if(!historical&&intent.activity===row.activity&&intent.nature==='finished'&&intent.productId&&intent.quantity){
  try{const baseline=await checkBaseline(c,product(data,row.product_id),{date:purchase.date});await apply(c,data,row,intent.quantity,'receipt','Entrada automática de compra',baseline);}
  catch(error){if(error.code!=='INVENTORY_BASELINE_REVIEW_REQUIRED')throw error;}
 }
 await audit(c,row,'registered',historical?'Compra histórica pendiente de conciliación':'Compra registrada según su naturaleza');return row;
}
async function businessDecisions(c,input){
 await c.query("UPDATE inventory_settings SET policy=jsonb_set(policy,'{jarceriaInitialCapture}',$1::jsonb) WHERE singleton=true",[JSON.stringify(jarceriaInitialPolicy)]);
 await inventoryChange(c,'jarceria_initial_policy',{reason:'Decisión del propietario: inicial opcional para todos los productos, durante el alta individual o posteriormente',...jarceriaInitialPolicy});
 const declaration=input.historicalManualInclusion;
 if(!declaration)return;
 if(declaration.confirmed!==true||!Array.isArray(declaration.rows)||!declaration.rows.length||declaration.rows.length>2000)fail('Confirma el listado histórico incorporado manualmente.');
 const reason=why(declaration),keys=new Set();
 for(const selection of declaration.rows){
  const key=JSON.stringify([selection.purchaseId,selection.itemId]);if(keys.has(key))fail('No repitas renglones históricos.');keys.add(key);
  const row=(await c.query('SELECT * FROM purchase_inventory WHERE purchase_id=$1 AND item_id=$2 FOR UPDATE',[selection.purchaseId,selection.itemId])).rows[0];
  if(!row||!row.historical||row.fingerprint!==selection.fingerprint)fail('El renglón histórico cambió o no pertenece al corte aprobado.');
  if(row.state==='included')continue;
  if(row.state!=='reconcile')fail('El renglón ya tiene una operación física; requiere revisión específica.');
  await update(c,row,{state:'included',actual_quantity:null});
  await audit(c,row,'manual_included',reason,{evidenceType:'owner_declaration',sourceFingerprint:row.fingerprint,inventoryEffect:'none'});
 }
}
export const purchaseInventoryCommands=['activateWebStabilization','configureWebBusinessDecisions','configurePurchaseInventory','resolvePurchaseInventory','confirmPurchasePreparation','returnPurchaseInventory','correctPurchasePreparation'];
export async function executePurchaseInventory(c,data,name,input){
 if(!await purchaseInventoryAvailable(c))fail('Integración de compras pendiente de migración autorizada.');
 if(name==='activateWebStabilization'){
  if(input.approved!==true||input.planHash!==webActivationPlan(data).hash)fail('Revisa y autoriza el plan vigente antes de activar.');
  for(const service of officialServices)saveCommerce(data,'saveService',service);
  await executePurchaseInventory(c,data,'configurePurchaseInventory',{acknowledgeHistorical:true});
  await businessDecisions(c,input);await enablePackInventory(c);return {};
 }
 if(name==='configureWebBusinessDecisions'){
  if(input.approved!==true||input.planHash!==webActivationPlan(data).hash)fail('Revisa y autoriza el plan vigente antes de aplicar decisiones de negocio.');
  if(!(await purchaseAutomationPolicy(c)).enabled)fail('El corte histórico debe estar preparado antes de aplicar las decisiones.');
  await businessDecisions(c,input);return {};
 }
 if(name==='configurePurchaseInventory'){
  if(input?.acknowledgeHistorical!==true)fail('Confirma que las compras anteriores requieren conciliación y no se aplicarán automáticamente.');
  if((await purchaseAutomationPolicy(c)).enabled)return {};
  for(const purchase of data.procurement.purchases.filter(p=>!p.voidedAt))for(const [ordinal,item]of purchase.items.entries())await register(c,data,purchase,item,ordinal,true);
  await c.query("UPDATE inventory_settings SET policy=jsonb_set(policy,'{purchaseAutomation}',$1::jsonb) WHERE singleton=true",[JSON.stringify({enabled:true,activatedAt:new Date().toISOString()})]);
  await inventoryChange(c,'purchase_inventory_activation',{reason:'Corte histórico explícito; sin reposición retroactiva'});return {};
 }
 const row=(await c.query('SELECT *,quantity::text,actual_quantity::text FROM purchase_inventory WHERE purchase_id=$1 AND item_id=$2 FOR UPDATE',[String(input.purchaseId),String(input.itemId)])).rows[0];
 if(!row)fail('Renglón de compra no encontrado.');
 const purchase=data.procurement.purchases.find(p=>String(p.id)===row.purchase_id);if(!purchase||(purchase.voidedAt&&name!=='returnPurchaseInventory'))fail('La compra está anulada o no existe.');
 if(input.activity&&row.activity!==input.activity)fail('La compra no pertenece a esta actividad.');
 const reason=why(input);
 if(name==='returnPurchaseInventory'){
  if(!['applied','included'].includes(row.state))fail('Solo se retira producto cuya entrada está registrada.');
  const q=inventoryConvert(input.quantity,input.unit,row.unit),recorded=await entered(c,row);
  if(row.state==='included'&&row.actual_quantity==null)fail('Primero confirma la cantidad realmente incluida con su evidencia.');
  const net=row.state==='included'&&!(await activeEntries(c,row)).length?inventoryText(inventoryDecimal(row.actual_quantity)+inventoryDecimal(recorded)):recorded;
  if(inventoryDecimal(q)<=0n||inventoryDecimal(q)>inventoryDecimal(net))fail('El retiro excede la entrada pendiente de compensar.');
  const id=await appendInventoryMovement(c,product(data,row.product_id),{kind:'adjustment',quantity:inventoryText(-inventoryDecimal(q)),purchaseId:row.purchase_id,reason,originKey:`purchase-return:${lotKey(row)}:${row.version}`,reference:{purchaseLotKey:lotKey(row),purchaseOrdinal:row.ordinal,itemId:row.item_id,physicalReturnConfirmed:true,packOutflowDisposition:input.packOutflowDisposition??'closed'}});
  await update(c,row,{state:inventoryDecimal(q)===inventoryDecimal(net)?'returned':row.state});await audit(c,row,'return',reason,{movementId:id,quantity:q});return {movementId:id};
 }
 if(name==='correctPurchasePreparation'){
  if(row.nature!=='input'||row.state!=='applied'||await entered(c,row)!==row.actual_quantity)fail('La preparación tiene retiros o no está vigente; requiere conciliación específica.');
  const q=inventoryConvert(input.quantity,input.unit,row.unit);if(inventoryDecimal(q)<=0n)fail('Confirma la cantidad final real.');
  const entries=await activeEntries(c,row);if(entries.length!==1)fail('La preparación requiere revisión de sus movimientos.');
  const original=entries[0],baseline=await checkBaseline(c,product(data,row.product_id),{seq:original.seq,createdAt:original.occurred_at.toISOString()},input.baselineTreatment);
  await appendInventoryMovement(c,product(data,row.product_id),{kind:'reversal',quantity:inventoryText(-inventoryDecimal(original.quantity)),reversalOf:original.id,purchaseId:row.purchase_id,reason,originKey:`purchase-prepare-reverse:${original.id}`,reference:{purchaseLotKey:lotKey(row),...baseline}});
  await update(c,row,{state:'prepare'});await apply(c,data,row,q,'prepared',reason,baseline);return {};
 }
 if(!['reconcile','prepare'].includes(row.state))fail('El renglón ya fue resuelto; no puede registrarse dos veces.');
 const intent=purchaseInventoryIntent(row.source,data.products);
 if(input.productId!=null){
  const allowed=(row.source.conversionSnapshots||[row.source]).map(s=>String(s.productId??s.outputProductId));
  if(!allowed.includes(String(input.productId))&&String(intent.productId)!==String(input.productId)&&!(input.acknowledgeMapping===true&&product(data,input.productId)&&productActivity(product(data,input.productId))===row.activity))fail('El producto no está vinculado al snapshot de la compra.');
  row.product_id=String(input.productId);row.unit=product(data,row.product_id)?.unit;
 }
 if(input.acknowledgeMapping===true){
  if(!['finished','input'].includes(input.nature))fail('Confirma si se trata de producto terminado o insumo.');
  row.nature=input.nature;
  if(row.nature==='finished'&&input.action!=='already_included')row.quantity=inventoryConvert(input.quantity,input.unit,row.unit);
  await audit(c,row,'mapped',reason,{productId:row.product_id,nature:row.nature,manualMapping:true});
 }
 const p=product(data,row.product_id);if(p&&productActivity(p)!==row.activity)fail('El destino no pertenece a la actividad de la compra.');if(!p)fail('La relación es ambigua: configura y selecciona un destino respaldado por la compra.');
 if(name==='resolvePurchaseInventory'&&input.action==='already_included'){
  const evidence=(await c.query("SELECT * FROM inventory_movements WHERE id=$1 AND product_id=$2 AND quantity>=0 AND kind IN ('estimate','receipt','prepared','adjustment','correction')",[input.evidenceMovementId,row.product_id])).rows[0];
  if(!evidence)fail('Selecciona el conteo o movimiento que ya incorporó esta compra.');
  if((await c.query('SELECT 1 FROM inventory_movements WHERE reversal_of=$1',[evidence.id])).rowCount)fail('El movimiento de evidencia está compensado.');
  await update(c,row,{state:'included',actual_quantity:row.nature==='finished'?row.quantity:input.quantity?inventoryConvert(input.quantity,input.unit,row.unit):null});await audit(c,row,'included',reason,{evidenceMovementId:evidence.id});return {};
 }
 if(row.nature==='input'&&name!=='confirmPurchasePreparation')fail('Este insumo requiere confirmar su elaboración real.');
 if(row.nature!=='input'&&name==='confirmPurchasePreparation')fail('La compra no corresponde a un insumo preparable.');
 if(row.nature==='ambiguous')fail('No se puede determinar la naturaleza del renglón; conserva la compra para conciliación.');
 const q=row.nature==='input'?inventoryConvert(input.quantity,input.unit,p.unit):row.quantity;
 if(!q)fail('No hay equivalencia física inequívoca para esta presentación.');
 const event=row.nature==='input'?{createdAt:new Date().toISOString()}:{date:purchase.date};
 const baseline=await checkBaseline(c,p,event,input.baselineTreatment);
 await update(c,row,{unit:p.unit});
 return {movementId:await apply(c,data,row,q,row.nature==='input'?'prepared':'receipt',reason,baseline)};
}
export async function syncPurchaseInventory(c,before,data,name,args){
 if(!await purchaseInventoryAvailable(c)||!(await purchaseAutomationPolicy(c)).enabled)return;
 if(!['savePurchase','savePresentationPurchase','voidPurchase'].includes(name))return;
 for(const purchase of data.procurement.purchases){
  const old=before.procurement.purchases.find(p=>p.id===purchase.id);
  if(old&&JSON.stringify(old)===JSON.stringify(purchase))continue;
  const rows=(await c.query('SELECT *,quantity::text,actual_quantity::text FROM purchase_inventory WHERE purchase_id=$1 FOR UPDATE',[String(purchase.id)])).rows;
  const options=name==='voidPurchase'?args[1]??{}:args[0]?.inventoryCorrection??{};
  for(const row of rows){
   const item=purchase.items.find(i=>String(i.id)===row.item_id),removed=!item||!!purchase.voidedAt;
   if(removed&&['cancelled','returned'].includes(row.state))continue;
   if(!removed&&fingerprint(item)===row.fingerprint)continue;
   await audit(c,row,'revised','Cambio comercial de la compra',{previous:row.source,next:item??null,voided:!!purchase.voidedAt});
   const intent=item?purchaseInventoryIntent(item,data.products):null;
   const physicalChanged=removed||String(intent.productId)!==String(row.product_id)||intent.quantity!==row.quantity||item?.quantity!==row.source.quantity;
   if(row.state==='included'&&physicalChanged){if(!options.confirmed||!options.reason)fail('Confirma la revision fisica de la compra historica antes de modificarla.');
    if(removed&&options.disposition==='returned'){
     if(row.actual_quantity==null)fail('La cantidad historica no esta determinada: confirma primero el retiro real desde Inventarios.');
     const recorded=inventoryDecimal(await entered(c,row)),net=(await activeEntries(c,row)).length?recorded:inventoryDecimal(row.actual_quantity)+recorded;
     if(net>0n)await appendInventoryMovement(c,product(data,row.product_id),{kind:'adjustment',quantity:inventoryText(-net),purchaseId:row.purchase_id,reason:why(options),originKey:`purchase-historical-return:${lotKey(row)}:${row.version}`,reference:{purchaseLotKey:lotKey(row),purchaseOrdinal:row.ordinal,physicalReturnConfirmed:true}});
    }else if(removed&&options.disposition!=='retained')fail('Indica si el producto historico permanece o se retira fisicamente.');
    await audit(c,row,'historical_review',why(options),{newItem:item??null,disposition:options.disposition});}
   if(row.state==='applied'&&physicalChanged){
    if(!options.confirmed||!['returned','retained','adjust'].includes(options.disposition))fail('Confirma el destino físico del inventario antes de corregir o anular esta compra.');
    const reason=why(options),net=await entered(c,row);
    if(!removed&&inventoryDecimal(net)!==inventoryDecimal(row.actual_quantity))fail('La compra tiene retiros parciales: concilia su cantidad antes de corregirla.');
    if(!removed&&row.nature==='input'&&options.disposition!=='retained')fail('Corrige la cantidad elaborada desde Preparaciones; no se supone un nuevo rendimiento.');
    if(options.disposition==='returned'||options.disposition==='adjust'){
     const entries=await activeEntries(c,row);
     const baseline=options.disposition==='adjust'?await checkBaseline(c,product(data,row.product_id),{seq:entries[0]?.seq,date:old.date,createdAt:old.createdAt},options.baselineTreatment):{};
     if(inventoryDecimal(net)>0n)await appendInventoryMovement(c,product(data,row.product_id),{kind:'adjustment',quantity:inventoryText(-inventoryDecimal(net)),purchaseId:row.purchase_id,reason,originKey:`purchase-compensate:${lotKey(row)}:${row.version}`,reference:{purchaseLotKey:lotKey(row),purchaseOrdinal:row.ordinal,physicalDisposition:options.disposition,...baseline}});
     await audit(c,row,'compensated',reason,{quantity:net,...baseline});
     if(!removed&&options.disposition==='adjust'){
      if(intent.nature!=='finished'||!intent.quantity||!intent.productId)fail('La corrección requiere un destino terminado inequívoco.');
      await update(c,row,{source:item,fingerprint:fingerprint(item),product_id:String(intent.productId),quantity:intent.quantity,unit:intent.unit});await apply(c,data,row,intent.quantity,'receipt',reason,baseline);continue;
     }
    }
    await audit(c,row,'disposition',reason,{disposition:options.disposition});
   }
   if(removed)await update(c,row,{state:['applied','included'].includes(row.state)?options.disposition==='retained'?'included':'returned':'cancelled'});
   else await update(c,row,{source:item,fingerprint:fingerprint(item),ordinal:purchase.items.indexOf(item),quantity:intent.quantity,unit:intent.unit??row.unit,product_id:intent.productId==null?row.product_id:String(intent.productId)});
  }
  if(!purchase.voidedAt)for(const [ordinal,item]of purchase.items.entries())if(!rows.some(r=>r.item_id===String(item.id)))await register(c,data,purchase,item,ordinal,!!old||purchase.date<localDate());
 }
}
