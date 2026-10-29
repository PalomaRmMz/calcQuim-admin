import ModalHeader from "../components/ModalHeader";
import TableActions from "../components/TableActions";
import PrimaryAction from "../components/PrimaryAction";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import { useContext, useEffect, useRef, useState } from "react";
import { PersistenceContext } from '../context/PersistenceContext.js';
import { Dialog, DialogContent, DialogActions, Button } from "@mui/material";
import { faCartShopping, faDollarSign, faChartColumn, faCalendarDay } from "@fortawesome/free-solid-svg-icons";
import SummaryCard from "../components/SummaryCard";
import ContentPanel from "../components/ContentPanel";
import DataTable from "../components/DataTable";
import SaleFormModal from "../components/SaleFormModal";
import { STORAGE_KEYS } from "../services/catalogStorage";
import { money, localDate } from "../utils/salesUtils";
import { assertDataGeneration } from "../services/dataReset.js";
import { useCatalog } from "../context/CatalogHooks.js";
import "../styles/components/SaleDetailModal.css";

import { loadSales, persistSales, createSale, voidSale } from "../services/salesStorage.js";
import { getBadgeStyle } from "../utils/classificationUtils.js";
import Feedback from "../components/Feedback";
import { Link } from "react-router";

export default function SalesPage() {
    const persistence = useContext(PersistenceContext);
    const catalog = useCatalog();
    const { products, categories, productLines } = catalog;
    const [state, setState] = useState(() => {
        if (persistence) return {sales:[],error:''};
        try { return { ...loadSales(), epoch: localStorage.getItem(STORAGE_KEYS.resetEpoch), error: "" }; }
        catch (error) { return { sales: [], raw: null, error: error.message }; }
    });
    const committed = useRef(state);
    const sales = persistence?.snapshot.data.sales ?? state.sales;
    const [creating, setCreating] = useState(false);
    const [selected, setSelected] = useState(null);
    const detailGroups = new Map();
    for (const item of selected?.items || []) {
        const product = products.find((entry) => entry.id === item.productId);
        const line = productLines.find((entry) => entry.id === product?.lineId);
        const category = categories.find((entry) => entry.id === product?.categoryId);
        const group = item.group || (line
            ? { id: `line-${line.id}`, name: line.name, colorId: line.id }
            : category
                ? { id: `category-${category.id}`, name: category.name, colorId: category.id }
                : { id: "unclassified", name: "Sin categoría" });
        if (!detailGroups.has(group.id)) detailGroups.set(group.id, { ...group, items: [] });
        detailGroups.get(group.id).items.push(item);
    }
    const sortedDetailGroups = [...detailGroups.values()].sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }) || a.id.localeCompare(b.id));
    for (const group of sortedDetailGroups) group.items.sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
    const [deleting, setDeleting] = useState(null);
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [notice, setNotice] = useState("");
    useEffect(() => {
        if (!notice) return;
        const timeout = window.setTimeout(() => setNotice(""), 4000);
        return () => window.clearTimeout(timeout);
    }, [notice, sales]);
    const filtered = sales.filter((sale) => (!from || sale.date >= from) && (!to || sale.date <= to));
    const valid = filtered.filter(s => !s.voidedAt);
    const total = valid.reduce((sum, sale) => sum + sale.total, 0);
    const todayTotal = sales.filter((sale) => !sale.voidedAt && sale.date === localDate()).reduce((sum, sale) => sum + sale.total, 0);

    function commit(transform) {
        const current = committed.current;
        if (current.error) return { ok: false, message: current.error };
        try {
            assertDataGeneration(current.epoch);
            catalog.assertCatalogCurrent?.();
            const next = transform(current.sales);
            const raw = persistSales(next, current.raw);
            committed.current = { ...current, sales: next, raw };
            setState(committed.current);
            return { ok: true };
        } catch (error) { return { ok: false, message: error.message || "No se pudo guardar la venta. Los datos anteriores se conservaron." }; }
    }
    async function saveSale(data) {
        const result = persistence ? await persistence.command('createSale',[data]) : commit(sales => createSale(sales, data, catalog, localStorage.getItem(STORAGE_KEYS.salesSequence)));
        if (result.ok) setNotice("Venta registrada correctamente.");
        return result;
    }
    async function deleteSale() {
        if (!deleting) return { ok: false, message: "Selecciona una venta." };
        const result = persistence ? await persistence.command('voidSale',[deleting.id]) : commit(sales => voidSale(sales, deleting.id));
        if (result.ok) { setSelected(null); setDeleting(null); setNotice("Venta anulada; su historial se conserva."); }
        return result;
    }
    if (state.error) return <><Feedback message={state.error} /><Link to="/administracion/datos">Datos y respaldos</Link></>;

    const columns = [
        { accessorKey: "folio", header: "Folio", size: 120 },
        { accessorKey: "date", header: "Fecha", Cell: ({ cell }) => new Date(`${cell.getValue()}T12:00:00`).toLocaleDateString("es-MX") },
        { accessorKey: "payment", header: "Método de pago" },
        { accessorKey: "total", header: "Total", Cell: ({ cell }) => <span className="table-money">{money(cell.getValue())}</span> },
        { id: "status", header: "Estado", accessorFn: sale => sale.voidedAt ? "Anulada" : "Registrada" },
        { id: "actions", header: "Acciones", enableSorting: false, Cell: ({ row }) => <TableActions label={`venta ${row.original.folio}`} onView={() => setSelected(row.original)} onDelete={row.original.voidedAt ? undefined : () => setDeleting(row.original)} deleteLabel="Anular" /> },
    ];

    return <div className="container-fluid px-0">
        <div className="row g-3 mb-4">
            <SummaryCard title="Ventas del período" value={valid.length} icon={faCartShopping} variant="blue" />
            <SummaryCard title="Importe del período" value={money(total)} icon={faDollarSign} variant="green" />
            <SummaryCard title="Venta promedio" value={money(valid.length ? total / valid.length : 0)} icon={faChartColumn} variant="purple" />
            <SummaryCard title="Vendido hoy" value={money(todayTotal)} icon={faCalendarDay} variant="yellow" />
        </div>
        {notice && <div className="alert alert-success" role="status">{notice}</div>}
        <ContentPanel title="Historial de ventas" subtitle="Consulta tus ventas y registra una nueva operación." action={<PrimaryAction onClick={() => setCreating(true)}>Nueva venta</PrimaryAction>}>
            <div className="filter-bar">
                <div><label htmlFor="salesFrom" className="form-label">Desde</label><input id="salesFrom" type="date" className="form-control" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></div>
                <div><label htmlFor="salesTo" className="form-label">Hasta</label><input id="salesTo" type="date" className="form-control" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></div>
                <button className="btn btn-outline-secondary" onClick={() => { setFrom(""); setTo(""); }}>Limpiar filtros</button>
            </div>
            {from && to && from > to && <p role="alert" className="text-danger">La fecha inicial debe ser anterior a la final.</p>}
            {!sales.length && <EmptyState title="Sin ventas">Registra tu primera venta para comenzar.</EmptyState>}
            <DataTable columns={columns} data={filtered} searchPlaceholder="Buscar folio o método de pago..." initialSorting={[{ id: "date", desc: true }]} />
        </ContentPanel>
        {creating && <SaleFormModal onClose={() => setCreating(false)} onSave={saveSale} />}
        {deleting && <ConfirmDialog title="Anular venta" confirmText="Anular" onClose={() => setDeleting(null)} onConfirm={deleteSale}>¿Anular la venta {deleting.folio} por {money(deleting.total)}? Se conservará el historial y se excluirá de los totales.</ConfirmDialog>}
        <Dialog className="app-dialog" open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="md" aria-labelledby="sale-detail-title" PaperProps={{ className: "sale-modal" }}>
            <ModalHeader titleId="sale-detail-title" title={`Detalle de venta · ${selected?.folio || ""}`} onClose={() => setSelected(null)} />
            <DialogContent className="sale-modal-body">{selected && <><section className="sale-section">
                <dl className="sale-detail-meta">
                    <div><dt>Estado</dt><dd>{selected.voidedAt ? "Anulada" : "Registrada"}</dd></div><div><dt>Fecha de venta</dt><dd>{new Date(`${selected.date}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}</dd></div>
                    <div><dt>Método de pago</dt><dd>{selected.payment}</dd></div>
                    
                </dl>
                <div className="sale-section-heading"><h3>Productos de la venta</h3><span>{selected.items.length} productos</span></div><div className="table-responsive sale-items"><table className="table align-middle"><thead><tr><th>Producto</th><th>Vender por</th><th>Valor</th><th className="text-end">Importe</th></tr></thead>{sortedDetailGroups.map((group) => <tbody key={group.id}>
                    <tr className="sale-group-heading"><th scope="rowgroup" colSpan={4} style={getBadgeStyle(group.colorId) || { backgroundColor: "#f1f3f5", color: "#6c757d" }}>{group.name}</th></tr>
                    {group.items.map((item) => <tr key={item.productId}><td>{item.name}<small className="d-block text-muted">{money(item.price)} / {item.unit}</small></td><td><div className="d-flex flex-nowrap align-items-center gap-3" role="group" aria-label={`Modo de venta de ${item.name}`}>{[{ value: "quantity", label: "Por cantidad" }, { value: "amount", label: "Por monto" }].map((mode) => <label key={mode.value} className="sale-entry-checkbox"><input className="form-check-input" type="checkbox" disabled checked={(item.entryMode || "quantity") === mode.value} /><span>{mode.label}</span></label>)}</div></td><td><div className="input-group flex-nowrap" style={{ width: "max-content" }}><input className="form-control" style={{ width: "calc(5ch + 2.5rem)", flex: "0 0 auto" }} readOnly aria-label={`Valor vendido de ${item.name}`} value={item.entryMode === "amount" ? item.amount : item.quantity} /><span className="input-group-text">{item.entryMode === "amount" ? "MXN" : item.unit}</span></div>{item.entryMode === "amount" && <small className="d-block text-muted">≈ {Number(item.quantity.toFixed(3))} {item.unit}</small>}</td><td className="text-nowrap text-end">{money(item.amount)}{item.discountRate > 0 && <small className="sale-wholesale" title={`Descuento: ${money(item.discount)}`}>Mayoreo −15%</small>}</td></tr>)}</tbody>)}</table></div>
                </section>{selected.notes && <details className="sale-notes"><summary>Notas de la venta</summary><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{selected.notes}</p></details>}
            </>}</DialogContent>
            <DialogActions className="sale-modal-actions"><div className="sale-footer-total"><span>Total · MXN</span><strong>{money(selected?.total || 0)}</strong></div><Button color="inherit" onClick={() => setSelected(null)}>Cerrar detalle</Button></DialogActions>
        </Dialog>
    </div>;
}
