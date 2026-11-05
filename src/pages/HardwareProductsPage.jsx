import '../styles/components/SaleFormModal.css';
import {useContext,useState} from 'react';
import {Dialog,DialogContent,DialogActions,Button} from '@mui/material';
import {PersistenceContext} from '../context/PersistenceContext.js';
import {money} from '../utils/salesUtils.js';
import ContentPanel from '../components/ContentPanel';
import DataTable from '../components/DataTable';
import TableActions from '../components/TableActions';
import PrimaryAction from '../components/PrimaryAction';
import ModalHeader from '../components/ModalHeader';
import ValidatedForm from '../components/ValidatedForm';
import {Field} from '../components/ProcurementFields';
import Feedback from '../components/Feedback';
import ReferenceImport from '../components/ReferenceImport';
const newPresentation=()=>({key:crypto.randomUUID(),name:'',unit:'pieza',factor:'',price:'',integerOnly:true,active:true});
export default function HardwareProductsPage(){
 const persistence=useContext(PersistenceContext),[editing,setEditing]=useState(null),[notice,setNotice]=useState(''),[status,setStatus]=useState('');
 if(!persistence)return <Feedback message="Este módulo requiere PostgreSQL."/>;
 const data=persistence.snapshot.data,products=data.products.filter(p=>p.activity==='JARCERIA'),presentations=data.procurement.presentations||[];
 const columns=[{accessorKey:'name',header:'Producto',Cell:({row})=><><span className="table-text-primary">{row.original.name}</span><small className="d-block text-muted">{row.original.characteristics}</small></>},
  {id:'presentations',header:'Presentaciones y precios',accessorFn:p=>presentations.filter(r=>String(r.productId)===String(p.id)).map(r=>`${r.name} · ${money(r.price)}${r.active?'':' (inactiva)'}`).join(' / ')||'Sin presentaciones'},
  {accessorKey:'unit',header:'Inventario en'},{id:'active',header:'Estado',accessorFn:p=>p.active?'Activo':'Inactivo'},
  {id:'actions',header:'Acciones',enableSorting:false,Cell:({row})=><TableActions label={row.original.name} onEdit={()=>setEditing(row.original)} showDelete={false}/>}];
 return <><Feedback message={notice} variant="success"/><ContentPanel title="Productos de jarcería" subtitle="Administra cada producto con sus presentaciones y precios de venta." action={<PrimaryAction onClick={()=>setEditing({name:'',characteristics:'',unit:'pieza',active:true})}>Agregar producto</PrimaryAction>}>
 <div className="filter-bar"><label className="form-label">Estado<select className="form-select" value={status} onChange={e=>setStatus(e.target.value)}><option value="">Todos</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></label></div>
 <DataTable columns={columns} data={products.filter(p=>!status||(status==='active')===p.active)} searchPlaceholder="Buscar producto o presentación..." initialSorting={[{id:'name',desc:false}]}/>
 </ContentPanel><details className="mt-3"><summary>Herramientas de carga inicial</summary><ReferenceImport activity="JARCERIA"/></details>
 {editing&&<ProductEditor product={editing} presentations={presentations.filter(r=>String(r.productId)===String(editing.id))} onClose={()=>setEditing(null)} onSave={async input=>{const result=await persistence.command('saveHardwareProductBundle',[input]);if(result.ok){setNotice('Producto y presentaciones guardados.');setEditing(null);}return result;}}/>}</>;
}
function ProductEditor({product,presentations,onClose,onSave}){
 const [draft,setDraft]=useState(product),[rows,setRows]=useState(()=>presentations.length?presentations.map(p=>({...p,key:p.id})):[newPresentation()]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const change=(key,patch)=>setRows(rows.map(p=>p.key===key?{...p,...patch}:p));
 async function submit(){if(busy)return;setBusy(true);setError('');try{const result=await onSave({product:draft,presentations:rows.map(p=>{const row={...p,factor:Number(p.factor),price:Number(p.price)};delete row.key;return row;})});if(!result.ok)setError(result.message);}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <Dialog className="app-dialog" PaperProps={{className:"sale-modal"}} open fullWidth maxWidth="md" onClose={busy?undefined:onClose} aria-labelledby="hardware-title"><ModalHeader titleId="hardware-title" title={product.id?'Editar producto':'Agregar producto'} onClose={busy?()=>{}:onClose}/><ValidatedForm className="sale-modal-form" onSubmit={submit}><DialogContent className="sale-modal-body"><fieldset disabled={busy}>
 <div className="row g-3"><div className="col-md-8"><Field label="Nombre comercial" required maxLength={200} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></div><div className="col-md-4"><Field label="Unidad de inventario" disabled={Boolean(product.id)} value={draft.unit} onChange={e=>setDraft({...draft,unit:e.target.value})}>{['pieza','kg','gramo','bolsa','envase','botella'].map(u=><option key={u}>{u}</option>)}</Field></div></div>
 <Field label="Características" maxLength={1000} value={draft.characteristics||''} onChange={e=>setDraft({...draft,characteristics:e.target.value})}/><label className="form-check my-3"><input className="form-check-input" type="checkbox" checked={draft.active} onChange={e=>setDraft({...draft,active:e.target.checked})}/>Producto activo</label>
 <h3 className="h6">Presentaciones y precios</h3><p className="form-text">Indica cómo lo vendes y cuántas {draft.unit} contiene cada presentación. Todas utilizan la misma existencia.</p>
 {rows.map((p,index)=><section className="sale-section border rounded p-3 mb-3" key={p.key} aria-label={`Presentación ${index+1}`}><div className="row g-3"><div className="col-md-8"><Field label="Nombre de presentación" required value={p.name} onChange={e=>change(p.key,{name:e.target.value})}/></div><div className="col-md-4"><Field label="Unidad de venta" value={p.unit} onChange={e=>change(p.key,{unit:e.target.value})}>{['pieza','paquete','kg','gramo','bolsa','envase','botella'].map(u=><option key={u}>{u}</option>)}</Field></div><div className="col-md-6"><Field label={`Contenido (${draft.unit})`} required type="number" min="0.000001" step="0.000001" value={p.factor} onChange={e=>change(p.key,{factor:e.target.value})}/></div><div className="col-md-6"><Field label="Precio de venta" required type="number" min="0.01" step="0.01" value={p.price} onChange={e=>change(p.key,{price:e.target.value})}/></div></div>
 <div className="d-flex flex-wrap gap-3 mt-3"><label><input type="checkbox" checked={p.integerOnly} onChange={e=>change(p.key,{integerOnly:e.target.checked})}/> Vender cantidades enteras</label><label><input type="checkbox" checked={p.active} onChange={e=>change(p.key,{active:e.target.checked})}/> Presentación activa</label>{!p.id&&rows.length>1&&<button type="button" className="btn btn-sm btn-outline-danger" onClick={()=>setRows(rows.filter(r=>r.key!==p.key))}>Quitar presentación</button>}</div>
 {p.priceHistory?.length>0&&<details className="mt-2"><summary>Historial de cambios</summary>{p.priceHistory.map((r,i)=><p key={i}>{r.at} · {money(r.price)} · Contenido: {r.factor} {draft.unit}</p>)}</details>}</section>)}
 <button type="button" className="btn btn-outline-primary" onClick={()=>setRows([...rows,newPresentation()])}>Agregar presentación</button><Feedback message={error}/>
 </fieldset></DialogContent><DialogActions className="sale-modal-actions"><Button disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" variant="contained" disabled={busy}>{busy?'Guardando…':'Guardar producto'}</Button></DialogActions></ValidatedForm></Dialog>;
}
