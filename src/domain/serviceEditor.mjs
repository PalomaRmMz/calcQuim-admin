import {validateService} from './commerce.mjs';
const amount=value=>{
 if(!/^\d+(?:\.\d{1,2})?$/.test(String(value)))throw Error('Escribe tarifas válidas con hasta dos decimales.');
 const n=Number(value);if(!Number.isSafeInteger(Math.round(n*100)))throw Error('Tarifa fuera de rango.');return n;
};
export function serviceEditorValue(draft){
 const value={...draft,price:draft.priceMode==='custom'?null:amount(draft.price),addons:(draft.addons||[]).map(a=>({...a,price:amount(a.price)}))};
 if(draft.loadPricing)value.loadPricing={...draft.loadPricing,options:draft.loadPricing.options.map(o=>({...o,full:amount(o.full),half:draft.loadPricing.step===0.5?amount(o.half):null,addons:[...o.addons]}))};
 validateService({...value,id:value.id||'new-service'});return value;
}
