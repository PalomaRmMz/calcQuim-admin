import DataTable from "./DataTable";
import { memo, useMemo, useState } from 'react';

const visibility = { category: false, line: false, paid: false, quote: false, presentation: false, price: false, yield: false, purchaseCount: false };

export function ComparatorMobileDetails({ group, columns }) {
    const [open, setOpen] = useState(false);
    return <details className="comparator-details" onToggle={event => setOpen(event.currentTarget.open)}>
        <summary>Ver alternativas e historial ({group.alternatives.length})</summary>
        {open && <ComparatorAlternatives group={group} columns={columns} />}
    </details>;
}

// MRT probes this callback even for collapsed rows; keep the element truthy for
// its expand button, but never mount expensive tables until the row is expanded.
export function ComparatorExpandedPanel({ expanded, group, columns }) {
    return expanded ? <ComparatorAlternatives group={group} columns={columns} /> : null;
}

function ComparatorAlternatives({ group, columns }) {
    const comparableRows = useMemo(() => group.comparable.map(candidate => candidate.row), [group]);
    const relatedRows = useMemo(() => group.related.map(candidate => candidate.row), [group]);
    return (<div className="comparator-alternatives">
            <h3>Alternativas comparables</h3>
            {group.comparable.length ? <DataTable columns={columns} data={comparableRows} mobileCards columnVisibility={visibility} /> : <p>Sin alternativa comparable confirmada</p>}
            <h3>Registros relacionados o no confirmados</h3>
            {group.related.length ? <><ul>{group.related.map(({ row: alternative, reason }) => <li key={alternative.id}>{alternative.display.snapshot?.name || 'Sin nombre'}: {reason}</li>)}</ul><DataTable columns={columns} data={relatedRows} mobileCards columnVisibility={visibility} /></> : <p>Sin registros pendientes en los filtros actuales.</p>}
            {!group.alternatives.length && <p>Este producto todavía no tiene alternativas de abastecimiento.</p>}
        </div>);
}

export default memo(ComparatorAlternatives);
