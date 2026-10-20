import FormLabel, { RequiredMark, FieldError } from "./FormLabel";
import ValidatedForm from "./ValidatedForm";
import { getProductDisplayName, normalizeText } from "../utils/catalogUtils.js";
import { categoryStyle } from '../utils/categoryColors.js';
import { getBadgeStyle } from "../utils/classificationUtils.js";
import ModalHeader from "./ModalHeader";
import { useState } from "react";
import { Autocomplete, createFilterOptions, Dialog, DialogContent, DialogActions, Button, TextField } from "@mui/material";
import { useCatalog } from "../context/CatalogHooks.js";
import { calculateItems, localDate, money } from "../utils/salesUtils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCartShopping, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import "../styles/components/SaleFormModal.css";

const filterProducts = createFilterOptions({
    limit: 30,
    stringify: (product) => `${product.displayName} ${product.categoryName} ${product.lineName}`,
});

export default function SaleFormModal({ onClose, onSave }) {
    const { products, categories, productLines, priceGroups, getProductPrice, isProductAvailable } = useCatalog();
    const [productSearch, setProductSearch] = useState("");
    const [date, setDate] = useState(localDate);
    const [payment, setPayment] = useState("Efectivo");
    const [notes, setNotes] = useState("");
    const [items, setItems] = useState([]);
    const [error, setError] = useState("");
    const available = products.filter((product) => product.active && isProductAvailable(product) && getProductPrice(product) !== null && Number.isFinite(getProductPrice(product)) && getProductPrice(product) >= 0 && (product.priceGroupId == null || priceGroups.some((group) => group.id === product.priceGroupId && group.active)));
    const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
    const displayNameCounts = new Map();
    available.forEach(product => {
        const name = normalizeText(getProductDisplayName(product, categories, productLines));
        displayNameCounts.set(name, (displayNameCounts.get(name) || 0) + 1);
    });
    const lineNames = new Map(productLines.map((line) => [line.id, line.name]));
    const searchOptions = available
        .filter((product) => !items.some((item) => item.productId === product.id))
        .map((product) => ({
            ...product,
            displayName: getProductDisplayName(product, categories, productLines),
            categoryName: categoryNames.get(product.categoryId) || "",
            lineName: lineNames.get(product.lineId) || "",
        }));
    const unclassified = { id: "unclassified", name: "Sin categoría" };
    const productGroups = new Map(products.map((product) => [
        product.id,
        lineNames.get(product.lineId)
            ? { id: `line-${product.lineId}`, name: lineNames.get(product.lineId), colorId: product.lineId }
            : categoryNames.get(product.categoryId)
                ? { id: `category-${product.categoryId}`, name: categoryNames.get(product.categoryId), colorId: product.categoryId }
                : unclassified,
    ]));
    const calculated = calculateItems(items.map(item => { const product = products.find(p => p.id === item.productId); return product ? { ...item, price: getProductPrice(product), name: getProductDisplayName(product, categories, productLines) } : item; })).sort((a, b) => {
        const groupA = productGroups.get(a.productId) || unclassified;
        const groupB = productGroups.get(b.productId) || unclassified;
        const groupOrder = groupA.name.localeCompare(groupB.name, "es", { sensitivity: "base" });
        return groupOrder || groupA.id.localeCompare(groupB.id) || a.name.localeCompare(b.name, "es", { sensitivity: "base" });
    });
    const groupedItems = [];
    for (const item of calculated) {
        const group = productGroups.get(item.productId) || unclassified;
        if (groupedItems.at(-1)?.id !== group.id) groupedItems.push({ ...group, items: [] });
        groupedItems.at(-1).items.push(item);
    }
    const total = Math.round(calculated.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;

    function addProduct(product) {
        if (!product) return;
        setItems((current) => current.some((item) => item.productId === product.id) ? current : [...current, { productId: product.id, name: getProductDisplayName(product, categories, productLines), unit: product.unit, price: getProductPrice(product), quantity: 1 }]);
        setProductSearch("");
    }

    function submit(event) {
        event.preventDefault();
        if (!items.length) return setError("Agrega al menos un producto.");
        if (!date || date > localDate()) return setError("Selecciona una fecha válida que no sea futura.");
        if (calculated.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.amount)) || !Number.isFinite(total)) return setError("Todas las cantidades deben ser mayores que cero y válidas.");
        if (items.some((item) => !available.some((product) => product.id === item.productId))) return setError("Un producto ya no está disponible. Retíralo para continuar.");
        const result = onSave({ date, payment, notes: notes.trim(), items: calculated.map((item) => ({ ...item, group: productGroups.get(item.productId) || unclassified })), total });
        if (!result.ok) return setError(result.message);
        onClose();
    }

    return <Dialog className="app-dialog" open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="new-sale-title" PaperProps={{ className: "sale-modal" }}>
        <ValidatedForm onSubmit={submit} className="sale-modal-form">
            <ModalHeader titleId="new-sale-title" title="Nueva venta" subtitle="Agrega tus productos y registra el pago." onClose={onClose} />
            <DialogContent className="sale-modal-body">
                <section className="sale-section">
                <div className="row g-2 mb-3">
                    <div className="col-12 col-md-6"><FormLabel required htmlFor="saleDate" className="form-label">Fecha</FormLabel><input id="saleDate" required aria-required="true" className="form-control" type="date" max={localDate()} value={date} onChange={(e) => setDate(e.target.value)} /></div>
                    <div className="col-12 col-md-6"><FormLabel required htmlFor="salePayment" className="form-label">Método de pago</FormLabel><select id="salePayment" required aria-required="true" className="form-select" value={payment} onChange={(e) => setPayment(e.target.value)}>{["Efectivo", "Transferencia", "Tarjeta"].map((method) => <option key={method}>{method}</option>)}</select></div>
                </div>
                <div className="sale-section-heading"><h3>Productos de la venta</h3><span>{items.length} {items.length === 1 ? "producto" : "productos"}</span></div>
                <div className="row g-2 mb-3">
                    <div className="col-12">
                        <Autocomplete
                            id="saleProduct"
                            options={searchOptions}
                            value={null}
                            inputValue={productSearch}
                            onInputChange={(_, value) => setProductSearch(value)}
                            onChange={(_, product) => addProduct(product)}
                            getOptionLabel={(product) => product.displayName}
                            getOptionKey={(product) => product.id}
                            filterOptions={(options, state) => state.inputValue.trim() ? filterProducts(options, { ...state, inputValue: state.inputValue.trim() }) : []}
                            noOptionsText={productSearch.trim() ? "No se encontraron productos disponibles" : "Escribe para buscar productos"}
                            forcePopupIcon={false}
                            clearText="Limpiar búsqueda"
                            onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
                            renderOption={({ key, ...props }, product) => (
                                <li key={key} {...props}>
                                    <div className="category-accent" style={categoryStyle(categories.find(category => category.id === product.categoryId))}>
                                        {product.displayName}
                                        {displayNameCounts.get(normalizeText(product.displayName)) > 1 && <small className="d-block text-muted">{product.categoryName || 'Sin categoría'}{product.lineName ? ` · ${product.lineName}` : ''}</small>}
                                        <small className="d-block text-muted">{money(getProductPrice(product))} / {product.unit}</small>
                                    </div>
                                </li>
                            )}
                            renderInput={(params) => <TextField {...params} size="small" autoFocus label="Agregar producto" placeholder="Buscar por producto, categoría o línea..." helperText="Escribe para buscar y selecciona un resultado para agregarlo. Hasta 30 coincidencias." />}
                        />
                    </div>
                </div>
                {!available.length && <div className="alert alert-warning">No hay productos disponibles con precio. Actualiza el catálogo para registrar ventas.</div>}
                {items.length > 0 ? <div className="table-responsive sale-items"><table className="table align-middle"><thead><tr><th>Producto</th><th>Vender por</th><th>Valor<RequiredMark /></th><th className="text-end">Importe</th><th><span className="visually-hidden">Acciones</span></th></tr></thead>{groupedItems.map((group) => <tbody key={group.id}>
                    <tr className="sale-group-heading"><th colSpan={5} scope="rowgroup" style={getBadgeStyle(group.colorId) || { backgroundColor: "#f1f3f5", color: "#6c757d" }}>{group.name}</th></tr>
                    {group.items.map((item) => <tr key={item.productId}>
                    <td>{item.name}<small className="d-block text-muted">{money(item.price)} / {item.unit}</small></td>
                    <td>
                        <div className="d-flex flex-nowrap align-items-center gap-3" role="group" aria-label={`Modo de venta de ${item.name}`}>
                            {[{ value: "quantity", label: "Por cantidad" }, { value: "amount", label: "Por monto" }].map((mode) => (
                                <label key={mode.value} className="sale-entry-checkbox d-flex">
                                    <input type="radio" name={`sale-mode-${item.productId}`} className="form-check-input" aria-label={`${mode.label}: ${item.name}`} checked={(item.entryMode || "quantity") === mode.value} disabled={mode.value === "amount" && item.price <= 0} onChange={() => setItems(items.map((entry) => entry.productId === item.productId ? { ...entry, entryMode: mode.value, requestedAmount: item.amount, quantity: Number(item.quantity.toFixed(3)) } : entry))} />
                                    <span>{mode.label}</span>
                                </label>
                            ))}
                        </div>
                    </td>
                    <td>
                        <div className="input-group flex-nowrap" style={{ width: "max-content" }}>
                            <input id={`sale-value-${item.productId}`} data-inline-error="true" aria-label={item.entryMode === "amount" ? `Monto de ${item.name} en pesos` : `Cantidad de ${item.name} en ${item.unit}`} style={{ width: "calc(5ch + 2.5rem)", flex: "0 0 auto" }} className="form-control" required aria-required="true" type="number" min="0" data-positive="true" step="any" value={item.entryMode === "amount" ? item.requestedAmount : items.find((entry) => entry.productId === item.productId).quantity} onChange={(e) => setItems(items.map((entry) => entry.productId === item.productId ? { ...entry, [item.entryMode === "amount" ? "requestedAmount" : "quantity"]: e.target.value } : entry))} />
                            <span className="input-group-text">{item.entryMode === "amount" ? "MXN" : item.unit}</span>
                        </div>
                        <FieldError id={`sale-value-${item.productId}`} />
                        {item.entryMode === "amount" && <small className="d-block text-muted">≈ {Number(item.quantity.toFixed(3))} {item.unit}</small>}
                    </td>
                    <td className="text-nowrap text-end">
                        {money(item.amount)}
                        {item.discountRate > 0 && <small className="sale-wholesale" title={`Importe original: ${money(item.subtotal)}. Descuento: ${money(item.discount)}`}>Mayoreo −15%</small>}
                    </td>
                    <td><button type="button" className="sale-remove" aria-label={`Quitar ${item.name}`} title="Quitar producto" onClick={() => setItems(items.filter((entry) => entry.productId !== item.productId))}><FontAwesomeIcon icon={faTrashCan} /></button></td>
                </tr>)}</tbody>)}</table></div> : <div className="sale-empty"><FontAwesomeIcon icon={faCartShopping} /><strong>Tu venta empieza aquí</strong><p>Busca un producto para agregarlo y calcular el total.</p></div>}
                </section>
                <details className="sale-notes">
                    <summary>Notas (opcional)</summary>
                    <div><label htmlFor="saleNotes" className="form-label">Notas <span className="text-muted fw-normal">(opcional)</span></label><textarea id="saleNotes" className="form-control" placeholder="Agrega una observación sobre esta venta…" rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
                </details>
                {error && <div className="alert alert-danger" role="alert">{error}</div>}
            </DialogContent>
            <DialogActions className="sale-modal-actions"><div className="sale-footer-total"><span>Total</span><strong>{money(total)}</strong></div><Button onClick={onClose} color="inherit">Cancelar</Button><Button type="submit" variant="contained" disableElevation disabled={!items.length}>Registrar venta</Button></DialogActions>
        </ValidatedForm>
    </Dialog>;
}
