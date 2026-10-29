// Identificadores persistentes: cambiar una etiqueta nunca renumera el motivo.
export const INVENTORY_REASON_VERSION=1;
export const INVENTORY_REASONS={
    initial_correction:'Corrección de inventario inicial',
    initial_inventory:'Inventario inicial',physical_count:'Conteo físico',visual_estimate:'Estimación visual',stock_correction:'Corrección de existencia',
    prepared_product:'Preparación de producto',finished_receipt:'Recepción de producto terminado',positive_adjustment:'Ajuste positivo',
    internal_use:'Uso interno',waste:'Merma',exit_correction:'Corrección de salida',
    capture_error:'Error de captura',count_correction:'Corrección de conteo',entry_correction:'Corrección de captura',
    replenishment_configuration:'Configuración de reposición',sale_allocation:'Desglose de venta',purchase_review:'Revisión de recepción',sale_void:'Anulación de venta',
    sale_known_quantity:'Venta con cantidad física conocida',other:'Otro',legacy_free_text:'Motivo anterior de texto libre',
};
const contexts={
    initial:['initial_inventory','physical_count','visual_estimate'],count:['physical_count','count_correction'],initial_correction:['initial_correction','capture_error','count_correction'],
    estimate:['initial_inventory','physical_count','visual_estimate','stock_correction'],
    prepared:['prepared_product'],receipt:['finished_receipt'],return:['finished_receipt'],
    outflow:['internal_use','waste','exit_correction'],waste:['internal_use','waste','exit_correction'],
    adjustment:['count_correction','entry_correction'],positive_adjustment:['positive_adjustment'],
    correction:['count_correction','entry_correction'],reversal:['count_correction','entry_correction','exit_correction'],
    replenishment:['replenishment_configuration'],allocation:['sale_allocation'],purchase_review:['purchase_review'],sale_void:['sale_void','entry_correction'],
};
export function inventoryReasonOptions(context){
    if(!contexts[context])throw new Error('Operación de motivo no válida.');
    return [...contexts[context],'other'].map(id=>({id,label:INVENTORY_REASONS[id]}));
}
export const emptyInventoryReason=()=>({reasonCode:'',reasonExplanation:'',observations:''});
export function movementReasonContext(kind,quantity,reference){
    if(kind==='adjustment')return reference?.entryType==='justified_outflow'?'outflow':reference?.entryType==='positive_adjustment'?'positive_adjustment':'adjustment';
    return kind;
}
function text(value,max,label){
    if(value==null)return '';
    if(typeof value!=='string'||value.trim().length>max)throw new Error(`${label}: máximo ${max} caracteres.`);
    return value.trim();
}
export function resolveInventoryReason(input,context,{allowLegacy=true}={}){
    const observations=text(input.observations,2000,'Observaciones');
    if(input.reasonCode==null&&allowLegacy){
        const legacy=text(input.reason,1000,'Motivo');if(!legacy)throw new Error('Selecciona un motivo.');
        return {text:legacy,metadata:{reasonCode:'legacy_free_text',reasonCatalogVersion:1,reasonSource:'legacy_api',observations}};
    }
    if(!inventoryReasonOptions(context).some(r=>r.id===input.reasonCode))throw new Error('Selecciona un motivo válido para esta operación.');
    const explanation=input.reasonCode==='other'?text(input.reasonExplanation,1000,'Explicación de Otro'):'';
    if(input.reasonCode==='other'&&!explanation)throw new Error('Explica el motivo cuando selecciones Otro.');
    return {text:INVENTORY_REASONS[input.reasonCode],metadata:{reasonCode:input.reasonCode,reasonCatalogVersion:1,reasonExplanation:explanation,observations}};
}
export function inventoryReasonPayload(value,context){
    const resolved=resolveInventoryReason(value,context,{allowLegacy:false});
    return {...resolved.metadata,reason:resolved.text};
}
