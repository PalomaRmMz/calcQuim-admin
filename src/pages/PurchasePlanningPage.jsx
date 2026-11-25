import {useContext, useEffect, useMemo, useState} from 'react';
import {PersistenceContext} from '../context/PersistenceContext.js';
import {historicalPlanningCosts, plannedPurchaseLine, planningActivities as activities, planningCostSources as sources, planningRows, purchasePlanSummary} from '../domain/purchasePlanning.mjs';
import {localDate, money} from '../utils/salesUtils.js';
import {UNITS, unitLabel} from '../utils/units.js';
import {cleaningInventoryLabels, requiresInventoryPurchase} from '../domain/inventoryAttention.mjs';
import DataTable from '../components/DataTable.jsx';
import '../styles/components/DataTable.css';
import '../styles/components/Inventory.css';
import './PurchasePlanningPage.css';

const statuses = {
    empty: 'Agotado', low: 'Por debajo del mínimo', atMinimum: 'En el mínimo',
    unknown: 'Existencia desconocida', negative: 'Saldo por revisar',
    unconfigured: 'Sin mínimo', sufficient: 'Existencia suficiente', input: 'Compra manual',
};
const emptyDraft = {};
const stockTone = {empty: 'danger', low: 'warning', atMinimum: 'warning', negative: 'danger', sufficient: 'success'};
const stockLabel = row => (row.activity === 'LIMPIEZA' ? cleaningInventoryLabels[row.status] : undefined) ?? statuses[row.status];
const costLabel = value => new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 6,
}).format(value / 100);

function PurchasePlanCell({column, entry}) {
    const {row, draft, line, update} = entry;
    const {presentation, offers, supplier} = line;
    const best = offers.find(o => o.unitCents != null);
    const invalidQuantity = !!draft.selected && line.quantity === null;
    if (column === 'product') return <><label className="purchase-plan-product">
            <input type="checkbox" className="form-check-input" checked={!!draft.selected}
                onChange={e => update({selected: e.target.checked})}/>
            <span><strong className="table-text-primary">{row.name}</strong>
                <span className="classification-label">{row.articleId != null ? 'Insumo para preparación' : row.activity === 'LIMPIEZA' ? 'Limpieza terminada' : activities[row.activity]}</span></span></label></>;
    if (column === 'stock' && row.articleId != null) return <span className="badge text-bg-secondary">Compra manual</span>;
    if (column === 'stock') return <><strong className="table-text-primary">{row.quantity === null ? 'Desconocida' : row.quantity + ' ' + unitLabel(row.unit)}</strong>
            <small>Mínimo {row.minimum ?? 'sin configurar'} {row.minimum !== null && unitLabel(row.unit)}</small>
            <span className={`badge text-bg-${stockTone[row.status] ?? 'secondary'}`}>{stockLabel(row)}</span></>;
    if (column === 'presentation') return <><div className="purchase-plan-entry">{row.presentations.length > 1 ? <select className="form-select form-select-sm" aria-label={'Presentación de ' + row.name}
            value={presentation.id} onChange={e => update({presentationId: e.target.value, quantity: undefined, cost: '',
                ...(row.articleId != null ? {supplierId: undefined} : {})})}>
            {row.presentations.map(p => <option value={p.id} key={p.id}>{p.name}
                {p.supplierName ? ' · ' + p.supplierName : !p.sourceId && p.factor !== 1 ? ' · ' + p.factor + ' ' + unitLabel(row.unit) : ''}</option>)}
        </select> : <span>{presentation?.name ?? 'Sin presentación'}</span>}
            <input className="form-control form-control-sm text-end" type="number" min="0"
                step={presentation?.integer ? 1 : '0.000001'} aria-label={'Cantidad para ' + row.name}
                placeholder="—" value={line.input} disabled={!presentation} aria-invalid={invalidQuantity || undefined}
                aria-describedby={draft.quantity == null && line.input ? 'purchase-plan-suggestion' : undefined}
                onChange={e => update({quantity: e.target.value})}/></div>
            {draft.quantity == null && line.input && <small className="text-end">Provisional</small>}
            {invalidQuantity && <small className="text-danger">Indica una cantidad válida.</small>}
        </>;
    if (column === 'supplier') return <><select className="form-select form-select-sm" aria-label={'Proveedor para ' + row.name}
            value={draft.supplierId ?? supplier?.id ?? ''} onChange={e => update({supplierId: e.target.value, cost: ''})}>
            <option value="">Sin determinar</option><option value="manual">Referencia manual</option>
            {offers.map(o => <option key={o.id} value={o.id}>{o.name}{o.unitCents != null ? ' · ' + costLabel(o.unitCents) + ' · ' + o.date : ''}</option>)}
        </select>
            {draft.supplierId === 'manual' && <input className="form-control form-control-sm mt-1" maxLength={100}
                aria-label={'Referencia de proveedor para ' + row.name} placeholder="Nombre o referencia"
                value={draft.supplierName ?? ''} onChange={e => update({supplierName: e.target.value})}/>}
            {best && <small><strong>Mejor costo</strong> · {best.id !== supplier?.id && best.name + ' · '}{costLabel(best.unitCents)}{best.id !== supplier?.id && ' · ' + best.date}</small>}
            {row.articleId != null && supplier?.baseQuantity > 0 && <small>Compra de referencia · {supplier.baseQuantity} {unitLabel(row.unit)}</small>}
            {supplier?.formats.length > 0 && <small>Presentaciones · {supplier.formats.join(' / ')}</small>}
            {supplier?.tiers.length > 0 && <small>Niveles desde {supplier.tiers.join(', ')} · por presentación o condición general</small>}
        </>;
    if (column === 'cost') return <><input className="form-control form-control-sm text-end" type="number" min="0" step="0.01"
            aria-label={'Costo manual por presentación de ' + row.name} placeholder={line.unitCents === null ? '—' : costLabel(line.unitCents)}
            value={draft.cost ?? ''} onChange={e => update({cost: e.target.value})}/>
            <small>{line.unitCents === null ? 'Por determinar' : line.source}
                {supplier?.date && <time dateTime={supplier.date}>{supplier.date}</time>}</small>
            {draft.cost && supplier?.unitCents != null && <small>Costo aplicado: {costLabel(supplier.unitCents)}</small>}
            {presentation && <small>Por {unitLabel(presentation.unit)}</small>}
        </>;
    if (column === 'amount') return <>{line.amount === null ? <small>Por determinar</small> :
            <strong className="table-money table-text-primary">{money(line.amount / 100)}</strong>}</>;
    return null;
}

