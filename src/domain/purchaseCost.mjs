import {decimal} from './commerce.mjs';
// El importe pagado en centavos es la autoridad. La división no vuelve a multiplicarse para obtener el total.
export function presentationPurchaseCost(entry){
 const quantity=decimal(entry.quantity);
 if(entry.totalAmount!=null){
  const cents=decimal(entry.totalAmount,2);
  return {total:Number(cents)/100,cost:Number(cents*1000000n)/Number(quantity)/100,costMode:'total',paidTotal:String(entry.totalAmount)};
 }
 const cents=decimal(entry.cost,2);
 return {total:Number((cents*quantity+500000n)/1000000n)/100,cost:Number(cents)/100,costMode:'unit'};
}
