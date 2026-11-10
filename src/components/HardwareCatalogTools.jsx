import {useState} from 'react';
import {Button} from '@mui/material';
import AppModal from './AppModal';
import {Field} from './ProcurementFields';
import Feedback from './Feedback';
import ValidatedForm from './ValidatedForm';
const blank=()=>({key:crypto.randomUUID(),name:'',hardwareCategoryId:'',presentation:'',unit:'pieza',saleUnit:'pieza',factor:'1',price:'',active:true});
export function HardwareBatch({categories,onSave,onClose}){
 const [rows,setRows]=useState([blank()]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const change=(key,patch)=>setRows(rows.map(r=>r.key===key?{...r,...patch}:r));
 async function submit(){
  if(busy)return;setBusy(true);setError('');
  try{const result=await onSave({rows:rows.map(r=>({product:{name:r.name,unit:r.unit,hardwareCategoryId:r.hardwareCategoryId||null,active:r.active},presentations:[{name:r.presentation,unit:r.saleUnit,factor:Number(r.factor),price:Number(r.price),integerOnly:!['kg','gramo'].includes(r.unit),active:r.active}]}))});if(!result.ok)setError(result.message);}
  catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <AppModal title="Alta por lote de jarcería" maxWidth="xl" onClose={busy?()=>{}:onClose}><ValidatedForm onSubmit={submit}><fieldset disabled={busy}>
  <p>Se valida y guarda todo el lote en una sola operación. Si un renglón falla, no se registra ningún producto. Para agregar variantes a un producto existente, usa Editar producto.</p>
  {rows.map((r,index)=><section className="border rounded p-3 mb-3" key={r.key}><h3 className="h6">Producto {index+1}</h3><div className="row g-3">
   <div className="col-md-4"><Field label="Nombre" required maxLength={200} value={r.name} onChange={e=>change(r.key,{name:e.target.value})}/></div>
   <div className="col-md-4"><Field label="Categoría" value={r.hardwareCategoryId} onChange={e=>change(r.key,{hardwareCategoryId:e.target.value})}><option value="">Sin categoría</option>{categories.filter(c=>c.active).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Field></div>
   <div className="col-md-4"><Field label="Presentación" required value={r.presentation} onChange={e=>change(r.key,{presentation:e.target.value})}/></div>
   <div className="col-md-4"><Field label="Unidad de inventario" value={r.unit} onChange={e=>change(r.key,{unit:e.target.value})}>{['pieza','kg','gramo','bolsa','envase','botella'].map(u=><option key={u}>{u}</option>)}</Field></div>
   <div className="col-md-4"><Field label="Unidad de venta" value={r.saleUnit} onChange={e=>change(r.key,{saleUnit:e.target.value})}>{['pieza','paquete','kg','gramo','bolsa','envase','botella'].map(u=><option key={u}>{u}</option>)}</Field></div>
   <div className="col-md-4"><Field label="Contenido en unidad de inventario" required type="number" min="0.000001" step="0.000001" value={r.factor} onChange={e=>change(r.key,{factor:e.target.value})}/></div>
   <div className="col-md-4"><Field label="Precio de venta" required type="number" min="0.01" step="0.01" value={r.price} onChange={e=>change(r.key,{price:e.target.value})}/></div>
  </div><label className="my-2"><input type="checkbox" checked={r.active} onChange={e=>change(r.key,{active:e.target.checked})}/> Disponible</label>{rows.length>1&&<button type="button" className="btn btn-sm btn-outline-danger ms-3" onClick={()=>setRows(rows.filter(x=>x.key!==r.key))}>Quitar renglón</button>}</section>)}
  <div style={{whiteSpace:'pre-line'}}><Feedback message={error}/></div><div className="d-flex gap-2"><Button disabled={rows.length>=100} onClick={()=>setRows([...rows,blank()])}>Agregar renglón</Button><Button type="submit" variant="contained">{busy?'Guardando…':'Guardar lote completo'}</Button></div>
 </fieldset></ValidatedForm></AppModal>;
}
export function HardwareCategories({categories,onCommand,onClose,initialCategory=null,hideList=false}){
 const [draft,setDraft]=useState(initialCategory??{name:'',active:true}),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function save(){if(busy)return;setBusy(true);setError('');try{const result=await onCommand('saveHardwareCategory',[draft]);if(result.ok)setDraft({name:'',active:true});else setError(result.message);}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <AppModal title="Categorías de jarcería" onClose={busy?()=>{}:onClose}><p>Son independientes de limpieza. Desactiva una categoría para conservar sus productos y asignaciones.</p>
  {!hideList&&<ul className="list-group mb-3">{categories.map(c=><li key={c.id} className="list-group-item d-flex justify-content-between align-items-center"><span>{c.name} · {c.active?'Activa':'Inactiva'}</span><Button disabled={busy} onClick={()=>{setDraft(c);setError('');}}>Editar</Button></li>)}</ul>}
  <ValidatedForm onSubmit={save}><fieldset disabled={busy}><Field label={draft.id?'Editar categoría':'Nueva categoría'} required maxLength={200} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/><label className="my-3"><input type="checkbox" checked={draft.active} onChange={e=>setDraft({...draft,active:e.target.checked})}/> Activa</label><Feedback message={error}/><div className="d-flex gap-2"><Button onClick={()=>setDraft({name:'',active:true})}>Nueva categoría</Button><Button type="submit" variant="contained">Guardar categoría</Button></div></fieldset></ValidatedForm>
 </AppModal>;
}
