import {packOptions,composition,consumeUnits,consumeClosed,whole} from '../../../src/domain/packInventory.mjs';
import {ApiError} from '../services/commands.mjs';
const fail=message=>{throw new ApiError(422,'PACK_INVENTORY_VALIDATION',message);};
export async function packAvailable(c){return (await c.query("SELECT to_regclass('inventory_pack_accounts') IS NOT NULL AS ok")).rows[0].ok;}
export async function packEnabled(c){return await packAvailable(c)&&!!(await c.query("SELECT (policy->'packAutomation'->>'enabled')::boolean AS ok FROM inventory_settings WHERE singleton=true")).rows[0]?.ok;}
export async function baseStock(c,id){
 const r=(await c.query(`SELECT a.anchor_id,m.seq,m.quantity::text,
 (SELECT id FROM inventory_movements WHERE product_id=a.product_id AND kind='estimate' ORDER BY seq LIMIT 1) AS initial_id,
 (SELECT reference->>'nextQuantity' FROM inventory_changes WHERE action='initial_correction' AND reference->>'initialMovementId'=m.id::text ORDER BY seq DESC LIMIT 1) AS corrected,
 (SELECT COALESCE(sum(quantity),0)::text FROM inventory_movements x WHERE x.product_id=a.product_id AND x.seq>m.seq AND x.reference->>'includedInAnchorId' IS DISTINCT FROM m.id::text) AS later
 FROM inventory_accounts a LEFT JOIN inventory_movements m ON m.id=a.anchor_id WHERE a.product_id=$1`,[String(id)])).rows[0];
 if(!r?.anchor_id)return null;
 const {inventoryDecimal,inventoryText}=await import('../../../src/services/inventoryUnits.js');return inventoryText(inventoryDecimal(r.anchor_id===r.initial_id?(r.corrected??r.quantity):r.quantity)+inventoryDecimal(r.later));
}
const unknown=(row,total)=>({known:false,presentationId:row?.presentation_id??null,factor:row?.factor==null?null:String(row.factor),closedPackages:null,looseUnits:null,total});
function state(row,total){return row?.known?{known:true,presentationId:row.presentation_id,factor:String(row.factor),closedPackages:String(row.closed_packages),looseUnits:String(row.loose_units),total}:unknown(row,total);}
async function definitions(c,product){return (await c.query('SELECT record FROM commercial_presentations WHERE product_id=$1',[String(product.id)])).rows.map(r=>r.record);}
async function account(c,product,requested){
 if(product.activity!=='JARCERIA'||product.unit!=='pieza')return null;
 if(!await packEnabled(c))return null;
 const definitionsList=await definitions(c,product),options=packOptions(product,definitionsList);
 let row=(await c.query('SELECT * FROM inventory_pack_accounts WHERE product_id=$1 FOR UPDATE',[String(product.id)])).rows[0];
 if(!row&&!options.length)return null;
 if(!row){const pack=requested?options.find(p=>p.id===requested):options.length===1?options[0]:null;await c.query('INSERT INTO inventory_pack_accounts(product_id,presentation_id,factor) VALUES($1,$2,$3)',[String(product.id),pack?.id??null,pack?.factor??null]);row=(await c.query('SELECT * FROM inventory_pack_accounts WHERE product_id=$1 FOR UPDATE',[String(product.id)])).rows[0];}
 const pack=definitionsList.find(p=>p.id===(requested??row.presentation_id));
 const existing=definitionsList.find(p=>p.id===row.presentation_id);
 if(row.known&&(!existing||Number(existing.factor)!==Number(row.factor)||existing.baseUnit!==product.unit))fail('La presentación física cambió: concilia antes de modificar su contenido.');
 if(requested&&!options.some(p=>p.id===requested))fail('La presentación cerrada no está disponible para este producto.');
 return {row,pack,definitionsList};
}
async function event(c,product,movement,action,before,after,reference){await c.query('INSERT INTO inventory_pack_events(product_id,movement_id,action,before_state,after_state,reference) VALUES($1,$2,$3,$4,$5,$6)',[String(product.id),movement??null,action,JSON.stringify(before),JSON.stringify(after),JSON.stringify(reference)]);}
async function save(c,product,next){await c.query('UPDATE inventory_pack_accounts SET presentation_id=$2,factor=$3,known=$4,closed_packages=$5,loose_units=$6,version=version+1 WHERE product_id=$1',[String(product.id),next.presentationId,next.factor,next.known,next.closedPackages,next.looseUnits]);}
function explicit(source,pack){
 if(source?.physicalComposition)return composition(source.physicalComposition,pack);
 // Una unidad de captura o una equivalencia no acredita el estado del empaque.
 return null;
}
async function applyPackMovement(c,product,input,movementId){
 const source=input.reference?.userReference?.source;
 const requested=source?.physicalComposition?.presentationId??(source?.presentationId&&source.unit==='paquete'?source.presentationId:null);
 const entry=await account(c,product,requested);if(!entry){if(source?.physicalComposition)fail('Activa el seguimiento y configura las presentaciones cerrada e individual antes de registrar composición.');return;}
 const {row,pack}=entry,total=await baseStock(c,product.id),before=state(row,total);
 const {inventoryDecimal,inventoryText}=await import('../../../src/services/inventoryUnits.js');
 const delta=inventoryDecimal(input.quantity),abs=inventoryText(delta<0n?-delta:delta),quantity=whole(abs);
 let after,action='composition_unknown',reference={reason:input.reason,source:input.reference??{},quantity:input.quantity};
 if(before.known&&whole(before.total??0)!==whole(before.closedPackages)*whole(before.factor)+whole(before.looseUnits))fail('El saldo y la composición no coinciden; concilia desde Inventarios.');
 const anchor=(await c.query('SELECT anchor_id FROM inventory_accounts WHERE product_id=$1',[String(product.id)])).rows[0]?.anchor_id;
 if(input.reference?.includedInAnchorId===anchor){await event(c,product,movementId,'already_included',before,before,reference);return;}
 const nextTotal=input.kind==='estimate'?String(input.quantity):total==null?null:inventoryText(inventoryDecimal(total)+delta);
 if(input.kind!=='estimate'&&delta<0n&&total!=null&&inventoryDecimal(nextTotal)<0n)fail('Existencias insuficientes; no se permite un descuento físico superior al saldo conocido.');
 if(input.kind==='estimate'){
  after=explicit(source,pack)??unknown(row,nextTotal);action=after.known?'physical_count':'count_without_composition';
  if(after.known&&inventoryDecimal(after.total)!==delta)fail('La composición debe coincidir exactamente con el total del inicial o conteo.');
 }else{
  let presentation=input.reference?.physicalPresentation;
  if(!presentation&&input.reference?.sourceSnapshot?.commercialPurchase)presentation=input.reference.sourceSnapshot.commercialPurchase;
  if(!presentation&&input.reference?.purchaseLotKey){const r=(await c.query("SELECT source->'commercialPurchase' AS p FROM purchase_inventory WHERE purchase_id=$1 AND item_id=$2",[input.purchaseId,input.reference.purchaseLotKey.slice(String(input.purchaseId).length+1)])).rows[0];presentation=r?.p;}
  let original;
  if(input.reversalOf){original=(await c.query('SELECT * FROM inventory_movements WHERE id=$1',[input.reversalOf])).rows[0];presentation=original?.reference?.physicalPresentation??original?.reference?.sourceSnapshot?.commercialPurchase;}
  if((input.kind==='return'||original?.kind==='sale')&&!presentation&&(input.saleId??original?.sale_id)){const r=(await c.query('SELECT record FROM sale_items WHERE sale_id=$1 AND product_id=$2',[String(input.saleId??original.sale_id),String(product.id)])).rows.map(r=>r.record.presentationSnapshot).filter(Boolean);presentation=r.find(p=>Number(p.factor)>1)??r[0];}
  const isPack=presentation&&(presentation.id??presentation.presentationId)===row.presentation_id;
  const isUnit=presentation&&Number(presentation.factor)===1;
  if(isPack&&Number(presentation.factor)!==Number(row.factor))fail('La equivalencia histórica del paquete difiere de la configuración física.');
  if(input.kind==='sale'&&presentation?.unit==='paquete'&&Number(presentation.factor)>1&&!isPack)fail('Selecciona y concilia la presentación cerrada desde Inventarios antes de vender paquetes.');
  if(delta<0n){
   if(input.kind==='sale'&&isPack){if(!before.known)fail('La composición física es desconocida: concilia los paquetes cerrados desde Inventarios.');if(quantity%whole(row.factor))fail('Cantidad de paquete no representable.');after=consumeClosed(before,String(quantity/whole(row.factor)));action='sale_package';}
   else if(before.known&&(isUnit||input.kind==='sale'&&!isPack||input.reference?.packOutflowDisposition==='units')){
    const result=consumeUnits(before,String(quantity));if(result.opened!=='0')await event(c,product,movementId,'automatic_open',before,result.afterOpen,{openedPackages:result.opened,factor:before.factor,reason:'Apertura automática para atender unidades sueltas; sin movimiento base adicional'});
    after=result.after;action=input.kind==='sale'?'sale_units':'outflow_units';
   }else if(before.known&&isPack){if(quantity%whole(row.factor))fail('Confirma la composición física del retiro parcial.');after=consumeClosed(before,String(quantity/whole(row.factor)));action='outflow_packages';}
   else after=unknown(row,nextTotal);
  }else{
   const disposition=input.reference?.packReturnDisposition??input.reference?.userReference?.packReturnDisposition;
   const returnMove=input.kind==='return'||original?.kind==='sale';
   const originalPack=isPack;
   if(before.known&&returnMove){
    if(disposition==='sealed'){if(!pack||quantity%whole(row.factor))fail('El retorno cerrado debe coincidir con paquetes completos.');after=composition({presentationId:pack.id,closedPackages:String(whole(before.closedPackages)+quantity/whole(row.factor)),looseUnits:before.looseUnits},pack);action='return_packages';}
    else if(disposition==='loose'||presentation&&!originalPack){after=composition({presentationId:pack.id,closedPackages:before.closedPackages,looseUnits:String(whole(before.looseUnits)+quantity)},pack);action='return_loose';}
    else after=unknown(row,nextTotal);
   }else if(before.known&&isPack){if(quantity%whole(row.factor))fail('La compra no corresponde a paquetes enteros.');after=composition({presentationId:pack.id,closedPackages:String(whole(before.closedPackages)+quantity/whole(row.factor)),looseUnits:before.looseUnits},pack);action='purchase_packages';}
   else if(before.known&&isUnit){after=composition({presentationId:pack.id,closedPackages:before.closedPackages,looseUnits:String(whole(before.looseUnits)+quantity)},pack);action='purchase_units';}
   else after=unknown(row,nextTotal);
  }
  if(!after.known){reference.physicalPresentation=presentation??null;if(input.kind==='sale')action='sale_units_unknown';else if(input.kind==='return'||original?.kind==='sale')action='return_unknown';else if(input.kind==='receipt'&&presentation)action=presentation.unit==='paquete'?'purchase_packages_unknown':'purchase_units_unknown';}
 }
 if(after.known&&nextTotal!=null&&inventoryDecimal(after.total)!==inventoryDecimal(nextTotal))fail('La composición resultante no coincide con el movimiento base.');
 await save(c,product,after);await event(c,product,movementId,action,before,after,reference);
}
export async function reconcilePack(c,product,spec,{reason,initialCorrection=false,initialMovementId,expectedVersion,previousTotal,initialPhysicalComposition}={}){
 const entry=await account(c,product,spec.presentationId);if(!entry)fail('Seguimiento de paquetes no habilitado para este producto.');
 const total=await baseStock(c,product.id),after=composition(spec,entry.pack),before=state(entry.row,total);
 if(expectedVersion!=null&&String(expectedVersion)!==String(entry.row.version))fail('La composición cambió; recarga antes de conciliar.');
 if(initialCorrection)before.total=previousTotal??(entry.row.known?String(whole(before.closedPackages)*whole(before.factor)+whole(before.looseUnits)):null);
 if(total==null||whole(total)!==whole(after.total))fail('El total de la composición debe coincidir con el saldo conocido; registra primero el inicial o un conteo físico.');
 await save(c,product,after);await event(c,product,null,initialCorrection?'initial_correction':'reconciliation',before,after,{reason,initialMovementId,...(initialPhysicalComposition?{initialPhysicalComposition}:{})});
}
export async function invalidatePackCorrection(c,product,reason,previousTotal){const entry=await account(c,product);if(!entry)return;const total=await baseStock(c,product.id),before=state(entry.row,previousTotal??total),after=unknown(entry.row,total);await save(c,product,after);await event(c,product,null,'correction_without_composition',before,after,{reason});}
export async function syncPackMovement(c,product,input,id){try{return await applyPackMovement(c,product,input,id);}catch(e){if(e instanceof ApiError)throw e;fail(e.message);}}
export async function enablePackInventory(c){if(!await packAvailable(c))fail('La gestión de paquetes requiere la migración 012 autorizada.');await c.query("UPDATE inventory_settings SET policy=jsonb_set(policy,'{packAutomation}','{\"enabled\":true}'::jsonb) WHERE singleton=true");}
export async function validatePackDefinitions(c,data){if(!await packEnabled(c))return;for(const row of (await c.query('SELECT * FROM inventory_pack_accounts WHERE known=true')).rows){const p=data.procurement.presentations.find(p=>p.id===row.presentation_id),product=data.products.find(p=>String(p.id)===row.product_id);if(!p||!product||product.activity!=='JARCERIA'||p.productId!=product.id||Number(p.factor)!==Number(row.factor)||p.baseUnit!==product.unit)fail('La presentación tiene composición física registrada; conserva ID, producto y contenido. Concilia antes de cambiar su equivalencia.');}}
export async function packInventorySnapshot(c){if(!await packAvailable(c))return {available:false};return JSON.parse(JSON.stringify({available:true,enabled:await packEnabled(c),accounts:(await c.query('SELECT *,factor::text,closed_packages::text,loose_units::text,version::text FROM inventory_pack_accounts ORDER BY product_id')).rows,events:(await c.query('SELECT *,seq::text FROM inventory_pack_events ORDER BY inventory_pack_events.seq')).rows}));}
export async function readPackInventory(c,data,inventory){
 if(!await packEnabled(c))return null;const snapshot=await packInventorySnapshot(c);
 return {enabled:true,products:data.products.flatMap(product=>{const options=packOptions(product,data.procurement.presentations||[]),row=snapshot.accounts.find(r=>r.product_id===String(product.id));if(!options.length&&!row)return [];return [{productId:product.id,options,version:row?.version??'0',...state(row,inventory.products.find(p=>String(p.productId)===String(product.id))?.quantity??null)}];}),events:snapshot.events};
}
