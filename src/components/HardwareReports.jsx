import {useContext,useMemo,useState} from 'react';
import {PersistenceContext} from '../context/PersistenceContext.js';
import {commerceReport} from '../domain/commerce.mjs';
import {purchaseActivity} from '../domain/activityScope.mjs';
import ContentPanel from './ContentPanel';
import DataTable from './DataTable';
import InventoryReport from './InventoryReport';
import Feedback from './Feedback';
import {money} from '../utils/salesUtils.js';
export default function HardwareReports(){
 const persistence=useContext(PersistenceContext),[from,setFrom]=useState(''),[to,setTo]=useState('');
 const data=persistence?.snapshot.data;
 const sales=useMemo(()=>data?commerceReport(data.sales,from,to):null,[data,from,to]);
 if(!data)return <Feedback message="Los reportes de jarcería requieren el catálogo conectado."/>;
 const invalid=Boolean(from&&to&&from>to),categories=data.procurement.hardwareCategories||[],products=data.products.filter(p=>p.activity==='JARCERIA');
 const purchases=data.procurement.purchases.filter(p=>!p.voidedAt&&purchaseActivity(p)==='JARCERIA'&&(!from||p.date>=from)&&(!to||p.date<=to));
 const suppliers=new Map();for(const p of purchases){const row=suppliers.get(p.supplierId)||{id:p.supplierId,name:p.supplierNameSnapshot||data.procurement.suppliers.find(s=>s.id===p.supplierId)?.name||'Proveedor histórico',count:0,cents:0};row.count++;row.cents+=Math.round(p.total*100);suppliers.set(p.supplierId,row);}
 const missingCategory=products.filter(p=>p.hardwareCategoryId==null),missingPresentation=products.filter(p=>p.active&&!data.procurement.presentations.some(r=>String(r.productId)===String(p.id)&&r.active));
 return <><ContentPanel title="Reportes de jarcería" subtitle="Compras y ventas por actividad. Las existencias sin inventario inicial se muestran sin determinar."><div className="filter-bar"><label>Desde<input className="form-control" type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Hasta<input className="form-control" type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div>{invalid?<Feedback message="Desde debe ser anterior o igual a Hasta."/>:<><p>Compras registradas: <strong>{money(purchases.reduce((s,p)=>s+Math.round(p.total*100),0)/100)}</strong> · Ventas desglosadas: <strong>{money(sales.byActivity.JARCERIA)}</strong></p><p className="form-text">Los importes excluyen anulaciones. Las ventas resumidas pendientes de desglose no se atribuyen a un producto. Consulta márgenes, salidas y costos comparables en Análisis comercial y abastecimiento. Los cálculos sin respaldo se mantienen sin determinar.</p><DataTable mobileCards columns={[{accessorKey:'name',header:'Proveedor'},{accessorKey:'count',header:'Compras'},{id:'total',header:'Importe pagado',accessorFn:r=>money(r.cents/100)}]} data={[...suppliers.values()]}/><h3 className="h6 mt-3">Ventas por producto y unidad</h3><DataTable mobileCards columns={[{accessorKey:'name',header:'Producto'},{accessorKey:'unit',header:'Unidad'},{accessorKey:'quantity',header:'Unidades vendidas'},{id:'amount',header:'Ventas',accessorFn:r=>money(r.amount)}]} data={sales.articleRanking}/></>}</ContentPanel>
 <ContentPanel title="Calidad de configuración · Jarcería" subtitle="Solo lectura. No requiere líneas ni grupos de precios."><details><summary>{missingCategory.length} productos sin categoría · Organización pendiente</summary><p>Asigna una categoría desde Productos de jarcería para facilitar búsquedas. No impide conservar compras ni ventas.</p><ul>{missingCategory.map(p=><li key={p.id}>{p.name}</li>)}</ul></details><details><summary>{missingPresentation.length} productos activos sin presentación de venta · Requiere atención</summary><p>Agrega o activa una presentación con unidad, contenido y precio para ofrecer estos productos en ventas.</p><ul>{missingPresentation.map(p=><li key={p.id}>{p.name}</li>)}</ul></details><p>{categories.length} categorías independientes. Los niveles de mayoreo se consultan y administran por proveedor desde Nueva compra de jarcería.</p></ContentPanel>
 <InventoryReport activity="JARCERIA"/></>;
}
