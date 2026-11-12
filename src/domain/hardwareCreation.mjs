export const hardwareIdentity = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/(\d)\s*(ml|kg|g|l)\b/g,'$1 $2').replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).sort().join(' ');
export function suggestHardwareCategory(name, categories) {
  const n=hardwareIdentity(name);
  const label=/inodoro|bano|harpic|lysol|bomba/.test(n)?'Productos para baño':/guante|cepillo/.test(n)?'Accesorios de limpieza':/tocador|shampoo|manos/.test(n)?'Higiene personal':/insecticida|matamoscas|tron/.test(n)?'Control de plagas':/muriatico|fabuloso|limpiahornos/.test(n)?'Limpiadores envasados':null;
  return categories.find(c=>c.active&&c.name===label)?.id??null;
}
export function hardwareCreationBundle(form) {
  const name=String(form.name??'').trim(),variant=String(form.variant??'').trim();
  if(!name)throw Error('Escribe el nombre del producto.');
  if(!['pieza','kg','gramo','bolsa','envase','botella'].includes(form.unit))throw Error('Selecciona una unidad válida.');
  const pricePending=form.pricePending===true;
  const presentations=pricePending?[]:form.presentations.map(p=>{
    if(!p.name?.trim()||!/^\d+(?:\.\d{1,2})?$/.test(String(p.price))||Number(p.price)<=0)throw Error('Cada presentación requiere nombre y precio positivo con hasta dos decimales.');
    if(!/^\d+(?:\.\d{1,6})?$/.test(String(p.factor))||Number(p.factor)<=0)throw Error('Indica el contenido real de cada presentación.');
    return {name:p.name.trim(),unit:p.unit,factor:Number(p.factor),price:Number(p.price),integerOnly:!['kg','gramo'].includes(form.unit),active:true};
  });
  if(!pricePending&&!presentations.length)throw Error('Agrega una presentación.');
  const product={name:name+(variant?` · ${variant}`:''),unit:form.unit,hardwareCategoryId:form.hardwareCategoryId||null,
    characteristics:variant?`Variante: ${variant}`:'',active:true,available:!pricePending,pricePending};
  let initialInventory;
  if(form.initialEnabled){
    const q=String(form.quantity??'').trim();
    if(!/^\d+(?:\.\d{1,6})?$/.test(q)||(!['kg','gramo'].includes(form.unit)&&!Number.isInteger(Number(q))))throw Error('Captura la cantidad inicial explícita y válida; vacío no equivale a cero.');
    initialInventory={quantity:q,unit:form.unit,observations:'Inventario inicial confirmado al dar de alta el producto'};
  }
  return {product,presentations,...(initialInventory?{initialInventory}:{})};
}
