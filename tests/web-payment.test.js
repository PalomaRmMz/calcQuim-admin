import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentAmounts,assertPayment,moneyCents,WEB_PAYMENT_POLICY,LEGACY_WEB_PAYMENT_POLICY} from '../src/domain/webPayment.mjs';
import {ticketHtml} from '../src/domain/mobileReceipt/ticket.mjs';
import {validateSales} from '../src/services/salesStorage.js';
import {operationsReport} from '../src/domain/operationsReport.mjs';
const line=amount=>({id:'i',name:'Alcohol',productId:1,activity:'LIMPIEZA',lineType:'physical',unit:'litro',quantity:.25,price:45,amount,entryMode:'quantity'});

test('final policy has a different identifier and retains v1 interpretation',()=>{
 assert.notEqual(WEB_PAYMENT_POLICY,LEGACY_WEB_PAYMENT_POLICY);
 assert.equal(paymentAmounts([line(.01)],'Efectivo',LEGACY_WEB_PAYMENT_POLICY).collectedCents,0);
 assert.equal(paymentAmounts([line(.01)],'Efectivo').collectedCents,50);
 const historical={items:[line(.01)],payment:'Efectivo',total:0,monetary:paymentAmounts([line(.01)],'Efectivo',LEGACY_WEB_PAYMENT_POLICY)};
 assertPayment(historical);assert.match(ticketHtml({...historical,status:'confirmed',folio:'QA',date:'2026-11-09',createdAt:'2026-11-09T12:00:00Z'}),/0\.00/);
});
for(let cents=1;cents<25;cents++)test(`cash minimum for ${cents} positive cent(s), noncash unchanged`,()=>{
 const items=[line((cents/100).toFixed(2))],p=paymentAmounts(items,'Efectivo');
 assert.equal(p.calculatedCents,cents);assert.equal(p.collectedCents,50);assert.equal(p.roundingCents,50-cents);
 for(const method of ['Tarjeta','Transferencia'])assert.equal(paymentAmounts(items,method).collectedCents,cents);
});
test('all definitive examples, exact zero and aggregate-only minimum',()=>{
 for(const [cents,wanted]of [[0,0],[1,50],[10,50],[24,50],[25,50],[49,50],[50,50],[74,50],[75,100],[1101,1100],[1125,1150],[1149,1150],[1199,1200]]){
  assert.equal(paymentAmounts([line((cents/100).toFixed(2))],'Efectivo').collectedCents,wanted);
 }
 assert.equal(paymentAmounts([line(.1),line(.1)],'Efectivo').collectedCents,50);
 assert.equal(paymentAmounts([line(.24),line(.24),line(.24)],'Efectivo').collectedCents,50);
 const p=paymentAmounts([line(0)],'Efectivo');assert.equal(p.calculatedCents,0);assert.equal(p.roundingCents,0);
});
test('all required cash examples round once, ties upwards, using integer cents',()=>{
 for(const [amount,collected]of [[11.01,11],[11.24,11],[11.25,11.5],[11.49,11.5],[11.5,11.5],[11.74,11.5],[11.75,12],[11.99,12]]){
  const p=paymentAmounts([line(amount)],'Efectivo');assert.equal(p.collectedCents,moneyCents(collected));assert.equal(p.calculatedCents,moneyCents(amount));assert.equal(p.roundingCents,p.collectedCents-p.calculatedCents);
 }
});
test('transfer and card are exact; unsupported mixed payments never receive an invented rule',()=>{
 for(const method of ['Transferencia','Tarjeta'])assert.deepEqual(paymentAmounts([line(11.25)],method),{policyVersion:WEB_PAYMENT_POLICY,currency:'MXN',payment:method,calculatedCents:1125,roundingCents:0,collectedCents:1125});
 assert.throws(()=>paymentAmounts([line(11.25)],'Mixto'));
});
test('round aggregate after item totals, retain zero and positive/negative adjustments',()=>{
 assert.equal(paymentAmounts([line(11.12),line(.13)],'Efectivo').collectedCents,1150);
 assert.equal(paymentAmounts([line(11.5)],'Efectivo').roundingCents,0);
 assert.equal(paymentAmounts([line(11.24)],'Efectivo').roundingCents,-24);
 assert.equal(paymentAmounts([line(.01)],'Efectivo').collectedCents,50);
 assert.equal(paymentAmounts([line(.25)],'Efectivo').collectedCents,50);
});
test('unsafe precision and overflow fail instead of using floating point rounding',()=>{
 for(const value of [11.251,-1,NaN,Infinity,1e20])assert.throws(()=>moneyCents(value));
 assert.throws(()=>paymentAmounts([line(90071992547409.9),line(1)],'Efectivo'));
 assert.equal(paymentAmounts([line(.1),line(.2)],'Transferencia').collectedCents,30);
});
test('validated persisted summary and ticket distinguish commercial value and actual collection',()=>{
 const items=[line(11.25)],monetary=paymentAmounts(items,'Efectivo');
 const sale={id:'s',folio:'V-00001',date:'2026-11-01',createdAt:'2026-11-01T12:00:00Z',status:'confirmed',payment:'Efectivo',items,total:11.5,monetary};
 validateSales([sale]);assertPayment(sale);const html=ticketHtml(sale);assert.match(html,/Subtotal comercial: \$11\.25/);assert.match(html,/\+\$0\.25/);assert.match(html,/11\.50/);assert.equal(sale.items[0].quantity,.25);
 assert.throws(()=>validateSales([{...sale,monetary:{...monetary,roundingCents:0}}]));
 assert.throws(()=>ticketHtml({...sale,total:11.25}));
 const historical={...sale,total:11.25};delete historical.monetary;validateSales([historical]);assert.doesNotMatch(ticketHtml(historical),/Redondeo de efectivo/);
 const revised={...sale,items:[line(12.15)],total:12,monetary:paymentAmounts([line(12.15)],'Efectivo'),monetarySettlement:{status:'not_recorded',lastConfirmedCollectedCents:1150,revisedDueCents:1200,differenceCents:50}};
 const revisedHtml=ticketHtml(revised);assert.match(revisedHtml,/Total revisado/);assert.match(revisedHtml,/Cobro confirmado antes de la revisi/);assert.match(revisedHtml,/liquidaci/);
});
test('report keeps product value separate from cash adjustment and does not distribute mixed-ticket adjustments',()=>{
 const items=[line(11.25)],sale={id:'s',folio:'V1',date:'2026-11-01',payment:'Efectivo',items,total:11.5,monetary:paymentAmounts(items,'Efectivo')};
 const input={data:{products:[],categories:[],productLines:[],procurement:{purchases:[]},sales:[sale]},inventory:{products:[],movements:[],pending:[]},purchases:{rows:[]}};
 const report=operationsReport(input,{activity:'GENERAL',today:'2026-11-01'});assert.equal(report.payments.commercial,11.25);assert.equal(report.payments.rounding,.25);assert.equal(report.payments.collected,11.5);assert.equal(report.trends[0].sales,11.25);
 assert.equal(operationsReport(input,{activity:'LIMPIEZA',today:'2026-11-01'}).payments,null);
 sale.monetarySettlement={status:'not_recorded',lastConfirmedCollectedCents:1100,revisedDueCents:1150,differenceCents:50};const unsettled=operationsReport(input,{activity:'GENERAL',today:'2026-11-01'});assert.equal(unsettled.payments.collected,null);assert.equal(unsettled.payments.confirmedCollected,11);delete sale.monetarySettlement;
 sale.voidedAt='2026-11-01T13:00:00Z';const voided=operationsReport(input,{activity:'GENERAL',today:'2026-11-01'});assert.equal(voided.payments.collected,0);assert.equal(voided.payments.voidedCharge,11.5);
 const partial={...sale};delete partial.total;delete partial.voidedAt;delete partial.monetary;input.data.sales=[partial];const unknown=operationsReport(input,{activity:'GENERAL',today:'2026-11-01'});assert.equal(unknown.payments.collected,null);assert.equal(unknown.payments.commercial,11.25);
});
