import {ApiError} from '../services/commands.mjs';
import {inventoryDecimal} from '../../../src/services/inventoryUnits.js';

const fail=message=>{throw new ApiError(422,'PRESENTATION_INVENTORY',message);};
async function available(c){
 return (await c.query("SELECT to_regclass('inventory_presentation_ledger') IS NOT NULL AS ok")).rows[0].ok;
}
export async function presentationStock(c,productId){
 if(!await available(c))return [];
 return (await c.query(`SELECT DISTINCT ON (presentation_id) presentation_id AS "presentationId",product_id AS "productId",factor::text,balance::text
  FROM inventory_presentation_ledger WHERE ($1::text IS NULL OR product_id=$1) ORDER BY presentation_id,seq DESC`,[productId??null])).rows;
}
export async function countPresentationStock(c,product,presentations,input){
 if(!await available(c))fail('Falta la migración de inventario por presentación.');
 if(product.activity!=='JARCERIA'||product.unit!=='pieza'||typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>1000)fail('Confirma el producto y el motivo del conteo.');
 const id=String(product.id), definitions=presentations.filter(p=>String(p.productId)===id&&p.active);
 if((await c.query("SELECT 1 FROM inventory_accounts WHERE product_id=$1 AND anchor_id IS NOT NULL",[id])).rowCount||
    (await c.query("SELECT 1 FROM inventory_pack_accounts WHERE product_id=$1 AND known",[id])).rowCount)fail('Existe un saldo anterior confirmado. Requiere un corte específico.');
 if((await c.query("SELECT 1 FROM inventory_pending WHERE product_id=$1 AND state='pending'",[id])).rowCount)fail('Resuelve primero los desgloses pendientes.');
 if(definitions.length<2||definitions.some(p=>p.unit!=='paquete'||p.baseUnit!==product.unit||!p.integerOnly||!Number.isSafeInteger(Number(p.factor))||Number(p.factor)<=1)||
    !Array.isArray(input.counts)||input.counts.length!==definitions.length||
    new Set(input.counts.map(x=>x.presentationId)).size!==definitions.length)fail('Confirma todas las presentaciones de paquetes y sus cantidades.');
 const current=await presentationStock(c,id);
 if(current.length&&current.some(p=>input.expected?.[p.presentationId]!==p.balance))
  fail('Cambió el saldo por presentación. Vuelve a abrir la ficha antes de conciliar.');
 for(const p of definitions){
  const value=input.counts.find(x=>x.presentationId===p.id)?.quantity;
  if(typeof value!=='string'||!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value)))fail('Cada conteo debe ser un número entero de paquetes.');
  const before=current.find(x=>x.presentationId===p.id);
  if(before&&Number(before.factor)!==Number(p.factor))fail('Conserva la equivalencia de la presentación.');
  await c.query('INSERT INTO inventory_presentation_ledger(product_id,presentation_id,factor,delta,balance,reason) VALUES($1,$2,$3,$4,$5,$6)',
   [id,p.id,p.factor,String(BigInt(value)-BigInt(before?.balance??0)),value,input.reason.trim()]);
 }
}

export async function validatePresentationStock(c,data){
 const stock=await presentationStock(c);
 for(const row of stock){
  const list=data.procurement.presentations.filter(p=>String(p.productId)===row.productId&&p.active);
  const p=list.find(p=>p.id===row.presentationId);
  if(!p||p.unit!=='paquete'||p.baseUnit!=='pieza'||!p.integerOnly||Number(p.factor)!==Number(row.factor)||
     list.some(p=>!stock.some(s=>s.presentationId===p.id)))fail('Conserva los formatos y equivalencias con saldo independiente.');
 }
}

