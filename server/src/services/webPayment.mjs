import {paymentAmounts,WEB_PAYMENT_POLICY} from '../../../src/domain/webPayment.mjs';
import {ApiError} from './commands.mjs';
export async function webPaymentSnapshot(c){
 if(!(await c.query("SELECT to_regclass('web_payment_settings') IS NOT NULL AS ok")).rows[0].ok)return {available:false,enabled:false};
 return JSON.parse(JSON.stringify({available:true,...(await c.query('SELECT * FROM web_payment_settings WHERE singleton=true')).rows[0]}));
}
export async function configureWebPayment(c,input){
 const policy=await webPaymentSnapshot(c);
 if(policy.available&&policy.policy_version!==WEB_PAYMENT_POLICY)throw new ApiError(409,'WEB_PAYMENT_POLICY_SCHEMA_MISMATCH','La configuraci?n requiere un esquema coherente con la versi?n preparada.');
 if(!policy.available)throw new ApiError(422,'WEB_PAYMENT_SCHEMA_PENDING','La política requiere la migración 013 autorizada.');
 if(input?.approved!==true||input.policyVersion!==WEB_PAYMENT_POLICY||typeof input.enabled!=='boolean'||!input.reason?.trim())throw new ApiError(422,'WEB_PAYMENT_APPROVAL_REQUIRED','Confirma la versión, estado y motivo de la política web.');
 const event={at:new Date().toISOString(),enabled:input.enabled,policyVersion:WEB_PAYMENT_POLICY,reason:input.reason.trim()};
 await c.query('UPDATE web_payment_settings SET enabled=$1,activated_at=CASE WHEN $1 THEN now() ELSE activated_at END,history=history||$2::jsonb WHERE singleton=true',[input.enabled,JSON.stringify([event])]);
 return {ok:true};
}
export function applyWebPayment(data,before,name,args,options={}){
 if(['createCommercialSale','createSale'].includes(name)&&options.webPaymentEnabled){
  if(options.webPaymentVersion&&options.webPaymentVersion!==WEB_PAYMENT_POLICY)throw new ApiError(409,'WEB_PAYMENT_POLICY_SCHEMA_MISMATCH','El esquema de pruebas anterior no debe reutilizarse con otra pol?tica.');
  if(args[0]?.webPaymentPolicyVersion!==WEB_PAYMENT_POLICY)throw new ApiError(409,'WEB_PAYMENT_CLIENT_UPDATE_REQUIRED','Actualiza la web antes de registrar un cobro con la nueva política.');
  const sale=data.sales[0];decorate(sale,WEB_PAYMENT_POLICY);
  if(sale.originalReceipt)sale.originalReceipt={...sale.originalReceipt,payment:sale.payment,monetary:{...sale.monetary},total:sale.total};
 }else if(name==='correctMobileSale'){
  const previous=before.find(s=>s.id===args[0]);if(!previous?.monetary)return;
  if(args[1]?.payment!=null&&args[1].payment!==previous.payment)throw new ApiError(422,'PAYMENT_CHANGE_UNSUPPORTED','La corrección conserva el método de pago; no hay flujo de liquidación para cambiarlo.');
  const sale=data.sales.find(s=>s.id===previous.id);decorate(sale,previous.monetary.policyVersion);
  const confirmed=previous.monetarySettlement?.lastConfirmedCollectedCents??previous.originalReceipt?.monetary?.collectedCents??previous.monetary.collectedCents;
  sale.monetarySettlement={status:'not_recorded',lastConfirmedCollectedCents:confirmed,revisedDueCents:sale.monetary.collectedCents,differenceCents:sale.monetary.collectedCents-confirmed};
  sale.revisions.at(-1).monetary={...previous.monetary};
  sale.history.at(-1).monetaryBefore={...previous.monetary};sale.history.at(-1).monetaryAfter={...sale.monetary};
  sale.history.at(-1).revisedTotalDifferenceCents=sale.monetary.collectedCents-previous.monetary.collectedCents;
  sale.history.at(-1).settlementStatus='not_recorded';
  sale.updatedReceipt={...sale.updatedReceipt,payment:sale.payment,monetary:{...sale.monetary},monetarySettlement:{...sale.monetarySettlement},total:sale.total};
 }else if(name==='voidSale'){
  const sale=data.sales.find(s=>s.id===args[0]);if(sale?.monetary)sale.voidMonetary={...sale.monetary,lastConfirmedCollectedCents:sale.monetarySettlement?.lastConfirmedCollectedCents??sale.monetary.collectedCents,settlementStatus:'not_recorded'};
 }
}
function decorate(sale,version){sale.monetary=paymentAmounts(sale.items,sale.payment,version);sale.total=sale.monetary.collectedCents/100;}
