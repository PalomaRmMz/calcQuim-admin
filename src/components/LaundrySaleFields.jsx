import {laundryOptions} from '../domain/laundryPricing.mjs';
import {money} from '../utils/salesUtils.js';
import {Field} from './ProcurementFields';

export default function LaundrySaleFields({service,value,onValue,addons,onAddons,description,onDescription,preview,error}){
 const custom=service.priceMode==='custom',options=custom?[]:laundryOptions(service),selected=options.find(o=>o.addons.length===addons.length&&o.addons.every(id=>addons.includes(id))),wash=service.id==='fc:service:lavado'||service.serviceType==='wash';
 return <>{!custom&&options.length>1&&<Field label="Tipo de lavado" value={selected?.key||''} onChange={e=>onAddons(options.find(o=>o.key===e.target.value)?.addons||[])}>{options.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}</Field>}
 {custom&&<Field label="Descripción del trabajo" required={service.descriptionRequired===true||service.id==='fc:service:especial'} maxLength={200} value={description} onChange={e=>onDescription(e.target.value)}/>}
 <Field label={custom?'Importe en pesos':'Cantidad de cargas'} type="number" inputMode="decimal" min={custom?'0.01':wash?'0.5':'1'} step={custom?'0.01':service.loadPricing?.step??(wash?0.5:1)} value={value} onChange={e=>onValue(e.target.value)}/>
 <div className="d-flex justify-content-between align-items-center mt-3"><span>Subtotal del concepto</span><strong className="table-money" aria-label="Subtotal del concepto" aria-live="polite" role="status">{value.trim()?(preview?money(preview.amount):'—'):money(0)}</strong></div>
 {error&&value.trim()&&<p className="text-danger mt-2 mb-0" role="alert">{wash&&!service.loadPricing&&Number(value)%1?'Las medias cargas están pendientes de habilitar.':error}</p>}</>;
}
