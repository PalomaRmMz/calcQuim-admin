import {saveSupplierPurchaseTiers} from '../../../src/domain/supplierPurchaseTiers.mjs';
import {presentationPurchaseCost} from '../../../src/domain/purchaseCost.mjs';
import {normalizeText} from '../../../src/utils/catalogUtils.js';
import {convertQuantity} from '../../../src/utils/units.js';
import {hardwareCategory,saveHardwareCategory,deleteHardwareCategory,validateHardwareName} from '../../../src/domain/hardwareCatalog.mjs';
import {assertSupplierActivity,purchaseActivity} from '../../../src/domain/activityScope.mjs';
import {createHash} from 'node:crypto';
import {referenceCommerce} from '../../../src/domain/referenceCommerce.mjs';
import {prepareFinishedPurchase} from '../../../src/services/finishedProductFlow.js';
import {baseQuantity,decimal} from '../../../src/domain/commerce.mjs';
import {randomUUID} from 'node:crypto';
import {validatePresentation,validateService,sameId} from '../../../src/domain/commerce.mjs';
export const commerceCommands=['saveSupplierPurchaseTiers','saveHardwareCategory','deleteHardwareCategory','saveHardwareProductsBatch','saveHardwareProductBundle','savePresentation','saveService','saveCommerceProduct','savePresentationPurchase','previewCommerceImport','importCommerceCatalog'];
export function saveCommerce(data,name,input){
 if(data.procurement.commerceSchema!==1)throw new Error('Migración comercial pendiente.');
 if(name==='saveSupplierPurchaseTiers')return saveSupplierPurchaseTiers(data,input);
 if(name==='saveHardwareCategory')return saveHardwareCategory(data,input);
 if(name==='deleteHardwareCategory')return deleteHardwareCategory(data,input);
 if(name==='saveHardwareProductsBatch'){
   if(!Array.isArray(input.rows)||!input.rows.length||input.rows.length>100)throw Error('Captura entre 1 y 100 productos.');
   const next=structuredClone(data),errors=[];
   input.rows.forEach((row,index)=>{try{if(row.product?.id||row.presentations?.some(p=>p.id))throw Error('El alta por lote solo admite productos nuevos.');saveCommerce(next,'saveHardwareProductBundle',row);}catch(e){errors.push(`Renglón ${index+1}: ${e.message}`);}});
   if(errors.length)throw Error(errors.join('\n'));
   Object.assign(data,next);return {ok:true,count:input.rows.length};
 }
 if(name==='saveHardwareProductBundle'){
   if(!Array.isArray(input.presentations)||(!input.presentations.length&&!(input.product?.pricePending===true&&input.product?.available===false)))throw Error('Agrega una presentación con precio o marca el producto no disponible con precio pendiente.');
   if(input.product?.pricePending===true&&(input.product.available!==false))throw Error('Un precio pendiente no puede tener presentaciones de venta habilitadas.');
   if(!input.product?.pricePending&&input.product?.id==null&&input.presentations.some(p=>p.saleEnabled!==false&&(typeof p.price!=='number'||!Number.isFinite(p.price)||p.price<=0)))throw Error('Confirma un precio positivo para cada presentación de venta.');
   const next=structuredClone(data),result=saveCommerce(next,'saveCommerceProduct',input.product);
   const existing=(data.procurement.presentations||[]).filter(p=>sameId(p.productId,result.id));
   if(existing.some(p=>!input.presentations.some(r=>r.id===p.id)))throw Error('Conserva las presentaciones anteriores; puedes desactivarlas.');
   const ids=new Set();
   for(const p of input.presentations){
     if(p.id&&ids.has(p.id))throw Error('Presentación repetida.');
     const previous=(data.procurement.presentations||[]).find(r=>r.id===p.id);
     if(previous&&!sameId(previous.productId,result.id))throw Error('La presentación pertenece a otro producto.');
     if(p.id)ids.add(p.id);
     saveCommerce(next,'savePresentation',{...p,productId:result.id});
   }
   Object.assign(data,next);return result;
 }
 if(name==='saveCommerceProduct'){
   if(['autoOpenPackages','pricePending'].some(k=>input[k]!==undefined&&typeof input[k]!=='boolean'))throw Error('Confirma las opciones del producto.');
   if(!input.name?.trim()||!['pieza','kg','gramo','bolsa','envase','botella'].includes(input.unit))throw Error('Nombre y unidad base requeridos.');
   const old=data.products.find(p=>sameId(p.id,input.id));if(old&&old.activity!=='JARCERIA')throw Error('Conserva el artículo histórico de limpieza.');
   if(old&&old.unit!==input.unit)throw Error('Conserva la unidad base; crea otro artículo si es distinto.');
   const id=old?.id??Math.max(0,...data.products.map(p=>Number(p.id)))+1;
   const hardwareCategoryId=input.hardwareCategoryId===undefined?old?.hardwareCategoryId??null:input.hardwareCategoryId===''?null:input.hardwareCategoryId;
   if(hardwareCategoryId!=null&&!hardwareCategory(data,hardwareCategoryId))throw Error('Selecciona una categoría de jarcería válida.');
   const row={...old,id,hardwareCategoryId,name:validateHardwareName(data,input),unit:input.unit,activity:'JARCERIA',price:null,priceGroupId:null,categoryId:input.categoryId??old?.categoryId??null,lineId:null,active:input.active!==false,available:input.available??old?.available??true,externalKey:input.externalKey??old?.externalKey??null};
   row.creationAudit=input.creationAudit??old?.creationAudit??null;
   row.pricePending=input.pricePending===true;
   row.enforceStock=old?old.enforceStock??false:true;row.autoOpenPackages=input.autoOpenPackages??old?.autoOpenPackages;
   row.characteristics=String(input.characteristics??old?.characteristics??'').trim().slice(0,1000);
   data.products=old?data.products.map(p=>p.id===old.id?row:p):[...data.products,row];return {ok:true,id};
 }
 const field=name==='savePresentation'?'presentations':'services';const rows=data.procurement[field]||[];const old=rows.find(r=>r.id===input.id);const id=old?.id??input.id??randomUUID();
 const row={...input,id,name:String(input.name??'').trim().replace(/\s+/g,' '),active:input.active!==false};
 if(field==='presentations'&&rows.some(p=>p.id!==id&&sameId(p.productId,input.productId)&&normalizeText(p.name)===normalizeText(row.name)))throw Error('Ya existe esa presentación del producto.');
 if(field==='presentations'){const product=data.products.find(p=>sameId(p.id,row.productId));row.productId=product?.id;row.baseUnit=product?.unit;row.priceHistory=[...(old?.priceHistory||[]),...(old&&(old.price!==row.price||old.factor!==row.factor)?[{at:new Date().toISOString(),price:old.price,factor:old.factor,unit:old.unit}]:[])];validatePresentation(row,data.products);if(old&&!sameId(old.productId,row.productId))throw Error('Conserva la identidad física de la presentación.');}
 else {validateService(row);const configuration=s=>Object.fromEntries(['name','unit','priceMode','price','active','addons','loadPricing','descriptionRequired'].map(k=>[k,s[k]??null]));row.configurationHistory=[...(old?.configurationHistory||[]),...(old&&JSON.stringify(configuration(old))!==JSON.stringify(configuration(row))?[{at:new Date().toISOString(),before:configuration(old),after:configuration(row)}]:[])];row.tariffHistory=[...(old?.tariffHistory||[]),...(old&&JSON.stringify([old.price,old.addons,old.loadPricing,old.descriptionRequired,old.priceMode,old.unit])!==JSON.stringify([row.price,row.addons,row.loadPricing,row.descriptionRequired,row.priceMode,row.unit])?[{at:new Date().toISOString(),price:old.price,priceMode:old.priceMode,addons:old.addons||[],...(old.loadPricing?{loadPricing:old.loadPricing}:{}),...(old.descriptionRequired?{descriptionRequired:true}:{})}]:[])];}
 data.procurement[field]=old?rows.map(r=>r.id===id?row:r):[...rows,row];return {ok:true,id};
}

