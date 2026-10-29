import { randomUUID } from 'node:crypto';
import { normalizeUnit } from '../../../src/utils/units.js';
import { inventoryDecimal,inventoryText } from '../../../src/services/inventoryUnits.js';
// El hash de respaldos anteriores no incluía los campos derivados del inventario inicial.
export function inventorySnapshot(view,version=3){
  const snapshot=JSON.parse(JSON.stringify(view));
  if(version===3)return snapshot;
  delete snapshot.initialCaptureMode;
  if(version===2)return snapshot;
  if(version!==1)throw new Error('INVENTORY_SNAPSHOT_VERSION_UNSUPPORTED');
  delete snapshot.initialControlEnabled;
  for(const product of snapshot.products)for(const field of ['initialMovementId','initialOriginalQuantity','initialQuantity','initialRecordedAt','initialCorrectionAllowed','initialCorrectionBlockedReason'])delete product[field];
  return snapshot;
}
export async function inventoryAvailable(c){return (await c.query("SELECT to_regclass('inventory_settings') IS NOT NULL AS available")).rows[0].available;}
export async function inventoryPolicy(c){return (await c.query('SELECT sales_enabled,policy FROM inventory_settings WHERE singleton=true')).rows[0];}
export async function inventoryChange(c,action,reference){await c.query('INSERT INTO inventory_changes(action,reference) VALUES($1,$2)',[action,JSON.stringify(reference)]);}
export async function inventoryAccount(c,product){
  const unit=normalizeUnit(product.unit);if(!unit)throw new Error('Unidad de producto no compatible con inventario.');
  await c.query('INSERT INTO inventory_accounts(product_id,unit) VALUES($1,$2) ON CONFLICT(product_id) DO NOTHING',[String(product.id),unit]);
  const account=(await c.query('SELECT * FROM inventory_accounts WHERE product_id=$1 FOR UPDATE',[String(product.id)])).rows[0];
  if(account.unit!==unit)throw new Error('El producto cambió de unidad; requiere revisión explícita.');
  return account;
}
export async function appendInventoryMovement(c,product,input){
  await inventoryAccount(c,product);
  const id=randomUUID();
  const fields={id,product_id:String(product.id),kind:input.kind,quantity:input.quantity,unit:normalizeUnit(product.unit),certainty:input.certainty??'confirmed',reason:input.reason,occurred_at:input.occurredAt??new Date().toISOString(),purchase_id:input.purchaseId??null,sale_id:input.saleId??null,sale_ordinal:input.saleOrdinal??null,reversal_of:input.reversalOf??null,origin_key:input.originKey??null,reference:JSON.stringify(input.reference??{})};
  const names=Object.keys(fields);
  await c.query(`INSERT INTO inventory_movements(${names.join(',')}) VALUES(${names.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(fields));
  return id;
}
export async function readInventory(c,data){
  if(!await inventoryAvailable(c))return {enabled:false,products:[],pending:[],movements:[],changes:[]};
  const accounts=(await c.query('SELECT * FROM inventory_accounts')).rows;
  const movements=(await c.query('SELECT *,seq::text,quantity::text FROM inventory_movements ORDER BY inventory_movements.seq DESC')).rows;
  const replenishment=(await c.query('SELECT *,minimum::text,usual_batch::text FROM inventory_replenishment')).rows;
  const pending=(await c.query('SELECT *,quantity::text FROM inventory_pending ORDER BY created_at DESC')).rows;
  const changes=(await c.query('SELECT * FROM inventory_changes ORDER BY seq DESC')).rows;
  const products=data.products.map(product=>{
    const id=String(product.id),account=accounts.find(a=>a.product_id===id),anchor=movements.find(m=>m.id===account?.anchor_id),rows=movements.filter(m=>m.product_id===id&&anchor&&BigInt(m.seq)>BigInt(anchor.seq)&&m.reference.includedInAnchorId!==anchor.id);
    let quantity=null;
    const first=movements.filter(m=>m.product_id===id&&m.kind==='estimate').at(-1);
    const corrections=changes.filter(c=>c.action==='initial_correction'&&c.reference.initialMovementId===first?.id);
    const initialQuantity=first?(corrections[0]?.reference.nextQuantity??first.quantity):null;
    if(anchor)quantity=inventoryText(inventoryDecimal(anchor.id===first?.id?initialQuantity:anchor.quantity)+rows.reduce((sum,m)=>sum+inventoryDecimal(m.quantity),0n));
    const config=replenishment.find(r=>r.product_id===id);
    return {productId:product.id,name:product.name,categoryId:product.categoryId??null,lineId:product.lineId??null,unit:account?.unit??normalizeUnit(product.unit),status:!anchor?'unknown':rows.length?'calculated':'estimated',quantity,anchorId:anchor?.id??null,initialMovementId:first?.id??null,initialOriginalQuantity:first?.quantity??null,initialQuantity,initialRecordedAt:first?.recorded_at??null,initialCorrectionAllowed:!!first&&anchor?.id===first.id,initialCorrectionBlockedReason:first&&anchor?.id!==first.id?'Existe un conteo posterior. Corregir el inicial requiere revisión; utiliza un nuevo conteo para ajustar el saldo actual.':null,minimum:config?.minimum??null,usualBatch:config?.usual_batch??null,low:quantity!==null&&config?.minimum!=null&&inventoryDecimal(quantity)<=inventoryDecimal(config.minimum),negative:quantity!==null&&inventoryDecimal(quantity)<0n,movementsWithoutBasis:!anchor?movements.filter(m=>m.product_id===id).length:0};
  });
  const purchaseReviews=data.procurement.purchases.filter(p=>{
    const events=changes.filter(e=>String(e.reference.purchaseId)===String(p.id)&&['purchase_review_required','purchase_review_confirmed'].includes(e.action));
    return events[0]?.action==='purchase_review_required';
  }).map(p=>({purchaseId:p.id,date:p.date,voided:!!p.voidedAt}));
  return {enabled:true,initialControlEnabled:true,initialCaptureMode:'automatic',policy:await inventoryPolicy(c),products,pending,movements,changes,purchaseReviews};
}
