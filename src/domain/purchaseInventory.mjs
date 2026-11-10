import {inventoryConvert,inventoryDecimal} from '../services/inventoryUnits.js';
import {productActivity} from './activityScope.mjs';
import {outputForPurchase} from '../utils/procurementUtils.js';
export function purchaseInventoryIntent(item,products){
 const choices=item.commercialPurchase?[{productId:item.productId}]:item.conversionSnapshots??[item];
 const ids=[...new Set(choices.map(c=>c.productId??c.outputProductId).filter(id=>id!=null).map(String))];
 const product=ids.length===1?products.find(p=>String(p.id)===ids[0]):null;
 const nature=item.commercialPurchase||item.sourcingType==='READY_TO_USE'?'finished':['BASE','CONCENTRATE','HYDRONEO'].includes(item.sourcingType)?'input':'ambiguous';
 const snapshot=choices.find(c=>String(c.productId??c.outputProductId)===String(product?.id));
 let quantity=null,expectedOutput=null;
 if(product){
  try{
   if(nature==='finished')quantity=item.commercialPurchase?inventoryConvert(item.commercialPurchase.baseQuantity,item.commercialPurchase.baseUnit,product.unit):inventoryConvert(item.quantity,item.unit,product.unit);
   else if(nature==='input')expectedOutput=outputForPurchase({...snapshot,quantity:item.quantity,unit:item.unit});
   if(quantity&&inventoryDecimal(quantity)<=0n)quantity=null;
  }catch{/* Unidades ambiguas requieren conciliación; nunca se adivina el contenido. */}
 }
 return {productId:product?.id??null,activity:product?productActivity(product):item.commercialPurchase?'JARCERIA':'LIMPIEZA',nature,quantity,unit:product?.unit??null,expectedOutput,expectedUnit:snapshot?.yield?.outputUnit??null};
}
export const purchaseInventoryStates={reconcile:'Pendiente de conciliación',prepare:'Insumo pendiente de preparación',applied:'Entrada registrada',included:'Ya incluido en inventario',cancelled:'Compra cancelada',returned:'Entrada compensada'};
export const purchaseInventoryActions={registered:'Compra clasificada',receipt:'Entrada de producto terminado',prepared:'Elaboración confirmada',return:'Retiro físico',revised:'Compra corregida o anulada',mapped:'Destino conciliado manualmente',recognized:'Movimiento histórico reconocido',included:'Compra ya incluida en un movimiento',manual_included:'Ya incorporada manualmente: declaración del propietario, sin nueva entrada',compensated:'Compensación de inventario',disposition:'Destino físico confirmado',historical_review:'Revisión de compra histórica'};
