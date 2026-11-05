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
export default function LaundryPage(){
 const persistence=useContext(PersistenceContext),[editing,setEditing]=useState(null),[notice,setNotice]=useState('');
 if(!persistence)return <Feedback message="Lavandería requiere PostgreSQL."/>;
 const services=persistence.snapshot.data.procurement.services||[];
 const columns=[{accessorKey:'name',header:'Servicio',Cell:({row})=><strong>{row.original.name}</strong>},
 {id:'price',header:'Tarifa',accessorFn:s=>s.priceMode==='custom'?'Precio personalizado al vender':`${money(s.price)} / ${s.unit}`},
 {id:'addons',header:'Adicionales disponibles',accessorFn:s=>s.addons?.map(a=>`${a.name} +${money(a.price)}`).join(' · ')||'Sin adicionales'},
 {id:'state',header:'Estado',accessorFn:s=>s.active?'Activo':'Inactivo'},
 {id:'actions',header:'Acciones',enableSorting:false,Cell:({row})=><TableActions label={row.original.name} onEdit={()=>setEditing(row.original)} showDelete={false}/>}];
 return <><Feedback message={notice} variant="success"/><ContentPanel title="Lavandería · servicios y tarifas" subtitle="Edita las tarifas aquí. Registra el cobro diario desde Ventas." action={<PrimaryAction onClick={()=>setEditing({name:'',unit:'carga',priceMode:'fixed',price:'',active:true,addons:[]})}>Agregar servicio</PrimaryAction>}>
 <DataTable columns={columns} data={services} searchPlaceholder="Buscar servicio o adicional..." initialSorting={[{id:'name',desc:false}]}/>
 {services.filter(s=>s.active&&s.priceMode==='fixed').map(s=><details key={s.id} className="mt-3"><summary>{s.name}: combinaciones y tarifas</summary><ul>{combinations(s).map((c,i)=><li key={i}>{c.label}: <strong>{money(c.price)}</strong> / {s.unit}</li>)}</ul></details>)}
 </ContentPanel><details className="mt-3"><summary>Herramientas de carga inicial</summary><ReferenceImport activity="LAVANDERIA"/></details>
 {editing&&<ServiceEditor service={editing} onClose={()=>setEditing(null)} onSave={async input=>{const result=await persistence.command('saveService',[input]);if(result.ok){setNotice('Servicio y tarifas guardados.');setEditing(null);}return result;}}/>}</>;
}
function combinations(service){let rows=[{label:service.name,price:service.price}];for(const addon of service.addons||[])rows=[...rows,...rows.map(r=>({label:`${r.label} + ${addon.name}`,price:Math.round((r.price+addon.price)*100)/100}))];return rows;}
function ServiceEditor({service,onClose,onSave}){
 const [draft,setDraft]=useState({...service,addons:service.addons||[]}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(){if(busy)return;setBusy(true);setError('');try{const result=await onSave({...draft,price:draft.priceMode==='custom'?null:Number(draft.price),addons:draft.priceMode==='custom'?[]:draft.addons.map(a=>({...a,price:Number(a.price)}))});if(!result.ok)setError(result.message);}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <Dialog className="app-dialog" PaperProps={{className:"sale-modal"}} open fullWidth maxWidth="md" onClose={busy?undefined:onClose} aria-labelledby="laundry-title"><ModalHeader titleId="laundry-title" title={service.id?'Editar servicio':'Agregar servicio'} onClose={busy?()=>{}:onClose}/><ValidatedForm className="sale-modal-form" onSubmit={submit}><DialogContent className="sale-modal-body"><fieldset disabled={busy}>
 <Field label="Nombre del servicio" required maxLength={200} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/><div className="row g-3"><div className="col-md-6"><Field label="Cobro por" value={draft.unit} onChange={e=>setDraft({...draft,unit:e.target.value})}><option value="carga">Carga</option><option value="servicio">Trabajo / servicio</option></Field></div><div className="col-md-6"><Field label="Precio" value={draft.priceMode} onChange={e=>setDraft({...draft,priceMode:e.target.value})}><option value="fixed">Tarifa fija</option><option value="custom">Personalizado al vender</option></Field></div></div>
 {draft.priceMode==='fixed'?<><Field label="Tarifa base" required type="number" min="0" step="0.01" value={draft.price} onChange={e=>setDraft({...draft,price:e.target.value})}/><h3 className="h6 mt-3">Adicionales opcionales</h3>{draft.addons.map((a,index)=><div className="row g-2 align-items-end mb-3" key={a.id}><div className="col-md-7"><Field label="Nombre del adicional" required value={a.name} onChange={e=>setDraft({...draft,addons:draft.addons.map((x,i)=>i===index?{...x,name:e.target.value}:x)})}/></div><div className="col-md-3"><Field label="Precio adicional" required type="number" min="0" step="0.01" value={a.price} onChange={e=>setDraft({...draft,addons:draft.addons.map((x,i)=>i===index?{...x,price:e.target.value}:x)})}/></div><div className="col-md-2"><button type="button" className="btn btn-outline-danger" onClick={()=>setDraft({...draft,addons:draft.addons.filter((_,i)=>i!==index)})}>Quitar</button></div></div>)}<button type="button" className="btn btn-outline-primary" onClick={()=>setDraft({...draft,addons:[...draft.addons,{id:crypto.randomUUID(),name:'',price:''}]})}>Agregar adicional</button></>:<p className="form-text">El importe se captura en cada venta. No se asigna una tarifa sin definir.</p>}
 <label className="form-check mt-3"><input className="form-check-input" type="checkbox" checked={draft.active} onChange={e=>setDraft({...draft,active:e.target.checked})}/>Servicio activo</label><details className="mt-3"><summary>Historial de tarifas</summary>{draft.tariffHistory?.length?draft.tariffHistory.map((r,i)=><p key={i}>{r.at} · {r.price==null?'Personalizado':money(r.price)}{r.addons?.map(a=>` · ${a.name} ${money(a.price)}`).join('')}</p>):<p>Sin cambios anteriores.</p>}</details><Feedback message={error}/>
 </fieldset></DialogContent><DialogActions className="sale-modal-actions"><Button disabled={busy} onClick={onClose}>Cancelar</Button><Button variant="contained" type="submit" disabled={busy}>{busy?'Guardando…':'Guardar servicio'}</Button></DialogActions></ValidatedForm></Dialog>;
}
