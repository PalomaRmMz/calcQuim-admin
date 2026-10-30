import { useState } from 'react';
import { calculateItems, money } from '../utils/salesUtils.js';
import { ticketHtml } from '../services/saleReceipt.js';
export default function MobileSaleCorrection({ sale, persistence }) {
  const [values, setValues] = useState(() => sale.items.map(i => i.capturedValue)), [reason, setReason] = useState(''), [physical, setPhysical] = useState(false), [baseline, setBaseline] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const preview = calculateItems(sale.items.map((i,n) => ({ ...i, ...(i.entryMode==='amount'?{requestedAmount:values[n]}:{quantity:values[n]}) })));
  async function save(e) {
    e.preventDefault(); if(busy)return; setBusy(true); setError('');
    const result=await persistence.command('correctMobileSale',[sale.id,{values,reason,physicalTreatment:physical?'apply_difference':'',baselineTreatment:baseline}]);
    if(!result.ok)setError(result.message); else {setReason('');setPhysical(false);}
    setBusy(false);
  }
  function print(receipt) {
    const page=window.open('','_blank');
    if(!page){setError('Permite abrir la ventana del ticket para imprimir o guardar PDF.');return;}
    page.document.write(ticketHtml(receipt));page.document.close();page.focus();page.print();
  }
  return <section className="sale-section"><h3>Revisiones comerciales</h3><p>Folio {sale.folio} · Origen {sale.origin} · Versión {sale.commercialVersion||1}</p><button className="btn btn-outline-secondary me-2" onClick={()=>print(sale.originalReceipt)}>Ticket original / PDF</button>{sale.updatedReceipt&&<button className="btn btn-outline-primary" onClick={()=>print(sale.updatedReceipt)}>Ticket actualizado v{sale.updatedReceipt.version} / PDF</button>}
    {!sale.voidedAt&&<details><summary>Corregir cantidades o importes</summary><form onSubmit={save}>{sale.items.map((i,n)=><label className="d-block my-2" key={i.id}>{i.name} · {i.entryMode==='amount'?'MXN':i.unit} · Tarifa histórica {money(i.price)}<input className="form-control" inputMode="decimal" value={values[n]??''} onChange={e=>setValues(values.map((v,k)=>k===n?e.target.value:v))}/></label>)}<p>Total propuesto: {money(preview.reduce((sum,i)=>sum+i.amount,0))}</p><label className="d-block">Motivo obligatorio<textarea maxLength={1000} className="form-control" value={reason} onChange={e=>setReason(e.target.value)}/></label><label className="d-block my-2"><input type="checkbox" checked={physical} onChange={e=>setPhysical(e.target.checked)}/> Confirmo la diferencia física: las salidas anteriores se revierten y las cantidades específicas corregidas vuelven a descontarse. Las agrupaciones e importes requerirán nuevo desglose. El ticket original se conserva.</label><label className="d-block">Si hubo conteo o estimación posterior<select className="form-select" value={baseline} onChange={e=>setBaseline(e.target.value)}><option value="">Sin tratamiento confirmado</option><option value="apply_now">Aplicar ahora la diferencia física al inventario actual</option></select></label><button disabled={busy||!physical||!reason.trim()} className="btn btn-primary mt-3">Guardar revisión comercial</button></form></details>}{error&&<p role="alert">{error}</p>}
  </section>;
}
