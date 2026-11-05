import { useContext,useEffect,useState } from 'react';
import { PersistenceContext } from '../context/PersistenceContext.js';
import { useCatalog } from '../context/CatalogHooks.js';
import ContentPanel from '../components/ContentPanel';
import InventoryProductList from '../components/InventoryProductList';
import InventoryProductModal from '../components/InventoryProductModal';
import { inventoryKinds as kinds } from '../services/inventoryPresentation.js';
import InventoryReasonFields from '../components/InventoryReasonFields';
import InventoryReasonSummary from '../components/InventoryReasonSummary';
import { emptyInventoryReason,inventoryReasonPayload } from '../services/inventoryReasons.js';
import { saveInventory } from '../services/inventoryClient.js';

export default function InventoryPage(){
    const persistence=useContext(PersistenceContext),catalog=useCatalog();
    const [view,setView]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
    const [category,setCategory]=useState(''),[line,setLine]=useState(''),[filterProduct,setFilterProduct]=useState(''),[only,setOnly]=useState('');
    const [selectedId,setSelectedId]=useState(null),[reviewReason,setReviewReason]=useState(emptyInventoryReason);
    async function refresh(){const response=await fetch('/api/v1/inventory');if(!response.ok)throw new Error('Inventario no disponible. La migración operativa requiere autorización.');setView(await response.json());}
    useEffect(()=>{if(!notice||notice.includes('No repitas'))return;const timer=setTimeout(()=>setNotice(''),5000);return()=>clearTimeout(timer);},[notice]);
    const revision=persistence?.snapshot.revision,hasPersistence=Boolean(persistence);
    useEffect(()=>{let active=true;if(hasPersistence)fetch('/api/v1/inventory').then(async response=>{if(!response.ok)throw new Error('Inventario no disponible. La migración operativa requiere autorización.');return response.json();}).then(value=>{if(active)setView(value);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[revision,hasPersistence]);
    if(!persistence)return <p>Inventario requiere el modo PostgreSQL; no guarda en el navegador.</p>;
    if(!view?.enabled)return <section className="container py-4"><h2>Inventario pendiente de activación</h2><p role="status">{error||'Consultando disponibilidad del módulo…'}</p><p>No se asignaron existencias iniciales ni se modificaron productos o compras.</p></section>;
    const rows=view.products.filter(p=>(!category||String(p.categoryId)===category)&&(!line||String(p.lineId)===line)&&(!filterProduct||String(p.productId)===filterProduct)&&(!only||(only==='low'?p.low:only==='negative'?p.negative:p.status===only)));
    function reasonData(value,context){try{return inventoryReasonPayload(value,context);}catch(error){setError(error.message);return null;}}
    async function save(name,input){
        if(busy)return;setBusy(true);setError('');setNotice('');
        try{const result=await saveInventory(persistence.command,name,input,refresh);if(!result.ok)throw new Error(result.message);setNotice(result.viewWarning||'Operación registrada una sola vez.');return true;}
        catch(e){setError(e.message);return false;}finally{setBusy(false);}
    }
    const productOptions=(products=view.products)=>products.map(p=><option key={p.productId} value={String(p.productId)}>{p.name} · {p.unit}</option>);
    return <div className="container-fluid py-3">
        <p>Las existencias son aproximadas. Sin estimación inicial, los movimientos se conservan sin inventar un saldo.</p>
        {error&&<p role="alert" className="alert alert-danger">{error}</p>}{notice&&<p role="status" className="alert alert-success">{notice}</p>}
        <div className="row g-2 mb-3"><label className="col">Categoría<select className="form-select" value={category} onChange={e=>{setCategory(e.target.value);setLine('');}}><option value="">Todas</option>{[...catalog.categories].sort((a,b)=>a.name.localeCompare(b.name,"es")).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="col">Línea<select className="form-select" value={line} onChange={e=>setLine(e.target.value)}><option value="">Todas</option>{catalog.productLines.filter(l=>!category||String(l.categoryId)===category).sort((a,b)=>a.name.localeCompare(b.name,"es")).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label><label className="col">Producto<select className="form-select" value={filterProduct} onChange={e=>setFilterProduct(e.target.value)}><option value="">Todos</option>{productOptions()}</select></label><label className="col">Estado<select className="form-select" value={only} onChange={e=>setOnly(e.target.value)}><option value="">Todos</option><option value="unknown">Sin determinar</option><option value="estimated">Aproximada registrada</option><option value="calculated">Calculada desde una estimación</option><option value="negative">Saldo negativo</option><option value="low">Reposición</option></select></label></div>
        <ContentPanel title="Inventario de productos" subtitle="Selecciona un producto o pulsa Editar para abrir su ficha de inventario.">
            <InventoryProductList rows={rows} categories={catalog.categories} productLines={catalog.productLines} onSelect={setSelectedId}/>
        </ContentPanel>
        {view.purchaseReviews.length>0&&<section className="alert alert-warning"><h3 className="h6">Recepciones por revisar tras cambios en compras</h3><InventoryReasonFields context="purchase_review" value={reviewReason} onChange={setReviewReason} idPrefix="purchase-review" disabled={busy}/>{view.purchaseReviews.map(p=><div key={p.purchaseId}>{p.date} · {p.voided?'Compra anulada':'Compra editada'} <button disabled={busy||!reviewReason.reasonCode||(reviewReason.reasonCode==='other'&&!reviewReason.reasonExplanation.trim())} onClick={()=>{const metadata=reasonData(reviewReason,'purchase_review');if(metadata)save('inventoryReviewPurchase',{purchaseId:p.purchaseId,...metadata});}}>Confirmar revisión con el motivo capturado</button><p>No se revierte mercancía automáticamente; registra el ajuste físico si corresponde.</p></div>)}</section>}
        <details className="card p-3 mt-3"><summary>Historial de configuración y confirmaciones</summary><table className="table"><thead><tr><th>Fecha</th><th>Acción</th><th>Referencia</th><th>Motivo</th></tr></thead><tbody>{view.changes.map(change=><tr key={change.seq}><td>{new Date(change.recorded_at).toLocaleString('es-MX')}</td><td>{kinds[change.action]||({initial_classification:'Inventario inicial regularizado',replenishment:'Reposición configurada',allocation:'Desglose confirmado',sale_void:'Anulación y destino físico',reversal:'Compensación',purchase_review_required:'Revisión de recepción pendiente',purchase_review_confirmed:'Recepción revisada'}[change.action]??'Confirmación')}</td><td>{view.products.find(p=>String(p.productId)===String(change.reference.productId))?.name||persistence.snapshot.data.sales.find(s=>s.id===change.reference.saleId)?.folio||''}{change.action==='replenishment'&&<small className="d-block">Umbral: {change.reference.previous?.minimum??'Sin configurar'} → {change.reference.next.minimum??'Sin configurar'}; lote habitual: {change.reference.next.batch??'Sin configurar'} {change.reference.next.unit}</small>}</td><td><InventoryReasonSummary reference={change.reference} legacyReason={change.reference.reason||view.movements.find(m=>m.id===change.reference.movementId)?.reason||'Seguimiento de la operacion'}/></td></tr>)}</tbody></table></details>
        {selectedId!==null&&view.products.some(p=>p.productId===selectedId)&&<InventoryProductModal key={selectedId} product={view.products.find(p=>p.productId===selectedId)} view={view} data={persistence.snapshot.data} categories={catalog.categories} productLines={catalog.productLines} onClose={()=>setSelectedId(null)} onSave={async(name,input)=>{setNotice('');const result=await saveInventory(persistence.command,name,input,refresh);if(result.ok)setNotice(result.viewWarning||'Guardado en PostgreSQL.');return result;}}/>}
    </div>;
}
