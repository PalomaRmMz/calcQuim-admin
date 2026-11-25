import {inventoryDecimal,inventoryText} from '../services/inventoryUnits.js';
import PurchaseInventoryCorrection from './PurchaseInventoryCorrection';
import PurchaseDialog,{PurchaseArticleSearch} from './PurchaseDialog';
import { SourceForm } from './PurchasedItemForms';
import { normalizeText } from '../utils/catalogUtils.js';
import QuickPurchaseProduct from './QuickPurchaseProduct';
import {PurchaseLines,PurchaseLineGroup,PurchaseLineQuantity,PurchaseLineCostMode,PurchaseLineCost,PurchaseLineTotal} from "./PurchaseLineFields";
import { availablePurchaseSources, sourceSnapshot } from '../services/supplyModel.js';
import { getProductChoiceLabel, getProductDisplayName } from "../utils/catalogUtils.js";
import { useState } from "react";
import { getBadgeStyle } from "../utils/classificationUtils.js";
import { Button, createFilterOptions } from "@mui/material";
import { useCatalog } from "../context/CatalogHooks.js";
import { useProcurement } from "../context/ProcurementContext.js";
import { directSupply, supplySnapshot, SOURCING_TYPES, supplyPresentation } from "../utils/procurementUtils.js";
import PurchaseItemOutcome from "./PurchaseItemOutcome";
import TableActions from "./TableActions";
import { localDate } from "../utils/salesUtils";
import { calculatePurchaseItem, groupPurchaseItems } from "../utils/purchaseUtils";
import "../styles/components/SaleFormModal.css";

const filter = createFilterOptions({ limit: 30, stringify: (p) => `${p.name} ${p.classification}` });

