import {validateLaundryPricing,calculateLaundryLoad} from './laundryPricing.mjs';
export const COMMERCE_VERSION='fullclean-commerce-v1';
export const ACTIVITIES=['LIMPIEZA','JARCERIA','LAVANDERIA'];
const fail=message=>{throw new Error(message);};
export const sameId=(a,b)=>String(a)===String(b);
export function decimal(value,places=6,positive=true){
 const s=String(value??'').trim().replace(',','.');
 if(!new RegExp('^\\d+(?:\\.\\d{1,'+places+'})?$').test(s))fail('Cantidad o importe inválido.');
 const [w,f='']=s.split('.'),n=BigInt(w)*10n**BigInt(places)+BigInt(f.padEnd(places,'0'));
 if(n>BigInt(Number.MAX_SAFE_INTEGER)||(positive&&n===0n))fail('Cantidad o importe fuera de rango.');return n;
}
const num=n=>{if(n>BigInt(Number.MAX_SAFE_INTEGER))fail('Valor fuera de rango.');return Number(n);};
export function baseQuantity(quantity,factor){const n=decimal(quantity)*decimal(factor);if(n%1000000n)fail('Contenido no representable en seis decimales.');return num(n/1000000n)/1000000;}
export function validatePresentation(p,products){
 if(!p?.id||!p.name?.trim()||p.name.length>200||!products.some(x=>sameId(x.id,p.productId)&&x.activity==='JARCERIA'))fail('Selecciona un artículo de jarcería y nombre de presentación.');
 if(!['pieza','paquete','kg','gramo','bolsa','envase','botella'].includes(p.unit))fail('Unidad comercial inválida.');
 decimal(p.factor);decimal(p.price,2,false);
 if(p.baseUnit!==products.find(x=>sameId(x.id,p.productId))?.unit)fail('Unidad base inconsistente.');
 if(typeof p.integerOnly!=='boolean'||typeof p.active!=='boolean')fail('Define fraccionamiento y estado.');
 const product=products.find(x=>sameId(x.id,p.productId));
 if(!['kg','gramo'].includes(product.unit)&&(!p.integerOnly||Number(p.factor)%1))fail('El contenido de piezas debe ser entero.');
 return p;
}
export function validateService(s){
 if(!s?.id||!s.name?.trim()||s.name.length>200||!['fixed','custom'].includes(s.priceMode)||!['carga','servicio'].includes(s.unit)||typeof s.active!=='boolean')fail('Concepto de servicio inválido.');
 if(s.priceMode==='fixed')decimal(s.price,2,false);else if(s.price!=null)fail('Un servicio cotizado no tiene tarifa fija artificial.');
 const ids=new Set();for(const a of s.addons||[]){if(!a.id||ids.has(a.id)||!a.name?.trim())fail('Adicional inválido o repetido.');ids.add(a.id);decimal(a.price,2,false);}validateLaundryPricing(s);return s;
}
export function commerceChoices(data){
 const model=data?.procurement??data??{},products=data?.products??[];
 return [...(model.presentations||[]).filter(p=>p.active&&products.some(x=>sameId(x.id,p.productId)&&x.active&&x.available!==false)).map(p=>({key:'presentation:'+p.id,kind:'presentation',refId:p.id,name:p.name,context:'Jarcería · '+(products.find(x=>sameId(x.id,p.productId))?.name||''),tariffs:[{key:'commerce:'+p.id,price:Number(p.price),unit:p.unit,productIds:[p.productId],commerceVersion:COMMERCE_VERSION,presentation:p}]})),
 ...(model.services||[]).filter(s=>s.active).map(s=>({key:'service:'+s.id,kind:'service',refId:s.id,name:s.name,context:'Lavandería',tariffs:[{key:'commerce:'+s.id,price:s.priceMode==='custom'?0:Number(s.price),unit:s.unit,productIds:[],commerceVersion:COMMERCE_VERSION,service:s}]}))];
}
export function makeCommerceLine(choice,tariff,mode,value,id,options={}){
 if(!tariff||!choice.tariffs.some(t=>t.key===tariff.key))fail('Selecciona una tarifa.');
 const p=tariff.presentation,s=tariff.service;if(!p&&!s)fail('Concepto comercial inválido.');
 const custom=s?.priceMode==='custom';
 if(!custom&&mode!=='quantity')fail('Captura la cantidad de esta presentación o servicio.');
 const quantity=custom?1:Number(String(value).replace(',','.'));decimal(custom?'1':value);
 if((p?.integerOnly||s?.unit==='carga'&&!s.loadPricing||s?.unit==='servicio')&&!Number.isInteger(quantity))fail('La cantidad debe ser entera.');
 const selected=options.addons||[];if(!Array.isArray(selected)||new Set(selected).size!==selected.length)fail('Adicionales inválidos.');
 const addons=selected.map(key=>(s?.addons||[]).find(a=>a.id===key)||fail('Adicional no disponible.'));
 if(p&&selected.length)fail('El producto no admite adicionales.');
 if(custom&&s.descriptionRequired&&(typeof options.description!=='string'||!options.description.trim()||options.description.trim().length>200))fail('Describe brevemente el trabajo (máximo 200 caracteres).');
 const cents=custom?decimal(value,2):decimal(tariff.price,2,false)+addons.reduce((n,a)=>n+decimal(a.price,2,false),0n);
 const micro=decimal(quantity),amountCents=(cents*micro+500000n)/1000000n;
 if(amountCents===0n)fail('El importe debe ser positivo.');
 const laundry=s?.loadPricing?calculateLaundryLoad(s,value,selected):null;
 const price=laundry?.price??num(cents)/100,amount=laundry?.amount??num(amountCents)/100;
 return {id,reference:{kind:choice.kind,id:choice.refId},name:choice.name,context:choice.context,tariffKey:tariff.key,unit:tariff.unit,price,quantity,amount,subtotal:amount,...(laundry?{laundryPricingSnapshot:laundry.snapshot}:{}),discount:0,discountRate:0,entryMode:custom?'amount':'quantity',requestedAmount:custom?amount:null,capturedValue:String(value),commerceVersion:COMMERCE_VERSION,lineType:s?'service':'physical',activity:s?'LAVANDERIA':'JARCERIA',productId:p?.productId??null,presentationId:p?.id??null,serviceId:s?.id??null,addons:structuredClone(addons),description:custom?String(options.description||choice.name).trim().slice(0,200):'',presentationSnapshot:p?structuredClone(p):null,serviceSnapshot:s?structuredClone(s):null,baseQuantity:p?baseQuantity(quantity,p.factor):null,baseUnit:p?.baseUnit??null,packageState:'equivalent_only',eligibleProductIds:p?[p.productId]:[]};
}
export function resolveCommerceLine(row,data,id){
 const choice=commerceChoices(data).find(c=>c.kind===row.reference?.kind&&sameId(c.refId,row.reference.id));if(!choice)fail('Concepto inactivo o inexistente.');
 const t=choice.tariffs.find(t=>t.key===row.tariffKey);if(!t)fail('Presentación o tarifa cambiada.');
 const line=makeCommerceLine(choice,t,row.entryMode,row.value,id,{addons:row.addons||[],description:row.description});
 if(row.price!==line.price||row.unit!==line.unit)fail('La tarifa o unidad cambió; revisa el renglón.');return line;
}
export function historicalCommerceLine(old,value,options={}){
 const t={key:old.tariffKey,price:old.presentationSnapshot?.price??old.serviceSnapshot?.price??0,unit:old.unit,presentation:old.presentationSnapshot,service:old.serviceSnapshot};
 const c={kind:old.reference.kind,refId:old.reference.id,name:old.name,context:old.context,tariffs:[t]};
 return {...old,...makeCommerceLine(c,t,old.entryMode,value,old.id,{addons:old.addons?.map(a=>a.id)||[],description:options.description??old.description})};
}
export function commerceReport(sales,from='',to=''){
 const byActivity={LIMPIEZA:0,JARCERIA:0,LAVANDERIA:0,SIN_CLASIFICAR:0},rank=new Map(),articles=new Map();let totalCents=0,mixed=0;
 for(const sale of sales.filter(s=>!s.voidedAt&&(!from||s.date>=from)&&(!to||s.date<=to))){const activities=new Set();for(const i of sale.items){const activity=ACTIVITIES.includes(i.activity)?i.activity:'SIN_CLASIFICAR',cents=Math.round(i.amount*100);byActivity[activity]+=cents;totalCents+=cents;activities.add(activity);const key=JSON.stringify([activity,i.reference?.kind,i.presentationId??i.serviceId??i.productId??i.reference?.id,i.unit]);if(!rank.has(key))rank.set(key,{activity,name:i.name,unit:i.unit,quantity:0,amount:0,type:i.lineType??'historical'});const r=rank.get(key);r.quantity+=i.quantity;r.amount+=cents;}if(activities.size>1)mixed++;}
 for(const sale of sales.filter(s=>!s.voidedAt&&(!from||s.date>=from)&&(!to||s.date<=to)))for(const item of sale.items.filter(i=>i.activity==='JARCERIA'&&i.baseQuantity!=null)){
   const key=JSON.stringify([item.productId,item.baseUnit]);if(!articles.has(key))articles.set(key,{productId:item.productId,name:item.context?.replace(/^Jarcería · /,'')||item.name,unit:item.baseUnit,quantity:0,amount:0});const row=articles.get(key);row.quantity+=item.baseQuantity;row.amount+=Math.round(item.amount*100);
 }
 const ranking=[...rank.values()].map(r=>({...r,amount:r.amount/100})).sort((a,b)=>b.amount-a.amount);
 return {total:totalCents/100,mixed,byActivity:Object.fromEntries(Object.entries(byActivity).map(([k,v])=>[k,v/100])),ranking,articleRanking:[...articles.values()].map(r=>({...r,amount:r.amount/100})).sort((a,b)=>a.unit.localeCompare(b.unit)||b.quantity-a.quantity),serviceRanking:ranking.filter(r=>r.activity==='LAVANDERIA').sort((a,b)=>a.unit.localeCompare(b.unit)||b.quantity-a.quantity)};
}
