import SupplyInventoryPanel from '../components/SupplyInventoryPanel';
import {webHardwareStockUnit} from '../domain/webHardwarePresentationName.mjs';
import {cleaningInventoryLabels,filterInventoryProducts,inventoryAttention} from '../domain/inventoryAttention.mjs';
import {getProductDisplayName} from '../utils/catalogUtils.js';
import {scopeInventoryData,scopeInventory} from '../domain/activityScope.mjs';
import { useContext,useEffect,useRef,useState } from 'react';
import { PersistenceContext } from '../context/PersistenceContext.js';
import { useCatalog } from '../context/CatalogHooks.js';
import ContentPanel from '../components/ContentPanel';
import InventoryProductList from '../components/InventoryProductList';
import InventoryShoppingList from '../components/InventoryShoppingList';
import InventoryProductModal from '../components/InventoryProductModal';
import PresentationStockModal from '../components/PresentationStockModal';
import { inventoryKinds as kinds } from '../services/inventoryPresentation.js';
import InventoryReasonFields from '../components/InventoryReasonFields';
import InventoryReasonSummary from '../components/InventoryReasonSummary';
import { emptyInventoryReason,inventoryReasonPayload } from '../services/inventoryReasons.js';
import { saveInventory } from '../services/inventoryClient.js';

