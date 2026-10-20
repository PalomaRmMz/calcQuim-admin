import { useState } from 'react';
import { Field, UnitField } from './ProcurementFields';
import { unitLabel } from '../utils/units.js';
import '../styles/components/SourcePurchaseFields.css';

export default function SourcePurchaseFields({ value, onChange, finished = false, disabled = false }) {
    const [packaged, setPackaged] = useState(Boolean(value.purchaseQuantity || value.presentation));
    const set = key => event => onChange({ ...value, [key]: event.target.value });
    return <section className="source-purchase-fields" aria-label="Presentación de compra">
        <h4 className="source-purchase-heading">¿Cómo te lo entrega el proveedor?</h4>
        {finished && <Field label="Forma de compra" disabled={disabled} value={packaged ? 'packaged' : 'bulk'} onChange={event => {
            const next = event.target.value === 'packaged';
            setPackaged(next);
            if (!next) onChange({ ...value, purchaseQuantity: '', presentation: '' });
        }}><option value="bulk">A granel / envase propio</option><option value="packaged">Con presentación comercial</option></Field>}
        {finished && !packaged && <p className="form-text">Llevas tu propio bidón. Registra la cantidad real comprada y su costo en cada compra; no necesitas configurar un envase ni un contenido fijo.</p>}
        <div className="form-grid">
            {(!finished || packaged) && <Field disabled={disabled} label="Contenido de la presentación (opcional)" placeholder="Ej. 1 o 5; no es el precio" type="number" min="0" data-positive="true" step="any" value={value.purchaseQuantity ?? ''} onChange={set('purchaseQuantity')} />}
            <UnitField required disabled={disabled} label="Unidad de compra" value={value.purchaseUnit} onChange={set('purchaseUnit')} />
            {(!finished || packaged) && <Field disabled={disabled} label="Presentación / envase (opcional)" value={value.presentation || ''} onChange={set('presentation')} />}
        </div>
        {(!finished || packaged) && <p className="source-purchase-preview" aria-live="polite">{Number(value.purchaseQuantity) > 0 ? <><strong>{value.presentation || 'Presentación'} de {value.purchaseQuantity} {unitLabel(value.purchaseUnit)}</strong><span>Este es el contenido del envase. La cantidad comprada se captura en cada compra.</span></> : 'Si el envase tiene un contenido fijo, indícalo aquí. Puedes dejarlo pendiente.'}</p>}
    </section>;
}
