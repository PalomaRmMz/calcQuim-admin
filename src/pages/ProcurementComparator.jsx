import { getProductChoiceLabels } from "../utils/catalogUtils.js";
import { categoryStyle } from '../utils/categoryColors.js';
import { faClockRotateLeft } from '@fortawesome/free-solid-svg-icons';
import { memo, useCallback, useMemo, useState } from "react";
import ClassificationBadge from "../components/ClassificationBadge";
import { getClassification, matchesClassification, classificationLines } from "../utils/classificationUtils.js";
import { useProcurement } from "../context/ProcurementContext.js";
import { useCatalog } from "../context/CatalogHooks.js";
import { ComparatorExpandedPanel, ComparatorMobileDetails } from "../components/ComparatorAlternatives";
import ContentPanel from "../components/ContentPanel";
import DataTable from "../components/DataTable";
import TableActions from "../components/TableActions";
import TableBadge from "../components/TableBadge";
import CostHistoryModal from "../components/CostHistoryModal";
import EmptyState from "../components/EmptyState";
import FilterBar from "../components/FilterBar";
import { Field } from "../components/ProcurementFields";
import { SOURCING_TYPES, supplyPresentation, supplyOutcomeText, grossMargin, potentialSavings } from "../utils/procurementUtils.js";
import { unitCostText } from "../utils/purchaseUtils.js";
import { unitLabel } from "../utils/units.js";
import { money } from "../utils/salesUtils.js";
import { comparableCost, comparatorGroups } from "../utils/comparatorGroups.js";
import "../styles/components/ProcurementComparator.css";

const costText = (observation) => !observation ? "Sin dato" : observation.cost === null ? observation.reason : `${unitCostText(observation.cost)} / ${unitLabel(observation.outputUnit)} final`;
const ComparatorTable = memo(DataTable);
const groupVisibility = { details: false };
const mobileColumns = ['product', 'effective', 'supplier', 'source', 'count', 'details'];
const getGroupRowId = group => `${typeof group.id}:${group.id}`;
const emptyCandidates = [];

