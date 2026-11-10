import {purchaseInventoryIntent} from './purchaseInventory.mjs';
export function replenishmentSuggestion(product,data){
 const quantities=[];
 for(const purchase of data.procurement.purchases){
  if(purchase.voidedAt)continue;
  for(const item of purchase.items){
   const intent=purchaseInventoryIntent(item,data.products);
   if(String(intent.productId)===String(product.productId??product.id)&&intent.nature==='finished'&&intent.unit===product.unit&&Number(intent.quantity)>0)quantities.push(intent.quantity);
  }
 }
 const counts=new Map();for(const q of quantities)counts.set(q,(counts.get(q)||0)+1);
 const ranked=[...counts].sort((a,b)=>b[1]-a[1]);
 return {minimum:null,usualBatch:ranked.length&&(ranked.length===1||ranked[0][1]>ranked[1][1])?ranked[0][0]:null,observations:quantities.length};
}