const normalize = value => String(value ?? '').normalize('NFD').replace(/\p{Mark}/gu, '').toLowerCase();
const searchCell = (row, id, value) => normalize(row.getValue(id)).includes(normalize(value).trim());
const stockUnit = unit => UNITS.find(entry => entry.id === unit);
function compareQuantities(left, right, unitOf, quantityOf) {
    const leftUnit = stockUnit(unitOf(left)), rightUnit = stockUnit(unitOf(right));
    const leftGroup = leftUnit?.dimension ?? unitOf(left) ?? '', rightGroup = rightUnit?.dimension ?? unitOf(right) ?? '';
    const group = leftGroup.localeCompare(rightGroup, 'es');
    return group || quantityOf(left) * (leftUnit?.factor ?? 1) - quantityOf(right) * (rightUnit?.factor ?? 1);
}

const currencyFilter = (row, id, value) => {
    const cents = row.getValue(id);
    const text = cents === undefined ? (id === 'cost' ? sources.missing + ' · Sin costo · Por determinar' : 'Por determinar') :
        money(cents / 100) + ' ' + cents / 100 + (id === 'cost' ? ' ' + row.original.line.source : '');
    return normalize(text).includes(normalize(value).trim());
};
const column = (id, header, size, options) => ({
    id, header, size, filterFn: searchCell,
    muiFilterTextFieldProps: {placeholder: 'Filtrar ' + header.toLowerCase(), inputProps: {'aria-label': 'Filtrar ' + header.toLowerCase()}},
    Cell: ({row}) => <PurchasePlanCell column={id} entry={row.original}/>,
    ...options,
});
const moneyColumn = {filterFn: currencyFilter, sortingFn: 'basic', sortUndefined: 'last', sortDescFirst: false,
    muiTableHeadCellProps: {align: 'right'}, muiTableBodyCellProps: {align: 'right'}};
const columns = [
    column('product', 'Producto', 185, {accessorFn: ({row}) => row.name}),
    column('stock', 'Existencias', 152, {
        accessorFn: ({row}) => row.quantity === null ? undefined : row.quantity,
        sortingFn: (a,b) => compareQuantities(a.original.row, b.original.row, row => row.unit, row => row.quantity),
        sortUndefined: 'last', sortDescFirst: false,
        filterFn: ({original: {row}}, _id, value) => normalize(
            row.quantity === null ? stockLabel(row) :
                `${row.quantity} ${unitLabel(row.unit)} ${row.unit} · ${stockLabel(row)}`
        ).includes(normalize(value).trim()),
    }),
    column('presentation', 'Presentación y cantidad', 220, {
        accessorFn: ({line}) => line.quantity === null ? undefined : Number(line.quantity),
        sortingFn: (a,b) => compareQuantities(a.original, b.original, entry => entry.row.unit,
            entry => Number(entry.line.quantity) * entry.line.presentation.factor),
        sortUndefined: 'last', sortDescFirst: false,
        filterFn: ({original: {line}}, _id, value) => normalize(line.presentation ?
            line.presentation.name + ' · ' + line.input + ' ' + unitLabel(line.presentation.unit) + ' ' + line.presentation.unit :
            'Sin presentación').includes(normalize(value).trim()),
    }),
    column('supplier', 'Proveedor', 218, {accessorFn: ({line}) => line.supplierName || 'Sin determinar'}),
    column('cost', 'Costo unitario', 140, {...moneyColumn, accessorFn: ({line}) => line.unitCents ?? undefined}),
    column('amount', 'Importe estimado', 145, {...moneyColumn, accessorFn: ({line}) => line.amount ?? undefined}),
];
const getPlanRowId = entry => entry.row.id;
const getPlanRowClass = entry => entry.draft.selected ? 'Mui-selected' : '';

