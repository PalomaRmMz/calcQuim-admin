import {cleaningInventoryLabels,inventoryAttention,requiresInventoryPurchase} from '../domain/inventoryAttention.mjs';
import {getProductDisplayName} from '../utils/catalogUtils.js';
export const stockStates={out:'AGOTADO',low:'POR REPONER',sufficient:'SUFICIENTE',unknown:'SIN EXISTENCIA DETERMINADA',unconfigured:'SIN PUNTO DE REPOSICIÓN',negative:'SALDO NEGATIVO: CONCILIAR'};
export const presentationStockText=rows=>rows.map(r=>r.name+': '+r.balance+' paquetes').join(' · ');
export const inventoryReportLabels=activity=>activity==='LIMPIEZA'?{
    ...stockStates,out:cleaningInventoryLabels.empty,low:cleaningInventoryLabels.low,
    sufficient:cleaningInventoryLabels.sufficient,unknown:cleaningInventoryLabels.unknown,
}:stockStates;
export function inventoryReportRows(products,categories=[],lines=[],activity){
    const labels=inventoryReportLabels(activity);
    return products.map(p=>{
        const {key}=inventoryAttention(p),negative=key==='negative',missingThreshold=p.minimum==null;
        const status=key==='empty'?'out':key;
        if(key==='presentation')return {...p,id:p.productId,name:getProductDisplayName(p,categories,lines),
            category:categories.find(c=>String(c.id)===String(p.categoryId))?.name||'Sin categoría',
            status,negative:false,missingThreshold:false,stateLabel:'Inventario por presentación',suggestedQuantity:null,suggestionType:'Consultar formatos',
            quantity:null,unit:'paquete',minimum:null,usualBatch:null,action:p.presentationStock.some(r=>r.balance==='0')?'Reponer formato agotado':'Consultar saldos por presentación'};
        return {...p,id:p.productId,name:getProductDisplayName(p,categories,lines),category:categories.find(c=>String(c.id)===String(p.categoryId))?.name||'Sin categoría',status,negative,missingThreshold,stateLabel:labels[status],suggestedQuantity:p.usualBatch,suggestionType:p.usualBatch===null?'Sin lote configurado':'Lote habitual orientativo; no es una necesidad exacta',action:requiresInventoryPurchase(key)?'Reponer':negative?'Conciliar saldo':key==='unknown'?'Determinar existencia':missingThreshold?'Configurar punto de reposición':'Sin reposición inmediata'};
    }).sort((a,b)=>a.category.localeCompare(b.category,'es')||a.name.localeCompare(b.name,'es'));
}
export function filterInventoryReport(rows,{category='',line='',search='',state=''}={}){
    const text=search.trim().toLocaleLowerCase('es');
    return rows.filter(r=>(!category||String(r.categoryId)===String(category))&&(!line||String(r.lineId)===String(line))&&(!text||r.name.toLocaleLowerCase('es').includes(text))&&(!state||(state==='need'?requiresInventoryPurchase(r.status==='out'?'empty':r.status)||r.presentationStock?.some(f=>f.balance==='0'):state==='negative'?r.negative:state==='unconfigured'?r.missingThreshold:r.status===state)));
}
export function inventoryReportSummary(rows){return Object.fromEntries(Object.keys(stockStates).map(key=>[key,filterInventoryReport(rows,{state:key}).length]));}
export const inventoryExportColumns=[['name','Producto'],['category','Categoría'],['quantity','Existencia aproximada'],['unit','Unidad'],['minimum','Punto de reposición'],['usualBatch','Lote habitual'],['stateLabel','Estado de abastecimiento'],['suggestedQuantity','Cantidad sugerida'],['suggestionType','Tipo de sugerencia'],['action','Acción']].map(([key,label])=>({key,label,width:key==='suggestionType'?50:28,type:'text'}));
export function inventoryReportWorkbook(rows,capturedAt){return {scope:'inventory',capturedAt,issueCount:0,sheets:[{name:'Existencias y reposición',columns:inventoryExportColumns,rows:rows.map(r=>({...r,quantity:r.presentationStock?presentationStockText(r.presentationStock):r.quantity===null?'Sin determinar':r.quantity,minimum:r.minimum===null?'Sin configurar':r.minimum,usualBatch:r.usualBatch===null?'Sin configurar':r.usualBatch,suggestedQuantity:r.suggestedQuantity===null?'No calculable':r.suggestedQuantity}))}]};}
export function inventoryReportCsv(rows){
    const safe=value=>{const s=String(value??'');return '"'+((/^\s*[=+@-]/.test(s)||/^[\t\r]/.test(s))&&!/^-?\d+(\.\d+)?$/.test(s)?"'"+s:s).replaceAll('"','""')+'"';};
    const sheet=inventoryReportWorkbook(rows,new Date()).sheets[0];
    return '\uFEFF'+[sheet.columns.map(c=>safe(c.label)).join(','),...sheet.rows.map(r=>sheet.columns.map(c=>safe(r[c.key])).join(','))].join('\r\n');
}
