import SupplierLocation from "../components/SupplierLocation";
import { useMemo, useState } from "react";
import { useProcurement } from "../context/ProcurementContext.js";
import ContentPanel from "../components/ContentPanel";
import DataTable from "../components/DataTable";
import TableActions from "../components/TableActions";
import StatusBadge from "../components/StatusBadge";
import SupplierFormModal from "../components/SupplierFormModal";
import ConfirmDialog from "../components/ConfirmDialog";
import CostHistoryModal from "../components/CostHistoryModal";
import PrimaryAction from "../components/PrimaryAction";
import EmptyState from "../components/EmptyState";
import FilterBar from "../components/FilterBar";
import { Field } from "../components/ProcurementFields";

export default function SuppliersPanel() {
    const { data, analytics, deleteEntity } = useProcurement();
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [selectedId, selectSupplier] = useState(null);
    const selected = data.suppliers.find(s => s.id === selectedId);
    const setSelected = supplier => selectSupplier(supplier?.id ?? null);
    const [status, setStatus] = useState("");
    const rows = useMemo(() => {
        const stats = new Map(data.suppliers.map((s) => [s.id, { ...s, related: new Set(), lastPurchase: "" }]));
        data.supplyItems.forEach((s) => { if (s.outputProductId != null) stats.get(s.supplierId)?.related.add(s.outputProductId); });
        if (data.supplyModelVersion === 2) data.supplyItems.forEach(s => data.supplyConversions.filter(c => c.purchasedItemId === s.purchasedItemId).forEach(c => stats.get(s.supplierId)?.related.add(c.outputProductId)));
        data.purchases.forEach((p) => { const row = stats.get(p.supplierId); if (!row) return; p.items.forEach((i) => { if (i.productId != null) row.related.add(i.productId); }); if (!p.voidedAt && p.date > row.lastPurchase) row.lastPurchase = p.date; });
        return [...stats.values()].filter((s) => !status || String(s.active) === status);
    }, [data, status]);
    const columns = [
        { accessorKey: "name", header: "Proveedor" },
        { accessorKey: "active", header: "Estado", Cell: ({ cell }) => <StatusBadge active={cell.getValue()} /> },
        { accessorKey: "phone", header: "Teléfono" },
        { id: "location", header: "Ubicación", accessorFn: row => [row.address, row.mapsUrl].filter(Boolean).join(" "), Cell: ({ row }) => <SupplierLocation supplier={row.original} /> },
        { id: "related", header: "Productos relacionados", accessorFn: (row) => row.related.size },
        { accessorKey: "lastPurchase", header: "Última compra", Cell: ({ cell }) => cell.getValue() || "Sin compras" },
        { id: "actions", header: "Acciones", enableSorting: false, Cell: ({ row }) => <TableActions label={row.original.name} onView={() => setSelected(row.original)} onEdit={() => setEditing(row.original)} onDelete={() => setDeleting(row.original)} /> },
    ];
    return <><ContentPanel title="Proveedores" subtitle="Administra contactos y consulta su historial de abastecimiento." action={<PrimaryAction onClick={() => setEditing({})}>Nuevo proveedor</PrimaryAction>}>
        <FilterBar onClear={() => setStatus("")}><Field label="Estado" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos</option><option value="true">Activo</option><option value="false">Inactivo</option></Field></FilterBar>
        {!data.suppliers.length && <EmptyState title="Sin proveedores">Crea un proveedor para registrar compras y costos informados.</EmptyState>}<DataTable columns={columns} data={rows} searchPlaceholder="Buscar proveedor..." />
    </ContentPanel>{editing && <SupplierFormModal supplier={editing.id ? editing : null} onClose={() => setEditing(null)} />}{deleting && <ConfirmDialog onClose={() => setDeleting(null)} onConfirm={() => deleteEntity("suppliers", deleting.id)}>¿Eliminar a {deleting.name}? Solo se permite si no tiene relaciones ni historial.</ConfirmDialog>}{selected && <CostHistoryModal title={selected.name} observations={analytics.observations.filter((o) => o.supplierId === selected.id)} onClose={() => setSelected(null)}><section className="supplier-contact"><div className="section-heading mt-0"><h3>Datos del proveedor</h3><StatusBadge active={selected.active} /></div><div className="form-grid"><div><span className="form-text">Teléfono</span><p>{selected.phone || "Sin teléfono"}</p></div><div><span className="form-text">Ubicación</span><SupplierLocation supplier={selected} /></div></div>{selected.notes && <p className="preserve-text text-muted">{selected.notes}</p>}</section><div className="section-heading"><h3>Artículos que vende</h3></div><ul className="supplier-articles">{data.supplyItems.filter(s => s.supplierId === selected.id).map(s => <li key={s.id}>{data.purchasedItems?.find(a => a.id === s.purchasedItemId)?.name || s.name}<span className="text-muted"> · {s.presentation || 'Sin presentación'}</span> <StatusBadge active={s.active} /></li>)}</ul><div className="section-heading"><h3>Historial de costos y compras</h3></div></CostHistoryModal>}</>;
}
