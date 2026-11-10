import {useId} from 'react';
import {UNITS,normalizeUnit,unitLabel} from '../utils/units.js';
import {productInitialInventory} from '../domain/productInitialInventory.mjs';
import PhysicalCompositionFields,{emptyPhysicalComposition} from './PhysicalCompositionFields';
export const emptyProductInitial=()=>({enabled:false,quantity:'',selection:'base',observations:'',composition:emptyPhysicalComposition()});
export function productInitialPayload(draft,unit,presentations=[]){
 if(draft.composition?.enabled)return {unit,observations:draft.observations,physicalComposition:{presentationId:draft.composition.presentationId,closedPackages:draft.composition.closedPackages,looseUnits:draft.composition.looseUnits}};
 const p=presentations.find(p=>p.id===draft.selection);
 return {quantity:draft.quantity,unit:p?.unit??(draft.selection.startsWith('unit:')?draft.selection.slice(5):unit),...(draft.selection!=='base'&&!draft.selection.startsWith('unit:')?{presentationId:draft.selection}:{}),observations:draft.observations};
}
export default function InitialInventoryFields({value,onChange,unit,presentations=[]}){
 const id=useId(),base=UNITS.find(u=>u.id===normalizeUnit(unit)),units=UNITS.filter(u=>u.dimension===base?.dimension),options=presentations.filter(p=>p.active!==false);
 const packs=unit==='pieza'&&options.some(p=>p.unit==='pieza'&&Number(p.factor)===1)?options.filter(p=>p.unit==='paquete'&&Number(p.factor)>1):[];
 const change=patch=>onChange({...value,...patch});
 let preview='',error='';
 if(value.enabled&&(value.quantity!==''||value.composition?.enabled))try{const product={id:'new',unit},converted=productInitialInventory(productInitialPayload(value,unit,options),product,options.map(p=>({...p,productId:'new',baseUnit:unit})));preview=`Inicial que se registrará: ${converted.quantity} ${unitLabel(unit)}`;}catch(e){error=e.message;}
 return <section className="border rounded p-3 my-3" aria-label="Inventario inicial opcional"><label className="form-check"><input type="checkbox" className="form-check-input" checked={value.enabled} onChange={e=>change({enabled:e.target.checked})}/>Registrar inventario inicial ahora (opcional)</label><p className="form-text mb-2">Sin marcar: existencia desconocida. Puedes capturar el inicial después desde Inventarios. Cero solo si confirmas que no hay existencias.</p>
 {value.enabled&&<>{packs.length>0&&<PhysicalCompositionFields value={value.composition??emptyPhysicalComposition()} onChange={composition=>change({composition,quantity:''})} presentations={packs}/>}{!value.composition?.enabled&&<div className="row g-3"><label className="col-sm-6" htmlFor={`${id}-quantity`}>Cantidad inicial<input id={`${id}-quantity`} required type="number" min="0" step="0.000001" className="form-control" value={value.quantity} onChange={e=>change({quantity:e.target.value})}/></label><label className="col-sm-6" htmlFor={`${id}-unit`}>Unidad del inicial<select id={`${id}-unit`} className="form-select" value={value.selection} onChange={e=>change({selection:e.target.value,quantity:''})}><option value="base">{unitLabel(unit)} · unidad base</option>{units.filter(u=>u.id!==normalizeUnit(unit)).map(u=><option key={u.id} value={`unit:${u.id}`}>{u.label}</option>)}{options.map(p=><option key={p.id} value={p.id}>{p.name||'Presentación sin nombre'} · 1 {p.unit} = {p.factor||'?'} {unitLabel(unit)}</option>)}</select></label></div>}<label className="d-block mt-3" htmlFor={`${id}-observations`}>Observaciones del conteo<input id={`${id}-observations`} className="form-control" maxLength={2000} value={value.observations} onChange={e=>change({observations:e.target.value})}/></label>{preview&&<p role="status" className="form-text mt-2 mb-0">{preview}. Se guarda junto con el producto.</p>}{error&&<p role="alert" className="text-danger mt-2">{error}</p>}</>}
 </section>;
}
