import {ApiError} from './commands.mjs';
const fail=(message,code='INVENTORY_VALIDATION')=>{throw new ApiError(422,code,message);};
export async function checkBaseline(c,product,event,treatment){
  const anchor=(await c.query('SELECT m.* FROM inventory_accounts a JOIN inventory_movements m ON m.id=a.anchor_id WHERE a.product_id=$1',[String(product.id)])).rows[0];
  if(!anchor){if(treatment==='already_included')fail('No existe una estimación en la que incluir este movimiento.');return {};}
  const day=anchor.recorded_at.toLocaleDateString('en-CA',{timeZone:'America/Mexico_City'});
  const older=Boolean((event.seq!=null&&BigInt(event.seq)<BigInt(anchor.seq))||(event.date&&event.date<day)||(event.createdAt&&Date.parse(event.createdAt)<anchor.recorded_at.getTime()));
  if(!older){if(treatment==='already_included')fail('Indica la fecha original anterior a la estimación; no se omite una operación posterior.');return {};}
  if(!['already_included','apply_now'].includes(treatment))fail('La operación es anterior a la última estimación. Confirma si ya estaba incluida o si debe aplicarse ahora.','INVENTORY_BASELINE_REVIEW_REQUIRED');
  return {baselineTreatment:treatment,baselineAnchorId:anchor.id,...(treatment==='already_included'?{includedInAnchorId:anchor.id}:{})};
}
