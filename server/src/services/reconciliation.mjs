import { createHash } from 'node:crypto';
import { procurementAnalytics } from '../../../src/utils/purchaseAnalytics.js';
import { comparatorGroups } from '../../../src/utils/comparatorGroups.js';
import { reportAnalytics, purchaseReport } from '../../../src/utils/reportAnalytics.js';
import { getProductDisplayName } from '../../../src/utils/catalogUtils.js';
import { catalogProductPrice } from '../../../src/services/catalogValidation.js';
import { grossMargin } from '../../../src/utils/procurementUtils.js';
import { buildFullBackupExportData } from '../../../src/services/dataExport.js';
import { auditCalcQuim } from '../../../src/services/dataAudit.js';

export const sha256=value=>createHash('sha256').update(value).digest('hex');
// Solo categorías y huellas de rutas salen del comparador; nunca valores o identificadores.
export function comparePrivateValues(expected,actual) {
  let compared=0,mismatches=0;
  const diagnostics=[];
  function issue(kind,path) {
    mismatches++;
    if(diagnostics.length<30)diagnostics.push({kind,pathHash:sha256(JSON.stringify(path))});
  }
  function walk(a,b,path) {
    compared++;
    if(Object.is(a,b))return;
    if(a===null||b===null||typeof a!==typeof b){issue('TYPE_OR_NULL',path);return;}
    if(a instanceof Date||b instanceof Date){if(!(a instanceof Date&&b instanceof Date)||a.getTime()!==b.getTime())issue('DATE',path);return;}
    if(a instanceof Map||b instanceof Map){if(!(a instanceof Map&&b instanceof Map)){issue('TYPE',path);return;}walk([...a.entries()],[...b.entries()],[...path,'map']);return;}
    if(Array.isArray(a)||Array.isArray(b)) {
      if(!Array.isArray(a)||!Array.isArray(b)){issue('TYPE',path);return;}
      if(a.length!==b.length)issue('ARRAY_LENGTH',path);
      for(let i=0;i<Math.min(a.length,b.length);i++)walk(a[i],b[i],[...path,i]);
      return;
    }
    if(typeof a==='object') {
      const keys=new Set([...Object.keys(a),...Object.keys(b)]);
      for(const k of keys) {
        if(!Object.hasOwn(a,k)||!Object.hasOwn(b,k))issue('FIELD_PRESENCE',[...path,k]);
        else walk(a[k],b[k],[...path,k]);
      }return;
    }
    issue('VALUE',path);
  }
  walk(expected,actual,[]);
  return {equal:mismatches===0,fieldsCompared:compared,mismatches,diagnostics};
}

export function summarizeDataset(data) {
  const counts=Object.fromEntries(['categories','productLines','priceGroups','products','sales'].map(k=>[k,data[k].length]));
  for(const k of ['suppliers','purchasedItems','supplyItems','supplyConversions','supplierPrices','purchases'])counts[k]=data.procurement[k].length;
  Object.assign(counts,{purchaseItems:0,revisions:0,revisionItems:0,activePurchases:0,voidedPurchases:0,saleItems:0,voidedSales:0,receiptOccurrences:0,historicalConversionSnapshots:0,sourceYieldOverrides:0});
  const photos=[];
  function visit(p,path,revision=false) {
    if(revision){counts.revisions++;counts.revisionItems+=p.items.length;}
    else{counts.purchaseItems+=p.items.length;counts[p.voidedAt?'voidedPurchases':'activePurchases']++;}
    if(p.receipt){counts.receiptOccurrences++;photos.push({pathHash:sha256(path),bytesHash:sha256(Buffer.from(p.receipt.dataUrl.split(',')[1],'base64'))});}
    for(const i of p.items)counts.historicalConversionSnapshots+=i.conversionSnapshots?.length??0;
    for(const [index,r]of(p.revisions??[]).entries())visit(r,`${path}.revision.${index}`,true);
  }
  data.procurement.purchases.forEach((p,i)=>visit(p,`purchase.${i}`));
  for(const q of data.procurement.supplierPrices)counts.historicalConversionSnapshots+=q.snapshot?.conversionSnapshots?.length??0;
  for(const s of data.procurement.supplyItems)counts.sourceYieldOverrides+=Object.keys(s.yieldOverrides??{}).length;
  for(const s of data.sales){counts.saleItems+=s.items.length;if(s.voidedAt)counts.voidedSales++;}
  return {counts,photos};
}

