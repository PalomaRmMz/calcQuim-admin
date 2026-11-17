import {useState} from 'react';
import {Dialog,DialogContent,DialogActions,Button} from '@mui/material';
import {hardwareCreationBundle} from '../domain/hardwareCreation.mjs';
export default function QuickHardwareCreate({categories,onClose,onSave,AdvancedEditor,...props}){
 const [form,setForm]=useState({name:'',saleMode:'piece',piecePrice:'',packPrice:'',packSize:'',initialEnabled:false,closedPackages:'',looseUnits:'0',quantity:'',pricePending:false}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const set=(k,v)=>setForm(f=>({...f,[k]:v}));
 if(form.saleMode==='advanced')return <AdvancedEditor {...props} categories={categories} onClose={onClose} onSave={onSave}/>;
 const field=(key,label,type='text')=><label className="form-label d-block">{label}<input className="form-control" type={type} min={type==='number'?'0':undefined} step={type==='number'?'1':undefined} inputMode={type==='number'?'numeric':key.includes('Price')?'decimal':undefined} value={form[key]} onChange={e=>set(key,e.target.value)}/></label>;
 async function submit(e){e.preventDefault();if(busy)return;setBusy(true);try{const bundle=hardwareCreationBundle(form);if(!window.confirm(`Confirmar alta: ${bundle.product.name}. Inicial: ${bundle.initialInventory?.quantity??'sin registrar'} piezas.`))return;const r=await onSave(bundle);if(!r.ok)setError(r.message);}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <Dialog open fullWidth maxWidth="sm" onClose={busy?undefined:onClose}><form onSubmit={submit}><DialogContent><h2>Agregar producto</h2><fieldset disabled={busy}>
 {field('name','Nombre comercial completo')}
 <label className="form-label d-block">Categoría<select className="form-select" value={form.hardwareCategoryId||''} onChange={e=>set('hardwareCategoryId',e.target.value||null)}><option value="">Sin categoría</option>{categories.filter(c=>c.active).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 <label className="form-label d-block">Forma de venta<select className="form-select" value={form.saleMode} onChange={e=>set('saleMode',e.target.value)}>{[['piece','Solo por pieza'],['pack','Solo por paquete'],['both','Por paquete y pieza'],['advanced','Más opciones']].map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
 {form.saleMode!=='piece'&&field('packSize','Piezas por paquete','number')}
 <label className="d-block my-3"><input type="checkbox" checked={form.pricePending} onChange={e=>set('pricePending',e.target.checked)}/> Precio pendiente (no disponible para venta)</label>
 {!form.pricePending&&<>{form.saleMode!=='piece'&&field('packPrice','Precio por paquete (MXN)')}{form.saleMode!=='pack'&&field('piecePrice','Precio por pieza (MXN)')}</>}
 <label className="d-block my-3"><input type="checkbox" checked={form.initialEnabled} onChange={e=>set('initialEnabled',e.target.checked)}/> Registrar inventario inicial</label>
 {form.initialEnabled&&(form.saleMode==='piece'?field('quantity','Piezas iniciales','number'):<>{field('closedPackages','Paquetes cerrados','number')}{form.saleMode==='both'&&field('looseUnits','Piezas sueltas','number')}<p>Total equivalente: {Number(form.closedPackages||0)*Number(form.packSize||0)+Number(form.saleMode==='both'?form.looseUnits||0:0)} piezas</p></>)}
 {error&&<p role="alert">{error}</p>}</fieldset></DialogContent><DialogActions><Button disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy}>Guardar producto</Button></DialogActions></form></Dialog>;
}
