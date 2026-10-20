import { useRef, useState } from 'react';
import { RequiredLegend } from './FormLabel';
import { FormValidationContext } from './FormValidationContext.js';

// Keep domain validation in each submit handler. This adds accessible field feedback
// for native constraints without changing stored data or marking untouched fields.
export default function ValidatedForm({ children, onSubmit, ...props }) {
    const formRef = useRef(null);
    const [errors, setErrors] = useState([]);
    function validate() {
        const controls = [...formRef.current.elements].filter(control => control.willValidate);
        const invalid = [];
        for (const control of controls) {
            control.setCustomValidity('');
            if (control.required && ['text', 'search'].includes(control.type)) {
                control.setCustomValidity(control.value.trim() ? '' : 'Completa este campo.');
            }
            if (control.dataset.positive && control.value !== '' && !(control.valueAsNumber > 0)) {
                control.setCustomValidity('Escribe una cantidad mayor que cero.');
            }
            const valid = control.validity.valid;
            control.setAttribute('aria-invalid', String(!valid));
            if (control.id && (control.labels?.length || control.dataset.inlineError)) {
                const descriptionId = `${control.id}-validation`;
                const ids = (control.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== descriptionId);
                if (!valid) ids.push(descriptionId);
                if (ids.length) control.setAttribute('aria-describedby', ids.join(' '));
                else control.removeAttribute('aria-describedby');
            }
            if (!valid) {
                const label = control.getAttribute('aria-label') || control.labels?.[0]?.getAttribute('data-field-label') || control.labels?.[0]?.textContent || 'Campo';
                invalid.push({ control, label, message: control.validationMessage });
            }
        }
        setErrors(invalid);
        return invalid;
    }
    return <form {...props} ref={formRef} noValidate onInput={event => {
        if (event.target.setCustomValidity) event.target.setCustomValidity('');
        if (errors.length) validate();
    }} onSubmit={event => {
        event.preventDefault();
        event.stopPropagation();
        const invalid = validate();
        if (invalid.length) {
            // Optional sections may contain an invalid value entered before collapsing.
            for (const { control } of invalid) {
                let parent = control.parentElement;
                while (parent && parent !== formRef.current) { if (parent.tagName === 'DETAILS') parent.open = true; parent = parent.parentElement; }
            }
            invalid[0].control.focus(); invalid[0].control.reportValidity(); return;
        }
        onSubmit?.(event);
    }}>
        <RequiredLegend />
        <FormValidationContext.Provider value={errors}>{children}</FormValidationContext.Provider>
        {errors.length > 0 && <div className="form-errors" role="alert"><p>Revisa los campos indicados:</p><ul>{errors.map(({ control, label, message }, index) => <li key={index}><button type="button" onClick={() => control.focus()}>{label}: {message}</button></li>)}</ul></div>}
    </form>;
}
