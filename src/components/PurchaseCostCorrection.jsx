import {useRef,useState} from 'react';
import {Dialog,DialogContent,DialogActions,Button} from '@mui/material';
import ModalHeader from './ModalHeader';
import {Field} from './ProcurementFields';
import ValidatedForm from './ValidatedForm';
import Feedback from './Feedback';
export default function PurchaseCostCorrection({purchase,persistence,onClose}){
 const [amounts,setAmounts]=useState(purchase.items.map(i=>String(i.total))),[reason,setReason]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),lock=useRef(false);
 async function save(){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const result=await persistence.command('correctPresentationPurchase',[purchase.id,{reason,items:purchase.items.map((i,n)=>({id:i.id,totalAmount:amounts[n]}))}]);if(result.ok)onClose();else setError(result.message);}catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}}
 return <Dialog open fullWidth maxWidth="sm" onClose={busy?undefined:onClose}><ModalHeader title="Corregir importes de compra" onClose={busy?()=>{}:onClose}/><ValidatedForm onSubmit={save}><DialogContent><p>Se conservan proveedor, fecha, artículos y cantidades recibidas. Esta corrección no registra cobros ni pagos al proveedor.</p><fieldset disabled={busy}>{purchase.items.map((i,n)=><div className="mb-3" key={i.id}><p>{i.productNameSnapshot} · {i.commercialPurchase.name} · {i.commercialPurchase.quantity} {i.commercialPurchase.unit}</p><Field label={`Importe pagado · renglón ${n+1}`} required style={{maxWidth:'12rem'}} type="number" min="0.01" step="0.01" value={amounts[n]} onChange={e=>setAmounts(rows=>rows.map((r,k)=>k===n?e.target.value:r))}/></div>)}<Field label="Motivo de corrección" required maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></fieldset><Feedback message={error}/></DialogContent><DialogActions><Button disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy||!reason.trim()} variant="contained">Guardar corrección de importes</Button></DialogActions></ValidatedForm></Dialog>;
}