export function commercialImport(data,input,preview=false){
 const activity=input?.activity??null;if(activity&&!['JARCERIA','LAVANDERIA'].includes(activity))throw Error('Actividad de importación inválida.');
 const reference=activity?{...referenceCommerce,id:referenceCommerce.id+':'+activity,products:activity==='JARCERIA'?referenceCommerce.products:[],services:activity==='LAVANDERIA'?referenceCommerce.services:[],suppliers:activity==='JARCERIA'?referenceCommerce.suppliers:[]}:referenceCommerce;
 const hash=createHash('sha256').update(JSON.stringify(reference)).digest('hex');
 const legacyHash=createHash('sha256').update(JSON.stringify(referenceCommerce)).digest('hex');
 const legacyImported=activity&&data.procurement.commercialImports?.[referenceCommerce.id]===legacyHash&&reference.products.every(p=>data.products.some(existing=>existing.externalKey===p.externalKey))&&reference.services.every(s=>(data.procurement.services||[]).some(existing=>existing.id===s.id));
 const known=data.procurement.commercialImports?.[reference.id]??(legacyImported?hash:null);
 const plan={id:reference.id,hash,source:reference.source,products:reference.products,presentations:reference.products.flatMap(p=>p.options),services:reference.services,suppliers:reference.suppliers,pending:reference.pending,alreadyImported:!!known};
 if(preview)return {ok:true,plan};
 if(input?.hash!==hash||input?.confirmed!==true)throw Error('Revisa y confirma la importación con su huella vigente.');
 if(known){if(known!==hash)throw Error('Importación anterior incompatible.');return {ok:true,imported:false};}
 if((reference.products.length&&(data.products.some(p=>p.externalKey?.startsWith('fc:article:'))||(data.procurement.presentations||[]).some(p=>p.id.startsWith('fc:presentation:'))))||(reference.services.length&&(data.procurement.services||[]).some(s=>s.id.startsWith('fc:service:'))))throw Error('Hay claves de referencia configuradas; revisa vínculos antes de importar, no se sobrescriben.');
 for(const p of reference.products){const result=saveCommerce(data,'saveCommerceProduct',{...p,active:true});for(const o of p.options)saveCommerce(data,'savePresentation',{...o,id:'fc:presentation:'+p.externalKey.slice(11)+':'+o.key,productId:result.id,name:p.name+' · '+o.key,active:true});}
 for(const s of reference.services)saveCommerce(data,'saveService',s);
 // Supplier names are review material only. No invented contact details or forced supplier relationships.
 data.procurement.commercialImports={...(data.procurement.commercialImports||{}),[reference.id]:hash};return {ok:true,imported:true};
}
export function presentationPurchase(data,input,catalog,purchaseId){
 const old=purchaseId&&data.procurement.purchases.find(p=>p.id===purchaseId);
 const supplier=data.procurement.suppliers.find(s=>s.id===input.supplierId);
 if(!old||old.supplierId!==input.supplierId)assertSupplierActivity(supplier,'JARCERIA');
 const entries=input.items??[input];
 if(!Array.isArray(entries)||!entries.length)throw Error('Agrega al menos un producto.');
 const physical=entries.map(entry=>{
   const previous=old?.items.find(i=>i.id===entry.id);
   const current=data.procurement.presentations?.find(p=>p.id===entry.presentationId);
   if(purchaseId&&entry.id!=null&&(!previous||previous.commercialPurchase.presentationId!==entry.presentationId))throw Error('Conserva la presentación original del renglón.');
   const p=previous?{...previous.commercialPurchase,id:entry.presentationId,productId:previous.productId,
    integerOnly:current?.integerOnly||!['kg','gramo'].includes(previous.commercialPurchase.unit)||!['kg','gramo'].includes(previous.commercialPurchase.baseUnit)}
    :current?.active&&current.purchaseEnabled!==false?current:null;
   if(!p)throw Error('Presentación no disponible.');
   const count=Number(entry.quantity);decimal(entry.quantity);if(p.integerOnly&&!Number.isInteger(count))throw Error('Cantidad de empaques entera requerida.');
   const base=baseQuantity(entry.quantity,p.factor),calculation=presentationPurchaseCost(entry);
   return {id:previous?.id,p,count,base,...calculation};
 });
 const prepared=prepareFinishedPurchase(data.procurement,{activity:'JARCERIA',supplierId:input.supplierId,date:input.date,reference:input.reference||'',notes:input.notes||'',receipt:Object.hasOwn(input,'receipt')?input.receipt:old?.receipt??null,items:physical.map(({id,p,base,total})=>{
  const prior=old?.items.find(i=>i.id===id);
  const quantity=prior&&old.supplierId===input.supplierId?convertQuantity(base,p.baseUnit,prior.unit):base;
  return {id,directProductId:p.productId,quantity,costMode:'total',cost:total};
 })},catalog,purchaseId,{commercialRevision:Boolean(purchaseId)});
 const purchase=purchaseId?prepared.data.purchases.find(p=>p.id===purchaseId):prepared.data.purchases[0];
 physical.forEach(({p,count,base,cost,costMode,paidTotal},ordinal)=>{const item=purchase.items[ordinal];item.productId=p.productId;item.commercialPurchase={presentationId:p.id,name:p.name,unit:p.unit,quantity:count,costPerPresentation:cost,costMode,...(paidTotal?{paidTotal}:{}),factor:p.factor,baseQuantity:base,baseUnit:p.baseUnit};});
 data.products=prepared.products;data.procurement=prepared.data;return {ok:true,purchaseId:purchase.id};
}

