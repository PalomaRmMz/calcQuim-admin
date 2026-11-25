import {useState} from 'react';
import {Button} from '@mui/material';
import AppModal from './AppModal';

export default function PresentationStockModal({product,sales,busy,error,onSave,onClose}){
 const formats=product.presentationStock;
 const [mode,setMode]=useState('count');
 const [expected]=useState(()=>Object.fromEntries(formats.map(f=>[f.presentationId,f.balance])));
 const [counts,setCounts]=useState(expected);
 const [reason,setReason]=useState('');
 const [saleId,setSaleId]=useState('');
 const [formatId,setFormatId]=useState('');
 const [quantity,setQuantity]=useState('');
 const sold=sales.filter(s=>!s.voidedAt&&s.items.some(i=>formats.some(f=>f.presentationId===i.presentationId)));
 const selectedSale=sold.find(s=>s.id===saleId);
 const options=formats.filter(f=>selectedSale?.items.some(i=>i.presentationId===f.presentationId));
 function submit(){
  if(mode==='count')return onSave('inventoryCountPresentations',{productId:product.productId,reason,expected,
   counts:formats.map(f=>({presentationId:f.presentationId,quantity:counts[f.presentationId]}))});
  const format=options.find(f=>f.presentationId===formatId);
  if(!format||!/^\d+$/.test(quantity)||Number(quantity)<1)return;
  return onSave('inventoryMovement',{productId:product.productId,kind:'return',saleId,unit:product.unit,
   quantity:String(BigInt(quantity)*BigInt(format.factor)),reasonCode:'finished_receipt',observations:reason,
   packReturnDisposition:'sealed',reference:{presentationId:formatId}});
 }
 return <AppModal title={product.name+' · Existencias por presentación'} onClose={busy?undefined:onClose} onSubmit={submit}
  actions={<><Button type="button" disabled={busy} onClick={onClose}>Cerrar</Button><Button disabled={busy} type="submit" variant="contained">{mode==='count'?'Guardar conteo':'Confirmar devolución cerrada'}</Button></>}>
  <fieldset disabled={busy}>
   <ul>{formats.map(f=><li key={f.presentationId}>{f.name} · {f.balance} paquetes</li>)}</ul>
   <label className="d-block mb-2">Operación<select className="form-select" value={mode} onChange={e=>setMode(e.target.value)}>
    <option value="count">Conciliar conteo por presentación</option><option value="return">Devolución de venta</option>
   </select></label>
   {mode==='count'?formats.map(f=><label className="d-block mb-2" key={f.presentationId}>{f.name}<input className="form-control" required type="number" min="0" step="1" value={counts[f.presentationId]} onChange={e=>setCounts({...counts,[f.presentationId]:e.target.value})}/></label>):<>
    <label className="d-block mb-2">Venta<select className="form-select" required value={saleId} onChange={e=>{setSaleId(e.target.value);setFormatId('');}}>
     <option value="">Selecciona venta</option>{sold.map(s=><option key={s.id} value={s.id}>{s.folio} · {s.date}</option>)}
    </select></label>
    <label className="d-block mb-2">Presentación<select className="form-select" required value={formatId} onChange={e=>setFormatId(e.target.value)}>
     <option value="">Selecciona presentación</option>{options.map(f=><option key={f.presentationId} value={f.presentationId}>{f.name}</option>)}
    </select></label>
    <label className="d-block mb-2">Paquetes devueltos cerrados<input className="form-control" required type="number" min="1" step="1" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
   </>}
   <label className="d-block">Motivo<textarea className="form-control" maxLength={1000} required value={reason} onChange={e=>setReason(e.target.value)}/></label>
   {error&&<p role="alert" className="text-danger">{error}</p>}
  </fieldset>
 </AppModal>;
}
