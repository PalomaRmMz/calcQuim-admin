import {laundryOptions} from '../domain/laundryPricing.mjs';
import {money} from '../utils/salesUtils.js';
import {Field} from './ProcurementFields';

export default function LaundrySaleFields({service,value,onValue,addons,onAddons,description,onDescription,preview,error}){
 const custom=service.priceMode==='custom',options=custom?[]:laundryOptions(service),selected=options.find(o=>o.addons.length===addons.length&&o.addons.every(id=>addons.includes(id))),wash=service.id==='fc:service:lavado'||service.serviceType==='wash';
 return <div className="laundry-capture">{!custom&&options.length>1&&<Field label="Modalidad / Tipo de lavado" value={selected?.key||''} onChange={e=>onAddons(options.find(o=>o.key===e.target.value)?.addons||[])}>{options.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}</Field>}
 {custom&&<Field label="Descripción del trabajo" required={service.descriptionRequired===true||service.id==='fc:service:especial'} maxLength={200} value={description} onChange={e=>onDescription(e.target.value)}/>}
 <div className="laundry-quantity"><Field label={custom?'Importe en pesos':'Cantidad de cargas'} type="number" inputMode="decimal" min={custom?'0.01':service.loadPricing?.step??1} step={custom?'0.01':service.loadPricing?.step??1} value={value} onChange={e=>onValue(e.target.value)} onBlur={()=>{if(custom&&Number(value)>0&&Number.isFinite(Number(value)))onValue(Number(value).toFixed(2));}}/></div>
 {!custom&&<p className="form-text mb-2">{service.loadPricing?.step===0.5?"Admite media carga: 0.5, 1, 1.5...":"Este servicio admite cargas completas: 1, 2, 3..."}</p>}
 {!custom&&<p className="form-text mb-2">{addons.length?`Adicionales incluidos: ${(service.addons||[]).filter(a=>addons.includes(a.id)).map(a=>a.name).join(", ")}.`:"Sin adicionales. Selecciona otra modalidad para ver las opciones disponibles."}</p>}
 <div className="d-flex justify-content-between align-items-center mt-3"><span>Subtotal del concepto</span><strong className="table-money" aria-label="Subtotal del concepto" aria-live="polite" role="status">{value.trim()?(preview?money(preview.amount):'—'):money(0)}</strong></div>
 {error&&value.trim()&&<p className="text-danger mt-2 mb-0" role="alert">{wash&&!service.loadPricing&&Number(value)%1?'Las medias cargas están pendientes de habilitar.':error}</p>}</div>;
}
