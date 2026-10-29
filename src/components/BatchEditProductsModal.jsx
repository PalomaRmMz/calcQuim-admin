import FormLabel from "./FormLabel";
import ValidatedForm from "./ValidatedForm";
import ModalHeader from "./ModalHeader";
import { Dialog } from "@mui/material";
import { useMemo, useState } from "react";
import { getProductChoiceLabel, normalizeText } from "../utils/catalogUtils";
import "../styles/components/BatchEditProductsModal.css";

function BatchEditProductsModal({
    show, products, categories, productLines, priceGroups, onClose, onSave,
}) {
    const [selectedProducts, setSelectedProducts] = useState([]);
    const [search, setSearch] = useState("");
    const [editCategory, setEditCategory] = useState(false);
    const [categoryId, setCategoryId] = useState("");
    const [editLine, setEditLine] = useState(false);
    const [requestedLineId, setLineId] = useState("");
    const [editPrice, setEditPrice] = useState(false);
    const [priceType, setPriceType] = useState(priceGroups.some((group) => group.active) ? "group" : "individual");
    const [priceGroupId, setPriceGroupId] = useState("");
    const [price, setPrice] = useState("");
    const [editStatus, setEditStatus] = useState(false);
    const [active, setActive] = useState(true);
    const [error, setError] = useState("");

    const activeCategories = useMemo(
        () => [...categories]
            .filter((category) => category.active)
            .sort((a, b) => a.name.localeCompare(b.name, "es")),
        [categories]
    );

    const activePriceGroups = useMemo(
        () => [...priceGroups]
            .filter((group) => group.active)
            .sort((a, b) => a.name.localeCompare(b.name, "es")),
        [priceGroups]
    );


    /* HELPERS */

    function getProductName(product) {
        return getProductChoiceLabel(product, products, categories, productLines);
    }


    /* PRODUCTOS */

    const sortedProducts = [...products].sort((a, b) => getProductName(a).localeCompare(getProductName(b), "es"));

    const filteredProducts = sortedProducts.filter((product) =>
        normalizeText(getProductName(product)).includes(normalizeText(search))
    );

    const selectedProductObjects = products.filter((product) =>
        selectedProducts.includes(product.id)
    );

    const selectedCategoryIds = [
        ...new Set(selectedProductObjects.map((product) => product.categoryId)),
    ];


    /* CATEGORÍA OBJETIVO PARA LÍNEAS */

    let targetCategoryId = null;

    if (editCategory && categoryId) {
        targetCategoryId = Number(categoryId);
    } else if (selectedCategoryIds.length === 1) {
        targetCategoryId = selectedCategoryIds[0];
    }

    const availableLines = targetCategoryId
        ? [...productLines]
            .filter((line) => line.categoryId === targetCategoryId && line.active)
            .sort((a, b) => a.name.localeCompare(b.name, "es"))
        : [];


    /* LIMPIAR LÍNEA INCOMPATIBLE */

    const lineId = requestedLineId === "none" || availableLines.some((line) => line.id === Number(requestedLineId)) ? requestedLineId : "";


    /* SELECCIÓN */

    const allVisibleSelected =
        filteredProducts.length > 0 &&
        filteredProducts.every((product) => selectedProducts.includes(product.id));

    function handleProductChange(productId) {
        setSelectedProducts((currentProducts) =>
            currentProducts.includes(productId)
                ? currentProducts.filter((id) => id !== productId)
                : [...currentProducts, productId]
        );
    }

    function handleSelectVisible() {
        const visibleIds = filteredProducts.map((product) => product.id);

        if (allVisibleSelected) {
            setSelectedProducts((currentProducts) =>
                currentProducts.filter((id) => !visibleIds.includes(id))
            );
            return;
        }

        setSelectedProducts((currentProducts) => [
            ...new Set([...currentProducts, ...visibleIds]),
        ]);
    }


    /* CAMBIOS */

    function handleEditCategoryChange(event) {
        const checked = event.target.checked;

        setEditCategory(checked);
        setCategoryId("");
        setLineId("");
    }

    function handleCategoryChange(event) {
        setCategoryId(event.target.value);
        setLineId("");
    }

    function handleEditLineChange(event) {
        setEditLine(event.target.checked);
        setLineId("");
    }

    function handlePriceTypeChange(event) {
        setPriceType(event.target.value);
        setPriceGroupId("");
        setPrice("");
    }


    /* GUARDAR */

    async function handleSubmit(event) {
        event.preventDefault();
        setError("");

        if (selectedProducts.length === 0) {
            setError("Selecciona al menos un producto.");
            return;
        }

        if (!editCategory && !editLine && !editPrice && !editStatus) {
            setError("Selecciona al menos un dato para modificar.");
            return;
        }

        if (editCategory && !categoryId) {
            setError("Selecciona una categoría.");
            return;
        }

        if (editLine && !lineId) {
            setError("Selecciona una línea o la opción Sin línea.");
            return;
        }

        if (editLine && lineId !== "none" && !targetCategoryId) {
            setError(
                "Los productos pertenecen a distintas categorías. Selecciona también una categoría antes de asignar una línea."
            );
            return;
        }

        if (editPrice && priceType === "group" && !priceGroupId) {
            setError("Selecciona un grupo de precio.");
            return;
        }

        if (
            editPrice &&
            priceType === "individual" &&
            (price === "" || !Number.isFinite(Number(price)) || Number(price) < 0)
        ) {
            setError("Escribe un precio válido.");
            return;
        }

        const changes = {};

        if (editCategory) changes.categoryId = Number(categoryId);

        if (editLine) {
            changes.lineId = lineId === "none" ? null : Number(lineId);
        }

        if (editPrice) {
            changes.priceType = priceType;

            if (priceType === "group") changes.priceGroupId = Number(priceGroupId);
            if (priceType === "individual") changes.price = Number(price);
        }

        if (editStatus) changes.active = active;

        const result = await onSave({
            productIds: selectedProducts,
            changes,
        });

        if (!result.ok) {
            setError(result.message);
            return;
        }

        onClose();
    }

    if (!show) return null;


    return (
        <Dialog className="app-dialog" open={show} onClose={onClose} fullWidth maxWidth="lg" aria-labelledby="BatchEditProductsModal-title">
                    <div className="modal-content">
                        <ValidatedForm onSubmit={handleSubmit}>
                            <ModalHeader titleId="BatchEditProductsModal-title" title={'Editar productos por lote'} onClose={onClose} />

                            <div className="modal-body">
                                <div className="row g-4">

                                    {/* PRODUCTOS */}

                                    <div className="col-12 col-lg-6">
                                        <h6 className="mb-3">Productos</h6>

                                        <div className="mb-3">
                                            <label htmlFor="batchEditSearch" className="form-label">Buscar productos</label>
                                            <input id="batchEditSearch"
                                                type="text"
                                                className="form-control"
                                                value={search}
                                                onChange={(event) => setSearch(event.target.value)}
                                                placeholder="Buscar productos..."
                                            />
                                        </div>

                                        <div className="d-flex justify-content-between align-items-center mb-2">
                                            <span>
                                                <strong>{selectedProducts.length}</strong> seleccionados
                                            </span>

                                            <button
                                                type="button"
                                                className="btn btn-sm btn-light"
                                                onClick={handleSelectVisible}
                                                disabled={filteredProducts.length === 0}
                                            >
                                                {allVisibleSelected ? "Quitar visibles" : "Seleccionar visibles"}
                                            </button>
                                        </div>

                                        <div className="batch-products-list border rounded p-2">
                                            {filteredProducts.length === 0 ? (
                                                <div className="text-muted text-center py-4">
                                                    No se encontraron productos.
                                                </div>
                                            ) : (
                                                filteredProducts.map((product) => (
                                                    <div key={product.id} className="form-check py-2">
                                                        <input
                                                            id={`batch-product-${product.id}`}
                                                            type="checkbox"
                                                            className="form-check-input"
                                                            checked={selectedProducts.includes(product.id)}
                                                            onChange={() => handleProductChange(product.id)}
                                                        />

                                                        <label
                                                            className="form-check-label"
                                                            htmlFor={`batch-product-${product.id}`}
                                                        >
                                                            {getProductName(product)}
                                                        </label>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>


                                    {/* DATOS A MODIFICAR */}

                                    <div className="col-12 col-lg-6">
                                        <h6 className="mb-3">Datos a modificar</h6>


                                        {/* CATEGORÍA */}

                                        <div className="batch-edit-option">
                                            <div className="form-check mb-3">
                                                <input
                                                    id="batchEditCategory"
                                                    type="checkbox"
                                                    className="form-check-input"
                                                    checked={editCategory}
                                                    onChange={handleEditCategoryChange}
                                                />

                                                <label
                                                    className="form-check-label fw-semibold"
                                                    htmlFor="batchEditCategory"
                                                >
                                                    Cambiar categoría
                                                </label>
                                            </div>

                                            {editCategory && (
                                                <>
                                                    <FormLabel required htmlFor="batch-value-categoryId">Categoría</FormLabel><select id="batch-value-categoryId" required aria-required="true"
                                                        className="form-select"
                                                        value={categoryId}
                                                        onChange={handleCategoryChange}
                                                    >
                                                        <option value="">Selecciona una categoría</option>

                                                        {activeCategories.map((category) => (
                                                            <option key={category.id} value={category.id}>
                                                                {category.name}
                                                            </option>
                                                        ))}
                                                    </select>

                                                    <div className="form-text">
                                                        Si una línea actual no pertenece a la nueva categoría,
                                                        se quitará automáticamente.
                                                    </div>
                                                </>
                                            )}
                                        </div>


                                        {/* LÍNEA */}

                                        <div className="batch-edit-option">
                                            <div className="form-check mb-3">
                                                <input
                                                    id="batchEditLine"
                                                    type="checkbox"
                                                    className="form-check-input"
                                                    checked={editLine}
                                                    onChange={handleEditLineChange}
                                                />

                                                <label
                                                    className="form-check-label fw-semibold"
                                                    htmlFor="batchEditLine"
                                                >
                                                    Cambiar línea
                                                </label>
                                            </div>

                                            {editLine && (
                                                <>
                                                    <FormLabel required htmlFor="batch-value-lineId">Línea</FormLabel><select id="batch-value-lineId" required aria-required="true"
                                                        className="form-select"
                                                        value={lineId}
                                                        onChange={(event) => setLineId(event.target.value)}
                                                    >
                                                        <option value="">Selecciona una opción</option>
                                                        <option value="none">Sin línea</option>

                                                        {availableLines.map((line) => (
                                                            <option key={line.id} value={line.id}>
                                                                {line.name}
                                                            </option>
                                                        ))}
                                                    </select>

                                                    {!targetCategoryId && (
                                                        <div className="form-text">
                                                            Para asignar una línea a productos de distintas categorías,
                                                            cambia también su categoría.
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>


                                        {/* PRECIO */}

                                        <div className="batch-edit-option">
                                            <div className="form-check mb-3">
                                                <input
                                                    id="batchEditPrice"
                                                    type="checkbox"
                                                    className="form-check-input"
                                                    checked={editPrice}
                                                    onChange={(event) => setEditPrice(event.target.checked)}
                                                />

                                                <label
                                                    className="form-check-label fw-semibold"
                                                    htmlFor="batchEditPrice"
                                                >
                                                    Cambiar precio
                                                </label>
                                            </div>

                                            {editPrice && (
                                                <>
                                                    <select
                                                        className="form-select mb-3"
                                                        value={priceType}
                                                        onChange={handlePriceTypeChange}
                                                    >
                                                        <option
                                                            value="group"
                                                            disabled={activePriceGroups.length === 0}
                                                        >
                                                            Grupo de precio
                                                        </option>

                                                        <option value="individual">Precio individual</option>
                                                        <option value="none">Sin precio</option>
                                                    </select>

                                                    {priceType === "group" && (
                                                        <><FormLabel required htmlFor="batch-value-priceGroupId">Grupo de precio</FormLabel><select id="batch-value-priceGroupId" required aria-required="true"
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
                                                        </select></>
                                                    )}

                                                    {priceType === "individual" && (
                                                        <div>
                                                            <FormLabel required htmlFor="batch-value-price">Precio</FormLabel><div className="input-group">
                                                            <span className="input-group-text">$</span>

                                                            <input id="batch-value-price" required aria-required="true"
                                                                type="number"
                                                                className="form-control"
                                                                min="0"
                                                                step="0.01"
                                                                value={price}
                                                                onChange={(event) => setPrice(event.target.value)}
                                                            />
                                                        </div></div>
                                                    )}

                                                    {priceType === "none" && (
                                                        <div className="form-text">
                                                            Los productos seleccionados quedarán sin precio asignado.
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>


                                        {/* ESTADO */}

                                        <div className="batch-edit-option">
                                            <div className="form-check mb-3">
                                                <input
                                                    id="batchEditStatus"
                                                    type="checkbox"
                                                    className="form-check-input"
                                                    checked={editStatus}
                                                    onChange={(event) => setEditStatus(event.target.checked)}
                                                />

                                                <label
                                                    className="form-check-label fw-semibold"
                                                    htmlFor="batchEditStatus"
                                                >
                                                    Cambiar estado
                                                </label>
                                            </div>

                                            {editStatus && (
                                                <select
                                                    className="form-select"
                                                    value={active ? "active" : "inactive"}
                                                    onChange={(event) => setActive(event.target.value === "active")}
                                                >
                                                    <option value="active">Activo</option>
                                                    <option value="inactive">Inactivo</option>
                                                </select>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {error && (
                                    <div className="alert alert-danger mt-4 mb-0">
                                        {error}
                                    </div>
                                )}
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn btn-light" onClick={onClose}>
                                    Cancelar
                                </button>

                                <button type="submit" className="btn btn-primary">
                                    Aplicar cambios
                                </button>
                            </div>
                        </ValidatedForm>
                    </div>
                </Dialog>
    );
}

export default BatchEditProductsModal;
