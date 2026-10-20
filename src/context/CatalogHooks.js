import { createContext, useContext } from "react";
export const CatalogContext = createContext(null);
export function useCatalog() {
    const context = useContext(CatalogContext);
    if (!context) throw new Error("useCatalog requiere CatalogProvider.");
    return context;
}
