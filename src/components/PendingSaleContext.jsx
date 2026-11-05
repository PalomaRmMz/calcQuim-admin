const money=value=>value!=null&&value!==''&&Number.isFinite(Number(value))?new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(value)):'Sin dato';

export default function PendingSaleContext({pending,sale,item}){
    const missingQuantity=pending.quantity==null;
    const grouped=pending.scope!=='product';
    return <section className="border rounded bg-light p-3 my-3" aria-label="Qué revisar en esta venta">
        <h3 className="h6">Qué revisar en {sale?.folio||'esta venta'}</h3>
        <dl className="row mb-2">
            <dt className="col-sm-4">Fecha de venta</dt><dd className="col-sm-8">{sale?.date||'Sin dato'}</dd>
            <dt className="col-sm-4">Origen / pago</dt><dd className="col-sm-8">{({MOVIL:'Móvil',WEB:'Computadora'})[sale?.origin]||'Sin dato'} · {sale?.payment||'Sin dato'}</dd>
            <dt className="col-sm-4">Producto o grupo vendido</dt><dd className="col-sm-8">{item?.name||item?.group?.name||'Sin nombre disponible'} · renglón {pending.ordinal+1}</dd>
            <dt className="col-sm-4">Captura original</dt><dd className="col-sm-8">{item?.entryMode==='amount'?`Por monto: ${money(item.requestedAmount??item.capturedValue??item.amount)}`:`Por cantidad: ${item?.quantity??pending.quantity??'Sin dato'} ${item?.unit||pending.unit}`}</dd>
            <dt className="col-sm-4">Precio registrado por unidad</dt><dd className="col-sm-8">{money(item?.price)} / {item?.unit||pending.unit}</dd>
            <dt className="col-sm-4">Importe del renglón</dt><dd className="col-sm-8">{item?money(item.amount):'Sin dato'}</dd>
            <dt className="col-sm-4">Total de la venta</dt><dd className="col-sm-8">{sale?money(sale.total):'Sin dato'}</dd>
        </dl>
        {sale?.notes&&<p><strong>Notas de la venta: </strong>{sale.notes}</p>}
        {sale?.items?.length>1&&<details className="mb-3"><summary>Ver los demás renglones de esta venta</summary><ul>{sale.items.map((row,index)=><li key={index}>{index+1}. {row.name||row.group?.name||'Sin nombre'} · {money(row.amount)}{index===pending.ordinal?' · Pendiente seleccionado':''}</li>)}</ul></details>}
        <p className="mb-2"><strong>Por qué está pendiente: </strong>{missingQuantity?'Se registró el cobro, pero falta confirmar la cantidad física entregada.':`Está registrada la cantidad total (${pending.quantity} ${pending.unit}), pero falta asignarla a los productos que salieron.`} {grouped&&'La venta corresponde a un grupo; necesitas identificar los productos concretos entregados.'}</p>
        <p className="mb-2"><strong>Qué debes completar: </strong>{missingQuantity?`Consulta el ticket o confirma con quien hizo la venta cuántos ${pending.unit} se entregaron. Captura esa cantidad y repártela entre los productos que realmente salieron.`:`Agrega los productos entregados y sus cantidades. El desglose debe sumar ${pending.quantity} ${pending.unit}.`}</p>
        <p className="mb-0 text-muted">Si no puedes comprobar qué se entregó, déjalo pendiente hasta aclararlo. El monto cobrado por sí solo no confirma la cantidad física. Esta confirmación completa el inventario y conserva el importe de la venta.</p>
    </section>;
}