export function sourceFreshness(original,data) {
  let examined=0,later=0,invalid=0;
  const captured=Date.parse(original.capturedAt);
  function visit(value) {
    if(!value||typeof value!=='object')return;
    for(const [key,v]of Object.entries(value)) {
      if(['createdAt','updatedAt','voidedAt'].includes(key)&&v!=null){examined++;if(typeof v!=='string'||!Number.isFinite(Date.parse(v)))invalid++;else if(Date.parse(v)>captured)later++;}
      else if(v&&typeof v==='object')visit(v);
    }
  }
  visit(data);
  return {timestampsExamined:examined,timestampsAfterCapture:later,invalidTimestamps:invalid,
    browserCurrentStateVerified:false,conclusion:'HISTORICAL_SNAPSHOT_ONLY_BROWSER_NOT_READ'};
}

function economicViews(data,today) {
  const products=data.products.map(p=>({...p,displayName:getProductDisplayName(p,data.categories,data.productLines)}));
  const analytics=procurementAnalytics(data.procurement,products,today);
  return {
    analytics,
    comparator:comparatorGroups({rows:analytics.rows,products,categories:data.categories,productLines:data.productLines}),
    report:reportAnalytics(data.procurement,products,data.categories,data.productLines,analytics),
    purchases:purchaseReport(data.procurement),
    margins:analytics.rows.map(row=>({id:row.id,margin:grossMargin(catalogProductPrice(products.find(p=>p.id===row.productId),data.priceGroups),row.reference?.cost)})),
  };
}
export function reconcileDatasets(expected,actual,{dates=['2026-10-16','2026-10-28']}={}) {
  const fields=comparePrivateValues(expected,actual);
  const source=summarizeDataset(expected),target=summarizeDataset(actual);
  const entities={};
  for(const k of ['categories','productLines','priceGroups','products','sales','suppliers','purchasedItems','supplyItems','supplyConversions','supplierPrices','purchases']) {
    const a=expected[k]??expected.procurement[k],b=actual[k]??actual.procurement[k];
    entities[k]={source:a.length,target:b.length,identifiersAndTypesEqual:comparePrivateValues(a.map(r=>r.id),b.map(r=>r.id)).equal,recordsEqual:comparePrivateValues(a,b).equal};
  }
  const evaluations=dates.map(today=>({today,...comparePrivateValues(economicViews(expected,today),economicViews(actual,today))}));
  const snapshot=d=>({...d,legacyPurchases:[],issues:[],metadata:[],capturedAt:new Date('2026-10-28T00:00:00.000Z')});
  const exportParity=comparePrivateValues(buildFullBackupExportData(snapshot(expected)),buildFullBackupExportData(snapshot(actual)));
  const sourceAudit=auditCalcQuim(expected,dates.at(-1));
  const targetAudit=auditCalcQuim(actual,dates.at(-1));
  const audit={sourceCount:sourceAudit.length,targetCount:targetAudit.length,sourceSeverities:{},targetSeverities:{}};
  for(const issue of sourceAudit)audit.sourceSeverities[issue.severity]=(audit.sourceSeverities[issue.severity]??0)+1;
  for(const issue of targetAudit)audit.targetSeverities[issue.severity]=(audit.targetSeverities[issue.severity]??0)+1;
  const photosEqual=comparePrivateValues(source.photos,target.photos).equal;
  const countsEqual=comparePrivateValues(source.counts,target.counts).equal;
  return {equal:fields.equal&&photosEqual&&countsEqual&&exportParity.equal&&evaluations.every(e=>e.equal)&&sourceAudit.length===0&&targetAudit.length===0,
    fields,entities,counts:source.counts,countsEqual,photos:{source:source.photos.length,target:target.photos.length,hashesEqual:photosEqual},
    evaluations,exportParity,audit,cutoverEnabled:false};
}