export default function PurchaseFormModal({ purchase, onClose, onSave, activity=null }) {
    const { products: rawProducts, categories, productLines } = useCatalog();
    const [quickName, setQuickName] = useState(null);
    const [drafts, setDrafts] = useState([]);
    const products = [...rawProducts, ...drafts].map(p => ({ ...p, displayName: getProductDisplayName(p, categories, productLines) }));
    const { data } = useProcurement();
    const [supplierId, updateSupplier] = useState(purchase?.supplierId ?? "");
    const setSupplierId = value => updateSupplier(data.suppliers.find(s => String(s.id) === String(value))?.id ?? "");
    const [date, setDate] = useState(purchase?.date || localDate);
    const [reference, setReference] = useState(purchase?.reference || "");
    const [notes, setNotes] = useState(purchase?.notes || "");
    const [search, setSearch] = useState("");
    const [items, setItems] = useState(() => (purchase?.items || []).map((item) => ({ ...item, costMode: item.costMode || "total", cost: item.cost ?? (item.costMode === "unit" ? item.unitCost : item.total) })));
    const [error, setError] = useState("");
    const [inventoryCorrection,setInventoryCorrection]=useState({confirmed:false,disposition:'adjust',reason:'',baselineTreatment:''});
    const [receipt, setReceipt] = useState(purchase?.receipt || null);
    const [receiptBusy, setReceiptBusy] = useState(false);
    const [editingSource, setEditingSource] = useState(null);
    const existingSupplies = data.supplyModelVersion === 2 ? availablePurchaseSources(data, supplierId) : data.supplyItems.filter((s) => s.supplierId === supplierId);
    const missingSupplierArticles = supplierId && search.trim() && data.supplyModelVersion === 2 ? data.purchasedItems.filter(article => article.active && article.sourcingType !== 'READY_TO_USE'
        && normalizeText(article.name).includes(normalizeText(search.trim()))
        && !existingSupplies.some(source => source.purchasedItemId === article.id)) : [];
    const directIds = new Set(products.filter((p) => existingSupplies.some(s => s.sourcingType === "READY_TO_USE" && (s.outputProductId === p.id || data.supplyConversions?.some(c => c.active && c.purchasedItemId === s.purchasedItemId && c.outputProductId === p.id)))).map((p) => p.id));
    const stockFormats = new Map(rawProducts.filter(p => p.inventorySupplyId).map(p => [p.inventorySupplyId,p.supplyPackage??{liters:'1',label:'Botella'}]));
    const productMap = new Map(products.map((p) => [p.id, p]));
    const options = [...existingSupplies.filter((s) => s.active && (s.outputProductId == null || productMap.get(s.outputProductId)?.active)), ...(products.filter((p) => p.active && !p.inventorySupplyId && !directIds.has(p.id)).map((p) => ({ ...directSupply(p, supplierId), purchaseQuantity: null, directProductId: p.id })))]
        .filter((s) => !items.some((i) => i.supplyItemId === s.id || (s.directProductId != null && i.directProductId === s.directProductId)))
        .map((s) => { const p = productMap.get(s.outputProductId) || products.find(product => data.supplyConversions?.some(c => c.active && c.purchasedItemId === s.purchasedItemId && c.outputProductId === product.id)); return { ...s, choiceLabel: p && s.sourcingType === "READY_TO_USE" ? getProductChoiceLabel(p, products, categories, productLines) : s.name, classification: `${p?.displayName || ""} ${categories.find((c) => c.id === p?.categoryId)?.name || ""} ${productLines.find((l) => l.id === p?.lineId)?.name || ""} ${SOURCING_TYPES[s.sourcingType]} ${supplyPresentation(s)}` }; }).concat(missingSupplierArticles.map(article => ({ id: `configure:${article.id}`, purchasedItemId: article.id, name: article.name, classification: SOURCING_TYPES[article.sourcingType], requiresSource: true })));
    const calculated = items.map(item=>{
        const format=stockFormats.get(item.purchasedItemId);
        if(!format||item.packageQuantity==null)return calculatePurchaseItem(item);
        try{
            const packages=inventoryDecimal(item.packageQuantity);
            if(packages<=0n||packages%1000000n)return null;
            const quantity=inventoryText(packages/1000000n*inventoryDecimal(format.liters));
            return calculatePurchaseItem({...item,quantity});
        }catch{return null;}
    });
    const sortedGroups = groupPurchaseItems(items, products, categories, productLines);
    const total = Math.round(calculated.reduce((sum, item) => sum + (item?.total || 0), 0) * 100) / 100;
    function change(id, data) { setItems((current) => current.map((item) => item.id === id ? { ...item, ...data } : item)); }
    async function submit(e) {
        e.preventDefault();
        if (receiptBusy) return;
        if (!supplierId) return setError("Escribe el proveedor de esta compra.");
        if (!date || date > localDate()) return setError("Selecciona una fecha válida, no futura.");
        if (!items.length || calculated.some((item) => !item) || !Number.isFinite(total)) return setError("Agrega artículos con cantidad mayor que cero y un costo válido.");
        const result = await onSave({...(purchase?{inventoryCorrection}:{}), ...(!purchase&&activity?{activity}:{}), receipt, supplierId, date, reference: reference.trim(), notes: notes.trim(), items: sortedGroups.flatMap(({ items: entries, ...group }) => entries.map(({ index }) => ({ ...calculated[index], group }))), total });
        if (!result.ok) return setError(result.message);
        onClose();
    }
    function addDirect(product, newProduct) {
        const supply = { ...directSupply(product, supplierId), purchaseQuantity: null };
        setItems(current => [...current, { ...supplySnapshot(supply, product), id: crypto.randomUUID(), directProductId: product.id, newProduct, quantity: "", costMode: "unit", cost: "" }]);
        setSearch("");
    }
    return <><PurchaseDialog editing={Boolean(purchase)}
        suppliers={data.suppliers.filter(s => s.id===purchase?.supplierId||(s.active&&(!activity||s.businessActivity===activity)))}
        supplierId={supplierId} onSupplierChange={setSupplierId} supplierLocked={items.length>0} date={date} onDateChange={setDate}
        beforeSearch={purchase&&<PurchaseInventoryCorrection value={inventoryCorrection} onChange={setInventoryCorrection}/>} afterSearch={supplierId && !items.length && !existingSupplies.some(s => s.active) && <p className="alert alert-info">Busca un producto terminado o créalo aquí. Las bases y concentrados se configuran como artículos transformables en Abastecimiento.</p>}
        search={<PurchaseArticleSearch disabled={!supplierId} options={options} value={null} inputValue={search} onInputChange={(_, value) => setSearch(value)} getOptionLabel={(p) => p.name} getOptionKey={(p) => p.id} groupBy={option => option.requiresSource ? 'Configurar con este proveedor' : 'Disponibles para comprar'} renderOption={({ key, ...props }, p) => <li key={key} {...props}><div className="w-100"><div className="d-flex align-items-center justify-content-between gap-3"><span>{p.choiceLabel || p.name}</span>{p.requiresSource && <small className="text-primary text-nowrap">Configurar proveedor</small>}</div><small className="d-block text-muted">{p.requiresSource ? 'Artículo existente · Vincular al proveedor seleccionado' : `${supplyPresentation(p)} · ${SOURCING_TYPES[p.sourcingType]}`}</small></div></li>} filterOptions={(opts, state) => state.inputValue.trim() ? filter(opts, state) : []} noOptionsText={search.trim() ? <div>No encontramos &quot;{search}&quot;.<Button onMouseDown={e => e.preventDefault()} onClick={() => setQuickName(search)}>+ Crear producto</Button></div> : "Escribe para buscar"} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} onChange={(_, supply) => { if (supply?.requiresSource) { setEditingSource({ purchasedItemId: supply.purchasedItemId }); return; } if (supply) setItems((current) => [...current, { ...(data.supplyModelVersion === 2 && supply.directProductId == null ? sourceSnapshot(data, supply, products) : supplySnapshot(supply, productMap.get(supply.outputProductId))), id: crypto.randomUUID(), directProductId: supply.directProductId, newProduct: drafts.find(p => p.id === supply.directProductId), quantity: "", costMode: "total", cost: "" }]); setSearch(""); }} />}
        itemCount={items.length} total={total} receipt={receipt} onReceiptChange={setReceipt} onReceiptBusy={setReceiptBusy} receiptBusy={receiptBusy}
        reference={reference} onReferenceChange={setReference} notes={notes} onNotesChange={setNotes} error={error} onClose={onClose} onSubmit={submit}>
        <PurchaseLines>{sortedGroups.map(group=><PurchaseLineGroup key={group.id} name={group.name} style={getBadgeStyle(group.colorId) || { backgroundColor: "#f1f3f5", color: "#6c757d" }}>
                    {group.items.map(({ item, index }) => <tr key={item.id}>
                    <td>{item.name}<small className="d-block text-muted">{item.productNameSnapshot} · {SOURCING_TYPES[item.sourcingType]} · {supplyPresentation(item)}</small>{!purchase && data.supplyModelVersion === 2 && data.supplyItems.some(s => s.id === item.supplyItemId) && <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setEditingSource(data.supplyItems.find(s => s.id === item.supplyItemId))}>Revisar proveedor y contenido</button>}
                                        {item.sourcingType !== "READY_TO_USE" && <details><summary>Ver rendimiento</summary><PurchaseItemOutcome item={calculated[index] || { ...item, total: null }} /></details>}</td>
                    <td><PurchaseLineQuantity id={item.id} name={item.name} unit={stockFormats.has(item.purchasedItemId)?'envase':item.unit} step={stockFormats.has(item.purchasedItemId)?'1':'any'} value={stockFormats.has(item.purchasedItemId)?item.packageQuantity??(item.quantity===''?'':Number(item.quantity)/Number(stockFormats.get(item.purchasedItemId).liters)):item.quantity} onChange={quantity=>change(item.id,stockFormats.has(item.purchasedItemId)?{packageQuantity:quantity}:{quantity})} /></td>
                    <td className="text-nowrap">Sin costo conocido</td>
                    <td><PurchaseLineCostMode id={item.id} name={item.name} value={item.costMode} onChange={mode => change(item.id, { costMode: mode, cost: calculated[index] ? (mode === "total" ? calculated[index].total : Number(calculated[index].unitCost.toFixed(6))) : "" })} /></td>
                    <td>{stockFormats.has(item.purchasedItemId)&&item.costMode==='unit'&&<small className="d-block">Costo por litro</small>}<PurchaseLineCost id={item.id} name={item.name} mode={item.costMode} value={item.cost} onChange={cost => change(item.id, { cost })} /></td>
                    <td className="text-nowrap"><PurchaseLineTotal total={calculated[index]?.total} unitCost={calculated[index]?.unitCost} unit={item.unit} /></td>
                    <td><TableActions label={item.name} deleteLabel="Quitar" onDelete={() => setItems(items.filter((i) => i.id !== item.id))} /></td>
                </tr>)}
        </PurchaseLineGroup>)}</PurchaseLines>
    </PurchaseDialog>{editingSource && <SourceForm key={editingSource.id} source={editingSource.id ? editingSource : undefined} initialSupplierId={supplierId} article={data.purchasedItems.find(a => a.id === editingSource.purchasedItemId)} onClose={() => {
        const updated = data.supplyItems.find(s => s.id === editingSource.id);
        if (updated) setItems(current => current.map(item => item.supplyItemId === updated.id ? { ...item, ...sourceSnapshot(data, updated, products) } : item));
        setEditingSource(null);
    }} />}{quickName !== null && <QuickPurchaseProduct name={quickName} drafts={drafts} onClose={() => setQuickName(null)} onCreate={product => { setDrafts(current => [...current, product]); addDirect({ ...product, displayName: getProductDisplayName(product, categories, productLines) }, product); setQuickName(null); }} />}</>;
}
