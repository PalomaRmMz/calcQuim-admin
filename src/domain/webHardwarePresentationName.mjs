import {normalizeText} from '../utils/catalogUtils.js';
import {unitLabel} from '../utils/units.js';

export const webHardwareSaleUnit=presentation=>presentation?.unit==='pieza'&&
 presentation.baseUnit==='pieza'&&Number(presentation.factor)===1&&normalizeText(presentation.name)==='par'
 ?'par':presentation?.unit;

export function webHardwareStockUnit(productId,unit,presentations){
 if(unit!=='pieza')return unit;
 const active=presentations.filter(p=>p.active&&String(p.productId)===String(productId));
 return active.length===1&&webHardwareSaleUnit(active[0])==='par'?'par':unit;
}

export function webHardwarePresentationName(productName, presentation, baseUnit) {
 const name=String(presentation.name??'').trim().replace(/\s+/g,' ');
 const parts=name.split(/\s+·\s+/);
 const title=normalizeText(productName);
 if(name&&normalizeText(name)!==title){
  if(parts.length<2||normalizeText(parts[0])!==title)return name;
  return parts.slice(1).join(' · ');
 }
 const factor=Number(presentation.factor);
 const base=baseUnit==='pieza'?(factor===1?'pieza':'piezas'):unitLabel(baseUnit);
 if(presentation.key==='rollo'&&factor===1)return 'Rollo individual';
 if(presentation.unit==='paquete')return 'Paquete de '+factor+' '+base;
 if(factor!==1)return 'Presentación de '+factor+' '+base;
 const single={pieza:'Pieza individual',bolsa:'Bolsa individual',envase:'Envase individual',botella:'Botella individual',kg:'Por kilogramo',gramo:'Por gramo'};
 return single[presentation.unit]??unitLabel(presentation.unit);
}