export default function PurchasePlanningPage() {
    const persistence = useContext(PersistenceContext);
    const data = persistence?.snapshot.data;
    const [view, setView] = useState(null);
    const [error, setError] = useState('');
    const [retry, setRetry] = useState(0);
    const [activity, setActivity] = useState('');
    const [status, setStatus] = useState('attention');
    const [search, setSearch] = useState('');
    const [drafts, setDrafts] = useState({});
    const [showSelected, setShowSelected] = useState(false);
    const [showList, setShowList] = useState(false);
    const [copyStatus, setCopyStatus] = useState('');
    const revision = persistence?.snapshot.revision;
    const generation = persistence?.snapshot.generation;
    const today = localDate();
    useEffect(() => {
        if (revision == null) return;
        const controller = new AbortController();
        fetch('/api/v1/inventory', {signal: controller.signal, cache: 'no-store'}).then(async response => {
            if (!response.ok) throw Error('No se pudieron consultar las existencias.');
            return response.json();
        }).then(value => {
            if (controller.signal.aborted) return;
            setView({value, revision, generation, retry});
            setError('');
        }).catch(() => {
            if (!controller.signal.aborted) setError('No se pudieron consultar las existencias.');
        });
        return () => controller.abort();
    }, [revision, generation, retry]);
    const history = useMemo(() => data ? historicalPlanningCosts(data, today) : new Map(), [data, today]);
    const rows = useMemo(() => data && view?.value.enabled ? planningRows(data, view.value) : [], [data, view]);
    if (!data) return <p>La planificación de compras requiere conexión con PostgreSQL.</p>;
    const ready = view?.revision === revision && view?.generation === generation && view?.retry === retry;
    const currentDrafts = drafts.generation === generation ? drafts.lines : {};
    const visible = rows.filter(row => (!activity || (row.articleId != null ? activity === 'INSUMOS' : row.activity === activity)) &&
        row.name.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')) &&
        (showSelected ? currentDrafts[row.id]?.selected : row.articleId != null ?
            activity === 'INSUMOS' || Boolean(search.trim()) || Boolean(currentDrafts[row.id]?.selected) :
            !status || row.status === status || status === 'attention' && row.status !== 'sufficient' ||
            status === 'purchase' && (requiresInventoryPurchase(row.status) || row.status === 'atMinimum')));
    const makeLine = row => plannedPurchaseLine(row, currentDrafts[row.id] ?? emptyDraft, data.procurement, history, today);
    const tableRows = visible.map(row => ({row, draft: currentDrafts[row.id] ?? emptyDraft,
        line: makeLine(row), update: change => update(row.id, change)}));
    const selected = rows.filter(row => currentDrafts[row.id]?.selected).map(row => ({row, line: makeLine(row)}));
    const {amounts, bySource, missingCosts, missingAmounts, missingQuantities, supplierGroups, message} = purchasePlanSummary(selected);
    function update(id, change) {
        setCopyStatus('');
        setDrafts(previous => {
            const lines = previous.generation === generation ? previous.lines : {};
            return {generation, lines: {...lines, [id]: {...lines[id], ...change}}};
        });
    }

    return <section className="purchase-plan container-fluid py-3">
        <header className="purchase-plan-heading">
            <div><h2>Planificación de compras</h2>
                <p className="text-muted">Las selecciones se pierden al salir. Confirma disponibilidad y condiciones con el proveedor.</p></div>
            {ready && view.value.enabled && <div className="purchase-plan-actions">
                <button className="btn btn-outline-primary" disabled={!message} aria-expanded={showList} aria-controls="purchase-plan-list"
                    onClick={() => setShowList(value => !value)}>{showList && message ? 'Ocultar lista' : 'Ver lista planeada'}</button>
                {message ? <a className="btn btn-primary" href={'https://wa.me/?text=' + encodeURIComponent(message)} target="_blank" rel="noopener noreferrer">Compartir por WhatsApp</a> :
                    <button type="button" className="btn btn-primary" disabled>Compartir por WhatsApp</button>}
            </div>}
        </header>
        {error && !ready ? <p role="alert">{error} <button className="btn btn-outline-primary btn-sm"
            onClick={() => {setError('');setRetry(n => n + 1);}}>Reintentar</button></p> :
            !ready ? <p role="status">Consultando existencias…</p> : !view.value.enabled ? <p>Inventario pendiente de activación.</p> : <>
            <div className="purchase-plan-summary data-table-paper mb-3" aria-label="Presupuesto estimado">
                <div><span>Seleccionados</span><strong>{selected.length}</strong></div>
                <div><span>Limpieza</span><strong>{money(amounts.LIMPIEZA / 100)}</strong></div>
                <div><span>Jarcería</span><strong>{money(amounts.JARCERIA / 100)}</strong></div>
                <div className="purchase-plan-total"><span>Total presupuestado</span><strong>{selected.length > 0 && missingAmounts === selected.length ?
                    'Por determinar' : money((amounts.LIMPIEZA + amounts.JARCERIA) / 100)}</strong></div>
                <p className="purchase-plan-breakdown">Compras y cotizaciones <strong>{money(bySource.known / 100)}</strong>
                    {' · '}Desde precios de venta <strong>{money(bySource.sale / 100)}</strong>
                    {' · '}Estimaciones manuales <strong>{money(bySource.manual / 100)}</strong></p>
                {missingAmounts > 0 && <p role="status"><strong>Presupuesto parcial · {missingAmounts} sin importe</strong>{missingCosts > 0 && ' · ' + missingCosts + ' sin estimación unitaria'}{missingQuantities > 0 && ' · ' + missingQuantities + ' sin cantidad válida'}</p>}
                {selected.some(({line}) => line.source === sources.sale) && <p className="purchase-plan-breakdown">El precio de venta puede ser menor o mayor que el costo actual de reposición.</p>}
            </div>
            {supplierGroups.length > 0 && <details className="purchase-plan-help">
                <summary>Subtotales estimados por proveedor</summary>
                <ul>{supplierGroups.map((group, index) => <li key={index}>{group.name} · {group.subtotal}</li>)}</ul>
            </details>}
            {showList && message && <div className="purchase-plan-list data-table-paper p-3 mb-3" id="purchase-plan-list">
                <textarea className="form-control" rows={5} readOnly value={message} aria-label="Lista planeada por proveedor"/>
                <button className="btn btn-outline-primary mt-2" onClick={async () => {
                    try {await navigator.clipboard.writeText(message);setCopyStatus('Lista copiada.');}
                    catch {setCopyStatus('Selecciona el texto de la lista para copiarlo.');}
                }}>Copiar lista</button> <span role="status">{copyStatus}</span>
            </div>}
            <div className="inventory-filters purchase-plan-filters" role="group" aria-label="Filtros de planificación">
                <label>Producto<input type="search" className="form-control" placeholder="Buscar producto…" value={search} onChange={e => setSearch(e.target.value)}/></label>
                <label>Rubro<select className="form-select" value={activity} onChange={e => {
                    setActivity(e.target.value);
                    if (e.target.value === 'LIMPIEZA' && status === 'atMinimum') setStatus('low');
                }}>
                    <option value="">Todos</option><option value="LIMPIEZA">Limpieza terminada</option><option value="JARCERIA">Jarcería</option><option value="INSUMOS">Bases e insumos</option>
                </select></label>
                <label>Estado<select className="form-select" value={status} disabled={showSelected || activity === 'INSUMOS'} onChange={e => setStatus(e.target.value)}>
                    <option value="attention">Requieren atención</option><option value="purchase">Requieren compra</option><option value="">Todos</option>
                    {Object.entries(statuses).filter(([key]) => key !== 'input' && (activity !== 'LIMPIEZA' || key !== 'atMinimum'))
                        .map(([key,label]) => <option key={key} value={key}>{activity === 'JARCERIA' ? label : cleaningInventoryLabels[key] ?? label}</option>)}
                </select></label>
                <label className="purchase-plan-selection"><input type="checkbox" className="form-check-input" checked={showSelected} onChange={e => setShowSelected(e.target.checked)}/> Solo seleccionados</label>
            </div>
            <details className="purchase-plan-help"><summary>Cómo se sugieren las cantidades</summary>
                <p className="form-text" id="purchase-plan-suggestion">La cantidad provisional cubre hasta el mínimo o propone una unidad de compra al alcanzarlo. En limpieza, la sugerencia se limita habitualmente a 20 L. Puedes editarla.</p></details>
            <div className="purchase-plan-table">
                <DataTable columns={columns} data={tableRows} enableGlobalFilter={false} enableColumnFilters
                    getRowId={getPlanRowId} getRowClassName={getPlanRowClass}
                    emptyMessage="Sin productos para los filtros aplicados."/>
            </div>
        </>}
    </section>;
}
