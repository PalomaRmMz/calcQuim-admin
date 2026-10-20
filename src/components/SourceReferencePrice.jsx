import { Field } from './ProcurementFields';
import MoreOptions from './MoreOptions';
import { unitLabel } from '../utils/units.js';
import { money } from '../utils/salesUtils.js';

export default function SourceReferencePrice({ value, onChange }) {
    const quantity = Number(value.purchaseQuantity) > 0 ? Number(value.purchaseQuantity) : 1;
    const basis = `${quantity} ${unitLabel(value.purchaseUnit)}`;
    const hasPrice = value.price !== '' && value.price != null;
    return <MoreOptions label="Precio del proveedor (opcional)" hasValue={hasPrice}>
        <Field label={`Precio por ${basis} (MXN)`} placeholder="Ej. 70.00" type="number" min="0" step="any" value={value.price ?? ''} onChange={event => onChange({ ...value, price: event.target.value })} />
        <p className="form-text mb-0" aria-live="polite">{hasPrice && Number.isFinite(Number(value.price)) ? `${money(Number(value.price))} por ${basis}. ` : ''}Solo guarda una referencia. Registra lo que pagaste en Compras.</p>
    </MoreOptions>;
}
