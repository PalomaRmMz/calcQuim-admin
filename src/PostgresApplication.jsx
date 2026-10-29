import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import App from './App.jsx';
import { CatalogContext } from './context/CatalogHooks.js';
import { ProcurementContext } from './context/ProcurementContext.js';
import { PersistenceContext } from './context/PersistenceContext.js';
import { createApiClient } from './services/apiClient.js';
import { catalogProductPrice } from './services/catalogValidation.js';
import { getProductDisplayName } from './utils/catalogUtils.js';
import { procurementAnalytics } from './utils/purchaseAnalytics.js';
import { supplyModelIssues } from './services/supplyModel.js';
import { localDate } from './utils/salesUtils.js';
import ExportExcelButton from './components/ExportExcelButton.jsx';

const catalogNames=['addCategory','updateCategory','deleteCategory','addProductLine','updateProductLine','deleteProductLine','addPriceGroup','updatePriceGroup','deletePriceGroup','addProduct','updateProduct','deleteProduct','addProductsBatch','updateProductsBatch'];
const procurementNames=['savePurchasedItem','savePurchasedItemsBatch','saveSupplyYieldBatch','savePurchasedItemSetup','saveSupplySource','saveSupplyConversion','configureSupplyBatch','configureProductBatch','saveSources','saveSupplier','setSupplyActive','addSupplierPrice','deleteEntity','savePurchase','voidPurchase'];

function ConnectedApplication({ operational=false }) {
    const [client] = useState(()=>createApiClient(fetch,window.sessionStorage,operational?'operational':'synthetic'));
    const [snapshot,setSnapshot] = useState(null);
    const [error,setError] = useState('');
    const [today,setToday] = useState(localDate);
    const { pathname } = useLocation();
    useEffect(() => {
        let active=true;
        client.read().then(value=>{if(active)setSnapshot(value);}).catch(()=>{if(active)setError('No se pudo leer PostgreSQL. Comprueba que Express y PostgreSQL estén disponibles. No se usará localStorage como sustituto.');});
        return ()=>{active=false;};
    },[client]);
    useEffect(()=>{const timer=setInterval(()=>setToday(localDate()),60000);return()=>clearInterval(timer);},[]);
    if (!snapshot) return <main className="container py-5"><h1>{operational?'CalcQuim · PostgreSQL local':'PostgreSQL de ensayo'}</h1><p role="status">{error || 'Consultando servidor local…'}</p><button onClick={()=>window.location.reload()}>Reintentar</button></main>;
    const data=snapshot.data;
    const products=data.products.map(p=>({...p,displayName:getProductDisplayName(p,data.categories,data.productLines)}));
    const command=async(name,args)=>{
        const result=await client.command(name,args);
        if(result.ok) {setSnapshot(result.snapshot);setError('');}
        else setError(result.message);
        return result;
    };
    const actions=names=>Object.fromEntries(names.map(name=>[name,(...args)=>command(name,args)]));
    const exportSnapshot=()=>({...data,legacyPurchases:[],issues:[],metadata:[{key:'storage',origin:operational?'PostgreSQL local':'PostgreSQL sintético',value:snapshot.revision}],capturedAt:new Date()});
    const download=()=>{
        const blob=new Blob([JSON.stringify({application:operational?'CalcQuimPostgres':'CalcQuimPostgresSynthetic',formatVersion:1,...snapshot},null,2)],{type:'application/json'});
        const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=operational?'CalcQuim_Postgres.json':'CalcQuim_PostgresSynthetic.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
    const catalog={...data,...actions(catalogNames),storageError:'',assertCatalogCurrent:()=>{},getDisplayName:p=>getProductDisplayName(p,data.categories,data.productLines),getProductPrice:p=>catalogProductPrice(p,data.priceGroups),isProductAvailable:p=>p.available??true};
    const procurement={data:data.procurement,error:'',...actions(procurementNames),analytics:procurementAnalytics(data.procurement,products,today),integrityIssues:supplyModelIssues(data.procurement,products),saveSupplyBatch:()=>({ok:false,message:'El modelo actual utiliza Configurar productos por lote.'})};
    const administration=pathname.startsWith('/administracion')||pathname==='/datos';
    return <PersistenceContext.Provider value={{snapshot,command,exportSnapshot}}><CatalogContext.Provider value={catalog}><ProcurementContext.Provider value={procurement}>
        <aside role="status" className="alert alert-info mb-0">{operational?'PostgreSQL local · Guardado exclusivo en el servidor.':'PostgreSQL de ensayo · Datos sintéticos · El almacenamiento habitual del navegador permanece separado.'} <Link to="/administracion/datos">Respaldos</Link> · <button className="btn btn-sm btn-outline-secondary" onClick={()=>window.location.reload()}>Actualizar datos</button></aside>
        {error&&<p role="alert" className="alert alert-danger">{error}</p>}
        {administration?<main className="container py-4"><h1>{operational?'Respaldos PostgreSQL':'Datos de ensayo PostgreSQL'}</h1><p>{operational?'Descarga una copia lógica o exporta a Excel. El respaldo completo y la restauración se realizan con las herramientas privadas del servidor.':'La restauración se ensaya en un esquema independiente mediante las herramientas del servidor.'}</p><button onClick={download}>Descargar copia lógica</button><ExportExcelButton/><Link to="/productos">Volver a Productos</Link></main>:<App/>}
    </ProcurementContext.Provider></CatalogContext.Provider></PersistenceContext.Provider>;
}
export default function PostgresApplication({ operational=false }) {
    const [accepted,setAccepted]=useState(false);
    return operational||accepted?<ConnectedApplication operational={operational}/>:<main className="container py-5"><h1>CalcQuim · PostgreSQL de ensayo</h1><p>Este modo utiliza una base local con datos sintéticos. No carga, importa ni sustituye los datos de tu navegador habitual.</p><button className="btn btn-primary" onClick={()=>setAccepted(true)}>Abrir entorno PostgreSQL de ensayo</button></main>;
}
