export const LEGACY_WEB_PAYMENT_POLICY='web-cash-nearest-50-v1';
export const WEB_PAYMENT_POLICY='web-cash-nearest-50-min-50-v2';
const limit=BigInt(Number.MAX_SAFE_INTEGER);
const safe=n=>{if(n<0n||n>limit)throw Error('Importe fuera del rango monetario seguro.');return Number(n);};
export function moneyCents(value){
 const text=String(value);if(!/^\d+(?:\.\d{1,2})?$/.test(text))throw Error('El importe debe expresarse en centavos exactos.');
 const [whole,fraction='']=text.split('.');return safe(BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0')));
}
export function commercialCents(items){return safe(items.reduce((sum,item)=>sum+BigInt(moneyCents(item.amount)),0n));}
export function paymentAmounts(items,payment,policy=WEB_PAYMENT_POLICY){
 if(![WEB_PAYMENT_POLICY,LEGACY_WEB_PAYMENT_POLICY].includes(policy))throw Error('Política monetaria desconocida.');
 if(!['Efectivo','Transferencia','Tarjeta'].includes(payment))throw Error('Método de pago no soportado; no se admiten pagos mixtos.');
 const calculatedCents=commercialCents(items);
 const rounded=payment==='Efectivo'?safe(((BigInt(calculatedCents)+25n)/50n)*50n):calculatedCents;
 const collectedCents=payment==='Efectivo'?(policy===WEB_PAYMENT_POLICY&&calculatedCents>0&&calculatedCents<25?50:rounded):calculatedCents;
 return {policyVersion:policy,currency:'MXN',payment,calculatedCents,roundingCents:collectedCents-calculatedCents,collectedCents};
}
export function assertPayment(record){
 const expected=paymentAmounts(record.items,record.payment??record.monetary?.payment,record.monetary?.policyVersion);
 for(const [key,value]of Object.entries(expected))if(record.monetary?.[key]!==value)throw Error('El resumen monetario no coincide con los conceptos y el método de pago.');
 if(moneyCents(record.total)!==expected.collectedCents)throw Error('El total cobrado no coincide con la política registrada.');
 if(record.monetarySettlement){
  const s=record.monetarySettlement;
  if(s.status!=='not_recorded'||!Number.isSafeInteger(s.lastConfirmedCollectedCents)||s.lastConfirmedCollectedCents<0||s.revisedDueCents!==expected.collectedCents||s.differenceCents!==s.revisedDueCents-s.lastConfirmedCollectedCents)throw Error('El contexto de liquidación monetaria es inválido.');
 }
 return expected;
}
export const signedMoney=cents=>`${cents>=0?'+':'−'}$${(Math.abs(cents)/100).toFixed(2)}`;