export default function InventoryPage({activity='LIMPIEZA'}){
    const persistence=useContext(PersistenceContext),catalog=useCatalog();
    const inventoryTable=useRef(null);
    const [view,setView]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
    const [category,setCategory]=useState(''),[line,setLine]=useState(''),[filterProduct,setFilterProduct]=useState(''),[only,setOnly]=useState('');
    const [selectedId,setSelectedId]=useState(null),[selectedTab,setSelectedTab]=useState(undefined),[reviewReason,setReviewReason]=useState(emptyInventoryReason);
    async function refresh(){const response=await fetch('/api/v1/inventory');if(!response.ok)throw new Error('Inventario no disponible. La migración operativa requiere autorización.');setView(await response.json());}
    useEffect(()=>{if(!notice||notice.includes('No repitas'))return;const timer=setTimeout(()=>setNotice(''),5000);return()=>clearTimeout(timer);},[notice]);
    const revision=persistence?.snapshot.revision,hasPersistence=Boolean(persistence);
    useEffect(()=>{let active=true;if(hasPersistence)fetch('/api/v1/inventory').then(async response=>{if(!response.ok)throw new Error('Inventario no disponible. La migración operativa requiere autorización.');return response.json();}).then(value=>{if(active)setView(value);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[revision,hasPersistence]);
    if(!persistence)return <p>Inventario requiere el modo PostgreSQL; no guarda en el navegador.</p>;
    if(!view?.enabled)return <section className="container py-4"><h2>Inventario pendiente de activación</h2><p role="status">{error||'Consultando disponibilidad del módulo…'}</p><p>No se asignaron existencias iniciales ni se modificaron productos o compras.</p></section>;
    const scoped=scopeInventory(view,persistence.snapshot.data,activity),scopedData=scopeInventoryData(persistence.snapshot.data,activity);
    const hardware=activity==='JARCERIA',data=persistence.snapshot.data;
    const packs=view.packInventory?.products||[];
    const presentations=data.procurement.presentations||[];
    const packById=new Map(packs.map(pack=>[String(pack.productId),pack]));
    const attention=p=>{
        if(p.presentationStock)return {key:'presentation',label:'Saldo por presentaci\u00f3n',quantity:null};
        const state=inventoryAttention(p,packById.get(String(p.productId)));
        return hardware?state:{...state,label:cleaningInventoryLabels[state.key]??state.label};
    };
    const hardwareCategories=new Map(hardware?data.products.map(p=>[String(p.id),p.hardwareCategoryId]):[]);
    const products=hardware?scoped.products.map(p=>({...p,hardwareCategoryId:hardwareCategories.get(String(p.productId))})):scoped.products;
    const categories=hardware?(data.procurement.hardwareCategories??[]):catalog.categories;
    const productLines=hardware?[]:catalog.productLines;
    const displayUnit=p=>webHardwareStockUnit(p.productId,p.unit,presentations);
    const productName=p=>getProductDisplayName(p,categories,productLines);
    const needing=products.filter(p=>attention(p).key!=='sufficient'&&(!p.presentationStock||p.presentationStock.some(f=>f.balance==='0')));
    const rows=filterInventoryProducts(products,{activity,category,line,productId:filterProduct,only},attention);
    const selectedProduct=scoped.products.find(p=>p.productId===selectedId);

    function reasonData(value,context){try{return inventoryReasonPayload(value,context);}catch(error){setError(error.message);return null;}}
    async function save(name,input){
        if(busy)return;setBusy(true);setError('');setNotice('');
        try{const result=await saveInventory(persistence.command,name,{...input,activity},refresh);if(!result.ok)throw new Error(result.message);setNotice(result.viewWarning||'Operación registrada una sola vez.');return true;}
        catch(e){setError(e.message);return false;}finally{setBusy(false);}
    }
    const productOptions=[...products].sort((a,b)=>productName(a).localeCompare(productName(b),'es')).map(p=>
        <option key={p.productId} value={String(p.productId)}>{productName(p)} · {displayUnit(p)}</option>);
    return <div className="container-fluid py-3">
        <h2>{activity==='JARCERIA'?'Existencias de jarcería':'Existencias de limpieza'}</h2><p className="text-muted">{activity==='JARCERIA'?'Consulta paquetes, piezas sueltas y equivalencias de jarcería. Cada saldo indica su unidad; el total equivalente suma paquetes y sueltos en la unidad base del producto.':'Consulta litros, piezas y movimientos de productos de limpieza. Cada saldo se expresa en la unidad indicada junto al producto.'}</p><p>Las cantidades son aproximadas. Desconocido significa que falta un conteo inicial; no equivale a cero.</p>
        {error&&<p role="alert" className="alert alert-danger">{error}</p>}{notice&&<p role="status" className="alert alert-success">{notice}</p>}
        {!hardware&&view.supplies?.length>0&&<SupplyInventoryPanel supplies={view.supplies} sales={scopedData.sales} busy={busy} error={error} onSave={save}/>}
        <section className="inventory-overview" aria-label="Resumen de existencias">
          {[["empty","Agotados"],["low","Inventario bajo"],["sufficient","Suficientes"],["unknown","Desconocidos"],["unconfigured","Sin mínimo configurado"],["negative","Por revisar"]].map(([key,label])=><button key={key} type="button" className={`inventory-summary-card inventory-summary-${key} ${only===key?'active':''}`} aria-pressed={only===key} onClick={()=>setOnly(only===key?'':key)}><strong>{products.filter(p=>attention(p).key===key).length}</strong><span>{label}</span></button>)}
        </section>
        <details className="inventory-attention card p-3 mb-3"><summary>{needing.length} productos requieren atención</summary><p className="form-text">Reponer: agotados o bajos. Revisar: saldos negativos, desconocidos o mínimos pendientes.</p><ul>{needing.map(p=><li key={p.productId}><button className="btn btn-link text-start" onClick={()=>{setSelectedTab(attention(p).key==='unconfigured'?'replenishment':undefined);setSelectedId(p.productId);}}>{productName(p)} | {p.presentationStock?p.presentationStock.filter(f=>f.balance==='0').map(f=>f.name+' agotado').join(', '):attention(p).quantity===null?'Existencia desconocida':`${attention(p).quantity} ${displayUnit(p)}`} | {attention(p).label}</button></li>)}</ul></details>
        <div className="mb-3"><InventoryShoppingList tableRef={inventoryTable} options={{activity,catalogRows:products,categories,productLines,presentations,packs}}/></div>
        <div className="inventory-filters" role="group" aria-label="Filtros de existencias">
            <label>Categoría<select className="form-select" value={category} onChange={e=>{setCategory(e.target.value);setLine('');}}>
                <option value="">Todas</option>{[...categories].sort((a,b)=>a.name.localeCompare(b.name,'es')).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select></label>
            {!hardware&&<label>Línea<select className="form-select" value={line} onChange={e=>setLine(e.target.value)}>
                <option value="">Todas</option>{productLines.filter(l=>!category||String(l.categoryId)===category).sort((a,b)=>a.name.localeCompare(b.name,'es')).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
            </select></label>}
            <label>Producto<select className="form-select" value={filterProduct} onChange={e=>setFilterProduct(e.target.value)}><option value="">Todos</option>{productOptions}</select></label>
            <label>Estado<select className="form-select" value={only} onChange={e=>setOnly(e.target.value)}>
                <option value="">Todos</option><option value="attention">Requieren atención</option>{!hardware&&<option value="purchase">Requieren compra</option>}<option value="empty">Agotados</option><option value="low">Inventario bajo</option><option value="sufficient">Suficientes</option><option value="unknown">{hardware?'Desconocidos':cleaningInventoryLabels.unknown}</option><option value="unconfigured">Mínimo sin configurar</option><option value="negative">Cantidades por revisar</option>
            </select></label>
        </div>
        <ContentPanel title="Productos y existencias" subtitle="Abre Ver / ajustar para consultar movimientos, registrar un conteo o configurar reposición.">
            <InventoryProductList packs={packs} activity={activity} presentations={presentations} rows={rows} tableRef={inventoryTable}
                categories={categories} productLines={productLines} onSelect={id=>{setSelectedTab(undefined);setSelectedId(id);}}/>
        </ContentPanel>
        {scoped.purchaseReviews.length>0&&<details className="alert alert-warning"><summary>Revisar cambios de compras ({scoped.purchaseReviews.length})</summary><InventoryReasonFields context="purchase_review" value={reviewReason} onChange={setReviewReason} idPrefix="purchase-review" disabled={busy}/>{scoped.purchaseReviews.map(p=><div key={p.purchaseId}>{p.date} · {p.voided?'Compra anulada':'Compra editada'} <button disabled={busy||!reviewReason.reasonCode||(reviewReason.reasonCode==='other'&&!reviewReason.reasonExplanation.trim())} onClick={()=>{const metadata=reasonData(reviewReason,'purchase_review');if(metadata)save('inventoryReviewPurchase',{purchaseId:p.purchaseId,...metadata});}}>Confirmar revisión con el motivo capturado</button><p>No se revierte mercancía automáticamente; registra el ajuste físico si corresponde.</p></div>)}</details>}
        {scoped.changes.length>0&&<details className="card p-3 mt-3"><summary>Historial de inventario ({scoped.changes.length})</summary><table className="table"><thead><tr><th>Fecha</th><th>Acción</th><th>Referencia</th><th>Motivo</th></tr></thead><tbody>{scoped.changes.map(change=><tr key={change.seq}><td>{new Date(change.recorded_at).toLocaleString('es-MX')}</td><td>{kinds[change.action]||({initial_classification:'Inventario inicial regularizado',product_initial_creation:'Inicial capturado al crear producto',replenishment:'Reposición configurada',allocation:'Desglose confirmado',sale_void:'Anulación y destino físico',reversal:'Compensación',purchase_review_required:'Revisión de recepción pendiente',purchase_review_confirmed:'Recepción revisada'}[change.action]??'Confirmación')}</td><td>{scoped.products.find(p=>String(p.productId)===String(change.reference.productId))?.name||persistence.snapshot.data.sales.find(s=>s.id===change.reference.saleId)?.folio||''}{change.action==='replenishment'&&<small className="d-block">Umbral: {change.reference.previous?.minimum??'Sin configurar'} → {change.reference.next.minimum??'Sin configurar'}; lote habitual: {change.reference.next.batch??'Sin configurar'} {change.reference.next.unit}</small>}</td><td><InventoryReasonSummary reference={change.reference} legacyReason={change.reference.reason||scoped.movements.find(m=>m.id===change.reference.movementId)?.reason||'Seguimiento de la operacion'}/></td></tr>)}</tbody></table></details>}
        {selectedProduct?.presentationStock?<PresentationStockModal key={selectedId} product={selectedProduct} sales={scopedData.sales} busy={busy} error={error}
            onClose={()=>setSelectedId(null)} onSave={async(name,input)=>{if(await save(name,input))setSelectedId(null);}}/>:
            selectedProduct&&<InventoryProductModal activity={activity} initialTab={selectedTab} key={`${selectedId}:${selectedTab??'default'}`} product={selectedProduct} view={scoped} data={scopedData} categories={catalog.categories} productLines={catalog.productLines} onClose={()=>setSelectedId(null)} onSave={async(name,input)=>{setNotice('');const result=await saveInventory(persistence.command,name,{...input,activity},refresh);if(result.ok)setNotice(result.viewWarning||'Guardado en PostgreSQL.');return result;}}/>}
    </div>;
}
