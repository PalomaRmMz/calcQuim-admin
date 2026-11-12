import {ApiError} from '../services/commands.mjs';
const fail=(status,code,message)=>{throw new ApiError(status,code,message);};
const keyValid=k=>typeof k==='string'&&/^[a-zA-Z0-9_-]{8,64}$/.test(k);
export function installHardwareCreation(router,service,{principal=null}={}){
  const permitted=()=>{if(!principal?.permissions?.includes('hardware:create'))fail(403,'HARDWARE_CREATE_FORBIDDEN','No tienes permiso para dar de alta Jarcería.');};
  const key=k=>`mobile-product:${principal.id}:${k}`;
  router.get('/hardware/creation-options',async(_req,res)=>{permitted();const s=await service.read();res.json({revision:s.revision,generation:s.generation,categories:s.data.procurement.hardwareCategories.filter(c=>c.active),permission:true});});
  router.get('/hardware/operations/:key',async(req,res)=>{permitted();if(!keyValid(req.params.key))fail(400,'INVALID_KEY','Clave inválida.');const saved=await service.inventoryOperationStatus(key(req.params.key));res.json(saved?{status:'confirmed',operationId:req.params.key,productId:saved.response.id}:{status:'not_found'});});
  router.post('/hardware/products',async(req,res)=>{
    permitted();const b=req.body,k=req.get('Idempotency-Key');
    if(!keyValid(k))fail(400,'INVALID_KEY','Clave inválida.');
    if(!b||b.confirmed!==true||Object.keys(b).some(k=>!['confirmed','zeroConfirmed','revision','generation','bundle'].includes(k))||!Number.isSafeInteger(b.revision)||typeof b.generation!=='string')fail(400,'INVALID_BODY','Revisa y confirma el alta.');
    const p=b.bundle?.product,rows=b.bundle?.presentations;
    if(!p||Object.keys(b.bundle).some(k=>!['product','presentations','initialInventory'].includes(k))||Object.keys(p).some(k=>!['name','unit','hardwareCategoryId','characteristics','active','available','pricePending'].includes(k))||!Array.isArray(rows)||rows.length>20||rows.some(r=>Object.keys(r).some(k=>!['name','unit','factor','price','integerOnly','active'].includes(k))))fail(400,'HARDWARE_ONLY','Solo se permite un producto nuevo de Jarcería.');
    if(rows.some(r=>typeof r.price!=='number'||r.price<=0||!Number.isFinite(r.price)||Math.abs(r.price*100-Math.round(r.price*100))>0.00001))fail(422,'INVALID_PRICE','Introduce un precio positivo confirmado.');
    const initial=b.bundle.initialInventory;
    if(initial&&Number(initial.quantity)===0&&b.zeroConfirmed!==true)fail(422,'ZERO_CONFIRMATION_REQUIRED','Confirma expresamente el inventario inicial en cero.');
    if(initial&&(Object.keys(initial).some(k=>!['quantity','unit','observations'].includes(k))||String(initial.quantity).trim()===''||Number(initial.quantity)<0))fail(422,'INVALID_INITIAL','Cantidad inicial inválida.');
    const audit={responsibleId:principal.id,responsible:principal.name,channel:'ANDROID',operationId:k};
    const bundle={...b.bundle,product:{...p,creationAudit:audit,active:true,available:p.pricePending?false:true},...(initial?{initialInventory:{...initial,observations:`ANDROID_PRODUCT ${JSON.stringify(audit)}\n${String(initial.observations||'').slice(0,1000)}`}}:{})};
    const s=await service.command({name:'saveHardwareProductBundle',args:[bundle],revision:b.revision,generation:b.generation,requestKey:key(k),channel:'MOVIL'});
    res.json({status:'confirmed',operationId:k,productId:s.result.id,revision:s.revision,generation:s.generation,replayed:s.replayed===true});
  });
}
