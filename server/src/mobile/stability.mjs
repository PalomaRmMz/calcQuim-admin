import {ApiError} from '../services/commands.mjs';
const fail=(code,message,status=422)=>{throw new ApiError(status,code,message);};
const key=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(value);
export function installStability(router,service,{principal=null}={}){
 const permit=permission=>{if(!principal?.permissions?.includes(permission))fail('FORBIDDEN','Operación no autorizada.',403);};
 router.post('/sales/attempts/:key/cancel',async(req,res)=>{
  permit('sales:reconcile');const b=req.body;
  if(!key(req.params.key)||!b||b.confirmed!==true||typeof b.generation!=='string'||typeof b.reason!=='string'||!b.reason.trim()||b.reason.length>1000||Object.keys(b).some(k=>!['generation','reason','linkedSaleId','confirmed'].includes(k)))fail('INVALID_RECONCILIATION','Confirma el motivo y la operación pendiente.');
  res.json(await service.cancelMobileAttempt(req.params.key,{...b,reason:b.reason.trim()},principal));
 });
 router.get('/sales/reconciliation/:reference',async(req,res)=>{
  permit('sales:reconcile');const reference=req.params.reference;if(!reference||reference.length>150)fail('INVALID_REFERENCE','Escribe el folio o identificador exacto.');
  const s=await service.read(),matches=s.data.sales.filter(s=>(String(s.id)===reference||s.folio===reference)&&s.origin==='WEB'&&!s.voidedAt);
  if(matches.length!==1)fail('WEB_SALE_NOT_FOUND','No existe una única venta web vigente con esa referencia.',404);
  const sale=matches[0];res.json({id:String(sale.id),folio:sale.folio,date:sale.date,total:sale.total,payment:sale.payment,origin:sale.origin});
 });
 router.get('/sales/:id/editor',async(req,res)=>{
  permit('sales:edit');const s=await service.operations(),sale=s.data.sales.find(s=>String(s.id)===req.params.id&&s.origin==='MOVIL');
  if(!sale)fail('SALE_NOT_FOUND','Venta móvil no encontrada.',404);
  const snapshot=await service.read();if(snapshot.revision!==s.revision)fail('STALE_DATA','Actualiza la consulta.',409);
  res.json({sale,revision:s.revision,generation:snapshot.generation,products:s.data.products,pending:s.inventory.pending.filter(p=>String(p.sale_id)===String(sale.id)&&p.state==='pending'),inventory:s.inventory});
 });
 router.get('/sales/changes/:key',async(req,res)=>{
  permit('sales:edit');if(!key(req.params.key))fail('INVALID_KEY','Clave inválida.');
  const saved=await service.inventoryOperationStatus('mobile-change:'+req.params.key);res.json(saved?{status:'confirmed',result:saved.response}:{status:'not_found'});
 });
 router.post('/sales/:id/changes',async(req,res)=>{
  permit('sales:edit');const b=req.body,k=req.get('Idempotency-Key');
  if(!key(k)||!b||!['correction','breakdown'].includes(b.kind)||!Number.isSafeInteger(b.revision)||typeof b.generation!=='string'||!b.change||typeof b.change!=='object')fail('INVALID_CHANGE','Revisa la modificación.');
  const snapshot=await service.read(),sale=snapshot.data.sales.find(s=>String(s.id)===req.params.id&&s.origin==='MOVIL');if(!sale||sale.voidedAt)fail('SALE_NOT_EDITABLE','Venta no disponible para edición.');
  if(b.kind==='correction'&&Object.keys(b.change).some(k=>!['values','confirmedQuantities','serviceOptions','reason','physicalTreatment','baselineTreatment','packReturnDisposition'].includes(k)))fail('INVALID_CHANGE','Campos de revisión no autorizados.');
  if(b.kind==='breakdown'&&Object.keys(b.change).some(k=>!['rows','observations'].includes(k)))fail('INVALID_CHANGE','Campos de desglose no autorizados.');
  const name=b.kind==='correction'?'correctMobileSale':'resolveSaleBreakdowns';
  const args=b.kind==='correction'?[sale.id,{...b.change,auditChannel:'MOVIL'}]:[{...b.change,saleId:sale.id}];
  const result=await service.command({name,args,revision:b.revision,generation:b.generation,requestKey:'mobile-change:'+k,channel:'MOVIL'});
  res.json({status:'confirmed',result:result.result,revision:result.revision,generation:result.generation,replayed:result.replayed});
 });
}
