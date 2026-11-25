import { useEffect, useState } from 'react';

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

import { wholesaleSettings } from './domain/wholesalePricing.mjs';

const catalogNames=['addCategory','updateCategory','deleteCategory','addProductLine','updateProductLine','deleteProductLine','addPriceGroup','updatePriceGroup','deletePriceGroup','addProduct','updateProduct','deleteProduct','addProductsBatch','updateProductsBatch'];
const procurementNames=['savePurchasedItem','savePurchasedItemsBatch','saveSupplyYieldBatch','savePurchasedItemSetup','saveSupplySource','saveSupplyConversion','configureSupplyBatch','configureProductBatch','saveSources','saveSupplier','setSupplyActive','addSupplierPrice','deleteEntity','savePurchase','voidPurchase'];

function ConnectedApplication({ operational=false }) {
    const [client] = useState(()=>createApiClient(fetch,window.sessionStorage,operational?'operational':'synthetic'));
    const [snapshot,setSnapshot] = useState(null);
    const [error,setError] = useState('');
    const [refreshing,setRefreshing]=useState(false);
    const [today,setToday] = useState(localDate);

    useEffect(() => {
        let active=true;
        client.read().then(value=>{if(active)setSnapshot(value);}).catch(()=>{if(active)setError('No se pudo leer PostgreSQL. Comprueba que Express y PostgreSQL estén disponibles. No se usará localStorage como sustituto.');});
        return ()=>{active=false;};
    },[client]);
    useEffect(()=>{const timer=setInterval(()=>setToday(localDate()),60000);return()=>clearInterval(timer);},[]);
    if (!snapshot) return <main className="container py-5"><h1>{operational?'Nexo · Administración':'PostgreSQL de ensayo'}</h1><p role="status">{error || 'Consultando servidor local…'}</p><button onClick={()=>window.location.reload()}>Reintentar</button></main>;
    async function refreshData(){
        if(refreshing)return;setRefreshing(true);
        try{const next=await client.read();setSnapshot(next);setError('');return {ok:true,snapshot:next};}
        catch{const message='No se pudieron actualizar los datos. Reintenta cuando el servidor este disponible.';setError(message);return {ok:false,message};}
        finally{setRefreshing(false);}
    }
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

    const catalog={...data,wholesalePricing:wholesaleSettings(data),...actions(catalogNames),storageError:'',assertCatalogCurrent:()=>{},getDisplayName:p=>getProductDisplayName(p,data.categories,data.productLines),getProductPrice:p=>catalogProductPrice(p,data.priceGroups,Boolean(wholesaleSettings(data))),isProductAvailable:p=>p.available??true};
    const procurement={data:data.procurement,error:'',...actions(procurementNames),analytics:procurementAnalytics(data.procurement,products,today),integrityIssues:supplyModelIssues(data.procurement,products),saveSupplyBatch:()=>({ok:false,message:'El modelo actual utiliza Configurar productos por lote.'})};

    return <PersistenceContext.Provider value={{snapshot,command,refresh:refreshData,exportSnapshot}}><CatalogContext.Provider value={catalog}><ProcurementContext.Provider value={procurement}>
        <App connection={<div className="nexo-connection"><span role="status">{operational?'Servidor local':'Servidor QA'} · {error?'Revisa el estado':'Conectado'}</span><button type="button" className="btn btn-sm btn-outline-secondary" disabled={refreshing} onClick={refreshData}>{refreshing?'Actualizando…':'Actualizar datos'}</button>{error&&<span role="alert" className="text-danger">{error}</span>}</div>}/>
    </ProcurementContext.Provider></CatalogContext.Provider></PersistenceContext.Provider>;
}
export default function PostgresApplication({ operational=false }) {
    const [accepted,setAccepted]=useState(false);
    return operational||accepted?<ConnectedApplication operational={operational}/>:<main className="container py-5"><h1>Nexo · Administración · QA</h1><p>Este modo utiliza una base local con datos sintéticos. No carga, importa ni sustituye los datos de tu navegador habitual.</p><button className="btn btn-primary" onClick={()=>setAccepted(true)}>Abrir entorno PostgreSQL de ensayo</button></main>;
}
