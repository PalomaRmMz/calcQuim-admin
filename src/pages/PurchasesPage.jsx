import { ReceiptViewer } from '../components/PurchaseReceipt';
import ModalHeader from "../components/ModalHeader";
import { SOURCING_TYPES, supplyPresentation } from "../utils/procurementUtils.js";
import { getBadgeStyle } from "../utils/classificationUtils.js";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogActions, Button } from "@mui/material";
import { faBox, faDollarSign, faTruck, faChartColumn } from "@fortawesome/free-solid-svg-icons";
import ContentPanel from "../components/ContentPanel";
import SummaryCard from "../components/SummaryCard";
import DataTable from "../components/DataTable";
import { useCatalog } from "../context/CatalogHooks.js";
import PurchaseFormModal from "../components/PurchaseFormModal";
import { useProcurement } from "../context/ProcurementContext.js";
import TableActions from "../components/TableActions";
import ConfirmDialog from "../components/ConfirmDialog";
import PrimaryAction from "../components/PrimaryAction";
import Feedback from "../components/Feedback";
import ExportExcelButton from "../components/ExportExcelButton";
import EmptyState from "../components/EmptyState";
import PurchaseItemOutcome from "../components/PurchaseItemOutcome";
import { money } from "../utils/salesUtils";
import { groupPurchaseItems, unitCostText } from "../utils/purchaseUtils";
import "../styles/components/SaleDetailModal.css";

const dateText = (date) => new Date(`${date}T12:00:00`).toLocaleDateString("es-MX");

