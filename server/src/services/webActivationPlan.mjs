import {createHash} from 'node:crypto';
import {officialServices} from '../../../src/domain/officialLaundryServices.mjs';
import {jarceriaInitialPolicy} from '../../../src/domain/webBusinessDecisions.mjs';
import {packOptions} from '../../../src/domain/packInventory.mjs';
export function webActivationPlan(data){
 const current=data.procurement.services||[];
 const physicalCatalog={products:data.products.filter(p=>p.activity==='JARCERIA').map(p=>({id:p.id,unit:p.unit,activity:p.activity})),presentations:data.procurement.presentations||[]};
 const payload={services:current,proposedServices:officialServices,purchases:data.procurement.purchases,jarceriaInitialPolicy,packInventoryVersion:1,physicalCatalog};
 const hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
 return {hash,packProducts:data.products.flatMap(p=>{const options=packOptions(p,data.procurement.presentations||[]);return options.length?[{productId:p.id,name:p.name,presentations:options.map(o=>({id:o.id,factor:o.factor})),historicalComposition:'unknown_until_explicitly_counted'}]:[];}),requiresOperationalAuthorization:true,requiresSchema:12,packInventoryVersion:1,jarceriaInitialPolicy,historicalManualInclusion:'Aplicar solo el listado de renglones confirmado por el propietario, con sus huellas; sin movimientos físicos ni enlaces inferidos',services:officialServices.map(proposed=>({id:proposed.id,current:current.find(s=>s.id===proposed.id)??null,proposed})),historicalPurchases:data.procurement.purchases.filter(p=>!p.voidedAt).length,inventoryPolicy:'Solo compras nuevas inequívocas; históricas confirmadas como incorporadas manualmente, sin nueva entrada',requirements:['Backend y frontend preparados verificados juntos','Respaldo y restauración operativa verificados','Aprobación expresa de tarifas, corte histórico y ventana de activación']};
}
