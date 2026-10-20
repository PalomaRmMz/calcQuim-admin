import { calculateEffectiveCost, outputForPurchase, supplyOutcomeText, SOURCING_TYPES } from "../utils/procurementUtils.js";
import { unitLabel } from "../utils/units.js";
import { unitCostText } from "../utils/purchaseUtils.js";
export default function PurchaseItemOutcome({ item }) {
    if (item.conversionSnapshots) return <div className="purchase-outcome">{item.conversionSnapshots.length ? <><small>Destinos alternativos al registrar la compra (no se suman)</small>{item.conversionSnapshots.map(snapshot => <div key={snapshot.conversionId}><small>{snapshot.productNameSnapshot}</small><PurchaseItemOutcome item={{ ...snapshot, total: item.total, quantity: item.quantity, unit: item.unit }} /></div>)}</> : <small>Sin producto final al registrar la compra.</small>}</div>;
    const effective = calculateEffectiveCost({ price: item.total, priceQuantity: item.quantity, priceUnit: item.unit, yield: item.yield, targetUnit: item.productUnitSnapshot || item.yield?.outputUnit });
    const ready = item.sourcingType === "READY_TO_USE";
    const output = outputForPurchase(item);
    return <div className="purchase-outcome">{!ready && <small>{SOURCING_TYPES[item.sourcingType] || "Modalidad no registrada"}</small>}<small>{supplyOutcomeText(item)}</small>{!ready && output !== null && <small>Obtienes {Number(output.toFixed(4))} {unitLabel(item.yield.outputUnit)} de {item.productNameSnapshot}</small>}<strong>{effective.cost === null ? "Costo efectivo pendiente" : `Costo efectivo: ${unitCostText(effective.cost)} / ${unitLabel(effective.outputUnit)}${ready ? "" : " final"}`}</strong></div>;
}
