import {useId} from 'react';
export default function CleaningSaleFields({mode,value,confirmed,unit,onMode,onValue,onConfirmed,suggestion='',physicalEdited=false,onRestore}){
 const id=useId();
 return <div className="cleaning-sale-entry">
  <fieldset className="cleaning-capture-mode"><legend>Modo de captura</legend>{[['quantity','Por cantidad'],['amount','Por monto']].map(([key,label])=><label key={key}><input type="radio" name={`${id}-mode`} value={key} checked={mode===key} onChange={()=>onMode(key)}/><span>{label}</span></label>)}</fieldset>
  <div className="cleaning-entry-grid">
   <label htmlFor={`${id}-value`} className="form-label">{mode==='amount'?'Importe en pesos':`Cantidad (${unit||'unidad'})`}<input id={`${id}-value`} className="form-control" inputMode="decimal" value={value} onChange={e=>onValue(e.target.value)}/></label>
   {mode==='amount'&&<label htmlFor={`${id}-physical`} className="form-label">Cantidad física confirmada, si aplica ({unit||'unidad'})<input id={`${id}-physical`} className="form-control" inputMode="decimal" value={confirmed} onChange={e=>onConfirmed(e.target.value)}/>{onRestore&&<small className="physical-suggestion">{suggestion?`Calculada: ${suggestion} ${unit||'unidad'}`:'Ingresa un importe válido para calcular.'}{physicalEdited&&<button type="button" className="btn btn-link btn-sm p-0" disabled={!suggestion} onClick={onRestore}>Usar cantidad calculada</button>}</small>}</label>}
  </div>
 </div>;
}
