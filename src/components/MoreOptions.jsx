import { useState } from 'react';

// Keep optional values mounted so collapsing never discards an edit.
export default function MoreOptions({ children, hasValue = false, label = 'Más opciones' }) {
    const [open, setOpen] = useState(Boolean(hasValue));
    return <details className="more-options" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
        <summary>{label}</summary>
        <div className="more-options-content">{children}</div>
    </details>;
}
