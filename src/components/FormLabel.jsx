import { useContext } from 'react';
import { FormValidationContext } from './FormValidationContext.js';

export function RequiredMark() {
    return <span className="required-mark" aria-hidden="true"> *</span>;
}

export function RequiredLegend() {
    return <p className="required-legend"><RequiredMark /> Campo obligatorio</p>;
}

export function FieldError({ id }) {
    const errors = useContext(FormValidationContext);
    const error = errors.find(entry => entry.control.id === id);
    return error ? <small id={`${id}-validation`} className="field-error d-block">{error.message}</small> : null;
}

export default function FormLabel({ required = false, children, ...props }) {
    const errors = useContext(FormValidationContext);
    const error = props.htmlFor && errors.find(entry => entry.control.id === props.htmlFor);
    return <><label className="form-label" data-field-label={typeof children === 'string' ? children.trim() : undefined} {...props}>{children}{required && <RequiredMark />}</label>{error && <span id={`${props.htmlFor}-validation`} className="field-error d-block">{error.message}</span>}</>;
}
