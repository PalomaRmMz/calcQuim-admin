import { useState } from "react";
import AppModal from "./AppModal";
import Feedback from "./Feedback";
import SupplierCostFields from "./SupplierCostFields";
import { useProcurement } from "../context/ProcurementContext.js";
import { localDate } from "../utils/salesUtils.js";
import { calculateEffectiveCost, supplyOutcomeText, numberValue, positive, supplySnapshot } from "../utils/procurementUtils.js";
import { useCatalog } from "../context/CatalogHooks.js";
import { unitCostText } from "../utils/purchaseUtils.js";
import { unitLabel } from "../utils/units.js";
import MoreOptions from './MoreOptions';

export default function SupplierPriceFormModal({ supply, onClose }) {
    const { addSupplierPrice, data } = useProcurement();
    const { products } = useCatalog();
    const [form, setForm] = useState({ supplyItemId: supply.id, price: "", priceQuantity: supply.purchaseQuantity || 1, priceUnit: supply.purchaseUnit, quotedAt: localDate(), validUntil: "", notes: "" });
    const [error, setError] = useState("");
    const snapshot = supplySnapshot(supply, products.find((p) => p.id === supply.outputProductId));
    const effective = calculateEffectiveCost({ ...form, yield: snapshot.yield, targetUnit: snapshot.productUnitSnapshot || snapshot.yield?.outputUnit });
    const unitCost = numberValue(form.price) !== null && Number(form.price) >= 0 && positive(form.priceQuantity) ? Number(form.price) / Number(form.priceQuantity) : null;
    async function submit(event) { event.preventDefault(); event.stopPropagation(); const result = await addSupplierPrice(form); if (!result.ok) setError(result.message); else onClose(); }
    return <AppModal submitLabel="Registrar costo" title="Registrar costo" subtitle={supply.name} onClose={onClose} onSubmit={submit}>
        <p className="form-text">Cada registro conserva su fecha, precio y relaciones vigentes. Los costos anteriores no se sobrescriben.</p>
        <SupplierCostFields value={form} onChange={setForm} />
        <MoreOptions label="Cómo registrar el costo"><p className="form-text">Ejemplo: $100 por una garrafa de 5 L se registra como precio 100, cantidad 5, unidad L.</p></MoreOptions>
        <section className="sale-section"><p>{data?.supplyModelVersion === 2 ? 'Este costo corresponde al artículo, proveedor y presentación.' : supplyOutcomeText(supply)}</p><p>Costo unitario de compra: {Number.isFinite(unitCost) ? `${unitCostText(unitCost)} / ${unitLabel(form.priceUnit)}` : "Pendiente"}</p>{data?.supplyModelVersion === 2 ? <p>El comparador calcula el costo final de cada producto relacionado usando su propio rendimiento.</p> : <strong>{effective.cost === null ? "Costo efectivo pendiente" : `Costo efectivo: ${unitCostText(effective.cost)} / ${unitLabel(effective.outputUnit)} final`}</strong>}</section>
        <Feedback message={error} />
    </AppModal>;
}
