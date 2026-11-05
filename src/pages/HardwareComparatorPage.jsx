import {useContext,useState} from 'react';
import {Dialog,DialogContent,DialogActions,Button} from '@mui/material';
import {PersistenceContext} from '../context/PersistenceContext.js';
import {hardwareComparison} from '../domain/hardwareComparator.mjs';
import {localDate,money} from '../utils/salesUtils.js';
import ContentPanel from '../components/ContentPanel';
import DataTable from '../components/DataTable';
import TableActions from '../components/TableActions';
import ModalHeader from '../components/ModalHeader';
import {Field} from '../components/ProcurementFields';
import EmptyState from '../components/EmptyState';
export default function HardwareComparatorPage(){
 const persistence=useContext(PersistenceContext),[productId,setProductId]=useState(''),[supplier,setSupplier]=useState(''),[history,setHistory]=useState(null);
 if(!persistence)return <p>El comparador de jarcería requiere PostgreSQL.</p>;
 const data=persistence.snapshot.data,comparison=hardwareComparison(data,productId,localDate());
 const cost=row=>row.unitCost==null?'No comparable':money(row.unitCost)+' / '+row.baseUnit;
 const columns=[{accessorKey:'supplierName',header:'Proveedor'},
 {id:'presentation',header:'Presentación',accessorFn:r=>`${r.name} · ${r.quantity??'Sin dato'} ${r.unit||''}`},
 {id:'paid',header:'Costo registrado',accessorFn:r=>r.total==null?'Sin dato':money(r.total)},
 {id:'content',header:'Equivalente',accessorFn:r=>r.baseQuantity==null?'Sin equivalencia':`${r.baseQuantity} ${r.baseUnit}`},
 {id:'cost',header:'Costo por unidad',accessorFn:r=>r.unitCost,Cell:({row})=><><strong className="table-money">{cost(row.original)}</strong>{row.original.comparable&&comparison.best&&row.original.id===comparison.best.id&&<small className="d-block best-cost-label">★ Mejor costo conocido</small>}<small className="d-block text-muted">{row.original.comparable?'Comparable':row.original.reason}</small></>},
 {accessorKey:'date',header:'Fecha'},{accessorKey:'source',header:'Origen del costo'},
 {id:'actions',header:'Historial',enableSorting:false,Cell:({row})=><TableActions label={row.original.supplierName} viewLabel="Historial de" onView={()=>setHistory(row.original.supplierId)} showDelete={false}/>}];
 const rows=comparison.offers.filter(r=>!supplier||String(r.supplierId)===supplier);
 return <ContentPanel title="Comparador de jarcería" subtitle="Compara lo que cuesta comprar la misma cantidad de un producto.">
 <div className="filter-bar"><Field label="Producto" value={productId} onChange={e=>{setProductId(e.target.value);setSupplier('');}}><option value="">Selecciona un producto</option>{data.products.filter(p=>p.activity==='JARCERIA').map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</Field><Field label="Proveedor" value={supplier} onChange={e=>setSupplier(e.target.value)}><option value="">Todos</option>{[...new Map(comparison.offers.map(r=>[r.supplierId,r.supplierName]))].map(([id,name])=><option key={id} value={id}>{name}</option>)}</Field><button className="btn btn-outline-secondary" onClick={()=>{setProductId('');setSupplier('');}}>Limpiar filtros</button></div>
 {!comparison.product?<EmptyState title="Selecciona un producto">Consulta proveedores, costos y presentaciones comparables.</EmptyState>:<>{comparison.best?<div className="alert alert-info"><strong>Mejor costo conocido: {comparison.best.supplierName}</strong><span className="d-block">{cost(comparison.best)} · {comparison.best.source} · {comparison.best.date}</span></div>:<EmptyState title="Sin costos comparables">Registra una compra o revisa la información de los proveedores.</EmptyState>}
 <DataTable columns={columns} data={rows} searchPlaceholder="Buscar proveedor o presentación..." initialSorting={[{id:'cost',desc:false}]}/><p className="form-text">Se compara el último costo de cada oferta, con contenido y vigencia conocidos. El precio de venta no interviene.</p></>}
 <Dialog className="app-dialog" open={history!==null} fullWidth maxWidth="lg" onClose={()=>setHistory(null)}><ModalHeader title="Historial de costos" onClose={()=>setHistory(null)}/><DialogContent><DataTable columns={columns.filter(c=>c.id!=='actions')} data={comparison.history.filter(r=>String(r.supplierId)===String(history))} searchPlaceholder="Buscar costo..." initialSorting={[{id:'date',desc:true}]}/></DialogContent><DialogActions><Button onClick={()=>setHistory(null)}>Cerrar</Button></DialogActions></Dialog>
 </ContentPanel>;
}
