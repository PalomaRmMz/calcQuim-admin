import { useEffect, useState } from 'react';
import InventoryReasonFields from './InventoryReasonFields';
import PendingSaleContext from './PendingSaleContext';
import { emptyInventoryReason, inventoryReasonPayload } from '../services/inventoryReasons.js';
import {saleInventoryBaseline} from '../services/saleInventoryBaseline.js';
const date=value=>value?new Date(value).toLocaleString('es-MX',{timeZone:'America/Mexico_City'}):'Sin fecha registrada';
export default function MobileSaleBreakdown({ sale, persistence, products }) {
  const [view,setView]=useState(null),[selected,setSelected]=useState(''),[quantities,setQuantities]=useState({}),[physical,setPhysical]=useState(''),[baselines,setBaselines]=useState({}),[reason,setReason]=useState(emptyInventoryReason),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  useEffect(()=>{let active=true;fetch('/api/v1/inventory').then(async r=>{if(!r.ok)throw Error('No se pudo consultar el inventario.');return r.json();}).then(v=>{if(active)setView(v);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[sale.id,persistence.snapshot.revision]);
  const pending=(view?.pending||[]).filter(p=>String(p.sale_id)===String(sale.id)&&p.state==='pending');
  const row=pending.find(p=>p.id===selected),captured=row&&sale.items[row.ordinal];
  const compatible=captured?products.filter(p=>captured.eligibleProductIds?captured.eligibleProductIds.some(id=>String(id)===String(p.id)):row.scope==='product'?String(p.id)===String(row.scope_id):row.scope==='line'?String(p.lineId)===String(row.scope_id):row.scope==='category'?String(p.categoryId)===String(row.scope_id):false):[];
  function select(value){setSelected(value);setQuantities({});setPhysical('');setBaselines({});setError('');setNotice('');}
  async function save(e){
    e.preventDefault();if(busy||!row)return;setBusy(true);setError('');setNotice('');
    try{
      const allocations=compatible.filter(p=>Number(quantities[p.id])>0).map(p=>{const review=saleInventoryBaseline(sale,row,p.id,view);return {productId:p.id,quantity:quantities[p.id],unit:p.unit,...(review.required?{baselineTreatment:baselines[p.id]||undefined}:{})};});
      const result=await persistence.command('inventoryAllocate',[{pendingId:row.id,allocations,confirmedQuantity:physical,confirmedUnit:row.unit,...inventoryReasonPayload(reason,'allocation')}]);
      if(!result.ok)throw Error(result.message);
      setSelected('');setQuantities({});setPhysical('');setBaselines({});setReason(emptyInventoryReason());setNotice('Desglose guardado. El inventario fue actualizado una sola vez.');
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  return <section className="sale-section"><h3>Productos entregados e inventario</h3>{error&&<p role="alert" className="alert alert-danger">{error}</p>}{notice&&<p role="status" className="alert alert-success">{notice}</p>}{!view?<p>Consultando pendientes...</p>:!pending.length?<p>Sin pendientes de inventario.</p>:<form onSubmit={save}>
    <label>Producto o grupo pendiente<select required className="form-select" value={selected} onChange={e=>select(e.target.value)}><option value="">Selecciona</option>{pending.map(p=><option key={p.id} value={p.id}>{sale.items[p.ordinal]?.name} ? {p.quantity??'Cantidad por confirmar'} {p.unit}</option>)}</select></label>
    {captured&&<><PendingSaleContext pending={row} sale={sale} item={captured}/><p>Selecciona lo que entregaste. Las cantidades deben sumar {row.quantity??'la cantidad total confirmada'} {row.unit}.</p>
      {row.quantity==null&&<label>Cantidad total entregada ({row.unit})<input required type="number" min="0.000001" step="0.000001" className="form-control" value={physical} onChange={e=>setPhysical(e.target.value)}/></label>}
      {compatible.map(p=>{const review=saleInventoryBaseline(sale,row,p.id,view),chosen=Number(quantities[p.id])>0;return <div className="border rounded p-2 my-2" key={p.id}><label className="d-block">{p.name} ({p.unit})<input type="number" min="0" step="0.000001" className="form-control" value={quantities[p.id]??''} onChange={e=>setQuantities({...quantities,[p.id]:e.target.value})}/></label>{chosen&&(review.required?<div className="mt-2"><p>Venta: {sale.date} ? Captura: {date(review.capturedAt)}<br/>Ultimo conteo o estimacion de {p.name}: {date(review.anchorAt)}</p><label>La venta es anterior al conteo. ?Esa salida ya estaba incluida?<select required className="form-select" value={baselines[p.id]||''} onChange={e=>setBaselines({...baselines,[p.id]:e.target.value})}><option value="">Selecciona segun el conteo</option><option value="already_included">Si: completar el desglose sin volver a descontar</option><option value="apply_now">No: descontar ahora del saldo</option></select></label></div>:<p className="text-muted mb-0 mt-2">{review.anchorAt?`Ultimo conteo: ${date(review.anchorAt)}. La venta es posterior; se descontara automaticamente.`:'Sin conteo previo: se registrara la salida, sin inventar un saldo inicial.'}</p>)}</div>;})}
      {!compatible.length&&<p role="alert">No hay productos compatibles con el registro de esta venta. Revisa el catalogo.</p>}
      <InventoryReasonFields context="allocation" value={reason} onChange={setReason} idPrefix="sale-allocation" disabled={busy}/><button disabled={busy||!compatible.some(p=>Number(quantities[p.id])>0)} className="btn btn-primary mt-3">Guardar productos entregados</button>
    </>}
  </form>}</section>;
}