export async function presentationMovement(c,stock,input,movementId){
 const byId=id=>stock.find(p=>p.presentationId===id);
 let selected, original;
 if(input.reversalOf){
  original=(await c.query('SELECT l.presentation_id,l.delta::text,m.kind FROM inventory_presentation_ledger l JOIN inventory_movements m ON m.id=l.movement_id WHERE l.movement_id=$1',[input.reversalOf])).rows[0];
  if(original?.kind==='sale'&&input.reference?.packReturnDisposition!=='sealed')fail('Confirma que el paquete vendido regresó cerrado.');
  selected=byId(original?.presentation_id);
 }else if(input.kind==='return'){
  if(input.reference?.packReturnDisposition!=='sealed')fail('Confirma que el paquete regresó cerrado.');
  const outputs=(await c.query(`SELECT l.presentation_id, (-sum(l.delta))::text AS sold FROM inventory_presentation_ledger l
   JOIN inventory_movements m ON m.id=l.movement_id WHERE m.sale_id=$1 AND m.kind='sale'
    AND NOT EXISTS(SELECT 1 FROM inventory_movements r WHERE r.reversal_of=m.id)
   GROUP BY l.presentation_id`,[input.saleId])).rows;
  const line=input.reference?.userReference?.presentationId?
   outputs.find(x=>x.presentation_id===input.reference.userReference.presentationId):outputs.length===1?outputs[0]:null;
  selected=byId(line?.presentation_id);
  if(!selected)fail('Identifica la presentación exacta de una venta posterior al corte.');
  const returned=(await c.query(`SELECT coalesce(sum(l.delta),0)::text AS n FROM inventory_presentation_ledger l
   JOIN inventory_movements m ON m.id=l.movement_id WHERE m.sale_id=$1 AND m.kind='return' AND l.presentation_id=$2
   AND NOT EXISTS(SELECT 1 FROM inventory_movements r WHERE r.reversal_of=m.id)`,[input.saleId,selected.presentationId])).rows[0].n;
  if(inventoryDecimal(input.quantity)>inventoryDecimal(String((BigInt(line.sold)-BigInt(returned))*BigInt(selected.factor))))fail('La devolución excede los paquetes vendidos de esta presentación.');
 }else if(input.kind==='sale'||input.kind==='receipt'||input.kind==='adjustment'&&input.reference?.purchaseLotKey){
  const ref=input.reference??{};
  const lot=ref.purchaseLotKey&&(await c.query(`SELECT pi.historical, pi.source, pu.date::text AS date FROM purchase_inventory pi
   JOIN purchases pu ON pu.id=pi.purchase_id WHERE pi.purchase_id=$1 AND pi.purchase_id||':'||pi.item_id=$2`,[input.purchaseId,ref.purchaseLotKey])).rows[0];
  const choice=ref.physicalPresentation??ref.sourceSnapshot?.commercialPurchase??lot?.source?.commercialPurchase??ref.userReference?.presentation;
  selected=byId(choice?.presentationId??choice?.id);
  if(selected&&Number(choice.factor)!==Number(selected.factor))fail('La equivalencia del movimiento difiere de la registrada.');
  if(input.kind==='receipt'){
   const purchase=(await c.query("SELECT date::text,record->>'createdAt' AS created FROM purchases WHERE id=$1",[input.purchaseId])).rows[0];
   const cut=(await c.query("SELECT min(recorded_at) AS at,min((recorded_at AT TIME ZONE 'America/Mexico_City')::date)::text AS day FROM inventory_presentation_ledger WHERE product_id=$1",[stock[0].productId])).rows[0];
   if(!purchase||purchase.date<cut.day||!(Date.parse(purchase.created)>=Date.parse(cut.at))||lot?.historical)fail('La compra es anterior al conteo. Concilia su recepción sin duplicar existencias.');
  }
  if(input.kind==='adjustment'&&!(await c.query(`SELECT 1 FROM inventory_presentation_ledger l JOIN inventory_movements m ON m.id=l.movement_id
   WHERE m.kind='receipt' AND m.reference->>'purchaseLotKey'=$1 AND l.presentation_id=$2`,[ref.purchaseLotKey,selected?.presentationId??null])).rowCount)
   fail('La recepción es anterior al corte; requiere conciliación del formato.');
  if(input.kind==='adjustment'&&ref.packOutflowDisposition!=null&&ref.packOutflowDisposition!=='closed')
   fail('Este producto solo admite movimientos de paquetes completos.');
 }
 if(!selected||input.reference?.includedInAnchorId)fail('Usa el conteo por presentación o una operación vinculada a un formato confirmado.');
 const factor=BigInt(selected.factor)*1000000n,quantity=inventoryDecimal(input.quantity);
 if(quantity%factor!==0n)fail('El movimiento debe corresponder a paquetes completos.');
 const delta=quantity/factor;
 if(original&&delta!==-BigInt(original.delta))fail('La compensación debe coincidir con el movimiento original.');
 const balance=BigInt(selected.balance)+delta;
 if(balance<0n)fail('Existencia insuficiente en esta presentación.');
 await c.query('INSERT INTO inventory_presentation_ledger(product_id,presentation_id,factor,delta,balance,movement_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7)',
  [selected.productId,selected.presentationId,selected.factor,String(delta),String(balance),movementId,input.reason]);
}
