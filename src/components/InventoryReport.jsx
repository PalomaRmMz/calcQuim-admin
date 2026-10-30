import {useContext,useMemo,useState} from 'react';
import {Button} from '@mui/material';
import {PersistenceContext} from '../context/PersistenceContext.js';
import {useCatalog} from '../context/CatalogHooks.js';
import useInventoryReport from '../hooks/useInventoryReport.js';
import {inventoryReportRows,filterInventoryReport,inventoryReportSummary,stockStates,inventoryReportCsv,inventoryReportWorkbook,inventoryExportColumns} from '../services/inventoryReport.js';
import {saveInventory} from '../services/inventoryClient.js';
import {categoryStyle} from '../utils/categoryColors.js';
import {unitLabel} from '../utils/units.js';
import ContentPanel from './ContentPanel';
import Feedback from './Feedback';
import DataTable from './DataTable';
import TableActions from './TableActions';
import AppModal from './AppModal';
import InventoryProductModal from './InventoryProductModal';
import '../styles/components/InventoryReport.css';

const dateText=date=>new Intl.DateTimeFormat('es-MX',{timeZone:'America/Mexico_City',dateStyle:'short',timeStyle:'medium'}).format(date);
export default function InventoryReport(){
    const persistence=useContext(PersistenceContext),catalog=useCatalog();
    const {view,updatedAt,error,refresh}=useInventoryReport(persistence?.snapshot.revision,Boolean(persistence));
    const [category,setCategory]=useState(''),[line,setLine]=useState(''),[search,setSearch]=useState(''),[state,setState]=useState(''),[selected,setSelected]=useState(null),[print,setPrint]=useState(null),[exporting,setExporting]=useState(false),[message,setMessage]=useState('');
    const rows=useMemo(()=>inventoryReportRows(view?.products??[],catalog.categories,catalog.productLines),[view,catalog.categories,catalog.productLines]);
    const base=useMemo(()=>filterInventoryReport(rows,{category,line,search}),[rows,category,line,search]);
    const summary=useMemo(()=>inventoryReportSummary(base),[base]);
    const filtered=useMemo(()=>filterInventoryReport(base,{state}),[base,state]);
    if(!persistence)return <Feedback message="Este reporte requiere Express y PostgreSQL; no utiliza localStorage."/>;
    if(!view)return <Feedback message={error||'Consultando existencias en PostgreSQL…'} variant={error?'danger':'info'}/>;
    const selectedProduct=view.products.find(p=>p.productId===selected);
    const categoryRecord=r=>catalog.categories.find(c=>c.id===r.categoryId);
    const columns=[
        {accessorKey:'name',header:'Producto',Cell:({cell,row})=><button className="inventory-product-button" onClick={()=>setSelected(row.original.productId)}><span className="table-text-primary category-accent" style={categoryStyle(categoryRecord(row.original))}>{cell.getValue()}</span></button>},
        {accessorKey:'category',header:'Categoría',Cell:({cell,row})=><span className="classification-label category-accent" style={categoryStyle(categoryRecord(row.original))}>{cell.getValue()}</span>},
        {id:'quantity',header:'Existencia aproximada',accessorFn:r=>r.quantity===null?null:Number(r.quantity),Cell:({row})=>row.original.quantity??'Sin determinar'},
        {accessorKey:'unit',header:'Unidad',Cell:({cell})=>unitLabel(cell.getValue())},
        {id:'minimum',header:'Punto de reposición',accessorFn:r=>r.minimum===null?null:Number(r.minimum),Cell:({row})=>row.original.minimum??'Sin configurar'},
        {id:'usualBatch',header:'Lote habitual',accessorFn:r=>r.usualBatch===null?null:Number(r.usualBatch),Cell:({row})=>row.original.usualBatch??'Sin configurar'},
        {accessorKey:'stateLabel',header:'Estado de abastecimiento',Cell:({row})=><><strong className={row.original.negative?'text-danger':row.original.status==='low'?'text-warning':''}>{row.original.stateLabel}</strong>{row.original.missingThreshold&&row.original.status!=='unconfigured'&&<small className="d-block">Sin punto de reposición</small>}</>},
        {id:'suggestion',header:'Cantidad sugerida',accessorFn:r=>r.suggestedQuantity===null?null:Number(r.suggestedQuantity),Cell:({row})=>row.original.suggestedQuantity===null?'No calculable':<>{row.original.suggestedQuantity} {unitLabel(row.original.unit)}<small className="d-block">Lote habitual orientativo</small></>},
        {id:'action',header:'Abastecimiento',accessorFn:r=>r.action},
        {id:'actions',header:'Ficha de inventario',enableSorting:false,Cell:({row})=><TableActions label={row.original.name} onEdit={()=>setSelected(row.original.productId)} showDelete={false}/>},
    ];
    async function download(format){
        if(exporting||error)return;setExporting(true);setMessage('');
        const capturedRows=structuredClone(filtered),capturedAt=new Date(updatedAt);
        try{
            if(format==='excel'){const {exportWorkbook}=await import('../services/excelExport.js');await exportWorkbook(inventoryReportWorkbook(capturedRows,capturedAt));}
            else{const blob=new Blob([inventoryReportCsv(capturedRows)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='CalcQuim_Existencias_y_reposicion.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
            setMessage(`Exportados ${capturedRows.length} productos del filtro. Consulta: ${dateText(capturedAt)}.`);
        }catch{setMessage('No se pudo generar la exportación. Los datos no se modificaron.');}finally{setExporting(false);}
    }
    return <section className="inventory-report" aria-label="Reporte de existencias y reposición">
        <p>Datos consultados: <strong>{dateText(updatedAt)}</strong> (hora de Ciudad de México). Actualización automática cada 10 segundos y al guardar o volver a esta ventana.</p>
        <Feedback message={error}/>{message&&<p role="status">{message}</p>}
        <div className="report-metrics">{[...Object.entries(stockStates),['negative','SALDO NEGATIVO: CONCILIAR']].map(([key,label])=><button type="button" className="report-metric" aria-pressed={state===key} key={key} onClick={()=>setState(state===key?'':key)}><span>{label}</span><strong>{summary[key]}</strong><small>Filtrar productos</small></button>)}</div>
        <div className="filter-bar"><label>Categoría<select className="form-select" value={category} onChange={e=>{setCategory(e.target.value);setLine('');}}><option value="">Todas</option>{[...catalog.categories].sort((a,b)=>a.name.localeCompare(b.name,'es')).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Línea<select className="form-select" value={line} onChange={e=>setLine(e.target.value)}><option value="">Todas</option>{catalog.productLines.filter(l=>!category||String(l.categoryId)===category).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label><label>Producto<input className="form-control" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar producto"/></label><label>Estado<select className="form-select" value={state} onChange={e=>setState(e.target.value)}><option value="">Todos</option><option value="need">Necesito surtir</option>{[...Object.entries(stockStates),['negative','SALDO NEGATIVO: CONCILIAR']].map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label></div>
        <div className="report-actions mb-3"><button className="btn btn-primary" aria-pressed={state==='need'} onClick={()=>setState('need')}>Necesito surtir</button><button className="btn btn-outline-secondary" onClick={()=>{setState('');setCategory('');setLine('');setSearch('');}}>Ver todos</button><button className="btn btn-outline-secondary" onClick={()=>refresh().catch(()=>{})}>Actualizar</button><button className="btn btn-outline-secondary" disabled={Boolean(error)||exporting} onClick={()=>setPrint({rows:structuredClone(filtered),updatedAt:new Date(updatedAt)})}>Lista imprimible</button><button className="btn btn-outline-secondary" disabled={Boolean(error)||exporting} onClick={()=>download('excel')}>Exportar Excel</button><button className="btn btn-outline-secondary" disabled={Boolean(error)||exporting} onClick={()=>download('csv')}>Exportar CSV</button></div>
        <p className="form-text">{filtered.length} productos. Los indicadores respetan los filtros de categoría, línea y producto. Los avisos de saldo negativo y falta de umbral pueden coincidir con agotado; los indicadores no deben sumarse. El lote es una referencia, no una existencia máxima ni una necesidad exacta. Sin configuración explícita de preparar/comprar se indica Reponer. La lista y las exportaciones incluyen todos los resultados filtrados, no solo la página visible.</p>
        <ContentPanel title={state==='need'?'Necesito surtir':'Existencias actuales'}><DataTable columns={columns} data={filtered} getRowId={r=>String(r.productId)} initialSorting={[{id:'category',desc:false},{id:'name',desc:false}]} enableGlobalFilter={false}/></ContentPanel>
        {selectedProduct&&<InventoryProductModal key={selected} product={selectedProduct} view={view} data={persistence.snapshot.data} categories={catalog.categories} productLines={catalog.productLines} onClose={()=>setSelected(null)} onSave={async(name,input)=>{const result=await saveInventory(persistence.command,name,input,refresh);if(result.ok)setMessage(result.viewWarning||'Guardado en PostgreSQL; reporte actualizado.');return result;}}/>}
        {print&&<AppModal title="Existencias y reposición" maxWidth="xl" onClose={()=>setPrint(null)} actions={<><Button onClick={()=>setPrint(null)}>Cerrar</Button><Button variant="contained" onClick={()=>window.print()}>Imprimir</Button></>}><div className="inventory-report-print"><p>Datos consultados: {dateText(print.updatedAt)} · {print.rows.length} productos filtrados.</p><p>Cantidades aproximadas. El lote habitual es orientativo, no una necesidad exacta.</p><table><thead><tr>{inventoryExportColumns.map(c=><th key={c.key}>{c.label}</th>)}</tr></thead><tbody>{inventoryReportWorkbook(print.rows,print.updatedAt).sheets[0].rows.map(r=><tr key={r.productId}>{inventoryExportColumns.map(c=><td key={c.key}>{r[c.key]}</td>)}</tr>)}</tbody></table></div></AppModal>}
    </section>;
}
