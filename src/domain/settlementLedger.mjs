// Read-only technical projection. No payment is inferred from a commercial edit.
// Recording endpoints remain unavailable until a commercial policy is approved.
const cents=value=>value==null?null:Math.round(Number(value)*100);
const safe=n=>{if(!Number.isSafeInteger(n)||n<0)throw Error('Importe financiero inválido.');return n;};
export function validateSettlementEvent(event,saleId){
 if(!event||event.saleId!==saleId||typeof event.id!=='string'||!event.id||typeof event.requestKey!=='string'||!event.requestKey||!['collection','refund'].includes(event.kind)||event.status!=='confirmed'||!['Efectivo','Transferencia','Tarjeta'].includes(event.payment)||!event.reason?.trim()||!event.reference?.trim()||!Number.isFinite(Date.parse(event.occurredAt))||!event.responsibleId?.trim())throw Error('Constancia financiera incompleta.');
 safe(event.amountCents);if(event.amountCents===0)throw Error('La constancia debe tener importe positivo.');return event;
}
export function settlementSummary(sale,events=[]){
 const original=sale.originalReceipt?.monetary?.collectedCents??cents(sale.originalReceipt?.total)??((sale.commercialVersion??1)===1?cents(sale.total):null);
 if(original!=null)safe(original);
 const keys=new Map(),ids=new Set();let additional=0,refunds=0,count=0;
 for(const event of events){
  validateSettlementEvent(event,sale.id);const canonical=JSON.stringify(Object.fromEntries(Object.keys(event).sort().map(k=>[k,event[k]])));
  if(keys.has(event.requestKey)){if(keys.get(event.requestKey)!==canonical)throw Error('Conflicto de idempotencia financiera.');continue;}
  if(ids.has(event.id))throw Error('Identificador financiero duplicado.');ids.add(event.id);keys.set(event.requestKey,canonical);count++;
  if(event.kind==='collection')additional=safe(additional+event.amountCents);else refunds=safe(refunds+event.amountCents);
 }
 const net=original==null?null:original+additional-refunds;
 if(net!=null&&(!Number.isSafeInteger(net)||net<0))throw Error('Devoluciones sin respaldo suficiente.');
 const due=sale.voidedAt?null:cents(sale.total);if(due!=null)safe(due);
 const balance=due==null||net==null?null:due-net;
 return {commercialCents:sale.items.reduce((n,i)=>safe(n+safe(cents(i.amount))),0),documentDueCents:due,originalConfirmedCents:original,additionalConfirmedCents:additional,refundConfirmedCents:refunds,netConfirmedCents:net,balanceCents:balance,pendingCollectionCents:balance==null?null:Math.max(balance,0),pendingRefundCents:balance==null?null:Math.max(-balance,0),eventCount:count,status:sale.voidedAt?'annulment_review':balance==null?'undetermined':balance>0?'pending_collection':balance<0?'pending_refund':'balanced',recordingEnabled:false};
}
