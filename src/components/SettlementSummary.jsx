import {settlementSummary} from '../domain/settlementLedger.mjs';
const money=n=>n==null?'Sin determinar':`$${(n/100).toFixed(2)}`;
export default function SettlementSummary({sale}){
 const s=settlementSummary(sale);
 return <section className="border rounded p-3 my-3" aria-label="Diferencias monetarias"><h3 className="h6">Diferencias monetarias</h3><dl className="row mb-1">
 {[['Importe comercial actualizado',s.commercialCents],['Cobro original documentado',s.originalConfirmedCents],['Cobros adicionales registrados',s.additionalConfirmedCents],['Devoluciones registradas',s.refundConfirmedCents],['Diferencia pendiente de cobrar',s.pendingCollectionCents],['Diferencia pendiente de devolver',s.pendingRefundCents]].map(([label,n])=><div className="col-sm-6" key={label}><dt>{label}</dt><dd>{money(n)}</dd></div>)}
 </dl><p className="form-text mb-0">La corrección no confirma un pago ni una devolución. {sale.voidedAt?'La anulación requiere revisar el destino del dinero. ':''}El registro de liquidaciones requiere definir y aprobar su política comercial.</p></section>;
}
