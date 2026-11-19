import {ApiError} from './commands.mjs';
import {productInitialInventory} from '../../../src/domain/productInitialInventory.mjs';
import {executeInventoryCommand} from './inventory.mjs';
import {inventoryChange} from '../repositories/inventory.mjs';
import {inventoryDecimal} from '../../../src/services/inventoryUnits.js';
import {normalizeUnit} from '../../../src/utils/units.js';
export async function syncProductInitialInventory(c,before,data,name,args,{channel='WEB'}={}){
 const input=args?.[0],initial=input?.initialInventory==null?input?.initialInventory:structuredClone(input.initialInventory);
 const minimum=input?.minimum;
 if(initial===undefined&&minimum===undefined){
  if(args?.slice(1).some(a=>a?.initialInventory!==undefined)||input?.product?.initialInventory!==undefined||input?.rows?.some(r=>r.initialInventory!==undefined||r.product?.initialInventory!==undefined))throw new ApiError(422,'INITIAL_CREATION_SCOPE','El inicial integrado corresponde al alta individual. En lote o para productos existentes, utiliza Inventarios.');
  return;
 }
 if(!['addProduct','saveHardwareProductBundle'].includes(name)||name==='saveHardwareProductBundle'&&input.product?.id!=null)throw new ApiError(422,'INITIAL_CREATION_ONLY','El inicial en catÃ¡logo solo corresponde a un producto nuevo. Para existentes utiliza Inventarios y sus correcciones.');
 const added=data.products.filter(p=>!before.products.some(old=>String(old.id)===String(p.id)));
 if(added.length!==1)throw new ApiError(422,'INITIAL_CREATION_ONLY','Se requiere exactamente un producto nuevo.');
 const product=added[0];
 if(minimum!=null&&minimum!==''){
  try{
   if(normalizeUnit(product.unit)==='pieza'&&inventoryDecimal(minimum)%1000000n!==0n)throw Error('El inventario mínimo en piezas debe ser entero.');
  }catch(error){throw new ApiError(422,'INVALID_CREATION_MINIMUM',error.message);}
  await executeInventoryCommand(c,data,'inventoryReplenishment',[{
   productId:product.id,unit:product.unit,minimum,reasonCode:'replenishment_configuration',
   observations:'Inventario mínimo configurado al dar de alta el producto'
  }]);
 }
 if(initial===undefined)return;
 if(initial.physicalComposition?.presentationIndex!==undefined){
  const index=initial.physicalComposition.presentationIndex;
  const definitions=data.procurement.presentations.filter(p=>String(p.productId)===String(product.id));
  if(!Number.isInteger(index)||index<0||index>=definitions.length)throw new ApiError(422,'INVALID_COMPOSITION','Presentación física inválida.');
  initial.physicalComposition={presentationId:definitions[index].id,closedPackages:initial.physicalComposition.closedPackages,looseUnits:initial.physicalComposition.looseUnits};
 }
 let converted;
 try{converted=productInitialInventory(initial,product,data.procurement.presentations||[]);}catch(e){throw new ApiError(422,'INITIAL_CREATION_VALIDATION',e.message);}
 const result=await executeInventoryCommand(c,data,'inventoryInitial',[{...initial,productId:product.id,observations:initial.observations??''}]);
 await inventoryChange(c,'product_initial_creation',{productId:product.id,movementId:result.movementId,origin:channel==='MOVIL'?'ANDROID_PRODUCT_CREATION':'WEB_PRODUCT_CREATION',channel,confirmed:true,command:name,source:converted.source,quantity:converted.quantity,unit:converted.unit,reason:'Inventario inicial opcional confirmado al crear el producto'});
 return result;
}
