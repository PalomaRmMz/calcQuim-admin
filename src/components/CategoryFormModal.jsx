import FormLabel from "./FormLabel";
import ValidatedForm from "./ValidatedForm";
import ModalHeader from "./ModalHeader";
import { Dialog } from "@mui/material";
import { useState } from "react";

function CategoryFormModal({ show, category, onClose, onSave }) {
    const [name, setName] = useState(category?.name ?? "");
    const [active, setActive] = useState(category?.active ?? true);
    const [useAsProductPrefix, setUseAsProductPrefix] = useState(category?.useAsProductPrefix ?? false);
    const [error, setError] = useState("");
    const isEditing = Boolean(category);

    function handleSubmit(event) {
        event.preventDefault();
        setError("");

        if (!name.trim()) {
            setError("Escribe el nombre de la categoría.");
            return;
        }

        const result = onSave({
            name: name.trim(),
            active,
            useAsProductPrefix,
        });

        if (!result.ok) {
            setError(result.message);
            return;
        }

        onClose();
    }

    if (!show) return null;

    return (
        <Dialog className="app-dialog" open={show} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="CategoryFormModal-title">
            <div className="modal-content">
                <ValidatedForm onSubmit={handleSubmit}>
                    <ModalHeader titleId="CategoryFormModal-title" title={isEditing ? "Editar categoría" : "Nueva categoría"} onClose={onClose} />

                    <div className="modal-body">
                        <div className="mb-3">
                            <FormLabel required className="form-label" htmlFor="categoryName">
                                Nombre
                            </FormLabel>

                            <input
                                id="categoryName" required aria-required="true"
                                type="text"
                                className="form-control"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                autoFocus
                            />
                        </div>

                        <div className="form-check form-switch">
                            <input
                                id="categoryActive"
                                type="checkbox"
                                className="form-check-input"
                                checked={active}
                                onChange={(event) => setActive(event.target.checked)}
                            />

                            <label className="form-check-label" htmlFor="categoryActive">
                                Categoría activa
                            </label>
                        </div>

                        <div className="form-check form-switch mt-3">
                            <input
                                id="categoryProductPrefix"
                                type="checkbox"
                                className="form-check-input"
                                checked={useAsProductPrefix}
                                onChange={(event) => setUseAsProductPrefix(event.target.checked)}
                            />

                            <label className="form-check-label" htmlFor="categoryProductPrefix">
                                Usar el nombre de la categoría como prefijo del producto
                            </label>

                            <div className="form-text">
                                Solo se usa cuando el producto no tiene línea. Si tiene línea, la línea siempre tiene prioridad.
                            </div>
                        </div>

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
                            {isEditing ? "Guardar cambios" : "Agregar categoría"}
                        </button>
                    </div>
                </ValidatedForm>
            </div>
        </Dialog>
    );
}

export default CategoryFormModal;