export function editHardwarePurchase(data,input,purchaseId){
 const old=data.procurement.purchases.find(p=>p.id===purchaseId);
 if(!old||old.voidedAt||purchaseActivity(old)!=='JARCERIA'||!old.items.every(i=>i.commercialPurchase))throw Error('Selecciona una compra vigente de jarcería.');
 const reason=input?.inventoryCorrection?.reason;
 if(typeof reason!=='string'||!reason.trim()||reason.trim().length>1000)throw Error('Escribe el motivo de la corrección.');
 if(!Array.isArray(input.items)||!input.items.length)throw Error('Agrega al menos un artículo.');
 const result=hardwarePurchase(data,input,purchaseId);
 const purchase=data.procurement.purchases.find(p=>p.id===purchaseId),at=purchase.updatedAt;
 Object.assign(purchase.revisions.at(-1),{revisionReason:reason.trim(),revisedAt:at});
 purchase.history=[...(old.history||[]),{action:'purchase_correction',at,reason:reason.trim(),beforeTotal:old.total,afterTotal:purchase.total,channel:'WEB'}];
 return result;
}

export function hardwarePurchase(data,input,purchaseId){
 if(!purchaseId){
  const supplier=data.procurement.suppliers.find(s=>s.id===input?.supplierId&&s.active);
  if(!supplier)throw Error('Selecciona un proveedor activo.');
  assertSupplierActivity(supplier,'JARCERIA');
 }
 const {items,drafts=[]}=input;
 if(!Array.isArray(items)||!items.length||!Array.isArray(drafts))throw Error('Agrega al menos un artículo.');
 const next=structuredClone(data),created=new Map();
 for(const draft of drafts){
  const bundle=draft.bundle;
  if(typeof draft.id!=='string'||!draft.id||created.has(draft.id)||!items.some(item=>item.draftId===draft.id))throw Error('Revisa los productos nuevos de la compra.');
  if(!bundle?.product||bundle.product.id!=null||bundle.initialInventory!==undefined||bundle.product.initialInventory!==undefined||
    !Array.isArray(bundle.presentations)||bundle.presentations.some(p=>p.id!=null))throw Error('La compra solo admite altas de productos nuevos sin inventario inicial separado.');
  if(!hardwareCategory(next,bundle.product.hardwareCategoryId)?.active)throw Error('Selecciona una categoría de jarcería activa.');
  if(bundle.product.pricePending||bundle.product.active===false)throw Error('Confirma el precio de venta y el estado del producto nuevo.');
  if(bundle.minimum!=null&&bundle.minimum!==''&&decimal(bundle.minimum,6,false)%1000000n!==0n)throw Error('El inventario mínimo en piezas debe ser entero.');
  const {id}=saveCommerce(next,'saveHardwareProductBundle',bundle);
  created.set(draft.id,{id,minimum:bundle.minimum??null});
 }
 const resolved=items.map(item=>{
  if(item.draftId==null)return item;
  if(item.id!=null||item.presentationId!=null)throw Error('El producto nuevo debe agregarse en un renglón nuevo.');
  const product=created.get(item.draftId);
  const presentation=product&&Number.isInteger(item.presentationIndex)&&next.procurement.presentations.filter(p=>p.productId===product.id)[item.presentationIndex];
  if(!presentation)throw Error('Selecciona una presentación del producto nuevo.');
  return {...item,presentationId:presentation.id};
 });
 const result=presentationPurchase(next,{...input,items:resolved},next,purchaseId);
 Object.assign(data,next);
 return {...result,createdProducts:[...created.values()]};
}
