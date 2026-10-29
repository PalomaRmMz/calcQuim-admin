import FormLabel from "./FormLabel";
import ValidatedForm from "./ValidatedForm";
import ModalHeader from "./ModalHeader";
import { Dialog } from "@mui/material";
import { useState } from "react";

function ProductLineFormModal({
    show, line, categories, hasProducts = false, onClose, onSave,
}) {
    const [name, setName] = useState(line?.name ?? "");
    const [categoryId, setCategoryId] = useState(line?.categoryId ?? "");
    const [active, setActive] = useState(line?.active ?? true);
    const [error, setError] = useState("");
    const isEditing = Boolean(line);


    const availableCategories = [...categories]
        .filter((category) => category.active || category.id === line?.categoryId)
        .sort((a, b) => a.name.localeCompare(b.name, "es"));

    const selectedCategory = categories.find(
        (category) => category.id === Number(categoryId)
    );

    const categoryLocked = isEditing && hasProducts;
    const categoryInactive = Boolean(selectedCategory && !selectedCategory.active);
    const cannotActivate = categoryInactive && !active;

    async function handleSubmit(event) {
        event.preventDefault();
        setError("");

        if (!name.trim()) {
            setError("Escribe el nombre de la línea.");
            return;
        }

        if (!categoryId) {
            setError("Selecciona una categoría.");
            return;
        }

        if (active && categoryInactive) {
            setError("No puedes activar esta línea porque su categoría está inactiva.");
            return;
        }

        const result = await onSave({
            name: name.trim(),
            categoryId: Number(categoryId),
            active,
        });

        if (!result.ok) {
            setError(result.message);
            return;
        }

        onClose();
    }

    if (!show) return null;

    return (
        <Dialog className="app-dialog" open={show} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="ProductLineFormModal-title">
                    <div className="modal-content">
                        <ValidatedForm onSubmit={handleSubmit}>
                            <ModalHeader titleId="ProductLineFormModal-title" title={isEditing ? "Editar línea de producto" : "Nueva línea de producto"} onClose={onClose} />

                            <div className="modal-body">
                                <div className="mb-3">
                                    <FormLabel required className="form-label" htmlFor="productLineName">
                                        Nombre
                                    </FormLabel>

                                    <input
                                        id="productLineName" required aria-required="true"
                                        type="text"
                                        className="form-control"
                                        value={name}
                                        onChange={(event) => setName(event.target.value)}
                                        autoFocus
                                    />
                                </div>

                                <div className="mb-3">
                                    <FormLabel required className="form-label" htmlFor="productLineCategory">
                                        Categoría
                                    </FormLabel>

                                    <select
                                        id="productLineCategory" required aria-required="true"
                                        className="form-select"
                                        value={categoryId}
                                        onChange={(event) => setCategoryId(event.target.value)}
                                        disabled={categoryLocked}
                                    >
                                        <option value="">Selecciona una categoría</option>

                                        {availableCategories.map((category) => (
                                            <option key={category.id} value={category.id}>
                                                {category.name}
                                                {!category.active ? " (Inactiva)" : ""}
                                            </option>
                                        ))}
                                    </select>

                                    {categoryLocked && (
                                        <div className="form-text">
                                            La categoría no puede cambiarse porque esta línea tiene productos asociados.
                                        </div>
                                    )}
                                </div>

                                <div className="form-check form-switch">
                                    <input
                                        id="productLineActive"
                                        type="checkbox"
                                        className="form-check-input"
                                        checked={active}
                                        disabled={cannotActivate}
                                        onChange={(event) => setActive(event.target.checked)}
                                    />

                                    <label className="form-check-label" htmlFor="productLineActive">
                                        Línea activa
                                    </label>
                                </div>

                                {categoryInactive && (
                                    <div className="form-text mt-2">
                                        La línea no puede activarse mientras su categoría esté inactiva.
                                    </div>
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
                                    {isEditing ? "Guardar cambios" : "Agregar línea"}
                                </button>
                            </div>
                        </ValidatedForm>
                    </div>
                </Dialog>
    );
}

export default ProductLineFormModal;
