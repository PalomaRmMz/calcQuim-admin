const valid=value=>typeof value==='string'&&/T\d{2}:\d{2}/.test(value)&&Number.isFinite(Date.parse(value));
export const saleCapturedAt=sale=>[sale.createdAt,sale.history?.find(h=>h.action==='created')?.at].find(valid)||null;
export function saleCommercialReview(sale){
 const reviewed=Boolean(sale.updatedReceipt||sale.revisions?.length||sale.history?.some(event=>event.action==='commercial_correction'));
 const settlement=sale.monetarySettlement;
 return {reviewed,pending:!sale.voidedAt&&settlement?.status==='not_recorded'&&Number.isSafeInteger(settlement.differenceCents)&&settlement.differenceCents!==0};
}
export function saleLastChangedAt(sale){
 const values=[sale.createdAt,sale.updatedAt,sale.voidedAt,...(sale.history||[]).map(h=>h.at)].filter(valid);
 return values.sort((a,b)=>Date.parse(b)-Date.parse(a))[0]||null;
}
export function saleMoment(value,fallbackDate){
 if(valid(value))return new Date(value).toLocaleString('es-MX',{timeZone:'America/Mexico_City',year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'});
 if(/^\d{4}-\d{2}-\d{2}$/.test(fallbackDate||''))return new Date(`${fallbackDate}T12:00:00`).toLocaleDateString('es-MX');
 return 'Sin dato histórico';
}