export default function PurchasesPage() {
    const { data, error: storageError, savePurchase, voidPurchase, integrityIssues = [] } = useProcurement();
    const purchases = data?.purchases || [];
    const [status, setStatus] = useState("valid");
    const { products, categories, productLines } = useCatalog();
    const [editing, setEditing] = useState(null);
    const [creating, setCreating] = useState(false);
    const [selectedId, selectPurchase] = useState(null);
    const selected = purchases.find(p => p.id === selectedId);
    const setSelected = purchase => selectPurchase(purchase?.id ?? null);
    const [deleting, setDeleting] = useState(null);
    const [notice, setNotice] = useState("");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [supplier, setSupplier] = useState("");
    useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 4000); return () => clearTimeout(timer); }, [notice]);
    const filtered = purchases.filter((p) => (!from || p.date >= from) && (!to || p.date <= to) && (!supplier || p.supplierId === supplier) && (!status || (status === "void") === Boolean(p.voidedAt)));
    const valid = filtered.filter((p) => !p.voidedAt);
    const total = valid.reduce((sum, p) => sum + p.total, 0);
    async function save(input) {
        const result = await savePurchase(input, editing?.id);
        if (result.ok) setNotice(editing ? "Compra actualizada; la versión anterior se conservó." : "Compra registrada correctamente.");
        return result;
    }
    if (!data) return <><Feedback message={storageError} /><ExportExcelButton scope="procurement" /></>;
    const columns = [
        { accessorKey: "date", header: "Fecha", Cell: ({ cell }) => dateText(cell.getValue()) },
        { accessorKey: "supplierNameSnapshot", header: "Proveedor" },
        { accessorKey: "reference", header: "Ticket / factura", Cell: ({ row }) => <div>{row.original.reference || "Sin referencia"}{row.original.receipt && <button type="button" className="btn btn-link btn-sm d-block p-0" onClick={() => setSelected(row.original)}>Ver foto del ticket</button>}</div> },
        { id: "products", header: "Artículos", accessorFn: (p) => p.items.length },
        { accessorKey: "total", header: "Total", Cell: ({ cell }) => <strong>{money(cell.getValue())}</strong> },
        { id: "status", header: "Estado", accessorFn: (p) => p.voidedAt ? "Anulada" : "Registrada" },
        { id: "actions", header: "Acciones", enableSorting: false, Cell: ({ row }) => <TableActions label="compra" onView={() => setSelected(row.original)} onEdit={!row.original.voidedAt ? () => setEditing(row.original) : undefined} onDelete={!row.original.voidedAt ? () => setDeleting(row.original) : undefined} deleteLabel="Anular" /> },
    ];
    return <>
        <div className="d-flex justify-content-end mb-3"><ExportExcelButton scope="procurement" /></div>
        {integrityIssues.length > 0 && <details className="alert alert-warning"><summary>Hay {integrityIssues.length} vínculos de abastecimiento que requieren revisión</summary><ul>{integrityIssues.map(issue => <li key={issue}>{issue}</li>)}</ul><p>El historial se conserva. Las relaciones ambiguas no se reparan automáticamente.</p></details>}
        <>
        <div className="row g-3 mb-4">
            <SummaryCard title="Compras del período" value={valid.length} icon={faBox} variant="blue" />
            <SummaryCard title="Total comprado" value={money(total)} icon={faDollarSign} variant="green" />
            <SummaryCard title="Proveedores del período" value={new Set(valid.map((p) => p.supplierId)).size} icon={faTruck} variant="purple" />
            <SummaryCard title="Compra promedio" value={money(valid.length ? total / valid.length : 0)} icon={faChartColumn} variant="yellow" />
        </div>
        {notice && <div className="alert alert-success" role="status">{notice}</div>}
        <ContentPanel title="Historial de compras" subtitle="Consulta tus proveedores, cantidades y costos de adquisición." action={<PrimaryAction onClick={() => setCreating(true)}>Nueva compra</PrimaryAction>}>
            <div className="filter-bar">
                <div><label htmlFor="purchasesFrom" className="form-label">Desde</label><input id="purchasesFrom" className="form-control" type="date" max={to || undefined} value={from} onChange={(e) => setFrom(e.target.value)} /></div>
                <div><label htmlFor="purchasesTo" className="form-label">Hasta</label><input id="purchasesTo" className="form-control" type="date" min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} /></div>
                <div><label htmlFor="purchasesSupplier" className="form-label">Proveedor</label><select id="purchasesSupplier" className="form-select" value={supplier} onChange={(e) => setSupplier(e.target.value)}><option value="">Todos</option>{data.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                <div><label htmlFor="purchaseStatus" className="form-label">Estado</label><select id="purchaseStatus" className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="valid">Registradas</option><option value="void">Anuladas</option><option value="">Todas</option></select></div>
                <button className="btn btn-outline-secondary" onClick={() => { setFrom(""); setTo(""); setSupplier(""); setStatus("valid"); }}>Limpiar filtros</button>
            </div>
            {from && to && from > to && <p role="alert" className="text-danger">La fecha inicial debe ser anterior a la final.</p>}
            {!filtered.length && <EmptyState title="Sin compras para mostrar">Registra una compra o ajusta los filtros.</EmptyState>}
            <DataTable columns={columns} data={filtered} searchPlaceholder="Buscar proveedor o referencia..." initialSorting={[{ id: "date", desc: true }]} />
        </ContentPanel></>
        {(creating || editing) && <PurchaseFormModal purchase={editing} onClose={() => { setCreating(false); setEditing(null); }} onSave={save} />}
        <Dialog className="app-dialog" open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="lg" PaperProps={{ className: "sale-detail" }} aria-labelledby="purchase-detail-title">
            <ModalHeader titleId="purchase-detail-title" title="Detalle de compra" onClose={() => setSelected(null)} />
            <DialogContent className="sale-detail-body">{selected && <>
                <dl className="sale-detail-meta"><div><dt>Proveedor</dt><dd>{selected.supplierNameSnapshot}</dd></div><div><dt>Fecha</dt><dd>{dateText(selected.date)}</dd></div><div><dt>Referencia</dt><dd>{selected.reference || "Sin referencia"}</dd></div></dl>
                <section className="sale-section">
                    <div className="sale-section-heading"><h3>Artículos de la compra</h3><span>{selected.items.length} {selected.items.length === 1 ? "producto" : "productos"}</span></div>
                    <div className="table-responsive sale-items"><table className="table align-middle"><thead><tr><th>Artículo comprado / producto final</th><th>Cantidad</th><th className="text-end text-nowrap">Costo unitario</th><th className="text-end text-nowrap">Costo total</th><th>Rendimiento y costo efectivo</th></tr></thead>
                        {groupPurchaseItems(selected.items, products, categories, productLines).map((group) => <tbody key={group.id}>
                            <tr className="sale-group-heading"><th scope="rowgroup" colSpan={5} style={getBadgeStyle(group.colorId) || { backgroundColor: "#f1f3f5", color: "#6c757d" }}>{group.name}</th></tr>
                            {group.items.map(({ item }) => <tr key={item.id || item.productId}><td>{item.name}<small className="d-block text-muted">{item.legacy ? "Modalidad anterior no registrada" : SOURCING_TYPES[item.sourcingType]} · {item.productNameSnapshot || "Sin producto final registrado"} · {supplyPresentation(item)}</small></td><td className="text-nowrap">{item.quantity} {item.unit}</td><td className="text-end text-nowrap">{unitCostText(item.unitCost ?? item.total / item.quantity)}<small className="d-block text-muted">/ {item.unit}</small></td><td className="text-end text-nowrap">{money(item.total)}</td><td><PurchaseItemOutcome item={item} /></td></tr>)}
                        </tbody>)}
                    </table></div>
                </section>
                <ReceiptViewer receipt={selected.receipt} />
                {selected.voidedAt && <Feedback variant="warning" message="Compra anulada: se conserva para consulta y no participa en métricas." />}
                {selected.revisions?.length > 0 && <details className="sale-notes"><summary>Versiones anteriores ({selected.revisions.length})</summary>{selected.revisions.map((revision, index) => <details key={index} className="sale-notes"><summary>Versión {index + 1} · {revision.supplierNameSnapshot} · {revision.date} · {money(revision.total)}</summary><ReceiptViewer receipt={revision.receipt} /><p>Referencia: {revision.reference || "Sin referencia"}</p><p className="preserve-text">{revision.notes}</p><div className="table-responsive sale-items"><table className="table"><thead><tr><th>Insumo</th><th>Cantidad</th><th>Costo unitario</th><th>Costo total</th><th>Rendimiento</th></tr></thead><tbody>{revision.items.map((item) => <tr key={item.id}><td>{item.name}<small className="d-block text-muted">{item.legacy ? "Modalidad anterior no registrada" : SOURCING_TYPES[item.sourcingType]} · {item.productNameSnapshot || "Sin producto final registrado"} · {supplyPresentation(item)}</small></td><td>{item.quantity} {item.unit}</td><td>{unitCostText(item.unitCost ?? item.total / item.quantity)}</td><td>{money(item.total)}</td><td><PurchaseItemOutcome item={item} /></td></tr>)}</tbody></table></div></details>)}</details>}
                {selected.notes && <div className="sale-detail-notes"><h3>Notas</h3><p>{selected.notes}</p></div>}
            </>}</DialogContent>
            <DialogActions className="sale-detail-footer"><div><span>Total de compra · MXN</span><strong>{money(selected?.total || 0)}</strong></div>{!selected?.voidedAt && <Button variant="outlined" onClick={() => { setEditing(selected); setSelected(null); }}>Editar compra</Button>}<Button color="inherit" onClick={() => setSelected(null)}>Cerrar detalle</Button></DialogActions>
        </Dialog>
        {deleting && <ConfirmDialog title="Anular compra" confirmText="Anular compra" onClose={() => setDeleting(null)} onConfirm={async () => { const result = await voidPurchase(deleting.id); if (result.ok) setNotice("Compra anulada. Su historial se conserva."); return result; }}>¿Anular la compra a {deleting.supplierNameSnapshot} por {money(deleting.total)}? Dejar? de participar en los totales y el comparador.</ConfirmDialog>}
    </>;
}
