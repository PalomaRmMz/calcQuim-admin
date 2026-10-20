import { getProductChoiceLabel } from "../utils/catalogUtils.js";
import { categoryStyle } from '../utils/categoryColors.js';
import { faClockRotateLeft } from '@fortawesome/free-solid-svg-icons';
import { useState } from "react";
import ClassificationBadge from "../components/ClassificationBadge";
import { compareClassifiedProducts, getClassification, matchesClassification, classificationLines } from "../utils/classificationUtils.js";
import { useProcurement } from "../context/ProcurementContext.js";
import { useCatalog } from "../context/CatalogHooks.js";
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
import { isSupplyComparable } from "../utils/purchaseAnalytics.js";

const costText = (observation) => !observation ? "Sin dato" : observation.cost === null ? observation.reason : `${unitCostText(observation.cost)} / ${unitLabel(observation.outputUnit)} final`;
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
    const selected = analytics.rows.find(row => row.id === selectedId);
    const [quantity, setQuantity] = useState(40);
    const [referenceId, setReferenceId] = useState("");
    const rows = analytics.rows.filter((r) => (!productId || String(r.productId) === productId) && (!supplierId || r.supplierId === supplierId) && matchesClassification(analytics.productMap.get(r.productId), categoryId, lineId) && (!type || r.display.snapshot.sourcingType === type) && (!age || r.display.age.label === age) && (!status || (status === "active") === r.display.active))
        .sort((a, b) => compareClassifiedProducts(analytics.productMap.get(a.productId) || { id: a.productId, name: a.display.productName }, analytics.productMap.get(b.productId) || { id: b.productId, name: b.display.productName }, categories, productLines) || (a.effectiveUnitCost ?? Number.MAX_VALUE) - (b.effectiveUnitCost ?? Number.MAX_VALUE));
    const product = products.find((p) => String(p.id) === productId);
    const comparable = rows.filter((r) => isSupplyComparable(r.reference)).sort((a, b) => a.effectiveUnitCost - b.effectiveUnitCost);
    const best = product ? comparable[0]?.reference : null;
    const summary = product ? analytics.byProduct.get(product.id) : null;
    const reference = referenceId ? rows.find((r) => r.id === referenceId)?.reference : summary?.lastPurchase;
    const savings = potentialSavings(reference?.cost, best?.cost, quantity);
    const margin = grossMargin(product ? getProductPrice(product) : null, best?.cost);
    const columns = [
        { id: "category", header: "Categoría", accessorFn: r => getClassification(analytics.productMap.get(r.productId), categories, productLines).categoryName },
        { id: "line", header: "Línea / clasificación", accessorFn: r => getClassification(analytics.productMap.get(r.productId), categories, productLines).label, Cell: ({ row }) => <ClassificationBadge product={analytics.productMap.get(row.original.productId)} categories={categories} productLines={productLines} /> },
        { id: "product", header: "Producto final", accessorFn: (r) => r.display.productName, Cell: ({ cell, row }) => <span className="category-accent" style={categoryStyle(categories.find(c => c.id === analytics.productMap.get(row.original.productId)?.categoryId))}>{cell.getValue()}</span> },
        { id: "supplier", header: "Proveedor", accessorFn: (r) => r.display.supplierName },
        { id: "supply", header: "Artículo comprado", accessorFn: (r) => r.display.snapshot.name },
        { id: "type", header: "Modalidad", accessorFn: (r) => SOURCING_TYPES[r.display.snapshot.sourcingType], Cell: ({ cell }) => <TableBadge>{cell.getValue()}</TableBadge> },
        { id: "presentation", header: "Presentación", accessorFn: (r) => supplyPresentation(r.display.snapshot) },
        { id: "price", header: "Costo de compra / informado", accessorFn: (r) => Number.isFinite(r.display.price) ? `${unitCostText(r.display.price)} / ${r.display.priceQuantity} ${unitLabel(r.display.priceUnit)}` : "Sin costo registrado" },
        { id: "yield", header: "Rendimiento", accessorFn: (r) => supplyOutcomeText(r.display.snapshot) },
        { id: "effective", header: "Costo efectivo final", accessorFn: (r) => r.effectiveCost, size: 240, Cell: ({ row }) => <><strong className="table-money">{row.original.comparable ? costText(row.original.reference) : "Sin costo comparable"}</strong>{!row.original.comparable && <small className="d-block text-muted">{!row.original.hasPrice ? "Sin costo registrado" : row.original.reference?.reason || row.original.display.reason || "Revisa rendimiento, vigencia y estado"}</small>}{row.original.comparable && analytics.byProduct.get(row.original.productId)?.best === row.original.reference && <small className="d-block best-cost-label">★ Mejor costo conocido</small>}<small className="d-block text-muted">{row.original.display.source || "Sin origen del costo"} · {row.original.display.date || "Sin fecha"} · {row.original.display.age.label}{row.original.display.expired ? " · Vencida" : ""}{!row.original.display.active ? " · Inactivo" : ""}</small></> },
        { id: "source", header: "Origen del costo", accessorFn: (r) => r.display.source || "Sin origen del costo", Cell: ({ cell }) => <span>{cell.getValue()}</span> },
        { id: "date", header: "Fecha del dato", accessorFn: (r) => r.display.date || "—" },
        { accessorKey: "purchaseCount", header: "Compras registradas" },
        { id: "age", header: "Antigüedad", accessorFn: (r) => r.display.age.label, Cell: ({ row }) => <TableBadge variant={row.original.display.age.variant}>{row.original.display.age.label}{row.original.display.expired ? " · Vencida" : ""}{!row.original.display.active ? " · Inactivo" : ""}</TableBadge> },
        { id: "paid", header: "Último costo pagado", accessorFn: (r) => r.lastPurchase ? `${unitCostText(r.lastPurchase.price / r.lastPurchase.priceQuantity)} / ${unitLabel(r.lastPurchase.priceUnit)} · ${r.lastPurchase.date}` : "Sin compras" },
        { id: "quote", header: "Último costo informado", accessorFn: (r) => r.lastQuote ? `${unitCostText(r.lastQuote.price)} / ${r.lastQuote.priceQuantity} ${unitLabel(r.lastQuote.priceUnit)} · ${r.lastQuote.date}${r.lastQuote.expired ? " · Vencido" : ""}` : "Sin costos informados" },
        { id: "actions", header: "Historial", enableSorting: false, Cell: ({ row }) => <TableActions label={row.original.display.snapshot.name} viewIcon={faClockRotateLeft} viewLabel="Historial de" onView={() => setSelected(row.original.id)} /> },
    ];
    return <><ContentPanel title="Comparador de abastecimiento" subtitle="Compara el costo por unidad terminada del mismo producto, con origen del costo y fecha visibles.">
        <FilterBar onClear={() => { setProductId(""); setSupplierId(""); setCategoryId(""); setLineId(""); setType(""); setAge(""); setStatus("active"); setReferenceId(""); }}>
            <Field label="Producto final" value={productId} onChange={(e) => { setProductId(e.target.value); setReferenceId(""); }}><option value="">Todos los productos</option>{products.filter(p => matchesClassification(p, categoryId, lineId)).map((p) => <option key={p.id} value={p.id}>{getProductChoiceLabel(p, products, categories, productLines)}</option>)}</Field>
            <Field label="Proveedor" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">Todos</option>{data.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Field>
        </FilterBar>
        <details className="filter-details"><summary>Más filtros{[categoryId, lineId, type, age, status !== "active"].filter(Boolean).length > 0 ? " · Hay filtros adicionales aplicados" : ""}</summary><div className="filter-bar mt-3">
            <Field label="Categoría" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setLineId(""); setProductId(""); setReferenceId(""); }}><option value="">Todas</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Field>
            <Field label="Línea" value={lineId} onChange={e => { setLineId(e.target.value); setProductId(""); setReferenceId(""); }}><option value="">Todas</option>{classificationLines(productLines, categoryId).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</Field>
            <Field label="Modalidad" value={type} onChange={(e) => setType(e.target.value)}><option value="">Todas</option>{Object.entries(SOURCING_TYPES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Field>
            <Field label="Antigüedad" value={age} onChange={(e) => setAge(e.target.value)}><option value="">Todas</option>{["Reciente", "Atención", "Antiguo"].map((a) => <option key={a}>{a}</option>)}</Field>
            <Field label="Estado" value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Activos</option><option value="inactive">Inactivos</option><option value="">Todos</option></Field>
        </div></details>
        {product && <section className="comparison-summary mb-3"><div><span>Mejor costo conocido · filtros actuales</span><strong>{best ? costText(best) : "Sin costo comparable"}</strong><p>{best && `${best.supplierName} · ${SOURCING_TYPES[best.snapshot.sourcingType]} · ${best.source} · ${best.date} · ${best.age.label}`}</p></div><div><span>Margen bruto estimado</span><strong>{margin ? `${margin.percent.toFixed(1)}%` : "Pendiente"}</strong><p>{margin ? `${money(margin.profit)} de ganancia por ${unitLabel(product.unit)}` : "Requiere precio de venta positivo y costo efectivo."}</p></div>
        <div><Field label="Comparar ahorro contra" value={referenceId} onChange={(e) => setReferenceId(e.target.value)}><option value="">Última compra real del producto</option>{rows.filter((r) => r.reference?.cost != null).map((r) => <option key={r.id} value={r.id}>{r.display.supplierName} · {r.display.snapshot.name}</option>)}</Field><Field label={`Cantidad final deseada (${unitLabel(product.unit)})`} type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} /><p>{savings ? `Ahorro potencial: ${unitCostText(savings.unit)} / ${unitLabel(product.unit)} · ${money(savings.total)} en total.` : "Ahorro pendiente: falta un costo de referencia comparable."}</p></div></section>}
        <p className="form-text">Referencia: compra real o último costo informado no vencido, la de fecha más reciente; en empate se prefiere la compra. Un dato antiguo conserva su advertencia. El margen y el ahorro estiman solo el insumo: aún no incluyen envase, agua, preparación ni flete.</p>
        {!rows.length && <EmptyState title="Sin alternativas para mostrar">Crea una alternativa en Abastecimiento o ajusta los filtros. No necesitas registrar precios ni compras.</EmptyState>}
        <DataTable columns={columns} data={rows} columnOrder={['product', 'effective', 'supplier', 'supply', 'actions', 'type', 'source', 'date', 'age', 'line', 'category', 'presentation', 'price', 'yield', 'purchaseCount', 'paid', 'quote']} columnVisibility={{ line: false, category: false, presentation: false, price: false, yield: false, purchaseCount: false, paid: false, quote: false, type: false, source: false, date: false, age: false }} searchPlaceholder="Buscar producto, proveedor o alternativa..." />
    </ContentPanel>{selected && <CostHistoryModal title={`Historial · ${selected.display.snapshot.name}`} observations={selected.history} onClose={() => setSelected(null)} />}</>;
}
