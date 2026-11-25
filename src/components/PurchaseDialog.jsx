import {useId} from 'react';
import {faCartShopping} from '@fortawesome/free-solid-svg-icons';
import {Autocomplete,Button,Dialog,DialogActions,DialogContent,TextField} from '@mui/material';
import FormLabel from './FormLabel';
import ModalHeader from './ModalHeader';
import PurchaseReceipt from './PurchaseReceipt';
import ValidatedForm from './ValidatedForm';
import {localDate,money} from '../utils/salesUtils.js';
import '../styles/components/SaleFormModal.css';

export function PurchaseArticleSearch({onCreate,...props}){
 return <Autocomplete {...props} renderInput={params=><TextField {...params} size="small" label="Agregar artículo comprado" placeholder="Busca por artículo o presentación"
  slotProps={{input:{...params.InputProps,endAdornment:<>{onCreate&&<Button type="button" size="small" sx={{whiteSpace:'nowrap',minHeight:0,py:0,lineHeight:1.25}} onMouseDown={event=>event.preventDefault()} onClick={onCreate}>+ Nuevo producto</Button>}{params.InputProps.endAdornment}</>},htmlInput:params.inputProps,inputLabel:params.InputLabelProps}}/>}/>;
}

export default function PurchaseDialog({editing,suppliers,supplierId,onSupplierChange,supplierLocked,date,onDateChange,
 search,beforeSearch,afterSearch,children,itemCount,total,receipt,onReceiptChange,onReceiptBusy,reference,onReferenceChange,
 notes,onNotesChange,error,busy=false,receiptBusy,onClose,onSubmit}){
 const titleId=useId(),supplierField=useId(),dateField=useId(),referenceField=useId(),notesField=useId();
 const blocked=busy||receiptBusy;
 return <Dialog className="app-dialog" open onClose={busy?undefined:onClose} fullWidth maxWidth="lg" PaperProps={{className:'sale-modal'}} aria-labelledby={titleId}>
  <ValidatedForm className="sale-modal-form" onSubmit={onSubmit}>
   <ModalHeader icon={faCartShopping} titleId={titleId} title={editing?'Editar compra':'Nueva compra'} subtitle="Registra cuánto compraste y cuánto pagaste." onClose={busy?()=>{}:onClose}/>
   <DialogContent className="sale-modal-body">
    <fieldset disabled={busy}>
     <section className="sale-section">
      <div className="row g-3 mb-3">
       <div className="col-12 col-sm-6"><FormLabel required className="form-label" htmlFor={supplierField}>Proveedor</FormLabel>
        <select autoFocus id={supplierField} required aria-required="true" className="form-select" value={supplierId} disabled={supplierLocked}
         title={supplierLocked?'Para cambiar de proveedor retira primero los artículos.':undefined} onChange={event=>onSupplierChange(event.target.value)}>
         <option value="">Selecciona proveedor</option>
         {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}{!s.active?' (Inactivo)':''}</option>)}
        </select>
       </div>
       <div className="col-12 col-sm-6"><FormLabel required className="form-label" htmlFor={dateField}>Fecha</FormLabel>
        <input type="date" max={localDate()} id={dateField} required aria-required="true" className="form-control" value={date} onChange={event=>onDateChange(event.target.value)}/>
       </div>
      </div>
      {beforeSearch}
      {!suppliers.length&&<p role="status" className="alert alert-info">No hay proveedores activos disponibles para esta actividad. Agrega, clasifica o activa proveedores desde el apartado Proveedores.</p>}
      {search}
      <p className="text-muted small mt-2">Captura la cantidad y el costo total o unitario de cada artículo.</p>
      {afterSearch}
      <div className="sale-section-heading"><h3>Artículos de la compra</h3><span>{itemCount} {itemCount===1?'artículo':'artículos'}</span></div>
      {itemCount?children:<p className="sale-empty mt-3">Busca artículos para comenzar tu compra.</p>}
     </section>
     <PurchaseReceipt value={receipt} onChange={onReceiptChange} onBusy={onReceiptBusy}/>
     <details className="sale-notes"><summary>Referencia y notas (opcional)</summary><div>
      <label htmlFor={referenceField} className="form-label">Ticket o factura</label><input id={referenceField} maxLength={100} className="form-control mb-2" value={reference} onChange={event=>onReferenceChange(event.target.value)}/>
      <label htmlFor={notesField} className="form-label">Notas</label><textarea id={notesField} maxLength={1000} className="form-control" rows={2} value={notes} onChange={event=>onNotesChange(event.target.value)}/>
     </div></details>
     {error&&<p className="alert alert-danger mt-3" role="alert">{error}</p>}
    </fieldset>
   </DialogContent>
   <DialogActions className="sale-modal-actions">
    <div className="sale-footer-total"><span>Total de compra</span><strong>{money(total)}</strong></div>
    <Button color="inherit" disabled={busy} onClick={onClose}>Cancelar</Button>
    <Button type="submit" variant="contained" disabled={!itemCount||blocked}>{busy?'Guardando…':editing?'Guardar cambios':'Registrar compra'}</Button>
   </DialogActions>
  </ValidatedForm>
 </Dialog>;
}
