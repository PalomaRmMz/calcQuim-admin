import { getProductDisplayName } from "../utils/catalogUtils.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { ProcurementContext } from "./ProcurementContext.js";
import { useCatalog } from "./CatalogHooks.js";
import { loadSupplyProcurement as loadProcurement, persistProcurement, assertProcurementValid } from "../services/procurementStorage.js";
import * as supplyModel from '../services/supplyModel.js';
import { configureProductBatch } from '../services/supplyModelBatch.js';
import * as domain from "../services/procurementDomain.js";
import { procurementAnalytics } from "../utils/purchaseAnalytics.js";
import { prepareSupplyBatch, batchResultMessage } from "../services/procurementBatch.js";
import { procurementIntegrityIssues } from "../services/procurementIntegrity.js";
import { localDate } from "../utils/salesUtils.js";
import { STORAGE_KEYS } from "../services/catalogStorage.js";
import { assertDataGeneration } from "../services/dataReset.js";
import { prepareFinishedPurchase, configureFinishedProducts } from '../services/finishedProductFlow.js';
import { preparePurchasedItemSetup } from '../services/purchasedItemSetup.js';
import { preparePurchasedItemBatch } from '../services/purchasedItemBatch.js';
import { prepareSupplyYieldBatch } from '../services/supplyYieldBatch.js';

const errorMessage = (error) => ["QuotaExceededError", "SecurityError"].includes(error.name) ? "No se pudo guardar en este navegador. Revisa los permisos y el espacio disponible; los datos anteriores se conservaron." : error.message || "No se pudo guardar. Revisa el espacio disponible del navegador.";

export default function ProcurementProvider({ children }) {
    const { products: rawProducts, categories, productLines, priceGroups, commitPurchaseProducts, assertCatalogCurrent, storageError } = useCatalog();
    const products = useMemo(() => rawProducts.map(p => ({ ...p, displayName: getProductDisplayName(p, categories, productLines) })), [rawProducts, categories, productLines]);
    const [state, setState] = useState(() => {
        try { if (storageError) throw new Error(storageError); return { data: loadProcurement(localStorage, products), error: "", epoch: localStorage.getItem(STORAGE_KEYS.resetEpoch) }; }
        catch (error) { return { data: null, error: errorMessage(error) }; }
    });
    const committed = useRef(state);
    const [today, setToday] = useState(localDate);
    useEffect(() => {
        const refreshDate = () => setToday(localDate());
        const timer = setInterval(refreshDate, 60000);
        window.addEventListener("focus", refreshDate);
        return () => { clearInterval(timer); window.removeEventListener("focus", refreshDate); };
    }, []);
    const integrityIssues = useMemo(() => state.data ? state.data.supplyModelVersion === 2 ? supplyModel.supplyModelIssues(state.data, products) : procurementIntegrityIssues(state.data, products) : [], [state.data, products]);
    const analytics = useMemo(() => state.data ? procurementAnalytics(state.data, products, today) : null, [state.data, products, today]);
    function commit(transform) {
        const current = committed.current;
        if (!current.data) return { ok: false, message: current.error };
        try {
            assertDataGeneration(current.epoch);
            assertCatalogCurrent?.();
            const next = transform(current.data);
            persistProcurement(next, localStorage, current.data);
            committed.current = { data: next, error: "", epoch: current.epoch };
            setState(committed.current);
            return { ok: true };
        } catch (error) { return { ok: false, message: errorMessage(error) }; }
    }
    function saveSupplyBatch(request) {
        let prepared;
        const result = commit(data => {
            if (data.supplyModelVersion === 2) throw new Error('Usa Configurar varios productos o Relacionar con productos desde Abastecimiento.');
            prepared = prepareSupplyBatch(data, products, request);
            if (!prepared.ok) throw new Error(prepared.message);
            return prepared.next;
        });
        return result.ok ? { ...result, message: batchResultMessage(prepared, request.mode) } : result;
    }
    return <ProcurementContext.Provider value={{
        data: state.data, error: state.error, analytics, integrityIssues,
        savePurchasedItem: input => commit(data => supplyModel.savePurchasedItem(data, input)),
        savePurchasedItemsBatch: request => commit(data => preparePurchasedItemBatch(data, request).next),
        saveSupplyYieldBatch: request => commit(data => prepareSupplyYieldBatch(data, products, request).next),
        savePurchasedItemSetup: request => commit(data => preparePurchasedItemSetup(data, request, products)),
        saveSupplySource: input => commit(data => supplyModel.saveSupplySource(data, input)),
        saveSupplyConversion: input => commit(data => supplyModel.saveSupplyConversion(data, input, products)),
        configureSupplyBatch: request => commit(data => supplyModel.configureSupplyBatch(data, request, products)),
        configureProductBatch: request => commit(data => request.finished ? configureFinishedProducts(data, request, products) : configureProductBatch(data, request, products)),
        saveSources: (sources, costs = []) => commit(data => {
            let next = data;
            sources.forEach((source, index) => {
                next = supplyModel.saveSupplySource(next, source);
                if (costs[index]) next = domain.addSupplierPrice(next, { ...costs[index], supplyItemId: source.id || next.supplyItems.at(-1).id }, products);
            });
            return next;
        }),
        saveSupplier: (input) => commit((data) => domain.saveSupplier(data, input)),
        saveSupply: (input, initialCost) => commit((data) => domain.saveSupply(data, input, products, initialCost)),
        saveSupplyBatch,
        setSupplyActive: (id, active) => commit((data) => domain.setSupplyActive(data, id, active, products)),
        addSupplierPrice: (input) => commit((data) => domain.addSupplierPrice(data, input, products)),
        deleteEntity: (collection, id) => commit((data) => domain.deleteEntity(data, collection, id)),
        savePurchase: (input, id) => {
            if (state.data?.supplyModelVersion !== 2) return commit(data => domain.savePurchase(data, input, products, id));
            try {
                const current = committed.current;
                assertDataGeneration(current.epoch);
                assertCatalogCurrent();
                const prepared = prepareFinishedPurchase(current.data, input, { products: rawProducts, categories, productLines, priceGroups }, id);
                assertProcurementValid(prepared.data);
                const persist = () => persistProcurement(prepared.data, localStorage, current.data);
                if (prepared.products.length !== rawProducts.length) {
                    const result = commitPurchaseProducts(prepared.products, persist);
                    if (!result.ok) return result;
                } else persist();
                committed.current = { ...current, data: prepared.data, error: '' };
                setState(committed.current);
                return { ok: true };
            } catch (error) { return { ok: false, message: errorMessage(error) }; }
        },
        voidPurchase: (id) => commit((data) => domain.voidPurchase(data, id)),
    }}>{children}</ProcurementContext.Provider>;
}
