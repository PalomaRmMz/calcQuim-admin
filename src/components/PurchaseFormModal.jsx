import PurchaseReceipt from './PurchaseReceipt';
import { SourceForm } from './PurchasedItemForms';
import { normalizeText } from '../utils/catalogUtils.js';
import { faCartShopping } from '@fortawesome/free-solid-svg-icons';
import QuickPurchaseProduct from './QuickPurchaseProduct';
import FormLabel, { RequiredMark, FieldError } from "./FormLabel";
import ValidatedForm from "./ValidatedForm";
import { availablePurchaseSources, sourceSnapshot } from '../services/supplyModel.js';
import { getProductChoiceLabel, getProductDisplayName } from "../utils/catalogUtils.js";
import ModalHeader from "./ModalHeader";
import { useState } from "react";
import { getBadgeStyle } from "../utils/classificationUtils.js";
import { Autocomplete, TextField, Dialog, DialogContent, DialogActions, Button, createFilterOptions } from "@mui/material";
import { useCatalog } from "../context/CatalogHooks.js";
import { useProcurement } from "../context/ProcurementContext.js";
import { directSupply, supplySnapshot, SOURCING_TYPES, supplyPresentation } from "../utils/procurementUtils.js";
import PurchaseItemOutcome from "./PurchaseItemOutcome";
import TableActions from "./TableActions";
import { localDate, money } from "../utils/salesUtils";
import { calculatePurchaseItem, groupPurchaseItems, unitCostText } from "../utils/purchaseUtils";
import "../styles/components/SaleFormModal.css";

const filter = createFilterOptions({ limit: 30, stringify: (p) => `${p.name} ${p.classification}` });

