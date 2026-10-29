import { INVENTORY_REASONS } from '../services/inventoryReasons.js';
export default function InventoryReasonSummary({reference={},legacyReason=''}){
    const code=reference.reasonCode;
    const label=code&&code!=='legacy_free_text'&&INVENTORY_REASONS[code]?INVENTORY_REASONS[code]:legacyReason;
    return <><span>{label}</span>{code==='other'&&reference.reasonExplanation&&<small className="d-block">{reference.reasonExplanation}</small>}{reference.observations&&<small className="d-block text-muted">Observaciones: {reference.observations}</small>}</>;
}