export default function ProcurementComparator() {
    const { data, analytics } = useProcurement();
    const { products, categories, productLines, getProductPrice } = useCatalog();
    const [productId, setProductId] = useState("");
    const [supplierId, setSupplierId] = useState("");
    const [categoryId, setCategoryId] = useState("");
    const [lineId, setLineId] = useState("");
    const [type, setType] = useState("");
    const [age, setAge] = useState("");
    const [status, setStatus] = useState("active");
    const [selectedId, setSelected] = useState(null);
    const rowById = useMemo(() => new Map(analytics.rows.map(row => [row.id, row])), [analytics.rows]);
    const selected = rowById.get(selectedId);
    const [quantity, setQuantity] = useState(40);
    const [referenceId, setReferenceId] = useState("");
    const [search, setSearch] = useState("");
    const groups = useMemo(() => comparatorGroups({ rows: analytics.rows, products, categories, productLines, filters: { productId, supplierId, categoryId, lineId, type, age, status, search } }), [analytics.rows, products, categories, productLines, productId, supplierId, categoryId, lineId, type, age, status, search]);
    const { rowCount, comparableById, bestRowIds } = useMemo(() => ({
        rowCount: groups.reduce((count, group) => count + group.alternatives.length, 0),
        comparableById: new Map(groups.flatMap(group => group.comparable.map(candidate => [candidate.row.id, candidate]))),
        bestRowIds: new Set(groups.flatMap(group => group.best ? [group.best.row.id] : [])),
    }), [groups]);
    const choiceLabels = useMemo(() => getProductChoiceLabels(products, categories, productLines), [products, categories, productLines]);
    const productOptions = useMemo(() => products.filter(p => matchesClassification(p, categoryId, lineId)).map(p => <option key={p.id} value={p.id}>{choiceLabels.get(p.id)}</option>), [products, categoryId, lineId, choiceLabels]);
    const product = products.find(p => String(p.id) === productId);
    const group = groups.find(g => g.productId === product?.id);
    const best = group?.best?.reference;
    const candidates = group?.comparable || emptyCandidates;
    const reference = referenceId ? candidates.find(c => c.row.id === referenceId)?.reference : candidates.map(c => c.row.lastPurchase).filter(r => comparableCost(r, product) !== null).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    const referenceCost = comparableCost(reference, product);
    const savings = referenceCost > 0 && best ? potentialSavings(referenceCost, best.cost, quantity) : null;
    const margin = grossMargin(product ? getProductPrice(product) : null, best?.cost);
    const alternativeColumns = useMemo(() => [
        { id: "category", header: "Categoría", accessorFn: r => getClassification(analytics.productMap.get(r.productId), categories, productLines).categoryName },
        { id: "line", header: "Línea / clasificación", accessorFn: r => getClassification(analytics.productMap.get(r.productId), categories, productLines).label, Cell: ({ row }) => <ClassificationBadge product={analytics.productMap.get(row.original.productId)} categories={categories} productLines={productLines} /> },
        { id: "product", header: "Producto final", accessorFn: (r) => r.display.productName, Cell: ({ cell, row }) => <span className="category-accent" style={categoryStyle(categories.find(c => c.id === analytics.productMap.get(row.original.productId)?.categoryId))}>{cell.getValue()}</span> },
        { id: "supplier", header: "Proveedor", accessorFn: (r) => r.display.supplierName },
        { id: "supply", header: "Artículo comprado", accessorFn: (r) => r.display.snapshot?.name },
        { id: "type", header: "Modalidad", accessorFn: (r) => SOURCING_TYPES[r.display.snapshot?.sourcingType], Cell: ({ cell }) => <TableBadge>{cell.getValue()}</TableBadge> },
        { id: "presentation", header: "Presentación", accessorFn: (r) => supplyPresentation(r.display.snapshot || {}) },
        { id: "price", header: "Costo de compra / informado", accessorFn: (r) => Number.isFinite(r.display.price) ? `${unitCostText(r.display.price)} / ${r.display.priceQuantity} ${unitLabel(r.display.priceUnit)}` : "Sin costo registrado" },
        { id: "yield", header: "Rendimiento", accessorFn: (r) => supplyOutcomeText(r.display.snapshot || {}) },
        { id: "effective", header: "Costo efectivo final", accessorFn: (r) => comparableById.get(r.id)?.cost ?? null, size: 240, Cell: ({ row }) => <><strong className="table-money">{comparableById.has(row.original.id) ? costText(comparableById.get(row.original.id)?.reference) : "Sin alternativa comparable confirmada"}</strong>{!comparableById.has(row.original.id) && <small className="d-block text-muted">{!row.original.hasPrice ? "Sin costo registrado" : row.original.reference?.reason || row.original.display.reason || "Revisa rendimiento, vigencia y estado"}</small>}{comparableById.has(row.original.id) && bestRowIds.has(row.original.id) && <small className="d-block best-cost-label">★ Mejor costo conocido</small>}<small className="d-block text-muted">{row.original.display.source || "Sin origen del costo"} · {row.original.display.date || "Sin fecha"} · {row.original.display.age?.label}{row.original.display.expired ? " · Vencida" : ""}{!row.original.display.active ? " · Inactivo" : ""}</small></> },
        { id: "source", header: "Origen del costo", accessorFn: (r) => r.display.source || "Sin origen del costo", Cell: ({ cell }) => <span>{cell.getValue()}</span> },
        { id: "date", header: "Fecha del dato", accessorFn: (r) => r.display.date || "—" },
        { accessorKey: "purchaseCount", header: "Compras registradas" },
        { id: "age", header: "Antigüedad", accessorFn: (r) => r.display.age?.label, Cell: ({ row }) => <TableBadge variant={row.original.display.age?.variant}>{row.original.display.age?.label}{row.original.display.expired ? " · Vencida" : ""}{!row.original.display.active ? " · Inactivo" : ""}</TableBadge> },
        { id: "paid", header: "Último costo pagado", accessorFn: (r) => r.lastPurchase ? `${unitCostText(r.lastPurchase.price / r.lastPurchase.priceQuantity)} / ${unitLabel(r.lastPurchase.priceUnit)} · ${r.lastPurchase.date}` : "Sin compras" },
        { id: "quote", header: "Último costo informado", accessorFn: (r) => r.lastQuote ? `${unitCostText(r.lastQuote.price)} / ${r.lastQuote.priceQuantity} ${unitLabel(r.lastQuote.priceUnit)} · ${r.lastQuote.date}${r.lastQuote.expired ? " · Vencido" : ""}` : "Sin costos informados" },
        { id: "actions", header: "Historial", enableSorting: false, Cell: ({ row }) => <TableActions label={row.original.display.snapshot?.name} viewIcon={faClockRotateLeft} viewLabel="Historial de" onView={() => setSelected(row.original.id)} /> },
    ], [analytics.productMap, categories, productLines, comparableById, bestRowIds]);
    const renderDetailPanel = useCallback(({ row }) => <ComparatorExpandedPanel expanded={row.getIsExpanded()} group={row.original} columns={alternativeColumns} />, [alternativeColumns]);
    const columns = useMemo(() => [
        { id: 'product', header: 'Producto', accessorFn: g => g.name, Cell: ({ row }) => <><strong className="d-block">{row.original.name}</strong><ClassificationBadge product={row.original.product} categories={categories} productLines={productLines} /></> },
        { id: 'effective', header: 'Mejor costo comparable', accessorFn: g => g.best?.cost ?? null, Cell: ({ row }) => <strong className="table-money">{row.original.best ? costText(row.original.best.reference) : 'Sin alternativa comparable confirmada'}</strong> },
        { id: 'supplier', header: 'Proveedor recomendado', accessorFn: g => g.best?.reference.supplierName || 'Pendiente' },
        { id: 'source', header: 'Referencia', accessorFn: g => g.best?.reference.source || 'Sin referencia comparable' },
        { id: 'count', header: 'Alternativas comparables', accessorFn: g => g.comparable.length, Cell: ({ row }) => <>{row.original.comparable.length}{row.original.related.length > 0 && <small className="d-block text-muted">{row.original.related.length} relacionadas o pendientes</small>}</> },
        { id: 'details', header: 'Detalles', enableSorting: false, Cell: ({ row }) => <ComparatorMobileDetails key={row.original.id} group={row.original} columns={alternativeColumns} /> },
    ], [categories, productLines, alternativeColumns]);
    return <><ContentPanel title="Comparador de abastecimiento" subtitle="Una fila por producto. Compara costos confirmados y despliega alternativas e historial.">
        <FilterBar onClear={() => { setProductId(""); setSupplierId(""); setCategoryId(""); setLineId(""); setType(""); setAge(""); setStatus("active"); setReferenceId(""); setSearch(""); }}>
            <Field label="Producto final" value={productId} onChange={(e) => { setProductId(e.target.value); setReferenceId(""); setSearch(""); }}><option value="">Todos los productos</option>{productOptions}</Field>
            <Field label="Proveedor" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">Todos</option>{data.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Field>
        </FilterBar>
        <details className="filter-details"><summary>Más filtros{[categoryId, lineId, type, age, status !== "active"].filter(Boolean).length > 0 ? " · Hay filtros adicionales aplicados" : ""}</summary><div className="filter-bar mt-3">
            <Field label="Categoría" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setLineId(""); setProductId(""); setReferenceId(""); setSearch(""); }}><option value="">Todas</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Field>
            <Field label="Línea" value={lineId} onChange={e => { setLineId(e.target.value); setProductId(""); setReferenceId(""); setSearch(""); }}><option value="">Todas</option>{classificationLines(productLines, categoryId).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</Field>
            <Field label="Modalidad" value={type} onChange={(e) => setType(e.target.value)}><option value="">Todas</option>{Object.entries(SOURCING_TYPES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Field>
            <Field label="Antigüedad" value={age} onChange={(e) => setAge(e.target.value)}><option value="">Todas</option>{["Reciente", "Atención", "Antiguo"].map((a) => <option key={a}>{a}</option>)}</Field>
            <Field label="Estado" value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Activos</option><option value="inactive">Inactivos</option><option value="">Todos</option></Field>
        </div></details>
        {product && <section className="comparison-summary mb-3"><div><span>Mejor costo conocido · filtros actuales</span><strong>{best ? costText(best) : "Sin alternativa comparable confirmada"}</strong><p>{best && `${best.supplierName} · ${SOURCING_TYPES[best.snapshot.sourcingType]} · ${best.source} · ${best.date} · ${best.age.label}`}</p></div><div><span>Margen bruto estimado</span><strong>{margin ? `${margin.percent.toFixed(1)}%` : "Pendiente"}</strong><p>{margin ? `${money(margin.profit)} de ganancia por ${unitLabel(product.unit)}` : "Requiere precio de venta positivo y costo efectivo."}</p></div>
        <div><Field label="Comparar ahorro contra" value={referenceId} onChange={(e) => setReferenceId(e.target.value)}><option value="">Última compra real comparable (filtros actuales)</option>{candidates.map(c => c.row).map((r) => <option key={r.id} value={r.id}>{r.display.supplierName} · {r.display.snapshot?.name}</option>)}</Field><Field label={`Cantidad final deseada (${unitLabel(product.unit)})`} type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} /><p>{savings && <span className="d-block">Referencia: {reference.supplierName} · {reference.date} · {unitCostText(referenceCost)} / {unitLabel(product.unit)}</span>}{savings ? `Ahorro potencial: ${unitCostText(savings.unit)} / ${unitLabel(product.unit)} · ${money(savings.total)} en total.` : "Ahorro pendiente: falta un costo de referencia comparable."}</p></div></section>}
        <p className="form-text">Referencia: compra real o último costo informado no vencido, la de fecha más reciente; en empate se prefiere la compra. Un dato antiguo conserva su advertencia. El margen y el ahorro estiman solo el insumo: aún no incluyen envase, agua, preparación ni flete.</p>
        {!rowCount && <EmptyState title="Sin alternativas para mostrar">Crea una alternativa en Abastecimiento o ajusta los filtros. No necesitas registrar precios ni compras.</EmptyState>}
        <label className="form-label" htmlFor="comparator-search">Buscar producto, proveedor o alternativa</label>
        <input id="comparator-search" className="form-control mb-3" type="search" value={search} onChange={e => setSearch(e.target.value)} />
        <p className="form-text" role="status">{groups.length} {groups.length === 1 ? "producto" : "productos"} · {rowCount} {rowCount === 1 ? "alternativa visible" : "alternativas visibles"}. Los filtros y la búsqueda se aplican antes de elegir el mejor costo; el historial conserva sus registros originales.</p>
        <ComparatorTable columns={columns} data={groups} getRowId={getGroupRowId} renderDetailPanel={renderDetailPanel} columnVisibility={groupVisibility} enableGlobalFilter={false} mobileCards mobilePrimaryColumns={mobileColumns} />
    </ContentPanel>{selected && <CostHistoryModal title={`Historial · ${selected.display.snapshot.name}`} observations={selected.history} onClose={() => setSelected(null)} />}</>;
}
