import {ApiError} from '../services/commands.mjs';
export function installSalesHistory(router,service,{principal=null}={}){
 const permitted=()=>{if(!principal?.permissions?.includes('sales:read'))throw new ApiError(403,'SALES_READ_FORBIDDEN','No tienes permiso para consultar el historial oficial.');};
 router.get('/sales/history',async(req,res)=>{permitted();res.json(await service.salesHistory(req.query));});
 router.get('/sales/history/:id',async(req,res)=>{permitted();res.json(await service.officialSale(req.params.id,req.query));});
}