function decimal(value) {
  if(value==null)return null;
  const [mantissa,exponent='0']=String(value).toLowerCase().split('e');
  const negative=mantissa.startsWith('-');const [whole,fraction='']=mantissa.replace('-','').split('.');
  let digits=(whole+fraction).replace(/^0+/,'')||'0',power=Number(exponent)-fraction.length;
  while(digits.endsWith('0')&&digits!=='0'){digits=digits.slice(0,-1);power++;}
  return `${negative&&digits!=='0'?'-':''}${digits}e${digits==='0'?0:power}`;
}
export async function reconcileRelationalColumns(c,data) {
  let checked=0,failed=0;
  const specifications={
    categories:['categories',{}],suppliers:['suppliers',{}],
    product_lines:['productLines',{category_id:'categoryId'}],
    price_groups:['priceGroups',{}, {price:'price'}],
    products:['products',{category_id:'categoryId',line_id:'lineId',price_group_id:'priceGroupId',unit:'unit'},{price:'price'}],
    purchased_items:['purchasedItems',{unit:'unit',sourcing_type:'sourcingType'}],
    supply_sources:['supplyItems',{purchased_item_id:'purchasedItemId',supplier_id:'supplierId',purchase_unit:'purchaseUnit'},{purchase_quantity:'purchaseQuantity'}],
    supply_conversions:['supplyConversions',{purchased_item_id:'purchasedItemId',output_product_id:'outputProductId',input_unit:'yield.inputUnit',output_unit:'yield.outputUnit'}, {input_quantity:'yield.inputQuantity',output_quantity:'yield.outputQuantity'}],
    supplier_costs:['supplierPrices',{source_id:'supplyItemId',supplier_id:'supplierId',price_unit:'priceUnit'},{price:'price',price_quantity:'priceQuantity'}],
    purchases:['purchases',{supplier_id:'supplierId'},{total:'total'}],sales:['sales',{folio:'folio'},{total:'total'}],
  };
  const value=(row,path)=>path.split('.').reduce((r,k)=>r?.[k],row)??null;
  for(const [table,[collection,textFields,numericFields={}]]of Object.entries(specifications)) {
    const expected=data[collection]??data.procurement[collection];
    const dateColumns=['purchases','sales'].includes(table)?',date::text AS business_date_text':table==='supplier_costs'?',quoted_at::text AS quote_date_text,valid_until::text AS valid_until_text':'';
    const rows=(await c.query(`SELECT *${dateColumns} FROM ${table} ORDER BY position`)).rows;
    checked++;if(rows.length!==expected.length){failed++;continue;}
    for(const [index,row]of rows.entries()) {
      const source=expected[index];checked++;if(row.id!==String(source.id))failed++;
      for(const [field,path]of Object.entries(textFields)){checked++;const v=value(source,path);if(row[field]!== (v==null?null:String(v)))failed++;}
      for(const [field,path]of Object.entries(numericFields)){checked++;if(decimal(row[field])!==decimal(value(source,path)))failed++;}
      if(table==='purchases'||table==='sales'){checked++;if(row.business_date_text!==source.date)failed++;}
      if(table==='supplier_costs'){checked+=2;if(row.quote_date_text!==source.quotedAt)failed++;if(row.valid_until_text!==(source.validUntil||null))failed++;}
    }
  }
  const expectedOverrides=data.procurement.supplyItems.flatMap(s=>Object.entries(s.yieldOverrides??{}).map(([id,rule])=>({sourceId:String(s.id),conversionId:id,articleId:String(s.purchasedItemId),rule})));
  const overrides=(await c.query('SELECT * FROM source_yield_overrides')).rows;
  checked++;if(overrides.length!==expectedOverrides.length)failed++;
  for(const o of expectedOverrides){checked++;const row=overrides.find(r=>r.source_id===o.sourceId&&r.conversion_id===o.conversionId);if(!row||row.purchased_item_id!==o.articleId||!comparePrivateValues(row.record,o.rule).equal||decimal(row.input_quantity)!==decimal(o.rule.inputQuantity)||decimal(row.output_quantity)!==decimal(o.rule.outputQuantity))failed++;}
  for(const p of data.procurement.purchases){
    if(!p.receipt)continue;
    const row=(await c.query('SELECT sha256 FROM purchase_receipts WHERE purchase_id=$1',[String(p.id)])).rows[0];
    checked++;if(row?.sha256!==sha256(Buffer.from(p.receipt.dataUrl.split(',')[1],'base64')))failed++;
  }
  for(const [table,parents,parentField,amountFields]of [
    ['purchase_items',data.procurement.purchases,'purchase_id',{quantity:'quantity',total:'total'}],
    ['sale_items',data.sales,'sale_id',{quantity:'quantity',price:'price',amount:'amount'}],
  ]) {
    for(const parent of parents){
      const rows=(await c.query(`SELECT * FROM ${table} WHERE ${parentField}=$1 ORDER BY ordinal`,[String(parent.id)])).rows;
      checked++;if(rows.length!==parent.items.length){failed++;continue;}
      for(const [index,row]of rows.entries()){
        const item=parent.items[index];
        for(const [field,path]of Object.entries(amountFields)){checked++;if(decimal(row[field])!==decimal(value(item,path)))failed++;}
        checked++;if(row.unit!==item.unit)failed++;
        const relations=table==='purchase_items'?{legacy_id:'id',source_id:'supplyItemId',purchased_item_id:'purchasedItemId',product_id:'productId'}:{product_id:'productId'};
        for(const [field,path]of Object.entries(relations)){checked++;const v=value(item,path);if(row[field]!== (v==null?null:String(v)))failed++;}
      }
    }
  }
  const constraints=(await c.query("SELECT count(*)::int AS count FROM pg_constraint WHERE connamespace=current_schema()::regnamespace AND contype='f' AND NOT convalidated")).rows[0].count;
  return {equal:failed===0&&constraints===0,checks:checked,failed,unvalidatedForeignKeys:constraints};
}
