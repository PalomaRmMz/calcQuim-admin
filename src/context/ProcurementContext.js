import { createContext, useContext } from "react";
export const ProcurementContext = createContext(null);
export function useProcurement() {
    const context = useContext(ProcurementContext);
    if (!context) throw new Error("useProcurement requiere ProcurementProvider.");
    return context;
}
