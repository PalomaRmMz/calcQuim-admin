import { Router } from 'express';
import { ApiError } from '../services/commands.mjs';
import { procurementAnalytics } from '../../../src/utils/purchaseAnalytics.js';
import { reportAnalytics,purchaseReport } from '../../../src/utils/reportAnalytics.js';
import { getProductDisplayName } from '../../../src/utils/catalogUtils.js';
import { createDataController } from '../controllers/data.mjs';

const resources={
  categories:['categories','addCategory','updateCategory','deleteCategory'],
  'product-lines':['productLines','addProductLine','updateProductLine','deleteProductLine'],
  'price-groups':['priceGroups','addPriceGroup','updatePriceGroup','deletePriceGroup'],
  products:['products','addProduct','updateProduct','deleteProduct'],
  suppliers:['suppliers','saveSupplier','saveSupplier','deleteEntity'],
  'purchased-items':['purchasedItems','savePurchasedItem','savePurchasedItem'],
  'supply-sources':['supplyItems','saveSupplySource','saveSupplySource','deleteEntity'],
  'supply-conversions':['supplyConversions','saveSupplyConversion','saveSupplyConversion'],
  'supplier-costs':['supplierPrices','addSupplierPrice'],
  purchases:['purchases','savePurchase','savePurchase'], sales:['sales','createSale'],
};
export function dataRouter(service) {
  const r=Router();
  r.use((req,_res,next)=>{
    if(['POST','PATCH','PUT'].includes(req.method)&&(!req.body||typeof req.body!=='object'||Array.isArray(req.body))) throw new ApiError(400,'INVALID_BODY','Se requiere un objeto JSON.');
    next();
  });
  const {run,read}=createDataController(service);
  r.get('/dataset',read);
  r.get('/inventory',async(_req,res)=>res.json(await service.inventory()));
  r.post('/commands/:name',async(req,res)=>run(req,res,req.params.name,req.body.args));
  r.get('/analytics/:kind',async(req,res)=>{
    const {data}=await service.read();
    const today=req.query.today??new Date().toLocaleDateString('en-CA',{timeZone:'America/Mexico_City'});
    if(!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new ApiError(400,'INVALID_DATE','Fecha inválida.');
    const products=data.products.map(p=>({...p,displayName:getProductDisplayName(p,data.categories,data.productLines)}));
    const analytics=procurementAnalytics(data.procurement,products,today);
    if(req.params.kind==='procurement') return res.json({rows:analytics.rows,observations:analytics.observations});
    if(req.params.kind==='reports') return res.json(reportAnalytics(data.procurement,products,data.categories,data.productLines,analytics));
    if(req.params.kind==='purchases') return res.json(purchaseReport(data.procurement,req.query.from,req.query.to));
    throw new ApiError(404,'NOT_FOUND','Reporte no encontrado.');
  });
  for(const [path,[collection,create,update,remove]] of Object.entries(resources)) {
    r.get(`/${path}`,async(_req,res)=>{const s=await service.read();res.json({data:s.data[collection]??s.data.procurement[collection],revision:s.revision,generation:s.generation});});
    r.get(`/${path}/:id`,async(req,res)=>{const s=await service.read();const row=(s.data[collection]??s.data.procurement[collection]).find(x=>String(x.id)===req.params.id);if(!row)throw new ApiError(404,'NOT_FOUND','Registro no encontrado.');res.json({data:row,revision:s.revision,generation:s.generation});});
    r.post(`/${path}`,async(req,res)=>{
      if(req.body.id!=null)throw new ApiError(400,'SERVER_ASSIGNED_ID','El servidor asigna el identificador.');
      await run(req,res,create,[req.body]);
    });
    if(update) r.patch(`/${path}/:id`,async(req,res)=>{
      const s=await service.read();const old=(s.data[collection]??s.data.procurement[collection]).find(x=>String(x.id)===req.params.id);
      if(!old)throw new ApiError(404,'NOT_FOUND','Registro no encontrado.');
      const args=collection==='purchases'?[req.body,old.id]:collection in s.data?[old.id,{...old,...req.body}]:[{...old,...req.body,id:old.id}];
      await run(req,res,update,args);
    });
    if(remove) r.delete(`/${path}/:id`,async(req,res)=>{
      const s=await service.read();const old=(s.data[collection]??s.data.procurement[collection]).find(x=>String(x.id)===req.params.id);
      if(!old)throw new ApiError(404,'NOT_FOUND','Registro no encontrado.');
      await run(req,res,remove,remove==='deleteEntity'?[collection,old.id]:[old.id]);
    });
  }
  for(const resource of ['purchases','sales']) r.post(`/${resource}/:id/void`,async(req,res)=>{
    const s=await service.read();const row=(s.data[resource]??s.data.procurement[resource]).find(x=>String(x.id)===req.params.id);
    if(!row)throw new ApiError(404,'NOT_FOUND','Registro no encontrado.');
    await run(req,res,resource==='sales'?'voidSale':'voidPurchase',resource==='sales'?[row.id,req.body]:[row.id]);
  });
  return r;
}
