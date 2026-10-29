import MoreOptions from './MoreOptions';
import FormLabel from "./FormLabel";
import ValidatedForm from "./ValidatedForm";
import ModalHeader from "./ModalHeader";
import { Dialog } from "@mui/material";
import { useState } from "react";
import { UNITS, normalizeUnit } from "../utils/units.js";

function ProductFormModal({
    show, product, categories, productLines, priceGroups, onClose, onSave,
}) {
    const [active, setActive] = useState(product?.active ?? true);
    const [available, setAvailable] = useState(product?.available ?? true);
    const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
    const [error, setError] = useState("");
    const [lineId, setLineId] = useState(product?.lineId ?? "");
    const [name, setName] = useState(product?.name ?? "");
    const [price, setPrice] = useState(product?.priceGroupId != null ? "" : product?.price ?? "");
    const [priceGroupId, setPriceGroupId] = useState(product?.priceGroupId ?? "");
    const [priceType, setPriceType] = useState(product?.priceGroupId != null ? "group" : product?.price != null ? "individual" : "none");
    const [unit, setUnit] = useState(normalizeUnit(product?.unit) || product?.unit || "litro");

    const isEditing = Boolean(product);


    const availableCategories = [...categories]
        .filter((category) => category.active || category.id === product?.categoryId)
        .sort((a, b) => a.name.localeCompare(b.name, "es"));

    const availableLines = [...productLines]
        .filter((line) =>
            line.categoryId === Number(categoryId) &&
            (line.active || line.id === product?.lineId)
        )
        .sort((a, b) => a.name.localeCompare(b.name, "es"));

    const availablePriceGroups = [...priceGroups]
        .filter((group) => group.active || group.id === product?.priceGroupId)
        .sort((a, b) => a.name.localeCompare(b.name, "es"));

    const selectedPriceGroup = priceGroups.find(
        (group) => group.id === Number(priceGroupId)
    );

    function handleCategoryChange(event) {
        setCategoryId(event.target.value);
        setLineId("");
    }

    function handlePriceTypeChange(event) {
        const value = event.target.value;

        setPriceType(value);

        if (value !== "group") setPriceGroupId("");
        if (value !== "individual") setPrice("");
    }

    async function handleSubmit(event) {
        event.preventDefault();
        setError("");

        if (!name.trim()) {
            setError("Escribe el nombre del producto.");
            return;
        }

        if (priceType === "group" && !priceGroupId) {
            setError("Selecciona un grupo de precio.");
            return;
        }

        if (
            priceType === "individual" &&
            (price === "" || !Number.isFinite(Number(price)) || Number(price) < 0)
        ) {
            setError("Escribe un precio válido.");
            return;
        }

        let productData = {
            active,
            available,
            name: name.trim(),
            unit,
        };

        {
            productData = {
                ...productData,
                categoryId: categoryId ? Number(categoryId) : null,
                lineId: categoryId && lineId ? Number(lineId) : null,
                priceGroupId: priceType === "group" ? Number(priceGroupId) : null,
                price: priceType === "individual" ? Number(price) : null,
            };
        }

        const result = await onSave(productData);

        if (!result.ok) {
            setError(result.message);
            return;
        }

        onClose();
    }

    if (!show) return null;

    return (
        <Dialog className="app-dialog" open={show} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="ProductFormModal-title">
                    <div className="modal-content">
                        <ValidatedForm onSubmit={handleSubmit}>
                            <ModalHeader titleId="ProductFormModal-title" title={isEditing ? "Editar producto" : "Nuevo producto"} onClose={onClose} />

                            <div className="modal-body">
                                <h3 className="h6 mb-3">Información principal</h3>
                                <div className="product-primary-grid">
                                <div className="mb-3">
                                    <FormLabel required className="form-label" htmlFor="productName">
                                        Nombre
                                    </FormLabel>

                                    <input
                                        id="productName" required aria-required="true"
                                        type="text"
                                        className="form-control"
                                        value={name}
                                        onChange={(event) => setName(event.target.value)}
                                        placeholder="Ej. Brisa"
                                        autoFocus
                                    />
                                </div>
                                <div className="mb-3">
                                    <FormLabel required className="form-label" htmlFor="productUnit">
                                        Unidad
                                    </FormLabel>

                                    <select
                                        id="productUnit" required aria-required="true"
                                        className="form-select"
                                        value={unit}
                                        onChange={(event) => setUnit(event.target.value)}
                                    >
                                        {!normalizeUnit(unit) && <option value={unit}>{unit}</option>}
                                        {UNITS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
                                    </select>
                                </div>
                                </div>
                                {(
                                    <>
                                        <div className="mb-3">
                                            <label className="form-label" htmlFor="productCategory">
                                                Categoría
                                            </label>

                                            <select
                                                id="productCategory"
                                                className="form-select"
                                                value={categoryId}
                                                onChange={handleCategoryChange}
                                            >
                                                <option value="">Sin categoría</option>

                                                {availableCategories.map((category) => (
                                                    <option key={category.id} value={category.id}>
                                                        {category.name}
                                                        {!category.active ? " (Inactiva)" : ""}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {(availableLines.length > 0 || lineId) && <div className="mb-3">
                                            <label className="form-label" htmlFor="productLine">
                                                Línea de producto
                                            </label>

                                            <select
                                                id="productLine"
                                                className="form-select"
                                                value={lineId}
                                                onChange={(event) => setLineId(event.target.value)}
                                                disabled={!categoryId}
                                            >
                                                <option value="">Sin línea</option>

                                                {availableLines.map((line) => (
                                                    <option key={line.id} value={line.id}>
                                                        {line.name}
                                                        {!line.active ? " (Inactiva)" : ""}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>}
                                    </>
                                )}

                                <MoreOptions label="Estado y disponibilidad" hasValue={!active || !available}><div className="product-state-grid">
                                <div className="form-check form-switch">
                                    <input
                                        id="productActive"
                                        type="checkbox"
                                        className="form-check-input"
                                        checked={active}
                                        onChange={(event) => setActive(event.target.checked)}
                                    />

                                    <label className="form-check-label" htmlFor="productActive">
                                        Producto activo
                                    </label>
                                </div>

                                <div className="form-check form-switch">
                                    <input
                                        id="productAvailable"
                                        type="checkbox"
                                        className="form-check-input"
                                        checked={available}
                                        onChange={(event) => setAvailable(event.target.checked)}
                                    />

                                    <label className="form-check-label" htmlFor="productAvailable">
                                        Producto disponible
                                    </label>
                                </div>

                                </div></MoreOptions>
                                {(
                                    <>
                                        <hr className="my-4" />

                                        <h6 className="mb-3">Precio</h6>

                                        <div className="mb-3">
                                            <label className="form-label" htmlFor="productPriceType">
                                                Tipo de precio
                                            </label>

                                            <select
                                                id="productPriceType"
                                                className="form-select"
                                                value={priceType}
                                                onChange={handlePriceTypeChange}
                                            >
                                                <option value="none">Sin precio</option>
                                                <option value="group">Grupo de precio</option>
                                                <option value="individual">Precio individual</option>
                                            </select>
                                        </div>

                                        {priceType === "group" && (
                                            <div className="mb-3">
                                                <FormLabel required className="form-label" htmlFor="productPriceGroup">
                                                    Grupo de precio
                                                </FormLabel>

                                                <select
                                                    id="productPriceGroup" required aria-required="true"
                                                    className="form-select"
                                                    value={priceGroupId}
                                                    onChange={(event) => setPriceGroupId(event.target.value)}
                                                >
                                                    <option value="">Selecciona un grupo</option>

                                                    {availablePriceGroups.map((group) => (
                                                        <option key={group.id} value={group.id}>
                                                            {group.name} - ${Number(group.price).toFixed(2)}
                                                            {!group.active ? " (Inactivo)" : ""}
                                                        </option>
                                                    ))}
                                                </select>

                                                {selectedPriceGroup && (
                                                    <div className="alert alert-light border mt-3 mb-0">
                                                        Precio aplicado:{" "}
                                                        <strong>${Number(selectedPriceGroup.price).toFixed(2)}</strong>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {priceType === "individual" && (
                                            <div className="mb-3">
                                                <FormLabel required className="form-label" htmlFor="productPrice">
                                                    Precio individual
                                                </FormLabel>

                                                <div className="input-group">
                                                    <span className="input-group-text">$</span>

                                                    <input
                                                        id="productPrice" required aria-required="true"
                                                        type="number"
                                                        className="form-control"
                                                        min="0"
                                                        step="0.01"
                                                        value={price}
                                                        onChange={(event) => setPrice(event.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {priceType === "none" && (
                                            <div className="alert alert-warning mb-0">
                                                Este producto quedará sin precio asignado.
                                            </div>
                                        )}
                                    </>
                                )}

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

                                <button type="submit" className="btn btn-primary">
                                    {isEditing ? "Guardar cambios" : "Agregar producto"}
                                </button>
                            </div>
                        </ValidatedForm>
                    </div>
                </Dialog>
    );
}

export default ProductFormModal;
