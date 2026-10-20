import { getProductDisplayName } from "../utils/catalogUtils.js";
import { useState } from "react";
import AppModal from "./AppModal";
import Feedback from "./Feedback";
import SupplyPriceSection from "./SupplyPriceSection";
import SupplierCostFields from "./SupplierCostFields";
import SupplyYieldFields from "./SupplyYieldFields";
import { localDate } from "../utils/salesUtils.js";
import { Field, UnitField, NotesField } from "./ProcurementFields";
import { useProcurement } from "../context/ProcurementContext.js";
import { useCatalog } from "../context/CatalogHooks.js";
import { SOURCING_TYPES, buildReadyToUseYield, changeSupplyModality } from "../utils/procurementUtils.js";

export default function SupplyFormModal({ supply, productId, onClose }) {
    const { data, saveSupply } = useProcurement();
    const { products, categories, productLines } = useCatalog();
    const product = products.find((p) => p.id === productId);
    const [form, setForm] = useState(supply || { name: getProductDisplayName(product, categories, productLines), purchaseQuantity: 1, supplierId: "", outputProductId: product?.id ?? null, sourcingType: "READY_TO_USE", purchaseUnit: product?.unit || "litro", presentation: "", notes: "", active: true, yield: null });
    const [rule, setRule] = useState(supply?.yield || { inputQuantity: "", inputUnit: "litro", outputQuantity: "", outputUnit: "litro" });
    const [known, setKnown] = useState(Boolean(supply?.yield && supply.sourcingType !== "READY_TO_USE"));
    const [error, setError] = useState("");
    const [initialCost, setInitialCost] = useState({ price: "", priceQuantity: null, priceUnit: "", quotedAt: localDate(), notes: "" });
    const change = (key) => (event) => setForm({ ...form, [key]: key === "supplierId" ? data.suppliers.find(s => String(s.id) === event.target.value)?.id ?? "" : event.target.value });
    const ready = form.sourcingType === "READY_TO_USE";
    const outputProduct = products.find((p) => p.id === form.outputProductId);
    const hasUnsavedChanges = Boolean(supply && (JSON.stringify(form) !== JSON.stringify(supply) || (!ready && (known !== Boolean(supply.yield) || (known && JSON.stringify(rule) !== JSON.stringify(supply.yield))))));
    function changeType(event) {
        const next = changeSupplyModality(form, event.target.value, outputProduct);
        setForm(next.form);
        setKnown(next.known);
        setRule(next.rule);
    }
    function submit(event) {
        event.preventDefault();
        const cost = !supply && String(initialCost.price).trim() !== "" ? { ...initialCost, priceQuantity: initialCost.priceQuantity ?? (form.purchaseQuantity || 1), priceUnit: initialCost.priceUnit || form.purchaseUnit } : null;
        const result = saveSupply({ ...form, name: form.name.trim() || (ready ? getProductDisplayName(outputProduct, categories, productLines) : ""), purchaseQuantity: form.purchaseQuantity === "" ? null : form.purchaseQuantity, yield: ready ? buildReadyToUseYield(form.purchaseUnit, outputProduct?.unit) : known ? rule : null }, cost);
        if (!result.ok) setError(result.message); else onClose();
    }
    return <AppModal title={supply ? "Editar alternativa" : "Nueva alternativa"} subtitle="Selecciona cómo abasteces el producto final." onClose={onClose} onSubmit={submit} maxWidth="md">
        {!data.suppliers.some(s => s.active) && <p role="status" className="alert alert-info">No hay proveedores activos disponibles. Agrega o activa proveedores desde Compras &gt; Proveedores.</p>}
        <div className="form-grid"><Field label="Artículo comprado" required={!ready} autoFocus maxLength={150} value={form.name} onChange={change("name")} /><Field label="Proveedor" required value={form.supplierId} onChange={change("supplierId")}><option value="">Selecciona proveedor</option>{data.suppliers.filter((s) => s.active || s.id === form.supplierId).map((s) => <option key={s.id} value={s.id}>{s.name}{!s.active ? " (Inactivo)" : ""}</option>)}</Field>
        <Field label="Producto final" value={form.outputProductId ?? ""} onChange={(e) => { const selected = products.find((p) => String(p.id) === e.target.value); setForm({ ...form, outputProductId: selected?.id ?? null, ...(ready && selected ? { purchaseUnit: selected.unit } : {}) }); }}><option value="">Sin producto final (envase u otro insumo)</option>{products.map((p) => <option key={p.id} value={p.id}>{getProductDisplayName(p, categories, productLines)}</option>)}</Field>
        <Field label="Modalidad" value={form.sourcingType} onChange={changeType}>{Object.entries(SOURCING_TYPES).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</Field>
        <Field label="Cantidad de presentación" type="number" min="0" step="any" value={form.purchaseQuantity ?? ""} onChange={change("purchaseQuantity")} /><UnitField label="Unidad de compra / contenido" required value={form.purchaseUnit} onChange={change("purchaseUnit")} /><Field label="Presentación (opcional)" placeholder="Ej. garrafa de 5 L o bolsa de 500 g" maxLength={150} value={form.presentation} onChange={change("presentation")} /></div>
        {!ready ? <section className="sale-section mt-3"><label className="form-check"><input className="form-check-input" type="checkbox" checked={known} onChange={(e) => setKnown(e.target.checked)} /><span>¿Conoces cuánto producto terminado obtienes?</span></label>
        {known ? <div className="mt-3"><SupplyYieldFields value={rule} onChange={setRule} /></div> : <p className="form-text">Rendimiento pendiente. Costo efectivo pendiente. Puedes completar el rendimiento más adelante.</p>}
        </section> : <p className="form-text mt-3">Producto terminado · Sin transformación. La unidad de compra debe ser compatible con la del producto final.</p>}
        <p className="form-text">La alternativa puede existir sin costo, rendimiento ni compras previas.</p>
        {!supply && <section className="sale-section mt-3" aria-label="Costo inicial del proveedor">
            <h3>Costo del proveedor (opcional)</h3>
            <p className="form-text">Deja el costo vacío si aún no lo conoces. Si lo registras, se conservará en el historial de costos de esta alternativa.</p>
            <SupplierCostFields value={{ ...initialCost, priceQuantity: initialCost.priceQuantity ?? (form.purchaseQuantity || 1) }} onChange={setInitialCost} optional defaultUnit={form.purchaseUnit} />
        </section>}
        <NotesField value={form.notes || ""} onChange={change("notes")} /><label className="form-check form-switch mt-3"><input className="form-check-input" type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /><span>Alternativa activa</span></label><Feedback message={error} />
        {supply?.id && <SupplyPriceSection supplyId={supply.id} hasUnsavedChanges={hasUnsavedChanges} />}
    </AppModal>;
}
