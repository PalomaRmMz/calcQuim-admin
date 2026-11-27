import {hasPhysicalSaleLine,isRecharge,makeRechargeLine,rechargeOnlyCorrection} from '../domain/phoneRecharge.mjs';
import {total} from '../../server/src/mobile/sale.mjs';
import {saleCommercialReview} from '../services/saleAuditView.mjs';
import SettlementSummary from './SettlementSummary';
import WebMoneyBreakdown from './WebMoneyBreakdown';
import {paymentAmounts} from '../domain/webPayment.mjs';
import {historicalCommerceLine} from '../domain/commerce.mjs';
import {downloadTicketPng} from '../services/ticketExport.js';
import { useState } from 'react';
import { calculateHistoricalItems as calculateItems, money } from '../utils/salesUtils.js';
import { ticketHtml } from '../services/saleReceipt.js';
export default function MobileSaleCorrection({ sale, persistence, pending=false }) {
  const [values, setValues] = useState(() => sale.items.map(i => i.capturedValue)), [reason, setReason] = useState(''), [physical, setPhysical] = useState(false), [baseline, setBaseline] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [correcting,setCorrecting]=useState(false);
  const [confirmedQuantities,setConfirmedQuantities]=useState(()=>sale.items.map(i=>i.webPhysicalQuantity?.quantity??i.confirmedQuantity??''));
  const supply=sale.items.some(i=>i.presentationSnapshot?.supplyInventory);
  const split=sale.items.some(i=>persistence.snapshot.presentationInventoryProductIds?.includes(String(i.productId)));
  const input={values,confirmedQuantities,webPhysicalQuantities:confirmedQuantities,reason,physicalTreatment:physical?'apply_difference':'',baselineTreatment:baseline,...((split||supply)&&physical?{packReturnDisposition:'sealed'}:{})};
  const rechargeOnly=rechargeOnlyCorrection(sale,input);
  const needsPhysical=sale.items.some(hasPhysicalSaleLine)&&!rechargeOnly;
  let preview;
  try {preview=calculateItems(sale.items.map((item,n)=>isRecharge(item)?makeRechargeLine(values[n],item.id):rechargeOnly?item:item.commerceVersion?historicalCommerceLine(item,values[n]):({...item,confirmedQuantity:item.webPhysicalQuantity?(item.webPhysicalQuantity.priceConfirmation?confirmedQuantities[n]:null):confirmedQuantities[n],...(item.entryMode==='amount'?{requestedAmount:values[n]}:{quantity:values[n]})})));}
  catch(error){preview=sale.items.map(item=>({...item,amount:0,pricingError:error.message}));}
  let monetaryPreview=null, revisedTotal=null;
  try {
    if(!preview.some(item=>item.pricingError)){
      revisedTotal=total(preview);
      if(sale.monetary)monetaryPreview=paymentAmounts(preview,sale.payment,sale.monetary.policyVersion);
    }
  }catch{/* The server validates the total before saving. */}
  const pricingError=preview.find(item=>item.pricingError)?.pricingError;
  async function save(e) {
    e.preventDefault(); if(busy)return; setBusy(true); setError('');
    if(pricingError){setError(pricingError);setBusy(false);return;}
    const result=await persistence.command('correctMobileSale',[sale.id,input]);
    if(!result.ok)setError(result.message); else {setReason('');setPhysical(false);setCorrecting(false);}
    setBusy(false);
  }
  function print(receipt) {
    const page=window.open('','_blank');
    if(!page){setError('Permite abrir la ventana del ticket para imprimir o guardar PDF.');return;}
    page.document.write(ticketHtml(receipt));page.document.close();page.focus();page.print();
  }
  const review=saleCommercialReview(sale);
  return <section className="sale-section" aria-label="Ticket y corrección">{(review.reviewed||review.pending||pending)&&<section aria-label="Revisiones comerciales"><h3>Revisiones comerciales</h3>{pending&&<p>Hay un desglose pendiente para esta venta.</p>}<SettlementSummary sale={sale}/></section>}<button className="btn btn-outline-primary me-2" onClick={()=>downloadTicketPng(sale.updatedReceipt||sale.originalReceipt).catch(e=>setError(e.message))}>Ticket PNG</button><p>Folio {sale.folio} · Origen {sale.origin} · Versión {sale.commercialVersion||1}</p><button className="btn btn-outline-secondary me-2" onClick={()=>print(sale.originalReceipt)}>Ticket original / PDF</button>{sale.updatedReceipt&&<button className="btn btn-outline-primary" onClick={()=>print(sale.updatedReceipt)}>Ticket actualizado v{sale.updatedReceipt.version} / PDF</button>}
    {!sale.voidedAt&&<><button type="button" className="btn btn-outline-secondary my-2" aria-expanded={correcting} onClick={()=>setCorrecting(!correcting)}>Corregir venta</button>{correcting&&<form onSubmit={save}>{sale.items.map((i,n)=><label className="d-block my-2" key={i.id}>{isRecharge(i)?'Importe de la recarga':`${i.name} · ${i.entryMode==='amount'?'MXN':i.unit} · Tarifa histórica ${money(i.price)}`}<input className="form-control" type={isRecharge(i)?'text':'number'} min={isRecharge(i)?undefined:'0.000001'} step={isRecharge(i)?undefined:i.entryMode==='amount'?'0.01':'0.000001'} inputMode="decimal" value={values[n]??''} onChange={e=>setValues(values.map((v,k)=>k===n?e.target.value:v))}/></label>)}{sale.items.some(i=>i.pricingVersion)&&sale.items.map((i,n)=>hasPhysicalSaleLine(i)&&i.entryMode==='amount'?<label className="d-block" key={i.id+'-physical'}>Cantidad física confirmada de {i.name} ({i.unit}), si se requiere<input aria-label={`Cantidad física confirmada de ${i.name}`} className="form-control" value={confirmedQuantities[n]} onChange={e=>setConfirmedQuantities(confirmedQuantities.map((v,k)=>k===n?e.target.value:v))}/></label>:null)}<WebMoneyBreakdown monetary={monetaryPreview}/><p>Total propuesto: {monetaryPreview?money(monetaryPreview.collectedCents/100):revisedTotal==null?'—':money(revisedTotal)}</p>{sale.monetary&&<p className="form-text">Se conserva la política y el método originales. Esta revisión no registra el pago o devolución de la diferencia.</p>}<label className="d-block">Motivo obligatorio<textarea maxLength={1000} className="form-control" value={reason} onChange={e=>setReason(e.target.value)}/></label>{needsPhysical&&<><label className="d-block my-2"><input type="checkbox" checked={physical} onChange={e=>setPhysical(e.target.checked)}/> {supply&&'Confirmo que las botellas reincorporadas permanecen cerradas. '}{split&&'Confirmo que los paquetes que se reincorporan permanecen cerrados. '}Confirmo la diferencia física: las salidas anteriores se revierten y las cantidades específicas corregidas vuelven a descontarse. Las agrupaciones e importes requerirán nuevo desglose. El ticket original se conserva.</label><label className="d-block">Si hubo conteo o estimación posterior<select className="form-select" value={baseline} onChange={e=>setBaseline(e.target.value)}><option value="">Sin tratamiento confirmado</option><option value="apply_now">Aplicar ahora la diferencia física al inventario actual</option></select></label></>}<button disabled={busy||(sale.monetary&&!monetaryPreview)||(needsPhysical&&!physical)||revisedTotal==null||!reason.trim()} className="btn btn-primary mt-3">Guardar revisión comercial</button></form>}</>}{(error||correcting&&pricingError)&&<p role="alert">{error||pricingError}</p>}
  </section>;
}
