import FormLabel from './FormLabel';
import { inventoryReasonOptions } from '../services/inventoryReasons.js';

export default function InventoryReasonFields({context,value,onChange,idPrefix='inventory',disabled=false}){
    const options=inventoryReasonOptions(context);
    const selected=options.some(o=>o.id===value.reasonCode)?value.reasonCode:'';
    return <>
        <span className="d-block mb-3"><FormLabel htmlFor={`${idPrefix}-reason`} required>Motivo / origen</FormLabel><select id={`${idPrefix}-reason`} className="form-select" required disabled={disabled} value={selected} onChange={e=>onChange({...value,reasonCode:e.target.value,reasonExplanation:''})}><option value="">Selecciona un motivo</option>{options.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select></span>
        {selected==='other'&&<span className="d-block mb-3"><FormLabel htmlFor={`${idPrefix}-reason-explanation`} required>Explicación de Otro</FormLabel><textarea id={`${idPrefix}-reason-explanation`} className="form-control" required maxLength={1000} disabled={disabled} value={value.reasonExplanation} onChange={e=>onChange({...value,reasonExplanation:e.target.value})}/></span>}
        <span className="d-block mb-3"><FormLabel htmlFor={`${idPrefix}-observations`}>Observaciones (opcional)</FormLabel><textarea id={`${idPrefix}-observations`} className="form-control" maxLength={2000} disabled={disabled} value={value.observations} onChange={e=>onChange({...value,observations:e.target.value})}/></span>
    </>;
}