export default function PurchaseFormModal({ purchase, onClose, onSave }) {
    const { products: rawProducts, categories, productLines } = useCatalog();
    const [quickName, setQuickName] = useState(null);
    const [drafts, setDrafts] = useState([]);
    const products = [...rawProducts, ...drafts].map(p => ({ ...p, displayName: getProductDisplayName(p, categories, productLines) }));
    const { data } = useProcurement();
    const [supplierId, updateSupplier] = useState(purchase?.supplierId ?? "");
    const setSupplierId = value => updateSupplier(data.suppliers.find(s => String(s.id) === String(value))?.id ?? "");
    const [date, setDate] = useState(purchase?.date || localDate);
    const [reference, setReference] = useState(purchase?.reference || "");
    const [notes, setNotes] = useState(purchase?.notes || "");
    const [search, setSearch] = useState("");
    const [items, setItems] = useState(() => (purchase?.items || []).map((item) => ({ ...item, costMode: item.costMode || "total", cost: item.cost ?? (item.costMode === "unit" ? item.unitCost : item.total) })));
    const [error, setError] = useState("");
    const [receipt, setReceipt] = useState(purchase?.receipt || null);
    const [receiptBusy, setReceiptBusy] = useState(false);
    const [editingSource, setEditingSource] = useState(null);
    const existingSupplies = data.supplyModelVersion === 2 ? availablePurchaseSources(data, supplierId) : data.supplyItems.filter((s) => s.supplierId === supplierId);
    const missingSupplierArticles = supplierId && search.trim() && data.supplyModelVersion === 2 ? data.purchasedItems.filter(article => article.active && article.sourcingType !== 'READY_TO_USE'
        && normalizeText(article.name).includes(normalizeText(search.trim()))
        && !existingSupplies.some(source => source.purchasedItemId === article.id)) : [];
    const directIds = new Set(products.filter((p) => existingSupplies.some(s => s.sourcingType === "READY_TO_USE" && (s.outputProductId === p.id || data.supplyConversions?.some(c => c.active && c.purchasedItemId === s.purchasedItemId && c.outputProductId === p.id)))).map((p) => p.id));
    const productMap = new Map(products.map((p) => [p.id, p]));
    const options = [...existingSupplies.filter((s) => s.active && (s.outputProductId == null || productMap.get(s.outputProductId)?.active)), ...(products.filter((p) => p.active && !directIds.has(p.id)).map((p) => ({ ...directSupply(p, supplierId), purchaseQuantity: null, directProductId: p.id })))]
        .filter((s) => !items.some((i) => i.supplyItemId === s.id || (s.directProductId != null && i.directProductId === s.directProductId)))
        .map((s) => { const p = productMap.get(s.outputProductId) || products.find(product => data.supplyConversions?.some(c => c.active && c.purchasedItemId === s.purchasedItemId && c.outputProductId === product.id)); return { ...s, choiceLabel: p && s.sourcingType === "READY_TO_USE" ? getProductChoiceLabel(p, products, categories, productLines) : s.name, classification: `${p?.displayName || ""} ${categories.find((c) => c.id === p?.categoryId)?.name || ""} ${productLines.find((l) => l.id === p?.lineId)?.name || ""} ${SOURCING_TYPES[s.sourcingType]} ${supplyPresentation(s)}` }; }).concat(missingSupplierArticles.map(article => ({ id: `configure:${article.id}`, purchasedItemId: article.id, name: article.name, classification: SOURCING_TYPES[article.sourcingType], requiresSource: true })));
    const calculated = items.map(calculatePurchaseItem);
    const sortedGroups = groupPurchaseItems(items, products, categories, productLines);
    const total = Math.round(calculated.reduce((sum, item) => sum + (item?.total || 0), 0) * 100) / 100;
    function change(id, data) { setItems((current) => current.map((item) => item.id === id ? { ...item, ...data } : item)); }
    function submit(e) {
        e.preventDefault();
        if (receiptBusy) return;
        if (!supplierId) return setError("Escribe el proveedor de esta compra.");
        if (!date || date > localDate()) return setError("Selecciona una fecha válida, no futura.");
        if (!items.length || calculated.some((item) => !item) || !Number.isFinite(total)) return setError("Agrega artículos con cantidad mayor que cero y un costo válido.");
        const result = onSave({ receipt, supplierId, date, reference: reference.trim(), notes: notes.trim(), items: sortedGroups.flatMap(({ items: entries, ...group }) => entries.map(({ index }) => ({ ...calculated[index], group }))), total });
        if (!result.ok) return setError(result.message);
        onClose();
    }
    function addDirect(product, newProduct) {
        const supply = { ...directSupply(product, supplierId), purchaseQuantity: null };
        setItems(current => [...current, { ...supplySnapshot(supply, product), id: crypto.randomUUID(), directProductId: product.id, newProduct, quantity: "", costMode: "unit", cost: "" }]);
        setSearch("");
    }
    return <><Dialog className="app-dialog" open onClose={onClose} fullWidth maxWidth="lg" PaperProps={{ className: "sale-modal" }} aria-labelledby="purchase-title">
        <ValidatedForm className="sale-modal-form" onSubmit={submit}>
            <ModalHeader icon={faCartShopping} titleId="purchase-title" title={purchase ? "Editar compra" : "Nueva compra"} subtitle="Registra cuánto compraste y cuánto pagaste." onClose={onClose} />
            <DialogContent className="sale-modal-body">
                <section className="sale-section">
                <div className="row g-3 mb-3">
                    <div className="col-12 col-sm-6"><FormLabel required className="form-label" htmlFor="purchaseSupplier">Proveedor</FormLabel><select autoFocus id="purchaseSupplier" required aria-required="true" className="form-select" value={supplierId} disabled={items.length > 0} onChange={(e) => setSupplierId(e.target.value)}><option value="">Selecciona proveedor</option>{data.suppliers.filter((s) => s.active || s.id === purchase?.supplierId).map((s) => <option key={s.id} value={s.id}>{s.name}{!s.active ? " (Inactivo)" : ""}</option>)}</select></div>
                    <div className="col-12 col-sm-6"><FormLabel required className="form-label" htmlFor="purchaseDate">Fecha</FormLabel><input type="date" max={localDate()} id="purchaseDate" required aria-required="true" className="form-control" value={date} onChange={(e) => setDate(e.target.value)} /></div>
                </div>
                <p className="form-text">Puedes comprar artículos sin producto final ni costo informado previo.</p>{items.length > 0 && <p className="form-text">Para cambiar de proveedor retira primero los artículos.</p>}
                {!data.suppliers.some(s => s.active) && <p role="status" className="alert alert-info">No hay proveedores activos disponibles. Agrega o activa proveedores desde Compras &gt; Proveedores.</p>}
                <Autocomplete disabled={!supplierId} options={options} value={null} inputValue={search} onInputChange={(_, value) => setSearch(value)} getOptionLabel={(p) => p.name} getOptionKey={(p) => p.id} groupBy={option => option.requiresSource ? 'Configurar con este proveedor' : 'Disponibles para comprar'} renderOption={({ key, ...props }, p) => <li key={key} {...props}><div className="w-100"><div className="d-flex align-items-center justify-content-between gap-3"><span>{p.choiceLabel || p.name}</span>{p.requiresSource && <small className="text-primary text-nowrap">Configurar proveedor</small>}</div><small className="d-block text-muted">{p.requiresSource ? 'Artículo existente · Vincular al proveedor seleccionado' : `${supplyPresentation(p)} · ${SOURCING_TYPES[p.sourcingType]}`}</small></div></li>} filterOptions={(opts, state) => state.inputValue.trim() ? filter(opts, state) : []} noOptionsText={search.trim() ? <div>No encontramos &quot;{search}&quot;.<Button onMouseDown={e => e.preventDefault()} onClick={() => setQuickName(search)}>+ Crear producto</Button></div> : "Escribe para buscar"} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} onChange={(_, supply) => { if (supply?.requiresSource) { setEditingSource({ purchasedItemId: supply.purchasedItemId }); return; } if (supply) setItems((current) => [...current, { ...(data.supplyModelVersion === 2 && supply.directProductId == null ? sourceSnapshot(data, supply, products) : supplySnapshot(supply, productMap.get(supply.outputProductId))), id: crypto.randomUUID(), directProductId: supply.directProductId, newProduct: drafts.find(p => p.id === supply.directProductId), quantity: "", costMode: "total", cost: "" }]); setSearch(""); }} renderInput={(params) => <TextField {...params} size="small" label="Agregar artículo comprado" placeholder="Busca por artículo o presentación" />} />
                <p className="text-muted small mt-2">Captura la cantidad y el costo total o unitario de cada artículo.</p>
                {supplierId && !items.length && !existingSupplies.some(s => s.active) && <p className="alert alert-info">Busca un producto terminado o créalo aquí. Las bases y concentrados se configuran como artículos transformables en Abastecimiento.</p>}
                <div className="sale-section-heading"><h3>Artículos de la compra</h3><span>{items.length} {items.length === 1 ? "artículo" : "artículos"}</span></div>
                {items.length > 0 && <div className="table-responsive sale-items"><table className="table align-middle small"><thead><tr><th>Artículo comprado / producto final</th><th>Cantidad<RequiredMark /></th><th>Costo conocido</th><th>Valor<RequiredMark /></th><th>Costo total</th><th>Rendimiento y costo efectivo</th><th aria-label="Acciones" /></tr></thead>{sortedGroups.map((group) => <tbody key={group.id}>
                    <tr className="sale-group-heading"><th scope="rowgroup" colSpan={7} style={getBadgeStyle(group.colorId) || { backgroundColor: "#f1f3f5", color: "#6c757d" }}>{group.name}</th></tr>
                    {group.items.map(({ item, index }) => <tr key={item.id}>
                    <td>{item.name}<small className="d-block text-muted">{item.productNameSnapshot} · {SOURCING_TYPES[item.sourcingType]} · {supplyPresentation(item)}</small>{!purchase && data.supplyModelVersion === 2 && data.supplyItems.some(s => s.id === item.supplyItemId) && <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setEditingSource(data.supplyItems.find(s => s.id === item.supplyItemId))}>Revisar proveedor y contenido</button>}</td>
                    <td><div className="input-group flex-nowrap" style={{ width: "max-content" }}><input id={`purchase-quantity-${item.id}`} data-inline-error="true" aria-label={`Cantidad de ${item.name}`} style={{ width: "calc(5ch + 2.5rem)", flex: "0 0 auto" }} required aria-required="true" className="form-control" type="number" min="0" data-positive="true" step="any" placeholder="Cantidad" value={item.quantity} onChange={(e) => change(item.id, { quantity: e.target.value })} /><span className="input-group-text">{item.unit}</span></div><FieldError id={`purchase-quantity-${item.id}`} /></td>
                    <td><div className="d-flex flex-nowrap align-items-center gap-3" role="group" aria-label={`Tipo de costo de ${item.name}`}>{[{ value: "total", label: "Total" }, { value: "unit", label: "Unitario" }].map((mode) => <label key={mode.value} className="sale-entry-checkbox"><input type="radio" name={`purchase-mode-${item.id}`} className="form-check-input" checked={item.costMode === mode.value} onChange={() => change(item.id, { costMode: mode.value, cost: calculated[index] ? (mode.value === "total" ? calculated[index].total : Number(calculated[index].unitCost.toFixed(6))) : "" })} /><span>{mode.label}</span></label>)}</div></td>
                    <td><input id={`purchase-cost-${item.id}`} data-inline-error="true" aria-label={`Costo ${item.costMode === "total" ? "total" : "unitario"} de ${item.name}`} style={{ width: "calc(5ch + 2.5rem)" }} required aria-required="true" className="form-control" type="number" min="0" step={item.costMode === "total" ? "0.01" : "any"} value={item.cost} onChange={(e) => change(item.id, { cost: e.target.value })} /><FieldError id={`purchase-cost-${item.id}`} /></td>
                    <td className="text-nowrap">{calculated[index] ? <><strong>{money(calculated[index].total)}</strong><small className="d-block text-muted">{unitCostText(calculated[index].unitCost)} / {item.unit}</small></> : "—"}</td>
                    <td>{item.sourcingType === "READY_TO_USE" ? <span>Sin transformación</span> : <details><summary>Ver rendimiento</summary><PurchaseItemOutcome item={calculated[index] || { ...item, total: null }} /></details>}</td><td><TableActions label={item.name} deleteLabel="Quitar" onDelete={() => setItems(items.filter((i) => i.id !== item.id))} /></td>
                </tr>)}</tbody>)}</table></div>}
                {!items.length && <p className="sale-empty mt-3">Busca artículos para comenzar tu compra.</p>}
                </section>
                <PurchaseReceipt value={receipt} onChange={setReceipt} onBusy={setReceiptBusy} />
                <details className="sale-notes"><summary>Referencia y notas (opcional)</summary><div><label htmlFor="purchaseReference" className="form-label">Ticket o factura</label><input id="purchaseReference" maxLength={100} className="form-control mb-2" value={reference} onChange={(e) => setReference(e.target.value)} /><label htmlFor="purchaseNotes" className="form-label">Notas</label><textarea id="purchaseNotes" maxLength={1000} className="form-control" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div></details>
                {error && <p className="alert alert-danger mt-3" role="alert">{error}</p>}
            </DialogContent>
            <DialogActions className="sale-modal-actions"><div className="sale-footer-total"><span>Total de compra</span><strong>{money(total)}</strong></div><Button color="inherit" onClick={onClose}>Cancelar</Button><Button type="submit" variant="contained" disabled={!items.length || receiptBusy}>{purchase ? "Guardar cambios" : "Registrar compra"}</Button></DialogActions>
        </ValidatedForm>
    </Dialog>{editingSource && <SourceForm key={editingSource.id} source={editingSource.id ? editingSource : undefined} initialSupplierId={supplierId} article={data.purchasedItems.find(a => a.id === editingSource.purchasedItemId)} onClose={() => {
        const updated = data.supplyItems.find(s => s.id === editingSource.id);
        if (updated) setItems(current => current.map(item => item.supplyItemId === updated.id ? { ...item, ...sourceSnapshot(data, updated, products) } : item));
        setEditingSource(null);
    }} />}{quickName !== null && <QuickPurchaseProduct name={quickName} drafts={drafts} onClose={() => setQuickName(null)} onCreate={product => { setDrafts(current => [...current, product]); addDirect({ ...product, displayName: getProductDisplayName(product, categories, productLines) }, product); setQuickName(null); }} />}</>;
}
