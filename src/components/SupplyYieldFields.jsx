import { Field, UnitField } from "./ProcurementFields";
import { yieldText, yieldValid } from '../utils/procurementUtils.js';

export default function SupplyYieldFields({ value, onChange, required = true, showSummary = false }) {
    const change = key => event => onChange({ ...value, [key]: event.target.value });
    return <><div className="form-grid">
        <Field label="Cantidad de insumo necesaria" type="number" min="0" data-positive="true" step="any" required={required} value={value.inputQuantity} onChange={change("inputQuantity")} />
        <UnitField label="Unidad del insumo" required={required} value={value.inputUnit} onChange={change("inputUnit")} />
        <Field label="Cantidad final obtenida" type="number" min="0" data-positive="true" step="any" required={required} value={value.outputQuantity} onChange={change("outputQuantity")} />
        <UnitField label="Unidad final" required={required} value={value.outputUnit} onChange={change("outputUnit")} />
    </div>{showSummary && <p className="source-purchase-preview" aria-live="polite">{yieldValid(value) ? <strong>{yieldText(value)}</strong> : 'Ejemplo: usas 1 L de base para obtener 20 L de producto final.'}</p>}</>;
}
