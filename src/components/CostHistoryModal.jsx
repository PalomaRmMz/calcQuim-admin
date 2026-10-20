import AppModal from "./AppModal";
import DataTable from "./DataTable";
import TableBadge from "./TableBadge";
import EmptyState from "./EmptyState";
import { unitCostText } from "../utils/purchaseUtils.js";
import { unitLabel } from "../utils/units.js";
import { supplyOutcomeText, supplyPresentation } from "../utils/procurementUtils.js";
import PurchaseItemOutcome from './PurchaseItemOutcome';

export default function CostHistoryModal({ title, observations, children, onClose }) {
    const hasPurchases = observations.some((o) => o.source === "Compra real");
    const hasQuotes = observations.some((o) => o.source === "Costo informado");
    const columns = [
        { accessorKey: "date", header: "Fecha" },
        { accessorKey: "supplierNameSnapshot", header: "Proveedor registrado" },
        { id: "name", header: "Artículo comprado registrado", accessorFn: (row) => row.snapshot.name },
        { id: "product", header: "Producto final registrado", accessorFn: row => row.snapshot.conversionSnapshots?.map(c => c.productNameSnapshot).join(', ') || row.snapshot.productNameSnapshot },
        { id: "presentation", header: "Presentación registrada", accessorFn: row => supplyPresentation(row.snapshot) },
        { accessorKey: "source", header: "Fuente", Cell: ({ cell }) => <span className="table-text-muted">{cell.getValue()}</span> },
        { id: "price", header: "Costo de compra / informado", accessorFn: (row) => `${unitCostText(row.price)} / ${row.priceQuantity} ${unitLabel(row.priceUnit)}` },
        { id: "yield", header: "Rendimiento registrado", accessorFn: (row) => row.snapshot.conversionSnapshots?.map(c => `${c.productNameSnapshot}: ${supplyOutcomeText(c)}`).join('; ') || supplyOutcomeText(row.snapshot) },
        { id: "effective", header: "Costo efectivo", accessorFn: (row) => row.cost, Cell: ({ row }) => row.original.snapshot.conversionSnapshots ? <PurchaseItemOutcome item={{ ...row.original.snapshot, total: row.original.price, quantity: row.original.priceQuantity, unit: row.original.priceUnit }} /> : row.original.cost === null ? row.original.reason : `${unitCostText(row.original.cost)} / ${unitLabel(row.original.outputUnit)} final` },
        { id: "age", header: "Antigüedad", accessorFn: (row) => row.age.label, Cell: ({ row }) => <TableBadge variant={row.original.age.variant}>{row.original.age.label}{row.original.expired ? " · Vencida" : ""}</TableBadge> },
        { accessorKey: "notes", header: "Notas" },
    ];
    return <AppModal title={title} onClose={onClose} maxWidth="lg">{children}{!hasPurchases && <p className="form-text">Sin compras registradas</p>}{!hasQuotes && <p className="form-text">Sin costos informados</p>}{!observations.length && <EmptyState title="Sin costos registrados">La alternativa puede existir sin precio. Puedes agregar un costo informado cuando el proveedor te dé un precio.</EmptyState>}<DataTable columns={columns} data={observations} columnOrder={["date", "price", "source", "name", "age", "supplierNameSnapshot", "product", "presentation", "yield", "effective", "notes"]} columnVisibility={{ supplierNameSnapshot: false, product: false, presentation: false, yield: false, effective: false, notes: false }} initialSorting={[{ id: "date", desc: true }]} /></AppModal>;
}
