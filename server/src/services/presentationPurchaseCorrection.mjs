import {calculateEffectiveCost} from '../../../src/utils/procurementUtils.js';
import {presentationPurchaseCost} from '../../../src/domain/purchaseCost.mjs';
export function correctPresentationPurchase(data,id,input){
 const old=data.procurement.purchases.find(p=>p.id===id);
 if(!old||old.voidedAt||old.activity!=='JARCERIA'||!old.items.every(i=>i.commercialPurchase))throw Error('Selecciona una compra vigente de jarcería.');
 if(!input||Object.keys(input).some(k=>!['items','reason'].includes(k))||!input.reason?.trim()||input.reason.length>1000||!Array.isArray(input.items)||input.items.length!==old.items.length)throw Error('Conserva los renglones y escribe el motivo de corrección.');
 const ids=new Set();
 const items=old.items.map(item=>{
  const row=input.items.find(i=>i.id===item.id);if(!row||ids.has(row.id)||Object.keys(row).some(k=>!['id','totalAmount'].includes(k)))throw Error('Conserva la identidad de cada renglón de compra.');ids.add(row.id);
  const cost=presentationPurchaseCost({quantity:item.commercialPurchase.quantity,totalAmount:row.totalAmount});
  const effective=calculateEffectiveCost({price:cost.total,priceQuantity:item.quantity,priceUnit:item.unit,yield:item.yield,targetUnit:item.productUnitSnapshot||item.yield?.outputUnit});
  return {...item,costMode:'total',cost:cost.total,total:cost.total,unitCost:cost.total/Number(item.quantity),effectiveCost:effective.cost,effectiveUnit:effective.outputUnit||null,commercialPurchase:{...item.commercialPurchase,costPerPresentation:cost.cost,costMode:'total',paidTotal:String(row.totalAmount)}};
 });
 if(items.every((i,n)=>i.total===old.items[n].total))throw Error('No hay cambios de importe.');
 const total=items.reduce((n,i)=>n+Math.round(i.total*100),0)/100,at=new Date().toISOString();
 const {revisions,...original}=old;
 const next={...old,items,total,updatedAt:at,revisions:[...(revisions||[]),{...original,revisionReason:input.reason.trim(),revisedAt:at}],history:[...(old.history||[]),{action:'cost_correction',at,reason:input.reason.trim(),beforeTotal:old.total,afterTotal:total,channel:'WEB'}]};
 data.procurement={...data.procurement,purchases:data.procurement.purchases.map(p=>p.id===id?next:p)};
 return {ok:true,purchaseId:id};
}
