import {inventoryConvert,inventoryDecimal} from './inventoryUnits.js';
import {saleInventoryBaseline} from './saleInventoryBaseline.js';
import {getProductChoiceLabels,normalizeText} from '../utils/catalogUtils.js';

export function compatibleSaleProducts(pending,item,products){
    return [...new Map(products.filter(p=>item.eligibleProductIds?item.eligibleProductIds.some(id=>String(id)===String(p.id)):
        pending.scope==='product'?String(p.id)===String(pending.scope_id):
        pending.scope==='line'?String(p.lineId)===String(pending.scope_id):
        pending.scope==='category'?String(p.categoryId)===String(pending.scope_id):false).map(p=>[String(p.id),p])).values()];
}
export function breakdownProductLabels(products,categories,lines,presentations=[]){
    const names=getProductChoiceLabels(products,categories,lines);
    const counts=new Map();
    const options=products.map(product=>{
        const detail=[product.brand,product.variant,product.characteristics,
            ...presentations.filter(p=>p.active&&String(p.productId)===String(product.id)).map(p=>p.name)].filter(Boolean);
        const name=names.get(product.id);
        const label=[name,...new Set(detail.filter(value=>!normalizeText(name).includes(normalizeText(value))))].join(' · ');
        const normalized=normalizeText(label);
        counts.set(normalized,(counts.get(normalized)??0)+1);
        return [String(product.id),label];
    });
    return new Map(options.map(([id,label])=>[id,counts.get(normalizeText(label))>1?`${label} · SKU ${id}`:label]));
}
export function initialBreakdownDraft(pending,item,products){
    const compatible=compatibleSaleProducts(pending,item,products);
    return {enabled:true,physical:'',allocations:[{productId:compatible.length===1?String(compatible[0].id):'',quantity:pending.quantity??'',baselineTreatment:''}]};
}
export function buildSaleBreakdownRows(sale,pending,drafts,products,view){
    const rows=[];
    for(const row of pending){
        const draft=drafts[row.id]??initialBreakdownDraft(row,sale.items[row.ordinal],products);
        if(!draft.enabled)continue;
        const label=sale.items[row.ordinal]?.name||`Renglón ${row.ordinal+1}`;
        try{
            const allowed=compatibleSaleProducts(row,sale.items[row.ordinal],products);
            const expected=inventoryDecimal(row.quantity??draft.physical);
            if(expected<=0n)throw Error('Confirma una cantidad total positiva.');
            const seen=new Set();let total=0n;
            const allocations=draft.allocations.map(a=>{
                const product=allowed.find(p=>String(p.id)===String(a.productId));
                if(!product)throw Error('Selecciona el producto entregado.');
                if(seen.has(String(product.id)))throw Error('No repitas el mismo producto; suma su cantidad en una sola fila.');
                seen.add(String(product.id));
                if(inventoryDecimal(a.quantity)<=0n)throw Error('La cantidad debe ser positiva.');
                total+=inventoryDecimal(inventoryConvert(a.quantity,product.unit,row.unit));
                const review=saleInventoryBaseline(sale,row,product.id,view);
                if(review.required&&!['already_included','apply_now'].includes(a.baselineTreatment))throw Error('Indica si esta salida ya estaba incluida en el conteo mostrado.');
                return {productId:product.id,quantity:a.quantity,unit:product.unit,...(review.required?{baselineTreatment:a.baselineTreatment}:{})};
            });
            if(!allocations.length||total!==expected)throw Error(`Las cantidades deben sumar ${row.quantity??draft.physical} ${row.unit}.`);
            rows.push({pendingId:row.id,confirmedQuantity:row.quantity??draft.physical,confirmedUnit:row.unit,allocations});
        }catch(error){throw Object.assign(new Error(`${label}: ${error.message}`),{pendingId:row.id});}
    }
    if(!rows.length)throw Error('Selecciona al menos un renglón para completar.');
    return rows;
}
