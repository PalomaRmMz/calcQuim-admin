import { useState } from "react";
import { BATCH_OPERATIONS, CHANGE_SUPPLIER_WARNING, switchBatchSelection, operationChanges } from "../utils/batchSupplyOperations.js";
import { useCatalog } from "../context/CatalogHooks.js";
import { useProcurement } from "../context/ProcurementContext.js";
import { prepareSupplyBatch } from "../services/procurementBatch.js";
import { compareClassifiedProducts, matchesClassification, classificationLines } from "../utils/classificationUtils.js";
import { getProductDisplayName, normalizeText } from "../utils/catalogUtils.js";
import { SOURCING_TYPES, supplyOutcomeText, supplyPresentation } from "../utils/procurementUtils.js";
import { localDate } from "../utils/salesUtils.js";
import { unitCostText } from "../utils/purchaseUtils.js";
import { unitLabel } from "../utils/units.js";
import AppModal from "./AppModal";
import DataTable from "./DataTable";
import Feedback from "./Feedback";
import FilterBar from "./FilterBar";
import ClassificationBadge from "./ClassificationBadge";
import SupplierCostFields from "./SupplierCostFields";
import SupplyYieldFields from "./SupplyYieldFields";
import { Field, UnitField, NotesField } from "./ProcurementFields";
import "../styles/components/BatchEditProductsModal.css";

const newCost = unit => ({ price: "", priceQuantity: 1, priceUnit: unit || "litro", quotedAt: localDate(), notes: "" });
const newYield = (unit, outputUnit) => ({ inputQuantity: "", inputUnit: unit || "litro", outputQuantity: "", outputUnit: outputUnit || "litro" });

