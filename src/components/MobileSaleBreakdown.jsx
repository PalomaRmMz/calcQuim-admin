import { useEffect, useState } from 'react';
import InventoryReasonFields from './InventoryReasonFields';
import { emptyInventoryReason, inventoryReasonPayload } from '../services/inventoryReasons.js';
export default function MobileSaleBreakdown({ sale, persistence, products }) {
  const [baselines,setBaselines]=useState({});
  const [pending, setPending] = useState([]), [selected, setSelected] = useState(''), [quantities, setQuantities] = useState({}), [physical, setPhysical] = useState(''), [reason, setReason] = useState(emptyInventoryReason), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; fetch('/api/v1/inventory').then(r => { if (!r.ok) throw new Error('No se pudo consultar inventario.'); return r.json(); }).then(v => { if (active) setPending(v.pending.filter(p => p.sale_id === sale.id && p.state === 'pending')); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [sale.id, persistence.snapshot.revision]);
  const row = pending.find(p => p.id === selected), captured = row && sale.items[row.ordinal];
  const compatible = captured ? products.filter(p => captured.eligibleProductIds?.some(id => String(id) === String(p.id))) : [];
  async function save(e) {
    e.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      const result = await persistence.command('inventoryAllocate', [{ pendingId: selected, allocations: compatible.filter(p => Number(quantities[p.id]) > 0).map(p => ({ productId: p.id, quantity: quantities[p.id], unit: p.unit, baselineTreatment: baselines[p.id] || undefined })), confirmedQuantity: physical, confirmedUnit: row.unit, ...inventoryReasonPayload(reason, 'allocation') }]);
      if (!result.ok) throw new Error(result.message);
      setSelected(''); setQuantities({}); setPhysical(''); setBaselines({});
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="sale-section"><h3>Desglose físico pendiente</h3>{error && <p role="alert">{error}</p>}{!pending.length ? <p>Sin pendientes de inventario.</p> : <form onSubmit={save}><label>Renglón<select className="form-select" value={selected} onChange={e => { setSelected(e.target.value); setQuantities({}); setBaselines({}); }}><option value="">Selecciona</option>{pending.map(p => <option key={p.id} value={p.id}>{sale.items[p.ordinal]?.name} · {p.quantity || 'Confirmar cantidad física'} {p.unit}</option>)}</select></label>{captured && <><p>Importe y tarifa históricos conservados: ${captured.amount.toFixed(2)} · ${captured.price} / {captured.unit}</p>{row.quantity == null && <label>Cantidad física confirmada ({row.unit})<input className="form-control" value={physical} onChange={e => setPhysical(e.target.value)} /></label>}{compatible.map(p => <div className="my-2" key={p.id}><label className="d-block">{p.name} ({p.unit})<input className="form-control" inputMode="decimal" value={quantities[p.id] || ''} onChange={e => setQuantities({ ...quantities, [p.id]: e.target.value })} /></label><label className="d-block">Respecto a la última estimación<select className="form-select" value={baselines[p.id] || ''} onChange={e=>setBaselines({...baselines,[p.id]:e.target.value})}><option value="">Sin confirmar: revisar si es anterior a la estimación</option><option value="already_included">Ya estaba incluida: no volver a descontar</option><option value="apply_now">Debe descontarse ahora del saldo</option></select></label></div>)}<InventoryReasonFields context="allocation" value={reason} onChange={setReason} idPrefix="mobile-sale-allocation" /><button disabled={busy} className="btn btn-primary mt-3">Confirmar desglose</button></>}</form>}</section>;
}
