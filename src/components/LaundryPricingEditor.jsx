import {Field} from './ProcurementFields';
import {LAUNDRY_PRICING_VERSION} from '../domain/laundryPricing.mjs';

export default function LaundryPricingEditor({draft,onChange}){
 const pricing=draft.loadPricing;
 const set=next=>onChange({...draft,loadPricing:next});
 const patch=(index,values)=>set({...pricing,options:pricing.options.map((o,i)=>i===index?{...o,...values}:o)});
 if(!pricing)return draft.priceMode==='fixed'&&draft.unit==='carga'?<button type="button" className="btn btn-outline-primary mt-3" onClick={()=>set({version:LAUNDRY_PRICING_VERSION,step:1,options:[{key:crypto.randomUUID(),label:draft.name||'Carga completa',addons:[],full:draft.price,half:null}]})}>Configurar modalidades de carga</button>:null;
 return <section className="mt-3" aria-label="Modalidades y tarifas por carga"><h3 className="h6">Modalidades y tarifas por carga</h3>
 <p className="form-text">Estas tarifas determinan el importe de cada combinación. No se suman otra vez los adicionales.</p>
 <Field label="Cantidades permitidas" value={pricing.step} onChange={e=>set({...pricing,step:Number(e.target.value),options:pricing.options.map(o=>({...o,half:Number(e.target.value)===1?null:o.half??''}))})}><option value="1">Solo cargas completas</option><option value="0.5">Cargas completas y medias cargas</option></Field>
 {pricing.options.map((o,index)=><fieldset key={o.key} className="border rounded p-3 mt-2"><legend className="float-none w-auto h6">Modalidad {index+1}</legend>
 <Field label={`Nombre de modalidad ${index+1}`} required maxLength={200} value={o.label} onChange={e=>patch(index,{label:e.target.value})}/>
 <div className="row g-2"><div className="col-sm-6"><Field label={`Carga completa · modalidad ${index+1}`} style={{maxWidth:'12rem'}} required type="number" min="0.01" step="0.01" value={o.full} onChange={e=>patch(index,{full:e.target.value})}/></div>
 {pricing.step===0.5&&<div className="col-sm-6"><Field label={`Media carga · modalidad ${index+1}`} style={{maxWidth:'12rem'}} required type="number" min="0.01" step="0.01" value={o.half??''} onChange={e=>patch(index,{half:e.target.value})}/></div>}</div>
 <p className="form-text mb-1">Incluye</p>{draft.addons.map(a=><label key={a.id} className="form-check"><input className="form-check-input" type="checkbox" checked={o.addons.includes(a.id)} onChange={e=>patch(index,{addons:e.target.checked?[...o.addons,a.id]:o.addons.filter(id=>id!==a.id)})}/>{a.name||'Adicional sin nombre'}</label>)}
 {!draft.addons.length&&<p className="form-text">Sin adicionales.</p>}
 </fieldset>)}
 <button type="button" className="btn btn-outline-primary mt-2" onClick={()=>set({...pricing,options:[...pricing.options,{key:crypto.randomUUID(),label:'',addons:[],full:'',half:pricing.step===0.5?'':null}]})}>Agregar modalidad</button>
 </section>;
}
