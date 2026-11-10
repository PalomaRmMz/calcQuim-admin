import {inventoryDecimal} from '../services/inventoryUnits.js';
export function whole(value){const n=inventoryDecimal(value);if(n<0n||n%1000000n||n/1000000n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Usa una cantidad entera no negativa y representable.');return n/1000000n;}
export function packOptions(product,presentations){
 if(product?.activity!=='JARCERIA'||product.unit!=='pieza')return [];
 const rows=presentations.filter(p=>String(p.productId)===String(product.id)&&p.active);
 if(!rows.some(p=>p.unit==='pieza'&&Number(p.factor)===1))return [];
 return rows.filter(p=>p.unit==='paquete'&&Number.isSafeInteger(Number(p.factor))&&Number(p.factor)>1);
}
export function composition(spec,presentation){
 if(!presentation||spec?.presentationId!==presentation.id)throw Error('Selecciona la presentación cerrada correspondiente.');
 const closed=whole(spec.closedPackages),loose=whole(spec.looseUnits),factor=whole(presentation.factor);
 if(factor<2n)throw Error('El paquete debe contener más de una unidad base.');
 const total=closed*factor+loose;if(total>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Composición fuera de rango.');
 return {known:true,presentationId:presentation.id,factor:String(factor),closedPackages:String(closed),looseUnits:String(loose),total:String(total)};
}
export function consumeUnits(state,quantity){
 const q=whole(quantity),factor=whole(state.factor),closed=whole(state.closedPackages),loose=whole(state.looseUnits);
 if(q>closed*factor+loose)throw Error('Existencias insuficientes: no se permite descontar más unidades de las disponibles.');
 const needed=q>loose?q-loose:0n,opened=(needed+factor-1n)/factor;
 const afterOpen={...state,closedPackages:String(closed-opened),looseUnits:String(loose+opened*factor)};
 return {opened:String(opened),afterOpen,after:{...afterOpen,looseUnits:String(loose+opened*factor-q),total:String(closed*factor+loose-q)}};
}
export function consumeClosed(state,packages){
 const q=whole(packages),closed=whole(state.closedPackages);if(q>closed)throw Error('Paquetes cerrados insuficientes; los sueltos no se convierten en paquetes.');
 return {...state,closedPackages:String(closed-q),total:String((closed-q)*whole(state.factor)+whole(state.looseUnits))};
}