export default function BatchSupplyModal({ mode: initialMode = "create", initialCategoryId = "", initialLineId = "", onClose, onSaved }) {
    const { products: rawProducts, categories, productLines } = useCatalog();
    const products = rawProducts.map(p => ({ ...p, displayName: getProductDisplayName(p, categories, productLines) }));
    const { data, saveSupplyBatch } = useProcurement();
    const [operation, setOperation] = useState(initialMode);
    const creating = ["create", "alternatives"].includes(operation);
    const editing = operation === "edit";
    const changingSupplier = operation === "changeSupplier";
    const mode = creating ? "create" : "edit";
    const fullCreate = operation === "alternatives";
    const [articleMode, setArticleMode] = useState("shared");
    const [articles, setArticles] = useState({});
    const [presentationMode, setPresentationMode] = useState("shared");
    const [presentations, setPresentations] = useState({});
    const [selectionNotice, setSelectionNotice] = useState("");
    const [ids, setIds] = useState([]);
    const [search, setSearch] = useState("");
    const [categoryId, setCategoryId] = useState(initialCategoryId);
    const [lineId, setLineId] = useState(initialLineId);
    const [supplierFilter, setSupplierFilter] = useState("");
    const [typeFilter, setTypeFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [enabled, setEnabled] = useState({});
    const [values, setValues] = useState({ supplierId: "", sourcingType: "READY_TO_USE", purchaseUnit: "litro", presentation: "", active: true, notes: "" });
    const [yieldMode, setYieldMode] = useState("pending");
    const [sharedYield, setSharedYield] = useState(newYield());
    const [yields, setYields] = useState({});
    const [costMode, setCostMode] = useState(initialMode === "costs" ? "shared" : "none");
    const [sharedCost, setSharedCost] = useState(newCost());
    const [costs, setCosts] = useState({});
    const [review, setReview] = useState(null);
    const [error, setError] = useState("");
    const productMap = new Map(products.map(p => [p.id, p]));
    const supplierName = id => data.suppliers.find(s => s.id === id)?.name || "Sin proveedor";
    const entries = (creating ? products.map(product => ({ id: product.id, name: product.displayName, product, active: product.active })) : data.supplyItems.map(s => ({ ...s, product: productMap.get(s.outputProductId) })))
        .sort((a, b) => compareClassifiedProducts(a.product, b.product, categories, productLines) || a.name.localeCompare(b.name, "es") || supplierName(a.supplierId).localeCompare(supplierName(b.supplierId), "es"));
    const visible = entries.filter(e => matchesClassification(e.product, categoryId, lineId)
        && normalizeText(`${e.name} ${e.product?.displayName || ""} ${supplierName(e.supplierId)}`).includes(normalizeText(search))
        && (!supplierFilter || String(e.supplierId) === supplierFilter) && (!typeFilter || e.sourcingType === typeFilter)
        && (!statusFilter || String(e.active) === statusFilter));
    const selected = entries.filter(e => ids.includes(e.id));
    const changes = operationChanges(operation, values, enabled);
    if (fullCreate && articleMode === "individual") delete changes.name;
    if (fullCreate && presentationMode === "individual") { delete changes.purchaseQuantity; delete changes.purchaseUnit; delete changes.presentation; }
    const appliesYield = creating || (editing && (enabled.yield || enabled.sourcingType));
    const targetType = e => changes.sourcingType || e.sourcingType;
    const transforming = selected.filter(e => targetType(e) !== "READY_TO_USE");
    const readyOnly = creating ? values.sourcingType === "READY_TO_USE" : selected.length > 0 && !transforming.length;
    const change = key => event => setValues({ ...values, [key]: key === "supplierId" ? data.suppliers.find(s => String(s.id) === event.target.value)?.id ?? "" : event.target.value });
    function changeOperation(event) {
        const next = event.target.value;
        setIds(switchBatchSelection(ids, operation, next, data.supplyItems, products));
        setSelectionNotice(creating && !["create", "alternatives"].includes(next) ? "Selecciona las alternativas concretas que deseas modificar." : !creating && ["create", "alternatives"].includes(next) ? "Se seleccionaron los productos vinculados. Sus alternativas actuales se conservan; las alternativas sin producto vinculado no se incluyen." : "");
        setOperation(next);
        setArticles({}); setPresentations({}); setArticleMode("shared"); setPresentationMode("shared");
        setEnabled({});
        setValues({ supplierId: "", sourcingType: "READY_TO_USE", purchaseUnit: "litro", presentation: "", active: true, notes: "" });
        setYieldMode("pending"); setSharedYield(newYield()); setYields({});
        setCostMode(next === "costs" ? "shared" : "none"); setSharedCost(newCost()); setCosts({});
        setSupplierFilter(""); setTypeFilter(""); setSearch(""); setStatusFilter("");
        setError(""); setReview(null);
    }
    function field(key, label, control) {
        return <section className="border rounded p-3 mb-3" key={key}>
            {editing && <label className="form-check mb-2"><input type="checkbox" className="form-check-input" checked={Boolean(enabled[key])} onChange={e => setEnabled({ ...enabled, [key]: e.target.checked })} />Cambiar {label}</label>}
            {(creating || changingSupplier || enabled[key]) && control}
        </section>;
    }
    function inspect(event) {
        event.preventDefault();
        setError("");
        const request = { mode, ids, changes: fullCreate && articleMode === "shared" ? { ...changes, name: values.name || "" } : changes, requirePresentation: fullCreate, costPerPresentation: fullCreate,
            articles: fullCreate && articleMode === "individual" ? Object.fromEntries(ids.map(id => [id, articles[id] || ""])) : {},
            presentations: fullCreate && presentationMode === "individual" ? Object.fromEntries(ids.map(id => [id, presentations[id] || { purchaseQuantity: null }])) : {}, yieldMode: appliesYield ? yieldMode : "keep", sharedYield, yields, costMode, sharedCost, costs };
        const result = prepareSupplyBatch(data, products, request);
        setReview({ request, result });
    }
    function save(event) {
        event.preventDefault();
        const result = saveSupplyBatch(review.request);
        if (!result.ok) setError(result.message);
        else { onSaved(result.message); onClose(); }
    }
    const title = `${BATCH_OPERATIONS[operation]} por lote`;
    if (review) {
        const result = review.result;
        const columns = [
            { accessorKey: "name", header: "Producto / alternativa" },
            { id: "article", header: "Artículo comprado", accessorFn: r => r.supply?.name || "—" },
            ...(changingSupplier ? [{ id: "previousSupplier", header: "Proveedor anterior", accessorFn: r => supplierName(data.supplyItems.find(s => s.id === r.id)?.supplierId) }] : []),
            { id: "supplier", header: "Proveedor", accessorFn: r => supplierName(r.supply?.supplierId) },
            { accessorKey: "status", header: "Resultado previsto" },
            { id: "type", header: "Modalidad", accessorFn: r => SOURCING_TYPES[r.supply?.sourcingType] || "—" },
            { id: "presentation", header: "Presentación", accessorFn: r => r.supply ? supplyPresentation(r.supply) : "—" },
            { id: "unit", header: "Unidad de compra", accessorFn: r => unitLabel(r.supply?.purchaseUnit) },
            { id: "active", header: "Estado", accessorFn: r => r.supply ? r.supply.active ? "Activo" : "Inactivo" : "—" },
            { id: "yield", header: "Rendimiento", accessorFn: r => r.supply ? supplyOutcomeText(r.supply) : "—" },
            { id: "cost", header: "Nuevo costo", accessorFn: r => r.cost ? `${unitCostText(r.cost.price)} / ${r.cost.priceQuantity} ${unitLabel(r.cost.priceUnit)} · ${r.cost.quotedAt}` : "No se agrega costo" },
            { id: "notes", header: "Notas", accessorFn: r => r.supply?.notes || "—" },
        ];
        return <AppModal title={`Revisar · ${title}`} onClose={onClose} onSubmit={save} maxWidth="lg" actions={<>
            <button type="button" className="btn btn-light" onClick={() => { setReview(null); setError(""); }}>Volver a editar</button>
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={!result.ok || !(result.created + result.updated)}>{fullCreate ? "Crear alternativas" : "Guardar lote"}</button>
        </>}>
            {changingSupplier && <Feedback variant="warning" message={CHANGE_SUPPLIER_WARNING} />}
            <p><strong>{creating ? "Productos seleccionados" : "Alternativas seleccionadas"}: {result.selected}</strong> · Nuevas alternativas: {result.created} · Por actualizar: {result.updated} · {creating ? "Ya existentes" : "Sin cambios"}: {result.skipped} · Conflictos: {result.conflicts}</p>
            <p>{result.costCount} con nuevo costo · {result.created + result.updated - result.costCount} sin nuevo costo. Los existentes se omiten al agregar.</p>
            <p className="form-text">Se aplicará el lote completo al guardar. Las compras y los costos anteriores se conservan.</p>
            <Feedback message={result.message || error} />
            <DataTable columns={columns} data={result.rows} searchPlaceholder="Buscar en el resumen..." />
        </AppModal>;
    }
    return <AppModal title={title} subtitle={creating ? "Selecciona productos y configura sus alternativas." : "Selecciona alternativas y marca únicamente los campos que deseas cambiar."} onClose={onClose} onSubmit={inspect} maxWidth="lg" actions={<>
        <button type="button" className="btn btn-light" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={!ids.length}>Revisar lote</button>
    </>}>
        <Field label="Operación por lote" value={operation} onChange={changeOperation}>{Object.entries(BATCH_OPERATIONS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Field>
        {creating && <Feedback variant="info" message="Agrega una opción adicional para cada producto seleccionado. Los proveedores y las alternativas actuales permanecen intactos." />}
        {changingSupplier && <Feedback variant="warning" message={CHANGE_SUPPLIER_WARNING} />}
        {operation === "costs" && <p className="form-text">Agrega nuevos costos a las alternativas seleccionadas y conserva todos los registros anteriores.</p>}
        <Feedback variant="info" message={selectionNotice} />
        <FilterBar onClear={() => { setSearch(""); setCategoryId(""); setLineId(""); setSupplierFilter(""); setTypeFilter(""); setStatusFilter(""); }}>
            <Field label="Buscar" value={search} onChange={e => setSearch(e.target.value)} />
            <Field label="Categoría" value={categoryId} onChange={e => { setCategoryId(e.target.value); setLineId(""); }}><option value="">Todas</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Field>
            <Field label="Línea" value={lineId} onChange={e => setLineId(e.target.value)}><option value="">Todas</option>{classificationLines(productLines, categoryId).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</Field>
            {!creating && <Field label="Filtrar proveedor" value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}><option value="">Todos</option>{data.suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Field>}
            {!creating && <Field label="Filtrar modalidad" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}><option value="">Todas</option>{Object.entries(SOURCING_TYPES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Field>}
            <Field label="Filtrar estado" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">Todos</option><option value="true">Activo</option><option value="false">Inactivo</option></Field>
        </FilterBar>
        <div className="d-flex flex-wrap align-items-center gap-2 mb-2"><strong>{ids.length} seleccionados · {visible.length} visibles</strong>
            <button type="button" className="btn btn-outline-secondary" onClick={() => setIds([...new Set([...ids, ...visible.map(e => e.id)])])}>Seleccionar visibles</button>
            <button type="button" className="btn btn-outline-secondary" onClick={() => setIds(ids.filter(id => !visible.some(e => e.id === id)))}>Quitar visibles</button>
            <button type="button" className="btn btn-light" onClick={() => setIds([])}>Quitar todos</button>
        </div>
        <div className="batch-products-list border rounded p-2 mb-3">
            {visible.map(e => <label key={e.id} className="d-flex align-items-center gap-2 border-bottom py-2">
                <input type="checkbox" className="form-check-input" checked={ids.includes(e.id)} onChange={() => setIds(ids.includes(e.id) ? ids.filter(id => id !== e.id) : [...ids, e.id])} />
                <span>{e.name}{!creating && <small className="d-block">{supplierName(e.supplierId)} · {SOURCING_TYPES[e.sourcingType]} · {supplyPresentation(e)}</small>}</span>
                <ClassificationBadge product={e.product} categories={categories} productLines={productLines} />
            </label>)}
            {!visible.length && <p className="text-muted">Sin coincidencias.</p>}
        </div>
        <p className="form-text">La selección se conserva al cambiar filtros; el contador incluye los seleccionados que ahora estén ocultos.</p>
        {(creating || editing || changingSupplier) && <div className="form-grid">
            {(creating || changingSupplier) && field("supplierId", "proveedor", <><Field label={creating ? "Proveedor adicional" : "Proveedor de reemplazo"} required value={values.supplierId} onChange={change("supplierId")}><option value="">Selecciona proveedor</option>{data.suppliers.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Field>{changingSupplier && <p className="form-text">Solo se permite cambiar proveedor en alternativas sin historial ni relaciones que lo impidan.</p>}</>)}
            {!changingSupplier && <>
            {field("sourcingType", "modalidad", <Field label="Modalidad" value={values.sourcingType} onChange={change("sourcingType")}>{Object.entries(SOURCING_TYPES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Field>)}
            {(creating || editing) && <>
                {fullCreate && <Field label="Artículo comprado" value={articleMode} onChange={e => setArticleMode(e.target.value)}><option value="shared">Mismo para todos</option><option value="individual">Capturar por producto</option></Field>}
                {(!fullCreate || articleMode === "shared") && field("name", "artículo comprado", <Field label="Nombre del artículo comprado" required={values.sourcingType !== "READY_TO_USE"} value={values.name || ""} onChange={change("name")} placeholder={values.sourcingType === "READY_TO_USE" ? "Vacío: mismo producto final" : "Ej. Base Multiusos"} />)}
                {fullCreate && articleMode === "individual" && selected.map(e => <Field key={e.id} label={`Artículo comprado · ${e.name}`} required={values.sourcingType !== "READY_TO_USE"} value={articles[e.id] || ""} onChange={event => setArticles({ ...articles, [e.id]: event.target.value })} />)}
                {fullCreate && <Field label="Presentación comprada" value={presentationMode} onChange={e => setPresentationMode(e.target.value)}><option value="shared">Misma presentación para todos</option><option value="individual">Presentación individual</option></Field>}
            </>}
            {(!fullCreate || presentationMode === "shared") && <>
                {(fullCreate || editing) && field("purchaseQuantity", "cantidad de presentación", <Field label="Cantidad de presentación" type="number" min="0" step="any" required value={values.purchaseQuantity ?? ""} onChange={change("purchaseQuantity")} />)}
                {field("purchaseUnit", "unidad", <UnitField label="Unidad de compra" required value={values.purchaseUnit} onChange={change("purchaseUnit")} />)}
                {field("presentation", "presentación", <Field label="Descripción de presentación (opcional)" maxLength={150} value={values.presentation} onChange={change("presentation")} />)}
            </>}
            {fullCreate && presentationMode === "individual" && selected.map(e => {
                const value = presentations[e.id] || { purchaseQuantity: "", purchaseUnit: e.product.unit, presentation: "" };
                const update = (key, val) => setPresentations({ ...presentations, [e.id]: { ...value, [key]: val } });
                return <fieldset key={e.id} className="border rounded p-3"><legend className="fs-6">{e.name}</legend><Field label="Cantidad de presentación" type="number" min="0" step="any" required value={value.purchaseQuantity} onChange={event => update("purchaseQuantity", event.target.value)} /><UnitField label="Unidad de presentación" required value={value.purchaseUnit} onChange={event => update("purchaseUnit", event.target.value)} /><Field label="Descripción (opcional)" value={value.presentation} onChange={event => update("presentation", event.target.value)} /></fieldset>;
            })}
            {field("active", "estado", <Field label="Estado" value={String(values.active)} onChange={e => setValues({ ...values, active: e.target.value === "true" })}><option value="true">Activo</option><option value="false">Inactivo</option></Field>)}
            {field("notes", "notas", <NotesField value={values.notes} onChange={change("notes")} />)}
            </>}
        </div>}
        {(creating || editing) && (readyOnly ? <p className="form-text">Producto terminado · Sin transformación. Se validará que las unidades sean compatibles con cada producto.</p> : <section className="sale-section mt-3">
            {!creating && !enabled.sourcingType && <label className="form-check"><input type="checkbox" className="form-check-input" checked={Boolean(enabled.yield)} onChange={e => setEnabled({ ...enabled, yield: e.target.checked })} />Cambiar rendimiento</label>}
            {appliesYield && <>
                <Field label="Rendimiento del lote" value={yieldMode} onChange={e => setYieldMode(e.target.value)}><option value="pending">Dejar rendimiento pendiente</option><option value="shared">Aplicar explícitamente el mismo rendimiento a todos</option><option value="individual">Configurar rendimiento individualmente</option></Field>
                <p className="form-text">Aplica únicamente a alternativas con transformación. Los productos terminados conservan equivalencia directa.</p>
                {yieldMode === "shared" && <SupplyYieldFields value={sharedYield} onChange={setSharedYield} />}
                {yieldMode === "individual" && transforming.map(e => <fieldset key={e.id} className="border rounded p-3 mt-2"><legend className="fs-6">{e.name}{!creating && ` · ${supplierName(e.supplierId)}`}</legend>
                    <Field label="Rendimiento individual" value={!Object.hasOwn(yields, e.id) ? "" : yields[e.id] === null ? "pending" : "known"} onChange={event => setYields({ ...yields, [e.id]: event.target.value === "pending" ? null : newYield(changes.purchaseUnit || e.purchaseUnit, e.product?.unit) })}><option value="" disabled>Selecciona una opción</option><option value="pending">Pendiente</option><option value="known">Conocido</option></Field>
                    {yields[e.id] && <SupplyYieldFields value={yields[e.id]} onChange={value => setYields({ ...yields, [e.id]: value })} />}
                </fieldset>)}
            </>}
        </section>)}
        {!changingSupplier && <section className="sale-section mt-3">
            <h3>Costos del proveedor</h3>
            <Field label="Registro de costos" value={costMode} onChange={e => setCostMode(e.target.value)}><option value="none">No registrar costos todavía</option><option value="shared">Usar el mismo costo para todos</option><option value="individual">Capturar costos individualmente</option></Field>
            <p className="form-text">Cada costo se agrega al historial de su alternativa. En altas, las alternativas existentes se omiten junto con sus costos.</p>
            {costMode === "shared" && <SupplierCostFields perPresentation={fullCreate} value={sharedCost} onChange={setSharedCost} />}
            {costMode === "individual" && selected.map(e => <fieldset key={e.id} className="border rounded p-3 mt-2"><legend className="fs-6">{e.name}{!creating && ` · ${supplierName(e.supplierId)}`}</legend><SupplierCostFields perPresentation={fullCreate} optional value={costs[e.id] || newCost(changes.purchaseUnit || e.purchaseUnit || e.product?.unit)} onChange={value => setCosts({ ...costs, [e.id]: value })} /><p className="form-text">Importe vacío: no agregar costo.</p></fieldset>)}
        </section>}
        {fullCreate && <p className="form-text">Un artículo compartido no crea inventario ni distribuye compras entre productos. Registra cada compra real una sola vez en su alternativa correspondiente.</p>}
        <Feedback message={error} />
    </AppModal>;
}
