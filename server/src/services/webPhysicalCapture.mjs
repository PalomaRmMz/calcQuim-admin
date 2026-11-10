import {createMobileSale,correctMobileSale} from '../mobile/domain.mjs';
import {validateWebPhysical} from '../../../src/domain/webSaleCapture.mjs';
const hasPhysical=s=>s.origin==='WEB'&&s.items.some(i=>i.webPhysicalQuantity);
function attach(sale,metadata,receiptKey){
 sale.items=sale.items.map((line,n)=>metadata[n]?{...line,webPhysicalQuantity:validateWebPhysical(metadata[n],line)}:line);
 sale[receiptKey]={...sale[receiptKey],items:sale[receiptKey].items.map((row,n)=>({...row,...(sale.items[n].webPhysicalQuantity?{webPhysicalQuantity:{...sale.items[n].webPhysicalQuantity}}:{})}))};
}
export function createWebSale(sales,input,catalog,sequence){
 const metadata=(input.items||[]).map(r=>r.webPhysicalQuantity);
 const clean={...input,origin:'WEB',items:input.items?.map(r=>r.webPhysicalQuantity&&!r.webPhysicalQuantity.priceConfirmation?{...r,confirmedQuantity:null}:r)};
 const result=createMobileSale(sales,clean,catalog,sequence);attach(result[0],metadata,'originalReceipt');return result;
}
export function correctWebAwareSale(sales,id,input){
 const old=sales.find(s=>s.id===id);if(!old||!hasPhysical(old))return correctMobileSale(sales,id,input);
 const metadata=old.items.map((line,n)=>{
  if(!line.webPhysicalQuantity)return null;
  const raw=input.webPhysicalQuantities?.[n];
  if(raw==null||String(raw).trim()==='')throw Error('Confirma la cantidad física de la venta web corregida.');
  return validateWebPhysical({...line.webPhysicalQuantity,quantity:raw,source:'manual'},{...line,confirmedQuantity:line.webPhysicalQuantity.priceConfirmation?raw:line.confirmedQuantity});
 });
 const cleaned={...input,confirmedQuantities:old.items.map((line,n)=>line.webPhysicalQuantity?(line.webPhysicalQuantity.priceConfirmation?input.webPhysicalQuantities?.[n]:null):input.confirmedQuantities?.[n])};
 let result;
 if(Array.isArray(input.values)&&input.values.length===old.items.length&&input.values.every((v,n)=>String(v)===String(old.items[n].capturedValue))){
  if(old.voidedAt||!old.commerceVersion||input.physicalTreatment!=='apply_difference'||!input.reason?.trim()||input.reason.length>1000)throw Error('Confirma el tratamiento físico y motivo de la corrección web.');
  if(metadata.every((m,n)=>!m||m.quantity===old.items[n].webPhysicalQuantity.quantity))throw Error('No hay cambios comerciales.');
  const at=new Date().toISOString(),version=(old.commercialVersion||1)+1;
  const updated={...old,items:old.items.map(i=>({...i})),commercialVersion:version,breakdowns:{},revisions:[...(old.revisions||[]),{at,channel:'WEB',reason:input.reason.trim(),version:version-1,id:old.id,date:old.date,payment:old.payment,origin:old.origin,items:old.items,total:old.total,breakdowns:old.breakdowns||{}}],history:[...(old.history||[]),{action:'commercial_correction',channel:'WEB',at,reason:input.reason.trim(),version}],updatedReceipt:{...(old.updatedReceipt||old.originalReceipt),createdAt:at,version,corrected:true}};
  result=sales.map(s=>s.id===id?updated:s);
 }else result=correctMobileSale(sales,id,cleaned);
 const sale=result.find(s=>s.id===id);attach(sale,metadata,'updatedReceipt');return result;
}
