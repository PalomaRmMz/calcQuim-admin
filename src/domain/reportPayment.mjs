const cents=value=>value==null?null:Math.round(value*100);
export function reportedCollection(sale) {
 if(sale.monetarySettlement)return {confirmed:sale.monetarySettlement.lastConfirmedCollectedCents,collected:null,status:sale.monetarySettlement.status};
 // A commercial revision is not evidence that its difference was collected.
 if(!sale.monetary&&((sale.commercialVersion??1)>1||sale.revisions?.length))return {confirmed:cents(sale.originalReceipt?.total),collected:null,status:'not_recorded'};
 const amount=sale.monetary?.collectedCents??cents(sale.total);
 return {confirmed:amount,collected:amount,status:sale.voidMonetary?.settlementStatus??null};
}
