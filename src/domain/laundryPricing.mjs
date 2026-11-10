export const LAUNDRY_PRICING_VERSION='laundry-loads-v1';
const fail=message=>{throw Error(message);};
const key=ids=>[...ids].sort().join('|');
const cents=value=>{if(!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(String(value)))fail('Tarifa de lavandería inválida.');const n=Math.round(Number(value)*100);if(!Number.isSafeInteger(n)||n<0)fail('Tarifa de lavandería fuera de rango.');return BigInt(n);};
export function validateLaundryPricing(service){
 const pricing=service.loadPricing;if(pricing==null)return;
 if(pricing.version!==LAUNDRY_PRICING_VERSION||service.unit!=='carga'||service.priceMode!=='fixed'||![0.5,1].includes(pricing.step)||!Array.isArray(pricing.options)||!pricing.options.length)fail('Configuración de cargas inválida.');
 const ids=new Set(),combinations=new Set();
 for(const option of pricing.options){
  if(!option.key||!option.label?.trim()||!Array.isArray(option.addons)||new Set(option.addons).size!==option.addons.length||option.addons.some(id=>!service.addons?.some(a=>a.id===id))||ids.has(option.key)||combinations.has(key(option.addons)))fail('Tipo de lavado inválido o repetido.');
  ids.add(option.key);combinations.add(key(option.addons));cents(option.full);
  if(pricing.step===0.5){if(option.half==null)fail('Define la tarifa de media carga.');cents(option.half);}else if(option.half!=null)fail('No se definió venta por media carga para este servicio.');
 }
}
export function laundryOptions(service){
 if(service.loadPricing){validateLaundryPricing(service);return service.loadPricing.options;}
 if(service.id==='fc:service:lavado'){
  const labels=[['solo','Solo lavado',[]],['insumos','Lavado + jabón y suavizante Full Clean',['insumos']],['secado','Lavado + secado',['secado']],['completo','Servicio completo: lavado, secado, jabón y suavizante Full Clean',['insumos','secado']]];
  return labels.filter(([, ,ids])=>ids.every(id=>service.addons?.some(a=>a.id===id))).map(([id,label,addons])=>({key:id,label,addons}));
 }
 return [{key:'base',label:service.name,addons:[]}];
}
export function calculateLaundryLoad(service,value,addons=[]){
 validateLaundryPricing(service);const pricing=service.loadPricing;
 if(!pricing)fail('La tarifa de medias cargas no está configurada.');
 const text=String(value??'').trim().replace(',','.');if(!/^\d+(?:\.\d{1,6})?$/.test(text))fail('Usa una cantidad positiva en incrementos de media carga.');
 const halfUnits=Number(text)*2;if(!Number.isSafeInteger(halfUnits)||halfUnits<=0)fail('Escribe una cantidad de cargas positiva.');
 if(new Set(addons).size!==addons.length)fail('Adicionales repetidos.');
 const option=pricing.options.find(o=>key(o.addons)===key(addons));if(!option)fail('Selecciona un tipo de lavado disponible.');
 const whole=Math.floor(halfUnits/2),half=halfUnits%2;if(half&&pricing.step!==0.5)fail('Este servicio admite únicamente cargas completas.');
 const amount=cents(option.full)*BigInt(whole)+(half?cents(option.half):0n);
 if(amount<=0n||amount>BigInt(Number.MAX_SAFE_INTEGER))fail('Subtotal de lavandería fuera de rango.');
 return {price:Number(cents(option.full))/100,amount:Number(amount)/100,snapshot:{version:pricing.version,optionKey:option.key,label:option.label,fullPrice:option.full,halfPrice:option.half??null,fullLoads:whole,halfLoads:half,amount:Number(amount)/100}};
}
