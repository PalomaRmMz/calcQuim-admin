import FormLabel from "./FormLabel";
import ValidatedForm from "./ValidatedForm";
import ModalHeader from "./ModalHeader";
import { Dialog } from "@mui/material";
import { useMemo, useState } from "react";
import {
    getProductDisplayName,
    getProductDisplayPrefix,
    normalizeText,
    productNameHasDisplayPrefix,
    stripProductDisplayPrefix,
} from "../utils/catalogUtils.js";
import { UNITS } from "../utils/units.js";
import "../styles/components/BatchAddProductsModal.css";

function createRow(name = "", price = "") {
    const id = globalThis.crypto?.randomUUID?.() ?? `row-${Date.now()}-${Math.random()}`;
    return { id, name, price };
}

function BatchAddProductsModal({
    show,
    products,
    categories,
    productLines,
    priceGroups,
    onClose,
    onSave,
}) {
    const [categoryId, setCategoryId] = useState("");
    const [lineId, setLineId] = useState("");
    const [unit, setUnit] = useState("litro");
    const [priceMode, setPriceMode] = useState("none");
    const [priceGroupId, setPriceGroupId] = useState("");
    const [commonPrice, setCommonPrice] = useState("");
    const [active, setActive] = useState(true);
    const [available, setAvailable] = useState(true);
    const [rows, setRows] = useState(() => [createRow()]);
    const [pasteText, setPasteText] = useState("");
    const [error, setError] = useState("");

    const activeCategories = useMemo(
        () => [...categories]
            .filter((category) => category.active)
            .sort((a, b) => a.name.localeCompare(b.name, "es")),
        [categories]
    );

    const activeLines = useMemo(() => {
        if (!categoryId) return [];
        const selectedCategoryId = Number(categoryId);

        return [...productLines]
            .filter((line) => line.active && line.categoryId === selectedCategoryId)
            .sort((a, b) => a.name.localeCompare(b.name, "es"));
    }, [categoryId, productLines]);

    const activePriceGroups = useMemo(
        () => [...priceGroups]
            .filter((group) => group.active)
            .sort((a, b) => a.name.localeCompare(b.name, "es")),
        [priceGroups]
    );

    const selectedPriceGroup = priceGroupId
        ? priceGroups.find((group) => group.id === Number(priceGroupId))
        : null;

    const selectedCategoryId = categoryId ? Number(categoryId) : null;
    const selectedLineId = categoryId && lineId ? Number(lineId) : null;
    const selectedCategory = selectedCategoryId
        ? categories.find((category) => category.id === selectedCategoryId)
        : null;

    const classificationTemplate = {
        categoryId: selectedCategoryId,
        lineId: selectedLineId,
        name: "",
    };

    const visiblePrefix = getProductDisplayPrefix(
        classificationTemplate,
        categories,
        productLines
    );

    const rowAnalysis = useMemo(() => {
        const existingKeys = new Set(products.map((product) =>
            `${product.categoryId ?? "null"}|${product.lineId ?? "null"}|${normalizeText(product.name)}`
        ));
        const seen = new Set();

        return rows.map((row) => {
            const name = row.name.trim();
            const productDraft = {
                name,
                categoryId: selectedCategoryId,
                lineId: selectedLineId,
            };
            const displayName = getProductDisplayName(productDraft, categories, productLines);
            const hasRepeatedPrefix = Boolean(name) && productNameHasDisplayPrefix(
                name,
                productDraft,
                categories,
                productLines
            );

            if (!name) {
                return {
                    ...row,
                    displayName: "",
                    hasRepeatedPrefix: false,
                    status: "empty",
                    statusText: "Pendiente",
                };
            }

            const key = `${selectedCategoryId ?? "null"}|${selectedLineId ?? "null"}|${normalizeText(name)}`;

            if (existingKeys.has(key)) {
                return {
                    ...row,
                    displayName,
                    hasRepeatedPrefix,
                    status: "existing",
                    statusText: "Ya existe",
                };
            }

            if (seen.has(key)) {
                return {
                    ...row,
                    displayName,
                    hasRepeatedPrefix,
                    status: "repeated",
                    statusText: "Repetido en lote",
                };
            }

            seen.add(key);

            return {
                ...row,
                displayName,
                hasRepeatedPrefix,
                status: "new",
                statusText: "Nuevo",
            };
        });
    }, [products, rows, selectedCategoryId, selectedLineId, categories, productLines]);

    const counts = useMemo(() => ({
        captured: rowAnalysis.filter((row) => row.status !== "empty").length,
        newItems: rowAnalysis.filter((row) => row.status === "new").length,
        duplicates: rowAnalysis.filter((row) => ["existing", "repeated"].includes(row.status)).length,
        prefixed: rowAnalysis.filter((row) => row.hasRepeatedPrefix).length,
    }), [rowAnalysis]);

    function handleCategoryChange(event) {
        setCategoryId(event.target.value);
        setLineId("");
    }

    function handlePriceModeChange(event) {
        const value = event.target.value;
        setPriceMode(value);
        setPriceGroupId("");
        setCommonPrice("");
    }

    function updateRow(rowId, changes) {
        setRows((currentRows) => currentRows.map((row) =>
            row.id === rowId ? { ...row, ...changes } : row
        ));
    }

    function removeRow(rowId) {
        setRows((currentRows) => {
            const nextRows = currentRows.filter((row) => row.id !== rowId);
            return nextRows.length ? nextRows : [createRow()];
        });
    }

    function addRow() {
        setRows((currentRows) => [...currentRows, createRow()]);
    }

    function addPastedProducts() {
        setError("");

        const names = pasteText
            .split(/\r?\n/)
            .map((name) => name.trim())
            .filter(Boolean);

        if (!names.length) {
            setError("Pega al menos un nombre de producto, uno por línea.");
            return;
        }

        setRows((currentRows) => {
            const meaningfulRows = currentRows.filter((row) => row.name.trim() || row.price !== "");
            return [...meaningfulRows, ...names.map((name) => createRow(name))];
        });
        setPasteText("");
    }

    function removeDetectedPrefixes() {
        setRows((currentRows) => currentRows.map((row) => {
            if (!row.name.trim()) return row;

            const productDraft = {
                name: row.name,
                categoryId: selectedCategoryId,
                lineId: selectedLineId,
            };

            return {
                ...row,
                name: stripProductDisplayPrefix(
                    row.name,
                    productDraft,
                    categories,
                    productLines
                ),
            };
        }));
    }

    async function handleSubmit(event) {
        event.preventDefault();
        setError("");

        if (!selectedCategoryId) {
            setError("Selecciona una categoría. Todos los productos del lote deben quedar clasificados.");
            return;
        }

        if (!counts.newItems) {
            setError("No hay productos nuevos para crear. Revisa los duplicados o agrega más productos.");
            return;
        }

        if (counts.prefixed > 0) {
            setError(
                `Hay ${counts.prefixed} producto${counts.prefixed === 1 ? "" : "s"} cuyo nombre ya incluye el prefijo visible "${visiblePrefix}". Quítalo antes de guardar para evitar nombres repetidos.`
            );
            return;
        }

        if (priceMode === "group" && !priceGroupId) {
            setError("Selecciona un grupo de precio.");
            return;
        }

        if (
            priceMode === "individual-common" &&
            (commonPrice === "" || !Number.isFinite(Number(commonPrice)) || Number(commonPrice) < 0)
        ) {
            setError("Escribe un precio común válido.");
            return;
        }

        const rowsToCreate = rowAnalysis
            .filter((row) => row.status === "new")
            .map((row) => ({ name: row.name.trim(), price: row.price }));

        if (priceMode === "individual-row") {
            const invalidPrice = rowsToCreate.find((row) =>
                row.price !== "" && (!Number.isFinite(Number(row.price)) || Number(row.price) < 0)
            );

            if (invalidPrice) {
                setError(`El precio de "${invalidPrice.name}" no es válido.`);
                return;
            }
        }

        const result = await onSave({
            items: rowsToCreate,
            categoryId: selectedCategoryId,
            lineId: selectedLineId,
            unit,
            active,
            available,
            priceMode,
            priceGroupId: priceMode === "group" ? Number(priceGroupId) : null,
            commonPrice: priceMode === "individual-common" ? Number(commonPrice) : null,
        });

        if (!result.ok) {
            setError(result.message);
            return;
        }

        onClose();
    }

    if (!show) return null;

    return (
        <Dialog
            className="app-dialog"
            open={show}
            onClose={onClose}
            fullWidth
            maxWidth="lg"
            aria-labelledby="BatchAddProductsModal-title"
        >
            <div className="modal-content">
                <ValidatedForm onSubmit={handleSubmit}>
                    <ModalHeader
                        titleId="BatchAddProductsModal-title"
                        title="Agregar productos por lote"
                        subtitle="Define la clasificación y los datos comunes; después captura o pega varios nombres."
                        onClose={onClose}
                    />

                    <div className="modal-body batch-add-products-modal">
                        <section className="batch-add-section">
                            <div className="mb-3">
                                <h6 className="mb-1">Datos comunes</h6>
                                <p className="form-text mb-0">
                                    La categoría es obligatoria. Si eliges una línea, esa línea será el prefijo visible del producto.
                                </p>
                            </div>

                            <div className="row g-3">
                                <div className="col-12 col-md-6 col-xl-3">
                                    <FormLabel required htmlFor="batchAddCategory">Categoría</FormLabel>
                                    <select id="batchAddCategory" required aria-required="true" className="form-select" value={categoryId} onChange={handleCategoryChange}>
                                        <option value="">Selecciona una categoría</option>
                                        {activeCategories.map((category) => (
                                            <option key={category.id} value={category.id}>{category.name}</option>
                                        ))}
                                    </select>

                                    {selectedCategory && !selectedLineId && (
                                        <div className="form-text">
                                            {selectedCategory.useAsProductPrefix
                                                ? `Sin línea, se mostrará "${selectedCategory.name}" como prefijo.`
                                                : "Sin línea, se mostrará solo el nombre capturado."}
                                        </div>
                                    )}
                                </div>

                                <div className="col-12 col-md-6 col-xl-3">
                                    <label className="form-label" htmlFor="batchAddLine">Línea</label>
                                    <select
                                        id="batchAddLine"
                                        className="form-select"
                                        value={lineId}
                                        onChange={(event) => setLineId(event.target.value)}
                                        disabled={!categoryId}
                                    >
                                        <option value="">Sin línea</option>
                                        {activeLines.map((line) => (
                                            <option key={line.id} value={line.id}>{line.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="col-12 col-md-6 col-xl-3">
                                    <FormLabel required className="form-label" htmlFor="batchAddUnit">Unidad</FormLabel>
                                    <select id="batchAddUnit" required aria-required="true" className="form-select" value={unit} onChange={(event) => setUnit(event.target.value)}>
                                        {UNITS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                                    </select>
                                </div>

                                <div className="col-12 col-md-6 col-xl-3">
                                    <label className="form-label" htmlFor="batchAddPriceMode">Precio</label>
                                    <select id="batchAddPriceMode" className="form-select" value={priceMode} onChange={handlePriceModeChange}>
                                        <option value="none">Sin precio</option>
                                        <option value="group" disabled={activePriceGroups.length === 0}>Grupo de precio</option>
                                        <option value="individual-common">Mismo precio individual para todos</option>
                                        <option value="individual-row">Precio individual por producto</option>
                                    </select>
                                </div>

                                {priceMode === "group" && (
                                    <div className="col-12 col-md-6">
                                        <FormLabel required className="form-label" htmlFor="batchAddPriceGroup">Grupo de precio</FormLabel>
                                        <select
                                            id="batchAddPriceGroup" required aria-required="true"
                                            className="form-select"
                                            value={priceGroupId}
                                            onChange={(event) => setPriceGroupId(event.target.value)}
                                        >
                                            <option value="">Selecciona un grupo</option>
                                            {activePriceGroups.map((group) => (
                                                <option key={group.id} value={group.id}>
                                                    {group.name} - ${Number(group.price).toFixed(2)}
                                                </option>
                                            ))}
                                        </select>

                                        {selectedPriceGroup && (
                                            <div className="form-text">
                                                Los productos quedarán vinculados al grupo; si cambia el precio del grupo, se actualizarán con él.
                                            </div>
                                        )}
                                    </div>
                                )}

                                {priceMode === "individual-common" && (
                                    <div className="col-12 col-md-6">
                                        <FormLabel required className="form-label" htmlFor="batchAddCommonPrice">Precio individual común</FormLabel>
                                        <div className="input-group">
                                            <span className="input-group-text">$</span>
                                            <input
                                                id="batchAddCommonPrice" required aria-required="true"
                                                type="number"
                                                className="form-control"
                                                min="0"
                                                step="0.01"
                                                value={commonPrice}
                                                onChange={(event) => setCommonPrice(event.target.value)}
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="col-12 col-md-6 d-flex flex-column justify-content-end gap-2">
                                    <p id="batchAddStateLabel" className="batch-add-state-title">Estado y disponibilidad <span>Todo el lote</span></p>
                                    <div className="batch-add-state-options" role="group" aria-labelledby="batchAddStateLabel">
                                    <div className="form-check form-switch batch-add-state-option">
                                        <input
                                            id="batchAddActive"
                                            className="form-check-input"
                                            type="checkbox"
                                            checked={active}
                                            onChange={(event) => setActive(event.target.checked)}
                                        />
                                        <label className="form-check-label" htmlFor="batchAddActive">Productos activos</label>
                                    </div>

                                    <div className="form-check form-switch batch-add-state-option">
                                        <input
                                            id="batchAddAvailable"
                                            className="form-check-input"
                                            type="checkbox"
                                            checked={available}
                                            onChange={(event) => setAvailable(event.target.checked)}
                                        />
                                        <label className="form-check-label" htmlFor="batchAddAvailable">Productos disponibles</label>
                                    </div>
                                    </div>

                                </div>
                            </div>
                        </section>

                        <section className="batch-add-section mt-3">
                            <div className="row g-3 align-items-end">
                                <div className="col-12 col-lg-9">
                                    <label className="form-label" htmlFor="batchAddPaste">Pegar varios nombres</label>
                                    <textarea
                                        id="batchAddPaste"
                                        className="form-control batch-add-paste"
                                        value={pasteText}
                                        onChange={(event) => setPasteText(event.target.value)}
                                        placeholder={"Ej.\nAzul\nPrimavera\nBebé"}
                                    />
                                    <div className="form-text">
                                        Puedes copiar una columna desde Excel, WhatsApp o un bloc de notas. Usa un producto por línea.
                                    </div>
                                </div>

                                <div className="col-12 col-lg-3 d-grid">
                                    <button type="button" className="btn btn-outline-secondary" onClick={addPastedProducts}>
                                        Convertir en filas
                                    </button>
                                </div>
                            </div>
                        </section>

                        <section className="batch-add-section mt-3">
                            <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
                                <div>
                                    <h6 className="mb-1">Productos del lote</h6>
                                    <p className="form-text mb-0">
                                        Captura solo el nombre específico. La vista previa muestra cómo se verá con línea o categoría-prefijo.
                                    </p>
                                </div>

                                <div className="d-flex flex-wrap gap-2">
                                    {counts.prefixed > 0 && (
                                        <button type="button" className="btn btn-sm btn-outline-warning" onClick={removeDetectedPrefixes}>
                                            Quitar prefijos detectados ({counts.prefixed})
                                        </button>
                                    )}

                                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={addRow}>
                                        + Agregar fila
                                    </button>
                                </div>
                            </div>

                            {counts.prefixed > 0 && (
                                <div className="alert alert-warning">
                                    {counts.prefixed === 1 ? "Hay 1 nombre" : `Hay ${counts.prefixed} nombres`} que ya incluye
                                    {" "}<strong>{visiblePrefix}</strong>. Si lo guardas así, el prefijo se repetiría al mostrar el producto.
                                </div>
                            )}

                            <div className="batch-add-table-wrap border rounded">
                                <table className="table table-sm mb-0 batch-add-table">
                                    <thead>
                                        <tr>
                                            <th>Nombre almacenado</th>
                                            <th>Vista previa</th>
                                            {priceMode === "individual-row" && <th className="batch-add-price-column">Precio</th>}
                                            <th className="batch-add-status-column">Estado</th>
                                            <th className="batch-add-remove-column"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rowAnalysis.map((row) => (
                                            <tr key={row.id}>
                                                <td>
                                                    <input
                                                        type="text"
                                                        aria-label={`Nombre de producto, fila ${rowAnalysis.indexOf(row) + 1}`}
                                                        className={`form-control ${row.hasRepeatedPrefix ? "is-warning" : ""}`}
                                                        value={row.name}
                                                        onChange={(event) => updateRow(row.id, { name: event.target.value })}
                                                        placeholder="Ej. Limón"
                                                    />
                                                </td>

                                                <td>
                                                    {row.displayName
                                                        ? <span className="batch-add-preview">{row.displayName}</span>
                                                        : <span className="text-muted">—</span>}
                                                </td>

                                                {priceMode === "individual-row" && (
                                                    <td>
                                                        <div className="input-group input-group-sm">
                                                            <span className="input-group-text">$</span>
                                                            <input
                                                                type="number"
                                                                className="form-control"
                                                                min="0"
                                                                step="0.01"
                                                                aria-label={`Precio de ${row.name || "producto"} (opcional)`}
                                                                value={row.price}
                                                                onChange={(event) => updateRow(row.id, { price: event.target.value })}
                                                                placeholder="Opcional"
                                                            />
                                                        </div>
                                                    </td>
                                                )}

                                                <td>
                                                    <span className={`batch-add-status batch-add-status--${row.status}`}>
                                                        {row.statusText}
                                                    </span>
                                                    {row.hasRepeatedPrefix && (
                                                        <div className="batch-add-prefix-note">Prefijo repetido</div>
                                                    )}
                                                </td>

                                                <td>
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-light batch-add-remove"
                                                        aria-label={`Quitar ${row.name || "fila"}`}
                                                        onClick={() => removeRow(row.id)}
                                                    >
                                                        ×
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="batch-add-summary mt-3">
                                <span><strong>{counts.captured}</strong> capturados</span>
                                <span><strong>{counts.newItems}</strong> nuevos</span>
                                <span><strong>{counts.duplicates}</strong> duplicados</span>
                                {counts.prefixed > 0 && <span><strong>{counts.prefixed}</strong> con prefijo repetido</span>}
                            </div>
                        </section>

                        {error && (
                            <div className="alert alert-danger mt-3 mb-0" role="alert">
                                {error}
                            </div>
                        )}
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-light" onClick={onClose}>
                            Cancelar
                        </button>

                        <button type="submit" className="btn btn-primary" disabled={!counts.newItems}>
                            {counts.newItems
                                ? `Crear ${counts.newItems} producto${counts.newItems === 1 ? "" : "s"}`
                                : "Crear productos"}
                        </button>
                    </div>
                </ValidatedForm>
            </div>
        </Dialog>
    );
}

export default BatchAddProductsModal;
