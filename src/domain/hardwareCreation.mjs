export const hardwareIdentity = value => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/(\d)\s*(ml|kg|g|l)\b/g,'$1 $2').replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).sort().join(' ');
export function suggestHardwareCategory(name, categories) {
  const n=hardwareIdentity(name);
  const label=/inodoro|bano|harpic|lysol|bomba/.test(n)?'Productos para baño':/guante|cepillo/.test(n)?'Accesorios de limpieza':/tocador|shampoo|manos|naturel+a|toalla sanitaria/.test(n)?'Higiene personal':/insecticida|matamoscas|tron/.test(n)?'Control de plagas':/muriatico|fabuloso|limpiahornos/.test(n)?'Limpiadores envasados':null;
  return categories.find(c=>c.active&&c.name===label)?.id??null;
}
export function quickPresentations(form) {
  if (!['piece','pack','both'].includes(form.saleMode)) return form.presentations;
  const rows=[];
  if(form.saleMode!=='piece') rows.push({name:`Paquete de ${form.packSize} piezas`,unit:'paquete',factor:form.packSize,price:form.packPrice});
  if(form.saleMode!=='pack') rows.push({name:'Pieza individual',unit:'pieza',factor:'1',price:form.piecePrice});
  return rows;
}
export const hardwarePresentationUnits=['pieza','paquete','kg','gramo','bolsa','envase','botella'];
export const wholeSaleUnit=unit=>!['kg','gramo'].includes(unit);
const decimalInput=value=>String(value??'').trim().replace(',','.');

export function hardwareCreationBundle(form) {
  if (['piece','pack','both'].includes(form.saleMode)) form={...form,unit:'pieza',presentations:quickPresentations(form)};
  const name=String(form.name??'').trim(),variant=String(form.variant??'').trim();
  if(!name)throw Error('Escribe el nombre del producto.');
  if(!['pieza','kg','gramo','bolsa','envase','botella'].includes(form.unit))throw Error('Selecciona una unidad válida.');
  const pricePending=form.pricePending===true;
  const presentations=(pricePending&&!form.saleMode?[]:form.presentations).map(p=>{
    const price=decimalInput(p.price),factor=decimalInput(p.factor);
    if(!hardwarePresentationUnits.includes(p.unit))throw Error('Selecciona la unidad de presentación.');
    if(!pricePending&&p.saleEnabled!==false&&(!/^\d+(?:\.\d{1,2})?$/.test(price)||Number(price)<=0))throw Error('Cada presentación de venta requiere precio positivo con hasta dos decimales.');
    if(!/^\d+(?:\.\d{1,6})?$/.test(factor)||Number(factor)<=0)throw Error('Indica el contenido real de cada presentación.');
    const name=p.name?.trim()||(p.unit==='paquete'?`Paquete de ${factor} ${form.unit==='pieza'?'piezas':form.unit}`:p.unit==='pieza'?'Pieza individual':p.unit);
    return {name,unit:p.unit,factor:Number(factor),price:pricePending||p.saleEnabled===false?0:Number(price),saleEnabled:p.saleEnabled!==false,purchaseEnabled:p.purchaseEnabled!==false,integerOnly:wholeSaleUnit(form.unit)||wholeSaleUnit(p.unit),active:true};
  });
  if(!pricePending&&!presentations.length)throw Error('Agrega una presentación.');
  if (['pack','both'].includes(form.saleMode) && (!/^\d+$/.test(String(form.packSize)) || Number(form.packSize)<2 || !Number.isSafeInteger(Number(form.packSize)))) throw Error('Indica al menos dos piezas por paquete.');
  const minimum=decimalInput(form.minimum);
  if(minimum&&!(/^\d+(?:\.\d{1,6})?$/.test(minimum)&&(!wholeSaleUnit(form.unit)||Number.isInteger(Number(minimum)))))throw Error('Indica un inventario mínimo válido en la unidad base.');
  const product={name:name+(variant?` · ${variant}`:''),unit:form.unit,hardwareCategoryId:form.hardwareCategoryId||null,
    characteristics:variant?`Variante: ${variant}`:'',active:true,available:!pricePending,pricePending,enforceStock:true,autoOpenPackages:form.saleMode==='both'||form.saleMode==='advanced'&&form.autoOpenPackages===true};
  let initialInventory;
  if(form.initialEnabled){
    let q=decimalInput(form.quantity);
    let observations='Inventario inicial confirmado al dar de alta el producto';
    const advancedPack=form.saleMode==='advanced'&&form.unit==='pieza'&&form.presentations.some(p=>p.unit==='paquete');
    if (['pack','both'].includes(form.saleMode)||advancedPack) {
      const index=advancedPack?Number(form.initialPresentationIndex):0;
      const factor=advancedPack?decimalInput(form.presentations[index]?.factor):form.packSize;
      if(advancedPack&&(form.initialPresentationIndex==null||form.initialPresentationIndex===''||form.presentations[index]?.unit!=='paquete'))throw Error('Selecciona el paquete que contaste.');
      if(!/^\d+$/.test(String(factor))||Number(factor)<2)throw Error('El paquete necesita un contenido entero de al menos dos piezas.');
      const closed=String(form.closedPackages??'').trim(),loose=String(form.looseUnits??'0').trim();
      if(!/^\d+$/.test(closed)||!/^\d+$/.test(loose))throw Error('Captura paquetes cerrados y piezas sueltas enteros; vacío no equivale a cero.');
      const opened=String(form.openPackages??'0').trim(),remaining=String(form.openPackagePieces??'0').trim();
      if(!/^\d+$/.test(opened)||(BigInt(opened)>0n&&!/^\d+$/.test(remaining)))throw Error('Captura paquetes abiertos y piezas restantes enteros.');
      const openCount=BigInt(opened),openPieces=openCount===0n?0n:BigInt(remaining);
      if(openCount>0n&&(openPieces<openCount||openPieces>openCount*BigInt(factor)))throw Error('Revisa las piezas que quedan en los paquetes abiertos.');
      const looseTotal=BigInt(loose)+openPieces;
      const total=BigInt(closed)*BigInt(factor)+looseTotal;
      if(form.openPackages!==undefined)observations+=` · Paquetes abiertos: ${openCount} · Piezas restantes en abiertos: ${openPieces}`;
      if(total>9007199254n)throw Error('Inventario inicial fuera de rango.');
      q=String(total);
      initialInventory={physicalComposition:{presentationIndex:index,closedPackages:closed,looseUnits:String(looseTotal)}};
    }
    if(!/^\d+(?:\.\d{1,6})?$/.test(q)||(!['kg','gramo'].includes(form.unit)&&!Number.isInteger(Number(q))))throw Error('Captura la cantidad inicial explícita y válida; vacío no equivale a cero.');
    initialInventory={...initialInventory,quantity:q,unit:form.unit,observations};
  }
  return {product,presentations,...(minimum!==''?{minimum}:{}),...(initialInventory?{initialInventory}:{})};
}
