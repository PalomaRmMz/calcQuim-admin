import {decimal} from './commerce.mjs';
import {validDate} from '../utils/procurementUtils.js';
export function saveSupplierPurchaseTiers(data,input){
 if(!data.procurement.suppliers.some(s=>s.id===input.supplierId&&s.businessActivity==='JARCERIA'))throw Error('Selecciona un proveedor de jarcería.');
 if(!Array.isArray(input.tiers)||input.tiers.length>30)throw Error('Captura hasta 30 niveles por proveedor.');
 const seen=new Set();
 const tiers=input.tiers.map(t=>{
  const minimumQuantity=Number(t.minimumQuantity);
  if(!Number.isSafeInteger(minimumQuantity)||minimumQuantity<1)throw Error('La cantidad mínima debe ser un entero positivo.');
  const presentationId=t.presentationId||null;
  if(presentationId&&!data.procurement.presentations.some(p=>p.id===presentationId))throw Error('Presentación de mayoreo inválida.');
  const identity=JSON.stringify([presentationId,minimumQuantity]);if(seen.has(identity))throw Error('Nivel de mayoreo repetido.');seen.add(identity);
  const costPerPresentation=t.costPerPresentation==null||t.costPerPresentation===''?null:Number(decimal(t.costPerPresentation,2))/100;
  if(costPerPresentation!==null&&(!presentationId||!validDate(t.quotedAt)||!String(t.evidence||'').trim()))throw Error('Un precio verificable requiere presentación, fecha y referencia de cotización.');
  return {minimumQuantity,presentationId,costPerPresentation,quotedAt:costPerPresentation===null?null:t.quotedAt,evidence:costPerPresentation===null?'':String(t.evidence).trim().slice(0,200)};
 }).sort((a,b)=>a.minimumQuantity-b.minimumQuantity);
 const previous=data.procurement.supplierPurchaseTiers?.[input.supplierId]||[];
 data.procurement.supplierPurchaseTierHistory=[...(data.procurement.supplierPurchaseTierHistory||[]),{supplierId:input.supplierId,at:new Date().toISOString(),previous:structuredClone(previous)}];
 data.procurement.supplierPurchaseTiers={...data.procurement.supplierPurchaseTiers,[input.supplierId]:tiers};return {ok:true};
}
export function applicablePurchaseTiers(model,supplierId,presentationId,quantity){
 return (model.supplierPurchaseTiers?.[supplierId]||[]).filter(t=>(!t.presentationId||t.presentationId===presentationId)&&Number(quantity)>=t.minimumQuantity);
}
