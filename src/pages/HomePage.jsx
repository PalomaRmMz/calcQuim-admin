import {useContext,useEffect,useState} from 'react';
import {Link} from 'react-router';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faArrowRight,faBoxOpen,faCalendarDays,faChartColumn,faCircleExclamation,faCoins,faReceipt,faCartShopping,faWarehouse} from '@fortawesome/free-solid-svg-icons';
import {PersistenceContext} from '../context/PersistenceContext.js';
import {inventoryAttention,requiresInventoryPurchase} from '../domain/inventoryAttention.mjs';
import {saleCommercialReview} from '../services/saleAuditView.mjs';
import {money} from '../utils/salesUtils.js';
import {productActivity} from '../domain/activityScope.mjs';

const dateOptions={timeZone:'America/Mexico_City'};
const dayFormat=new Intl.DateTimeFormat('sv-SE',{...dateOptions,year:'numeric',month:'2-digit',day:'2-digit'});
const todayDate=()=>dayFormat.format(new Date());

export default function HomePage(){
 const persistence=useContext(PersistenceContext);
 const revision=persistence?.snapshot.revision;
 const [inventory,setInventory]=useState(null);
 const [failed,setFailed]=useState(false);
 const [today,setToday]=useState(todayDate);
 useEffect(()=>{
  const timer=setInterval(()=>setToday(todayDate()),60000);
  return ()=>clearInterval(timer);
 },[]);
 useEffect(()=>{
  if(revision==null)return;
  const controller=new AbortController();
  fetch('/api/v1/inventory',{signal:controller.signal,cache:'no-store'}).then(response=>{
   if(!response.ok)throw Error('Inventario no disponible');
   return response.json();
  }).then(view=>{if(!controller.signal.aborted){setInventory(view);setFailed(false);}}).catch(error=>{
   if(error.name!=='AbortError')setFailed(true);
  });
  return ()=>controller.abort();
 },[revision]);
 const sales=persistence?.snapshot.data.sales??[];
 const current=sales.filter(sale=>sale.date===today&&!sale.voidedAt);
 const packs=new Map((inventory?.packInventory?.products??[]).map(pack=>[String(pack.productId),pack]));
 const counts={empty:0,low:0};
 const restock={LIMPIEZA:0,JARCERIA:0};
 let cleaningWithoutCount=0;
 const catalog=new Map((persistence?.snapshot.data.products??[]).map(product=>[String(product.id),product]));
 for(const product of inventory?.products??[]){
  const state=inventoryAttention(product,packs.get(String(product.productId))).key;
  const activity=productActivity(catalog.get(String(product.productId)));
  if(state==='unknown'&&activity==='LIMPIEZA')cleaningWithoutCount++;
  if(requiresInventoryPurchase(state)){
   counts[state]++;
   restock[activity]++;
  }
 }
 const pendingIds=new Set((persistence?.snapshot.inventoryPending??[]).map(row=>String(row.saleId)));
 const pending=sales.filter(sale=>!sale.voidedAt&&pendingIds.has(String(sale.id))).length;
 const revisions=sales.filter(sale=>saleCommercialReview(sale).pending);
 const date=new Intl.DateTimeFormat('es-MX',{dateStyle:'full',...dateOptions}).format(new Date(`${today}T18:00:00Z`));
 const stockReady=inventory?.enabled&&!failed;
 const metrics=[['Vendido hoy',persistence?money(current.reduce((sum,sale)=>sum+Number(sale.total),0)):'—',faCoins,'blue'],
  ['Ventas de hoy',persistence?current.length:'—',faReceipt,'blue'],['Productos agotados',stockReady?counts.empty:'—',faBoxOpen,'red'],['Inventario bajo',stockReady?counts.low:'—',faCircleExclamation,'amber']];
 const actions=[['Registrar venta','/ventas?nueva=1',faReceipt],['Registrar compra','/compras?nueva=1',faCartShopping],['Inventarios','/inventarios/limpieza',faWarehouse],['Reportes','/reportes',faChartColumn]];
 const alerts=[
  [stockReady?restock.LIMPIEZA:0,'Reposición de limpieza','/inventarios/limpieza'],
  [stockReady?restock.JARCERIA:0,'Reposición de jarcería','/inventarios/jarceria'],
  [stockReady?cleaningWithoutCount:0,'Limpieza sin conteo confirmado','/inventarios/limpieza'],
  [pending,'Ventas pendientes de desglose','/ventas?pendientes=1'],
  [revisions.length,'Revisiones con diferencias pendientes','/ventas?revisiones=1'],
 ].filter(([count])=>count>0);
 return <div className="nexo-home">
  <header className="nexo-home-hero"><h2>Bienvenida a Nexo · Administración</h2><p><FontAwesomeIcon icon={faCalendarDays}/> {date}</p></header>
  <div className="nexo-home-metrics">{metrics.map(([label,value,icon,tone])=><div className="nexo-home-metric" key={label}>
   <div className={`nexo-home-icon nexo-home-icon-${tone}`}><FontAwesomeIcon icon={icon}/></div>
   <div><span>{label}</span><strong>{value}</strong></div>
  </div>)}</div>
  <div className="nexo-home-panels">
  <section className="nexo-home-panel"><h3>Accesos rápidos</h3><div className="nexo-home-actions">
   {actions.map(([label,path,icon],index)=><Link key={path} className={`nexo-home-action ${index===0?'nexo-home-action-primary':''}`} to={path}>
    <FontAwesomeIcon icon={icon}/><span>{label}</span><FontAwesomeIcon icon={faArrowRight} aria-hidden="true"/>
   </Link>)}
  </div></section>
  <section className="nexo-home-panel"><h3>Atención requerida</h3>
   {failed&&<p role="status">No se pudieron consultar las existencias.</p>}
   {alerts.length>0&&<ul className="nexo-home-alerts">{alerts.map(([count,label,path])=><li key={path}><Link to={path}><span>{label}</span><strong>{count}</strong></Link></li>)}</ul>}
   {stockReady&&!alerts.length&&<p className="mb-0">Todo al día.</p>}
   {!stockReady&&!failed&&!inventory&&<p className="mb-0">{persistence?'Consultando existencias…':'Conecta el servidor para consultar pendientes.'}</p>}
   {inventory&&!inventory.enabled&&<p className="mb-0">Existencias pendientes de activación.</p>}
  </section>
  </div>
 </div>;
}
