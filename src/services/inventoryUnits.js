import { UNITS,normalizeUnit } from '../utils/units.js';
// Escala fija explícita: no redondear cantidades físicas en silencio.
export function inventoryDecimal(value){
    if(!['number','string'].includes(typeof value))throw new Error('Cantidad no válida.');
    const text=String(value).trim();
    if(!/^-?\d+(?:\.\d{1,6})?$/.test(text))throw new Error('Usa una cantidad con hasta seis decimales, sin redondeo.');
    const [whole,fraction='']=text.replace('-','').split('.');
    return (text.startsWith('-')?-1n:1n)*(BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0')));
}
export function inventoryText(value){
    const sign=value<0n?'-':'';value=value<0n?-value:value;
    return sign+String(value/1000000n)+(value%1000000n?'.'+String(value%1000000n).padStart(6,'0').replace(/0+$/,''):'');
}
export function inventoryConvert(value,from,to){
    const source=UNITS.find(u=>u.id===normalizeUnit(from)),target=UNITS.find(u=>u.id===normalizeUnit(to));
    if(!source||!target||source.dimension!==target.dimension)throw new Error('Unidades incompatibles; no se supone el tamaño de un envase.');
    const factor=u=>u.factor===0.001?1n:1000n;
    const numerator=inventoryDecimal(value)*factor(source),denominator=factor(target);
    if(numerator%denominator!==0n)throw new Error('La conversión supera seis decimales; confirma una cantidad física representable.');
    return inventoryText(numerator/denominator);
}
