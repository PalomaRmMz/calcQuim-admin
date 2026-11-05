export function pendingSaleLabel(pending,sales){
    const sale=sales.find(s=>String(s.id)===String(pending.sale_id));
    const item=sale?.items?.[pending.ordinal];
    return `${sale?.folio||'Venta sin folio'} · ${item?.name||item?.group?.name||`Renglón ${pending.ordinal+1}`} · ${pending.quantity==null?'Falta cantidad física':`Falta desglose de ${pending.quantity} ${pending.unit}`}`;
}

