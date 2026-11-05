import FormLabel from "./FormLabel";
import ValidatedForm from "./ValidatedForm";
import ModalHeader from "./ModalHeader";
import { Dialog } from "@mui/material";
import { useState, useContext } from "react";
import { CatalogContext } from '../context/CatalogHooks.js';
import { validWholesalePrice } from '../domain/wholesalePricing.mjs';

function PriceGroupFormModal({ show, priceGroup, onClose, onSave }) {
    const {wholesalePricing} = useContext(CatalogContext) || {};
    const [wholesalePrice,setWholesalePrice] = useState(priceGroup?.wholesalePrice ?? '');
    const [name, setName] = useState(priceGroup?.name ?? "");
    const [price, setPrice] = useState(priceGroup?.price ?? "");
    const [active, setActive] = useState(priceGroup?.active ?? true);
    const [error, setError] = useState("");

    const isEditing = Boolean(priceGroup);


    async function handleSubmit(event) {
        event.preventDefault();
        setError("");
        try { validWholesalePrice(wholesalePrice, price); } catch (error) { setError(error.message); return; }

        if (!name.trim()) {
            setError("Escribe el nombre del grupo.");
            return;
        }

        if (price === "" || !Number.isFinite(Number(price)) || Number(price) < 0) {
            setError("Escribe un precio válido.");
            return;
        }

        const result = await onSave({
            name: name.trim(),
            price: Number(price),
            active,
            ...(wholesalePricing ? {wholesalePrice:validWholesalePrice(wholesalePrice,price)} : {}),
        });

        if (!result.ok) {
            setError(result.message);
            return;
        }

        onClose();
    }

    if (!show) return null;

    return (
        <Dialog className="app-dialog" open={show} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="PriceGroupFormModal-title">
                    <div className="modal-content">
                        <ValidatedForm onSubmit={handleSubmit}>
                            <ModalHeader titleId="PriceGroupFormModal-title" title={isEditing ? "Editar grupo de precio" : "Nuevo grupo de precio"} onClose={onClose} />

                            <div className="modal-body">
                                <div className="mb-3">
                                    <FormLabel required className="form-label" htmlFor="priceGroupName">
                                        Nombre
                                    </FormLabel>

                                    <input
                                        id="priceGroupName" required aria-required="true"
                                        type="text"
                                        className="form-control"
                                        value={name}
                                        onChange={(event) => setName(event.target.value)}
                                        placeholder="Ej. Multiusos estándar"
                                        autoFocus
                                    />
                                </div>

                                <div className="mb-3">
                                    <FormLabel required className="form-label" htmlFor="priceGroupPrice">
                                        Precio normal por litro
                                    </FormLabel>

                                    <div className="input-group">
                                        <span className="input-group-text">$</span>

                                        <input
                                            id="priceGroupPrice" required aria-required="true"
                                            type="number"
                                            className="form-control"
                                            min="0"
                                            step="0.01"
                                            value={price}
                                            onChange={(event) => setPrice(event.target.value)}
                                        />
                                    </div>
                                </div>

                                {wholesalePricing ? <div className="mb-3"><label className="form-label" htmlFor="priceGroupWholesale">Precio de mayoreo por litro</label><div className="input-group"><span className="input-group-text">$</span><input id="priceGroupWholesale" type="number" min="0.01" step="0.01" max={price || undefined} className="form-control" value={wholesalePrice} onChange={e=>setWholesalePrice(e.target.value)}/></div><small className="text-muted">Opcional. Desde 10 L; vacío conserva el precio normal.</small></div> : <p className="text-muted small">Mayoreo pendiente de activación autorizada.</p>}
                                <div className="form-check form-switch">
                                    <input
                                        id="priceGroupActive"
                                        type="checkbox"
                                        className="form-check-input"
                                        checked={active}
                                        onChange={(event) => setActive(event.target.checked)}
                                    />

                                    <label className="form-check-label" htmlFor="priceGroupActive">
                                        Grupo activo
                                    </label>
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
                                    {isEditing ? "Guardar cambios" : "Agregar grupo"}
                                </button>
                            </div>
                        </ValidatedForm>
                    </div>
                </Dialog>
    );
}

export default PriceGroupFormModal;
