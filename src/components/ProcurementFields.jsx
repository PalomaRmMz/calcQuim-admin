import { useContext, useId, useRef, useState } from "react";
import FormLabel from './FormLabel';
import { FormValidationContext } from './FormValidationContext.js';
import { UNITS } from "../utils/units.js";
import MoreOptions from './MoreOptions';

export function Field({ label, children, ...props }) {
    const id = useId();
    const [error, setError] = useState('');
    const errors = useContext(FormValidationContext);
    const submittedError = errors.find(entry => entry.control.id === id);
    const interacted = useRef(false);
    const validation = { 'aria-required': props.required || undefined, 'aria-invalid': submittedError || error ? true : undefined, 'aria-describedby': submittedError ? `${id}-validation` : error ? `${id}-error` : undefined,
        // Dialog autofocus can blur a field during mounting; that is not user input.
        onPointerDown: event => { interacted.current = true; props.onPointerDown?.(event); },
        onKeyDown: event => { interacted.current = true; props.onKeyDown?.(event); },
        onBlur: event => { if (interacted.current) setError(event.target.validationMessage); props.onBlur?.(event); },
        onChange: event => { interacted.current = true; setError(''); props.onChange?.(event); } };
    return <div className="procurement-field"><FormLabel htmlFor={id} required={props.required}>{label}</FormLabel>{children ? <select id={id} className="form-select" {...props} {...validation}>{children}</select> : <input id={id} className="form-control" {...props} {...validation} />}{error && !submittedError && <small id={`${id}-error`} className="field-error">{error}</small>}</div>;
}
export function UnitField(props) { return <Field {...props}><option value="">Selecciona unidad</option>{UNITS.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}</Field>; }
export function NotesField({ value, onChange, label = "Notas" }) {
    const id = useId();
    return <MoreOptions label={value ? label : `Agregar ${label.toLowerCase()}`} hasValue={value}><div className="procurement-field"><label className="form-label" htmlFor={id}>{label}</label><textarea id={id} className="form-control" rows={2} maxLength={1000} value={value} onChange={onChange} /></div></MoreOptions>;
}
