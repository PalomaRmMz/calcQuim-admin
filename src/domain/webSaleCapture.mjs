import {makeLine,repriceLines} from '../../server/src/mobile/sale.mjs';
export const WEB_PHYSICAL_VERSION='web-confirmed-quantity-v1';
export const captureUnit=tariff=>tariff?.presentation?.key==='rollo'&&tariff.unit==='pieza'&&Number(tariff.presentation.factor)===1?'rollo':tariff?.unit;
export function physicalQuantity(value){
 const text=String(value??'').trim().replace(',','.');
 if(!/^\d+(?:\.\d{1,6})?$/.test(text))throw Error('La cantidad física debe ser positiva y admitir hasta seis decimales.');
 const [whole,fraction='']=text.split('.'),micro=BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));
 if(micro<=0n||micro>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Cantidad física fuera de rango.');
 const raw=(micro/1000000n)+'.'+String(micro%1000000n).padStart(6,'0');return raw.replace(/0{1,3}$/,'');
}
export function captureChoices(choices){
 // A multi-price group remains selectable by its existing reference and exact price source.
 // Move the disambiguation to the search result; never select the first rate silently.
 return choices.flatMap(c=>c.tariffs.length===1?[c]:c.tariffs.map(t=>{
  const members=choices.filter(p=>p.kind==='product'&&t.productIds.some(id=>String(id)===String(p.refId))).map(p=>p.name);
  return {...c,key:c.key+':price:'+t.key,name:`${c.name} · $${t.price.toFixed(2)}/${t.unit}`,context:'Agrupación comercial · '+(c.context||'').replace('Selecciona una tarifa si hay varias','Precios vigentes')+(members.length?' · Productos: '+members.join(', '):''),tariffs:[t]};
 }));
}
export function capturePreview(choice,tariff,mode,value,lines=[],manualPhysical=null){
 if(!tariff||!String(value).trim())return null;
 try{return repriceLines([...lines,makeLine(choice,tariff,mode,value,'web-preview',null)]).at(-1);}
 catch(error){if(!/ambigu/.test(error.message)||manualPhysical==null||manualPhysical==='')throw error;
  return repriceLines([...lines,makeLine(choice,tariff,mode,value,'web-preview',manualPhysical)]).at(-1);
 }
}
export function suggestedPhysical(line){
 if(!line||line.entryMode!=='amount')return '';
 const n=BigInt(line.quantityNumerator??Math.round(line.amount*100)),d=BigInt(line.quantityDenominator??Math.round(line.price*100));
 if(n<=0n||d<=0n)return '';
 const micro=(n*2000000n+d)/(d*2n);if(micro===0n)return '';
 return physicalQuantity(`${micro/1000000n}.${String(micro%1000000n).padStart(6,'0')}`);
}
export function withWebPhysical(line,value,source='suggested'){
 if(line.entryMode!=='amount'||line.commerceVersion)throw Error('La confirmación física aplica a Limpieza por monto.');
 const priceConfirmation=line.confirmedQuantity!=null&&line.confirmedQuantity!=='';
 return {...line,webPhysicalQuantity:{version:WEB_PHYSICAL_VERSION,quantity:physicalQuantity(value),unit:line.unit,source,...(priceConfirmation?{priceConfirmation:true}:{})}};
}
export function validateWebPhysical(metadata,line){
 if(!metadata||metadata.version!==WEB_PHYSICAL_VERSION||metadata.unit!==line.unit||!['suggested','manual'].includes(metadata.source)||line.entryMode!=='amount'||line.commerceVersion||line.activity==='JARCERIA'||line.lineType==='service')throw Error('Confirmación física web inválida.');
 if(metadata.priceConfirmation!=null&&(metadata.priceConfirmation!==true||metadata.source!=='manual'||physicalQuantity(line.confirmedQuantity)!==physicalQuantity(metadata.quantity)))throw Error('La confirmación de precio debe coincidir con los litros confirmados y las reglas comerciales vigentes.');
 return {...metadata,quantity:physicalQuantity(metadata.quantity)};
}
