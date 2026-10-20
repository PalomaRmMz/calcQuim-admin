import { Link, Navigate, useParams } from "react-router";
import { useProcurement } from "../context/ProcurementContext.js";
import Feedback from "../components/Feedback";
import ExportExcelButton from "../components/ExportExcelButton";
import PurchasesPage from "./PurchasesPage";
import SupplyItemsPanel from "./SupplyItemsPanel";
import ProcurementComparator from "./ProcurementComparator";
import SuppliersPanel from "./SuppliersPanel";

const sections = { abastecimiento: SupplyItemsPanel, comparador: ProcurementComparator, proveedores: SuppliersPanel };
export default function PurchasesModule() {
    const { section } = useParams();
    const { data, error } = useProcurement();
    if (!section) return <PurchasesPage />;
    const Panel = Object.hasOwn(sections, section) ? sections[section] : null;
    if (!Panel) return <Navigate to="/compras" replace />;
    return <>
        <div className="d-flex justify-content-end mb-3"><ExportExcelButton scope="procurement" /></div>
        {data ? <Panel key={section} /> : <><Feedback message={error} /><Link to="/administracion/datos">Datos y respaldos</Link></>}
    </>;
}
