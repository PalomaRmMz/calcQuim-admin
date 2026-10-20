import { Field, UnitField, NotesField } from "./ProcurementFields";
import { localDate } from "../utils/salesUtils.js";

export default function SupplierCostFields({ value, onChange, optional = false, defaultUnit, perPresentation = false }) {
    const change = (key) => (event) => onChange({ ...value, [key]: event.target.value });
    const required = !optional || String(value.price).trim() !== "";
    return <>
        <div className="form-grid">
            <Field label="Costo del proveedor · MXN" type="number" required={!optional} min="0" step="any" value={value.price} onChange={change("price")} />
            {!perPresentation && <><Field label="Cantidad que cubre el costo" data-positive="true" type="number" required={required} min="0" step="any" value={value.priceQuantity} onChange={change("priceQuantity")} />
            <UnitField label="Unidad del contenido" required={required} value={value.priceUnit || defaultUnit || ""} onChange={change("priceUnit")} /></>}
            <Field label="Fecha del costo" type="date" required={required} max={localDate()} value={value.quotedAt} onChange={change("quotedAt")} />
        </div>
        {perPresentation && <p className="form-text">Importe por la presentación completa de cada alternativa. La vista previa muestra su cantidad y unidad.</p>}
        <NotesField label="Notas del costo (opcional)" value={value.notes} onChange={change("notes")} />
    </>;
}
