import { createContext, useContext } from "react";
export const DataAdministrationContext = createContext(null);
export const useDataAdministration = () => useContext(DataAdministrationContext);
