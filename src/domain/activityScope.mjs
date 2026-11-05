export const SUPPLIER_ACTIVITIES=['LIMPIEZA','JARCERIA'];
export const productActivity=product=>product?.activity==='JARCERIA'?'JARCERIA':'LIMPIEZA';
export const supplierActivityLabel=value=>({LIMPIEZA:'Productos de limpieza',JARCERIA:'Jarcería'}[value]||'Pendiente de clasificación');
export function supplierMatches(supplier,activity,{includeUnclassified=false}={}){
 return supplier?.businessActivity===activity||(includeUnclassified&&supplier?.businessActivity==null);
}
export function assertSupplierActivity(supplier,activity,{allowLegacyUnclassified=false}={}){
 if(!SUPPLIER_ACTIVITIES.includes(activity))throw Error('Actividad de compra inválida.');
 if(!supplierMatches(supplier,activity,{includeUnclassified:allowLegacyUnclassified}))throw Error(supplier?.businessActivity==null?'Clasifica el giro del proveedor antes de registrar esta compra.':'El proveedor no corresponde a la actividad de la compra.');
}
export function purchaseActivity(purchase){
 if(purchase?.activity)return purchase.activity;
 if(purchase?.items?.length&&purchase.items.every(i=>i.commercialPurchase))return 'JARCERIA';
 return null;
}
export function purchaseScopeLabel(purchase){return purchaseActivity(purchase)==='JARCERIA'?'Jarcería':purchaseActivity(purchase)==='LIMPIEZA'?'Productos de limpieza':'Histórica · actividad no clasificada';}
export function scopeInventoryData(data,activity){
 const products=data.products.filter(p=>productActivity(p)===activity),ids=new Set(products.map(p=>String(p.id)));
 const purchases=data.procurement.purchases.filter(p=>p.items.some(i=>i.productId!=null?ids.has(String(i.productId)):activity==='LIMPIEZA'&&!i.commercialPurchase));
 const sales=data.sales.filter(s=>s.items.some(i=>i.lineType!=='service'&&(i.productId!=null?ids.has(String(i.productId)):i.activity?i.activity===activity:activity==='LIMPIEZA')));
 return {...data,products,sales,procurement:{...data.procurement,purchases}};
}

// Projection for a screen only. Actions still use the full transactional dataset.
export function scopeProcurement(data,products,activity){
 const productIds=new Set(products.filter(p=>productActivity(p)===activity).map(p=>String(p.id)));
 const suppliers=data.suppliers.filter(s=>supplierMatches(s,activity,{includeUnclassified:activity==='LIMPIEZA'}));
 const supplierIds=new Set(suppliers.map(s=>s.id));
 const conversions=(data.supplyConversions||[]).filter(c=>productIds.has(String(c.outputProductId)));
 const articleIds=new Set(conversions.map(c=>c.purchasedItemId));
 const otherArticleIds=new Set((data.supplyConversions||[]).filter(c=>!productIds.has(String(c.outputProductId))).map(c=>c.purchasedItemId));
 const sources=data.supplyItems.filter(s=>supplierIds.has(s.supplierId)&&(data.supplyModelVersion===2?(articleIds.has(s.purchasedItemId)||(!otherArticleIds.has(s.purchasedItemId)&&activity==='LIMPIEZA')):productIds.has(String(s.outputProductId))||s.outputProductId==null));
 const sourceIds=new Set(sources.map(s=>s.id));
 for(const source of sources)articleIds.add(source.purchasedItemId);
 return {...data,suppliers,supplyItems:sources,purchasedItems:(data.purchasedItems||[]).filter(a=>articleIds.has(a.id)),supplyConversions:conversions,supplierPrices:data.supplierPrices.filter(q=>sourceIds.has(q.supplyItemId)),purchases:data.purchases.filter(p=>supplierIds.has(p.supplierId)).map(p=>({...p,items:p.items.filter(i=>sourceIds.has(i.supplyItemId)||(i.productId!=null&&productIds.has(String(i.productId))))})).filter(p=>p.items.length)};
}
export function scopeInventory(view,data,activity){
 const ids=new Set(data.products.filter(p=>productActivity(p)===activity).map(p=>String(p.id)));
 const products=view.products.filter(p=>ids.has(String(p.productId)));
 const pending=view.pending.filter(p=>{if(p.product_id!=null)return ids.has(String(p.product_id));const sale=data.sales.find(s=>String(s.id)===String(p.sale_id)),line=sale?.items[p.ordinal];return line?.activity?line.activity===activity:activity==='LIMPIEZA';});
 const pendingIds=new Set(pending.map(p=>p.id)),movements=view.movements.filter(m=>ids.has(String(m.product_id))),movementIds=new Set(movements.map(m=>m.id));
 const saleIds=new Set(movements.map(m=>m.sale_id).filter(Boolean)),purchaseIds=new Set(data.procurement.purchases.filter(p=>p.items.some(i=>i.productId!=null?ids.has(String(i.productId)):activity==='LIMPIEZA'&&!i.commercialPurchase)).map(p=>p.id));
 return {...view,products,pending,movements,changes:view.changes.filter(c=>{const r=c.reference;return r.productId!=null?ids.has(String(r.productId)):r.movementId?movementIds.has(r.movementId):r.pendingId?pendingIds.has(r.pendingId):r.saleId?saleIds.has(r.saleId):r.purchaseId?purchaseIds.has(r.purchaseId):activity==='LIMPIEZA';}),purchaseReviews:view.purchaseReviews.filter(p=>purchaseIds.has(p.purchaseId))};
}
