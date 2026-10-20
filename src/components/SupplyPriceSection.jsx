import { useState } from "react";
import { useProcurement } from "../context/ProcurementContext.js";
import { unitCostText } from "../utils/purchaseUtils.js";
import { unitLabel } from "../utils/units.js";
import SupplierPriceFormModal from "./SupplierPriceFormModal";
import CostHistoryModal from "./CostHistoryModal";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClockRotateLeft } from '@fortawesome/free-solid-svg-icons';

export default function SupplyPriceSection({ supplyId, hasUnsavedChanges = false, showHistory = true, additionalActions }) {
    const { analytics } = useProcurement();
    const [view, setView] = useState(null);
    const supply = analytics.supplyMap.get(supplyId);
    const economic = analytics.bySupply.get(supplyId);
    const price = economic?.lastQuote;
    const paid = economic?.lastPurchase;
    const canQuote = supply?.active && analytics.supplierMap.get(supply.supplierId)?.active;
    return <section className="supply-costs mt-3" aria-label="Costos del proveedor">
        <dl className="supply-cost-grid">
            <div><dt>Costo informado por el proveedor (opcional)</dt><dd>{price ? <><span className="cost-value">{unitCostText(price.price)}</span><small>por {price.priceQuantity} {unitLabel(price.priceUnit)} · {price.date}</small><small>{price.age.label}{price.expired ? ' · Vencido' : ''}</small></> : 'Sin costo informado adicional'}</dd></div>
            <div><dt>Último costo pagado</dt><dd>{paid ? <>{unitCostText(paid.price / paid.priceQuantity)} / {unitLabel(paid.priceUnit)}<small>{paid.date}</small></> : 'Sin compras registradas'}</dd></div>
        </dl>
        {paid && !price && <p className="form-text">La compra ya registró el costo pagado. No necesitas capturarlo de nuevo; el costo informado es solo para consultar precios sin registrar una compra.</p>}
        <div className="d-flex flex-wrap gap-2">
            <button type="button" className="btn btn-outline-secondary" disabled={!canQuote || hasUnsavedChanges} onClick={() => setView("quote")}>{price ? "Actualizar costo informado" : "Registrar costo informado"}</button>
            {showHistory && <button type="button" className="btn btn-outline-secondary" onClick={() => setView("history")}><FontAwesomeIcon icon={faClockRotateLeft} aria-hidden="true" className="me-2" />Ver historial de costos</button>}
            {additionalActions}
        </div>
        {hasUnsavedChanges && <p className="form-text">Guarda los cambios de la alternativa antes de registrar el costo. El costo informado utilizará esa configuración guardada.</p>}
        {!canQuote && <p className="form-text">La alternativa y su proveedor deben estar activos para registrar un costo.</p>}
        {view === "quote" && <SupplierPriceFormModal supply={supply} onClose={() => setView(null)} />}
        {view === "history" && <CostHistoryModal title={`Historial de costos · ${supply.name}`} observations={economic?.history || []} onClose={() => setView(null)} />}
    </section>;
}
