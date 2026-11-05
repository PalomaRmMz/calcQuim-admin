import {useEffect,useState} from 'react';
import {money} from '../utils/salesUtils.js';
import {saleInventoryBaseline} from '../services/saleInventoryBaseline.js';
import {buildSaleBreakdownRows,compatibleSaleProducts,initialBreakdownDraft} from '../services/saleBreakdownDraft.js';
import '../styles/components/SaleBreakdownEditor.css';
const moment=value=>new Date(value).toLocaleString('es-MX',{timeZone:'America/Mexico_City'});
export default function SaleBreakdownEditor({sale,persistence,products}){
    const [view,setView]=useState(null),[drafts,setDrafts]=useState({}),[observations,setObservations]=useState('');
    const [error,setError]=useState(''),[errorId,setErrorId]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
    useEffect(()=>{
        let active=true;
        fetch('/api/v1/inventory').then(async r=>{if(!r.ok)throw Error('No se pudo consultar el desglose. Actualiza los datos para reintentar.');return r.json();})
            .then(v=>{if(active)setView(v);}).catch(e=>{if(active)setError(e.message);});
        return()=>{active=false;};
    },[sale.id,persistence.snapshot.revision]);
    const pending=(view?.pending||[]).filter(p=>String(p.sale_id)===String(sale.id)&&p.state==='pending');
    const draftFor=row=>drafts[row.id]??initialBreakdownDraft(row,sale.items[row.ordinal],products);
    const update=(row,patch)=>{setDrafts(current=>({...current,[row.id]:{...(current[row.id]??initialBreakdownDraft(row,sale.items[row.ordinal],products)),...patch}}));setError('');setErrorId('');setNotice('');};
    const count=pending.filter(row=>draftFor(row).enabled).length;
    async function save(e){
        e.preventDefault();if(busy)return;setError('');setErrorId('');
        let rows;
        try{rows=buildSaleBreakdownRows(sale,pending,drafts,products,view);}
        catch(e){setError(e.message);setErrorId(e.pendingId||'');return;}
        setBusy(true);
        try{
            const result=await persistence.command('resolveSaleBreakdowns',[{saleId:sale.id,rows,observations}]);
            if(!result.ok)throw Error(result.message);
            setView(current=>({...current,pending:current.pending.filter(p=>!rows.some(row=>row.pendingId===p.id))}));
            setDrafts({});setObservations('');setNotice(`${rows.length} ${rows.length===1?'renglón completado':'renglones completados'}. Los importes se conservaron.`);
        }catch(e){setError(e.message);}finally{setBusy(false);}
    }
    return <section className="sale-breakdown-editor" aria-label="Desglose de la venta">
        <div className="sale-breakdown-heading"><div><h3>Desglose de la venta</h3><p>Indica qué productos entregaste. Guarda varios renglones juntos.</p></div>{pending.length>0&&<span>{pending.length} por completar</span>}</div>
        {error&&<p role="alert" className="alert alert-danger">{error}</p>}{notice&&<p role="status" className="alert alert-success">{notice}</p>}
        {!view?<p>Cargando desglose…</p>:!pending.length?<p className="text-success">Desglose completo.</p>:<form onSubmit={save} noValidate><fieldset disabled={busy} className="sale-breakdown-fields">
            {pending.map(row=>{
                const item=sale.items[row.ordinal],draft=draftFor(row),allowed=compatibleSaleProducts(row,item,products);
                return <article key={row.id} className={`sale-breakdown-card${errorId===row.id?' sale-breakdown-error':''}`}>
                    <header><label><input type="checkbox" checked={draft.enabled} onChange={e=>update(row,{enabled:e.target.checked})}/><strong>{item.name}</strong></label><span>{row.quantity!=null?`${row.quantity} ${row.unit}`:'Cantidad por confirmar'} · {money(item.amount)}</span></header>
                    {!draft.enabled?<p className="text-muted mb-0">Se deja pendiente para después.</p>:<>
                        {row.quantity==null&&<label className="d-block mb-2">Cantidad total entregada ({row.unit})<input className="form-control" type="number" min="0.000001" step="0.000001" value={draft.physical} onChange={e=>update(row,{physical:e.target.value})}/></label>}
                        {draft.allocations.map((allocation,index)=>{
                            const product=allowed.find(p=>String(p.id)===String(allocation.productId));
                            const review=product?saleInventoryBaseline(sale,row,product.id,view):null;
                            const change=patch=>update(row,{allocations:draft.allocations.map((a,n)=>n===index?{...a,...patch}:a)});
                            return <div key={index} className="sale-breakdown-allocation"><div className="sale-breakdown-inputs">
                                <label>Producto entregado<select aria-label={`Producto entregado de ${item.name}, parte ${index+1}`} className="form-select" value={allocation.productId} onChange={e=>change({productId:e.target.value,baselineTreatment:''})}><option value="">Selecciona el producto</option>{allowed.map(p=><option key={p.id} value={String(p.id)}>{p.name}</option>)}</select></label>
                                <label>Cantidad ({product?.unit||row.unit})<input aria-label={`Cantidad de ${item.name}, parte ${index+1}`} className="form-control" type="number" min="0.000001" step="0.000001" value={allocation.quantity} onChange={e=>change({quantity:e.target.value})}/></label>
                                {draft.allocations.length>1&&<button type="button" className="btn btn-outline-secondary" aria-label={`Quitar parte ${index+1} de ${item.name}`} onClick={()=>update(row,{allocations:draft.allocations.filter((_,n)=>n!==index)})}>Quitar</button>}
                            </div>{review?.required&&Number(allocation.quantity)>0&&<div className="sale-breakdown-baseline"><p>Venta: {sale.date}. Conteo de {product.name}: {moment(review.anchorAt)}.</p><label>¿El conteo ya contemplaba esta salida?<select className="form-select" value={allocation.baselineTreatment} onChange={e=>change({baselineTreatment:e.target.value})}><option value="">Selecciona</option><option value="already_included">Sí, no descontar otra vez</option><option value="apply_now">No, descontar ahora</option></select></label></div>}</div>;
                        })}
                        {allowed.length>1&&<button type="button" className="btn btn-link px-0" onClick={()=>update(row,{allocations:[...draft.allocations,{productId:'',quantity:'',baselineTreatment:''}]})}>+ Repartir entre varios productos</button>}
                        {!allowed.length&&<p role="alert">No hay productos compatibles con la tarifa de esta venta.</p>}
                    </>}
                </article>;
            })}
            <details className="sale-breakdown-notes"><summary>Agregar una observación (opcional)</summary><textarea aria-label="Observación del desglose" className="form-control mt-2" maxLength={2000} value={observations} onChange={e=>setObservations(e.target.value)}/></details>
            <footer><small>El cobro se conserva. El inventario se actualiza al guardar.</small><button className="btn btn-primary" disabled={!count} type="submit">{busy?'Guardando…':`Guardar ${count===1?'1 renglón':`${count} renglones`}`}</button></footer>
        </fieldset></form>}
        {sale.breakdowns&&Object.keys(sale.breakdowns).length>0&&<details className="mt-3"><summary>Productos ya confirmados</summary>{Object.entries(sale.breakdowns).map(([ordinal,rows])=><p key={ordinal} className="mt-2 mb-0"><strong>{sale.items[ordinal]?.name}: </strong>{rows.map(r=>`${r.name}: ${r.quantity} ${r.unit}`).join(' · ')}</p>)}</details>}
    </section>;
}
