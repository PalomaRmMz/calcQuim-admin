export default function PurchaseInventoryCorrection({value,onChange,hardware=false}){
 const change=(key,next)=>onChange({...value,[key]:next});
 return <details className="alert alert-warning">
  <summary>Tratamiento físico al corregir una compra recibida</summary>
  <label className="d-block"><input type="checkbox" checked={value.confirmed} onChange={e=>change('confirmed',e.target.checked)}/> Confirmo la revisión física de esta corrección</label>
  <label className="d-block">Destino<select className="form-select" value={value.disposition} onChange={e=>change('disposition',e.target.value)}>
   <option value="adjust">Aplicar la diferencia corregida al inventario</option>
   <option value="retained">{hardware?'Conservar el producto físico recibido':'Conservar el producto físico realmente recibido o elaborado'}</option>
  </select></label>
  <label className="d-block">Conteo posterior<select className="form-select" value={value.baselineTreatment} onChange={e=>change('baselineTreatment',e.target.value)}>
   <option value="">Revisar cuando corresponda</option>
   <option value="apply_now">Aplicar la diferencia ahora</option>
   <option value="already_included">La diferencia ya está incluida en el conteo posterior</option>
  </select></label>
  <label className="d-block">Motivo<input className="form-control" required={hardware} maxLength={1000} value={value.reason} onChange={e=>change('reason',e.target.value)}/></label>
 </details>;
}
