import {inventoryReportRows,inventoryReportSummary} from '../services/inventoryReport.js';
import {productActivity,purchaseActivity} from './activityScope.mjs';
import {inventoryConvert} from '../services/inventoryUnits.js';
import {validDate} from '../utils/procurementUtils.js';
import {localDate} from '../utils/salesUtils.js';
const n=value=>value!=null&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
export function operationsReport({data,inventory,purchases},{activity='LIMPIEZA',from='',to='',today=localDate()}={}){
 if(!['LIMPIEZA','JARCERIA','GENERAL'].includes(activity)||from&&!validDate(from)||to&&!validDate(to)||from&&to&&from>to)throw Error('Actividad o período inválido.');
 const inScope=a=>activity==='GENERAL'||a===activity,inPeriod=date=>(!from||date>=from)&&(!to||date<=to);
 const products=data.products.filter(p=>inScope(productActivity(p))),ids=new Set(products.map(p=>String(p.id))),byId=new Map(data.products.map(p=>[String(p.id),p]));
 const rows=(purchases?.rows||[]).filter(r=>inScope(r.activity)),liveRows=rows.filter(r=>!r.voided);
 const candidates=liveRows.filter(r=>!r.removed&&['applied','included'].includes(r.state)&&n(r.actual_quantity)>0&&n(r.source.total)!=null).map(r=>({productId:String(r.product_id),unit:r.unit,cost:Number(r.source.total)/Number(r.actual_quantity),at:r.updated_at instanceof Date?r.updated_at.toISOString():r.updated_at,date:r.date,supplierId:r.supplierId,supplierName:r.supplierName,purchaseId:r.purchase_id}));
 const trend=new Map(),salesByProduct=new Map(),margins=[],dateList=[];
 const month=date=>{const key=date.slice(0,7);if(!trend.has(key))trend.set(key,{month:key,purchases:0,sales:0});return trend.get(key);};
 for(const purchase of data.procurement.purchases.filter(p=>!p.voidedAt&&inPeriod(p.date))){
  const a=purchaseActivity(purchase)??(purchase.items.every(i=>i.commercialPurchase)?'JARCERIA':purchase.items.some(i=>i.sourcingType)?'LIMPIEZA':null);
  if(a&&inScope(a))month(purchase.date).purchases+=Math.round(purchase.total*100);
 }
 const movements=inventory.movements||[],reversed=new Set(movements.map(m=>m.reversal_of).filter(Boolean));
 const outputsByLine=new Map(),returnedSales=new Set(),costsByProduct=new Map();
 const lineKey=(saleId,ordinal,productId)=>JSON.stringify([saleId,Number(ordinal),String(productId)]);
 for(const m of movements){
  if(reversed.has(m.id))continue;
  if(m.kind==='return')returnedSales.add(m.sale_id);
  if(m.kind==='sale'){const key=lineKey(m.sale_id,m.sale_ordinal,m.product_id);if(!outputsByLine.has(key))outputsByLine.set(key,[]);outputsByLine.get(key).push(m);}
 }
 for(const c of candidates){const key=JSON.stringify([c.productId,c.unit]);if(!costsByProduct.has(key))costsByProduct.set(key,[]);costsByProduct.get(key).push(c);}
 for(const list of costsByProduct.values())list.sort((a,b)=>String(b.at).localeCompare(String(a.at)));
 let unattributedRevenue=0,businessUnclassifiedRevenue=0;
 for(const sale of data.sales.filter(s=>!s.voidedAt&&inPeriod(s.date))){
  for(const [ordinal,item]of sale.items.entries()){
   const p=byId.get(String(item.productId)),a=item.activity??(p?productActivity(p):null);
   if(!a){const cents=Math.round(item.amount*100);businessUnclassifiedRevenue+=cents;if(activity==='GENERAL'){unattributedRevenue+=cents;month(sale.date).sales+=cents;dateList.push(sale.date);}continue;}if(!inScope(a))continue;
   month(sale.date).sales+=Math.round(item.amount*100);dateList.push(sale.date);
   if(!p||item.lineType==='service'){if(!p&&item.lineType!=='service')unattributedRevenue+=Math.round(item.amount*100);continue;}
   // Cantidad física sustentada por el historial; las ventas resumidas no se convierten por precio.
   const physical=outputsByLine.get(lineKey(sale.id,ordinal,p.id))||[];
   const quantity=physical.length?physical.reduce((sum,m)=>sum-Math.min(0,Number(m.quantity)),0):null;
   const returned=returnedSales.has(sale.id);
   const known=salesByProduct.get(String(p.id))||{productId:p.id,name:p.name,unit:p.unit,quantity:0,unknown:false,revenue:0};
   if(quantity===null)known.unknown=true;else known.quantity+=quantity;known.revenue+=Math.round(item.amount*100);salesByProduct.set(String(p.id),known);
   const reference=(costsByProduct.get(JSON.stringify([String(p.id),p.unit]))||[]).find(c=>sale.createdAt&&c.at?Date.parse(c.at)<=Date.parse(sale.createdAt):c.date<sale.date);
   const cost=quantity!==null&&!returned&&reference?quantity*reference.cost:null;
   margins.push({saleId:sale.id,folio:sale.folio,date:sale.date,productId:p.id,name:item.name||p.name,quantity,unit:p.unit,revenue:Number(item.amount),costReference:reference?.cost??null,estimatedCost:cost,estimatedMargin:cost===null?null:Number(item.amount)-cost,marginPercent:cost===null||Number(item.amount)<=0?null:(Number(item.amount)-cost)/Number(item.amount)*100,purchaseId:reference?.purchaseId??null,reason:cost!==null?'Estimación con costo real previo; no equivale a costeo contable':returned?'Devolución física: requiere conciliación de margen':quantity===null?'Cantidad física pendiente de desglose':'Sin costo real previo trazable'});
  }
 }
 const pending=(inventory.pending||[]).filter(p=>p.state==='pending');
 const first=from||(dateList.length?[...dateList].sort()[0]:null),last=to||today;
 const days=first?Math.max(1,Math.round((Date.parse(last)-Date.parse(first))/86400000)+1):null;
 const rotation=products.filter(p=>p.active).map(p=>{
  const record=salesByProduct.get(String(p.id)),uncertain=pending.some(r=>r.product_id!=null?String(r.product_id)===String(p.id):r.scope==='category'?String(p.categoryId)===String(r.scope_id):r.scope==='line'?String(p.lineId)===String(r.scope_id):true);
  const quantity=uncertain||record?.unknown||!days||businessUnclassifiedRevenue>0?null:record?.quantity??0;
  return {productId:p.id,name:p.name,unit:p.unit,quantity,perDay:quantity!==null&&days?quantity/days:null,revenue:(record?.revenue??0)/100,reason:quantity===null?'Desglose físico pendiente':days?'Salida observada en el período':'Sin período observado suficiente'};
 }).sort((a,b)=>a.unit.localeCompare(b.unit)||(b.quantity??-1)-(a.quantity??-1));
 const stock=inventoryReportRows(inventory.products.filter(p=>ids.has(String(p.productId))),data.categories,data.productLines);
 const lowStock=stock.filter(r=>['out','low'].includes(r.status)).map(r=>{const rate=rotation.find(p=>String(p.productId)===String(r.productId))?.perDay;return {...r,daysRemaining:rate>0?Number(r.quantity)/rate:null};});
 const supplierCosts=candidates.map(c=>({...c,name:byId.get(c.productId)?.name??'Producto histórico'})).sort((a,b)=>a.name.localeCompare(b.name)||a.cost-b.cost);
 const preparations=rows.filter(r=>r.nature==='input').map(r=>{
  let expected=null;try{const raw=r.intent?.expectedOutput;expected=raw!=null?Number(inventoryConvert(String(raw),r.intent.expectedUnit,r.unit)):null;}catch{/* Rendimiento no representable: se mantiene desconocido. */}
  return {purchaseId:r.purchase_id,itemId:r.item_id,name:r.name,productName:r.productName,state:r.state,voided:r.voided,date:r.date,inputQuantity:r.source.quantity,inputUnit:r.source.unit,expected,actual:n(r.actual_quantity),unit:r.unit,realYield:n(r.actual_quantity)!=null&&n(r.source.quantity)>0?Number(r.actual_quantity)/Number(r.source.quantity):null,achievement:expected>0&&n(r.actual_quantity)!=null?Number(r.actual_quantity)/expected*100:null};
 });
 const pendingPurchases=liveRows.filter(r=>['reconcile','prepare'].includes(r.state)).map(r=>({purchaseId:r.purchase_id,itemId:r.item_id,name:r.name,productName:r.productName,date:r.date,state:r.state,historical:r.historical,nature:r.nature}));
 const legacyCommercialCents=s=>s.total!=null?Math.round(s.total*100):s.items.reduce((sum,i)=>sum+Math.round(i.amount*100),0);
 const paymentRows=activity==='GENERAL'?data.sales.filter(s=>inPeriod(s.date)).map(s=>({saleId:s.id,folio:s.folio,date:s.date,payment:s.payment,voided:!!s.voidedAt,commercial:(s.monetary?.calculatedCents??legacyCommercialCents(s))/100,rounding:(s.monetary?.roundingCents??0)/100,documentTotal:s.total??null,confirmedCollected:s.monetarySettlement?s.monetarySettlement.lastConfirmedCollectedCents/100:s.total??null,collected:s.monetarySettlement?null:s.total??null,policy:s.monetary?.policyVersion??'Histórica sin política nueva',settlement:s.monetarySettlement?.status??s.voidMonetary?.settlementStatus??null,cents:{commercial:s.monetary?.calculatedCents??legacyCommercialCents(s),rounding:s.monetary?.roundingCents??0,collected:s.monetarySettlement?null:s.monetary?.collectedCents??(s.total==null?null:Math.round(s.total*100)),confirmed:s.monetarySettlement?.lastConfirmedCollectedCents??s.monetary?.collectedCents??(s.total==null?null:Math.round(s.total*100))}})):null;
 const sumPayments=(records,key)=>{if(records.some(r=>r.cents[key]===null))return null;const cents=records.reduce((sum,r)=>{if(!Number.isSafeInteger(r.cents[key]))throw Error('Importe fuera de rango.');return sum+BigInt(r.cents[key]);},0n);if(cents>BigInt(Number.MAX_SAFE_INTEGER)||cents< -BigInt(Number.MAX_SAFE_INTEGER))throw Error('Total fuera de rango.');return Number(cents)/100;};
 const payments=paymentRows?{rows:paymentRows,commercial:sumPayments(paymentRows.filter(r=>!r.voided),'commercial'),rounding:sumPayments(paymentRows.filter(r=>!r.voided),'rounding'),collected:sumPayments(paymentRows.filter(r=>!r.voided),'collected'),confirmedCollected:sumPayments(paymentRows.filter(r=>!r.voided),'confirmed'),voidedCharge:sumPayments(paymentRows.filter(r=>r.voided),'confirmed')}:null;

 return {payments,activity,from,to,observationDays:days,generatedAt:new Date().toISOString(),automationEnabled:!!purchases?.enabled,inventorySummary:inventoryReportSummary(stock),lowStock,rotation,margins,supplierCosts,preparations,pendingPurchases,trends:[...trend.values()].sort((a,b)=>a.month.localeCompare(b.month)).map(r=>({...r,purchases:r.purchases/100,sales:r.sales/100})),unattributedRevenue:unattributedRevenue/100,businessUnclassifiedRevenue:businessUnclassifiedRevenue/100,marginCoverage:{known:margins.filter(r=>r.estimatedMargin!==null).length,unknown:margins.filter(r=>r.estimatedMargin===null).length},limitations:['Márgenes estimados con costos realmente pagados y disponibles antes de la venta; sin costeo de lotes vendidos.','Las unidades permanecen separadas; la velocidad de salida no es una razón de rotación contable.','Los saldos desconocidos y los umbrales ausentes no se sustituyen por cero.']};
}
