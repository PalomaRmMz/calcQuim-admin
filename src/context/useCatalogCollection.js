import { useRef, useState } from "react";
import { persistCatalogCollection, STORAGE_KEYS } from "../services/catalogStorage.js";
import { assertDataGeneration } from "../services/dataReset.js";

// Persist before publishing. Storage failure must never look like a saved edit.
export function useCatalogCollection(key, initialize) {
    const [state, setState] = useState(() => {
        const value = initialize();
        // CatalogProvider exposes the startup storage error and blocks writes.
        try { return { value, raw: localStorage.getItem(key), epoch: localStorage.getItem(STORAGE_KEYS.resetEpoch) }; }
        catch { return { value, raw: null }; }
    });
    const committed = useRef(state);
    function update(transform, afterPersist) {
        const current = committed.current;
        assertDataGeneration(current.epoch);
        const next = typeof transform === "function" ? transform(current.value) : transform;
        const raw = persistCatalogCollection(key, next, current.raw);
        try { afterPersist?.(); }
        catch (error) {
            try {
                if (localStorage.getItem(key) !== raw) throw new Error('El catálogo cambió durante el guardado.', { cause: error });
                if (current.raw === null) localStorage.removeItem(key);
                else localStorage.setItem(key, current.raw);
            } catch (rollbackError) { throw new Error('Falló la compra y no fue posible restaurar el catálogo. Recarga y revisa los datos antes de continuar.', { cause: rollbackError }); }
            throw error;
        }
        committed.current = { value: next, raw, epoch: current.epoch };
        setState(committed.current);
    }
    return [state.value, update];
}
