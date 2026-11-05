import {useContext,useMemo} from 'react';
import {CatalogContext} from '../context/CatalogHooks.js';
import {ProcurementContext} from '../context/ProcurementContext.js';
import {productActivity,scopeProcurement} from '../domain/activityScope.mjs';
import {procurementAnalytics} from '../utils/purchaseAnalytics.js';
import {localDate} from '../utils/salesUtils.js';

export default function CleaningScope({children,includeSupplierId=null}){
 const catalog=useContext(CatalogContext),procurement=useContext(ProcurementContext);
 const projected=useMemo(()=>{const products=catalog.products.filter(p=>productActivity(p)==='LIMPIEZA');const data=procurement?.data?scopeProcurement(procurement.data,catalog.products,'LIMPIEZA'):null;if(data&&includeSupplierId&&!data.suppliers.some(s=>s.id===includeSupplierId)){const historical=procurement.data.suppliers.find(s=>s.id===includeSupplierId);if(historical)data.suppliers=[...data.suppliers,historical];}return {catalog:{...catalog,products},procurement:data?{...procurement,data,analytics:procurementAnalytics(data,products,localDate())}:procurement};},[catalog,procurement,includeSupplierId]);
 return <CatalogContext.Provider value={projected.catalog}><ProcurementContext.Provider value={projected.procurement}>{children}</ProcurementContext.Provider></CatalogContext.Provider>;
}
