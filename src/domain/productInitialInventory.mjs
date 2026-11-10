import {inventoryConvert,inventoryDecimal,inventoryText} from '../services/inventoryUnits.js';
import {composition} from './packInventory.mjs';
export function productInitialInventory(input,product,presentations=[]){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Captura un inventario inicial válido o deja la opción desmarcada.');
 if(input.physicalComposition){
  const p=presentations.find(p=>p.id===input.physicalComposition.presentationId&&String(p.productId)===String(product.id)&&p.active&&p.unit==='paquete'&&p.baseUnit===product.unit);
  const physical=composition(input.physicalComposition,p);
  if(input.quantity!=null&&input.quantity!==''&&inventoryDecimal(inventoryConvert(input.quantity,input.unit,product.unit))!==inventoryDecimal(physical.total))throw Error('El total indicado y la composición no coinciden.');
  return {quantity:physical.total,unit:product.unit,source:{quantity:physical.total,unit:product.unit,physicalComposition:physical}};
 }
 const amount=inventoryDecimal(input.quantity);if(amount<0n)throw Error('El inventario inicial no puede ser negativo.');
 let quantity,source;
 if(input.presentationId){
  const p=presentations.find(p=>p.id===input.presentationId&&String(p.productId)===String(product.id)&&p.active);
  if(!p||p.unit!==input.unit)throw Error('Selecciona una presentación activa del producto.');
  if(p.integerOnly&&amount%1000000n!==0n)throw Error('La cantidad de esta presentación debe ser entera.');
  const scaled=amount*inventoryDecimal(p.factor);if(scaled%1000000n!==0n)throw Error('La conversión supera seis decimales; no se redondea el inventario.');
  quantity=inventoryConvert(inventoryText(scaled/1000000n),p.baseUnit,product.unit);
  source={presentationId:p.id,presentationName:p.name,factor:p.factor,baseUnit:p.baseUnit};
 }else quantity=inventoryConvert(input.quantity,input.unit,product.unit);
 return {quantity,unit:product.unit,source:{quantity:String(input.quantity),unit:input.unit,...source}};
}
