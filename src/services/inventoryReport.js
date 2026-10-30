import {inventoryDecimal} from './inventoryUnits.js';
import {getProductDisplayName} from '../utils/catalogUtils.js';
export const stockStates={out:'AGOTADO',low:'POR REPONER',sufficient:'SUFICIENTE',unknown:'SIN EXISTENCIA DETERMINADA',unconfigured:'SIN PUNTO DE REPOSICIÓN'};
export function inventoryReportRows(products,categories=[],lines=[]){
    return products.map(p=>{
        const known=p.quantity!==null,negative=known&&inventoryDecimal(p.quantity)<0n,missingThreshold=known&&p.minimum===null;
        const status=!known?'unknown':inventoryDecimal(p.quantity)<=0n?'out':missingThreshold?'unconfigured':inventoryDecimal(p.quantity)<=inventoryDecimal(p.minimum)?'low':'sufficient';
        return {...p,id:p.productId,name:getProductDisplayName(p,categories,lines),category:categories.find(c=>c.id===p.categoryId)?.name||'Sin categoría',status,negative,missingThreshold,stateLabel:stockStates[status]+(negative?' · SALDO NEGATIVO: CONCILIAR':''),suggestedQuantity:p.usualBatch,suggestionType:p.usualBatch===null?'Sin lote configurado':'Lote habitual orientativo; no es una necesidad exacta',action:'Reponer'};
    }).sort((a,b)=>a.category.localeCompare(b.category,'es')||a.name.localeCompare(b.name,'es'));
}
export function filterInventoryReport(rows,{category='',line='',search='',state=''}={}){
    const text=search.trim().toLocaleLowerCase('es');
    return rows.filter(r=>(!category||String(r.categoryId)===String(category))&&(!line||String(r.lineId)===String(line))&&(!text||r.name.toLocaleLowerCase('es').includes(text))&&(!state||(state==='need'?['out','low'].includes(r.status):state==='negative'?r.negative:state==='unconfigured'?r.missingThreshold:r.status===state)));
}
export function inventoryReportSummary(rows){return Object.fromEntries([...Object.keys(stockStates),'negative'].map(key=>[key,filterInventoryReport(rows,{state:key}).length]));}
export const inventoryExportColumns=[['name','Producto'],['category','Categoría'],['quantity','Existencia aproximada'],['unit','Unidad'],['minimum','Punto de reposición'],['usualBatch','Lote habitual'],['stateLabel','Estado de abastecimiento'],['suggestedQuantity','Cantidad sugerida'],['suggestionType','Tipo de sugerencia'],['action','Acción']].map(([key,label])=>({key,label,width:key==='suggestionType'?50:28,type:'text'}));
export function inventoryReportWorkbook(rows,capturedAt){return {scope:'inventory',capturedAt,issueCount:0,sheets:[{name:'Existencias y reposición',columns:inventoryExportColumns,rows:rows.map(r=>({...r,quantity:r.quantity===null?'Sin determinar':r.quantity,minimum:r.minimum===null?'Sin configurar':r.minimum,usualBatch:r.usualBatch===null?'Sin configurar':r.usualBatch,suggestedQuantity:r.suggestedQuantity===null?'No calculable':r.suggestedQuantity}))}]};}
export function inventoryReportCsv(rows){
    const safe=value=>{const s=String(value??'');return '"'+((/^\s*[=+@-]/.test(s)||/^[\t\r]/.test(s))&&!/^-?\d+(\.\d+)?$/.test(s)?"'"+s:s).replaceAll('"','""')+'"';};
    const sheet=inventoryReportWorkbook(rows,new Date()).sheets[0];
    return '\uFEFF'+[sheet.columns.map(c=>safe(c.label)).join(','),...sheet.rows.map(r=>sheet.columns.map(c=>safe(r[c.key])).join(','))].join('\r\n');
}
