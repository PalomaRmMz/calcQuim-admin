import {ApiError} from './commands.mjs';
import {productInitialInventory} from '../../../src/domain/productInitialInventory.mjs';
import {executeInventoryCommand} from './inventory.mjs';
import {inventoryChange} from '../repositories/inventory.mjs';
export async function syncProductInitialInventory(c,before,data,name,args,{channel='WEB'}={}){
 const input=args?.[0],initial=input?.initialInventory;
 if(initial===undefined){
  if(args?.slice(1).some(a=>a?.initialInventory!==undefined)||input?.product?.initialInventory!==undefined||input?.rows?.some(r=>r.initialInventory!==undefined||r.product?.initialInventory!==undefined))throw new ApiError(422,'INITIAL_CREATION_SCOPE','El inicial integrado corresponde al alta individual. En lote o para productos existentes, utiliza Inventarios.');
  return;
 }
 if(!['addProduct','saveHardwareProductBundle'].includes(name)||name==='saveHardwareProductBundle'&&input.product?.id!=null)throw new ApiError(422,'INITIAL_CREATION_ONLY','El inicial en catálogo solo corresponde a un producto nuevo. Para existentes utiliza Inventarios y sus correcciones.');
 const added=data.products.filter(p=>!before.products.some(old=>String(old.id)===String(p.id)));
 if(added.length!==1)throw new ApiError(422,'INITIAL_CREATION_ONLY','Se requiere exactamente un producto nuevo.');
 const product=added[0];let converted;
 try{converted=productInitialInventory(initial,product,data.procurement.presentations||[]);}catch(e){throw new ApiError(422,'INITIAL_CREATION_VALIDATION',e.message);}
 const result=await executeInventoryCommand(c,data,'inventoryInitial',[{...initial,productId:product.id,observations:initial.observations??''}]);
 await inventoryChange(c,'product_initial_creation',{productId:product.id,movementId:result.movementId,origin:channel==='MOVIL'?'ANDROID_PRODUCT_CREATION':'WEB_PRODUCT_CREATION',channel,confirmed:true,command:name,source:converted.source,quantity:converted.quantity,unit:converted.unit,reason:'Inventario inicial opcional confirmado al crear el producto'});
 return result;
}
