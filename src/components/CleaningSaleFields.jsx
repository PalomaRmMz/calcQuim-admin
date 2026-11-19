import {useId} from 'react';
export default function CleaningSaleFields({mode,value,confirmed,unit,onMode,onValue,onConfirmed,suggestion='',physicalEdited=false,onRestore,action}){
 const id=useId();
 const integerQuantity=mode!=='amount'&&["pieza","rollo","paquete","envase","botella","bolsa"].includes(unit);
 return <div className="cleaning-sale-entry">
  <fieldset className="cleaning-capture-mode"><legend>Modo de captura</legend>{[['quantity','Por cantidad'],['amount','Por monto']].map(([key,label])=><label key={key}><input type="radio" name={`${id}-mode`} value={key} checked={mode===key} onChange={()=>onMode(key)}/><span>{label}</span></label>)}</fieldset>
  <div className="cleaning-entry-grid">
   <label htmlFor={`${id}-value`} className="form-label">{mode==='amount'?'Importe en pesos':`Cantidad (${unit||'unidad'})`}<span className="input-group">{mode==='amount'&&<span className="input-group-text">$</span>}<input id={`${id}-value`} className="form-control" type="number" min={mode==='amount'?"0.01":integerQuantity?"1":"0.000001"} step={mode==='amount'?"0.01":integerQuantity?"1":"0.000001"} inputMode={integerQuantity?"numeric":"decimal"} onBlur={()=>{if(mode==='amount'&&Number(value)>0&&Number.isFinite(Number(value)))onValue(Number(value).toFixed(2));}} value={value} onChange={e=>onValue(e.target.value)}/>{mode!=='amount'&&<span className="input-group-text">{unit||'unidad'}</span>}</span></label>
   {mode==='amount'&&<label htmlFor={`${id}-physical`} className="form-label">Cantidad física confirmada (opcional) ({unit||'unidad'})<input id={`${id}-physical`} className="form-control" type="number" min="0.000001" step="0.000001" inputMode="decimal" value={confirmed} onChange={e=>onConfirmed(e.target.value)}/>{onRestore&&<small className="physical-suggestion">{suggestion?`Calculada: ${suggestion} ${unit||'unidad'}`:'Ingresa un importe válido para calcular.'}{physicalEdited&&<button type="button" className="btn btn-link btn-sm p-0" disabled={!suggestion} onClick={onRestore}>Usar cantidad calculada</button>}</small>}</label>}
  </div>
  {action}
 </div>;
}
