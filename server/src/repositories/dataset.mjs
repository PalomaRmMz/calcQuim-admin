import { createHash } from 'node:crypto';
import { normalizeText } from '../../../src/utils/catalogUtils.js';
import { sourceIdentity } from '../../../src/services/supplyModel.js';

export const collections = {
  categories:'categories', productLines:'product_lines', priceGroups:'price_groups', products:'products',
  suppliers:'suppliers', purchasedItems:'purchased_items', supplyItems:'supply_sources',
  supplyConversions:'supply_conversions', supplierPrices:'supplier_costs', purchases:'purchases', sales:'sales',
};
export const key = value => value == null ? null : String(value);
const omit = (obj, fields) => Object.fromEntries(Object.entries(obj).filter(([k]) => !fields.includes(k)));
const digest = value => createHash('sha256').update(value).digest('hex');

export async function readDataset(c, lock = false, allowRehearsal = false) {
  const state = (await c.query(`SELECT * FROM dataset_state WHERE singleton=true${lock ? ' FOR UPDATE' : ''}`)).rows[0];
  const allowed=allowRehearsal==='operational'?['operational']:allowRehearsal===true?['synthetic','migration_rehearsal']:['synthetic'];
  if (!state || !allowed.includes(state.purpose)) throw new Error('Dataset no autorizado.');
  const data = { categories:[], productLines:[], priceGroups:[], products:[], sales:[], procurement:structuredClone(state.metadata) };
  for (const [name, table] of Object.entries(collections)) {
    const rows = (await c.query(`SELECT record FROM ${table} ORDER BY position`)).rows.map(r => r.record);
    if (Object.hasOwn(data, name)) data[name] = rows;
    else data.procurement[name] = rows;
  }
  if(state.metadata.commerceSchema===1){
    data.procurement.presentations=(await c.query('SELECT record FROM commercial_presentations ORDER BY id')).rows.map(r=>r.record);
    data.procurement.services=(await c.query('SELECT record FROM commercial_services ORDER BY id')).rows.map(r=>r.record);
  }
  // Leer los detalles por lote: el número de consultas no crece por cada folio.
  async function grouped(table,parent,ordered=true){
    const groups=new Map();
    for(const row of (await c.query(`SELECT ${parent},record FROM ${table}${ordered?` ORDER BY ${parent},ordinal`:''}`)).rows){
      const id=key(row[parent]);if(!groups.has(id))groups.set(id,[]);
      groups.get(id).push(row.record);
    }
    return groups;
  }
  const purchaseItems=await grouped('purchase_items','purchase_id');
  const revisions=await grouped('purchase_revisions','purchase_id');
  const receipts=await grouped('purchase_receipts','purchase_id',false);
  const saleItems=await grouped('sale_items','sale_id');
  for (const p of data.purchases ?? data.procurement.purchases) {
    p.items=purchaseItems.get(key(p.id))??[];
    if(Object.hasOwn(p,'revisions'))p.revisions=revisions.get(key(p.id))??[];
    if(p.receipt===true)p.receipt=receipts.get(key(p.id))?.[0];
  }
  for(const sale of data.sales)sale.items=saleItems.get(key(sale.id))??[];
  return { data, revision:Number(state.revision), generation:state.generation, counters:state.counters };
}

function columns(name, r, wholesale = false) {
  switch (name) {
    case 'categories': case 'suppliers': return { name_key:normalizeText(r.name) };
    case 'productLines': return { category_id:key(r.categoryId), name_key:normalizeText(r.name) };
    case 'priceGroups': return { name_key:normalizeText(r.name), price:r.price, ...(wholesale ? {wholesale_price:r.wholesalePrice ?? null} : {}) };
    case 'products': return { category_id:key(r.categoryId),line_id:key(r.lineId),price_group_id:key(r.priceGroupId),name_key:normalizeText(r.name),unit:r.unit,price:r.price ?? null, ...(wholesale ? {wholesale_price:r.wholesalePrice ?? null} : {}) };
    case 'purchasedItems': return { sourcing_type:r.sourcingType,unit:r.unit };
    case 'supplyItems': return { purchased_item_id:key(r.purchasedItemId),supplier_id:key(r.supplierId),purchase_unit:r.purchaseUnit,purchase_quantity:r.purchaseQuantity ?? null,identity_key:sourceIdentity(r) };
    case 'supplyConversions': return { purchased_item_id:key(r.purchasedItemId),output_product_id:key(r.outputProductId),input_quantity:r.yield?.inputQuantity ?? null,input_unit:r.yield?.inputUnit ?? null,output_quantity:r.yield?.outputQuantity ?? null,output_unit:r.yield?.outputUnit ?? null };
    case 'supplierPrices': return { source_id:key(r.supplyItemId),supplier_id:key(r.supplierId),price:r.price,price_quantity:r.priceQuantity,price_unit:r.priceUnit,quoted_at:r.quotedAt,valid_until:r.validUntil || null };
    case 'purchases': return { supplier_id:key(r.supplierId),date:r.date,total:r.total };
    case 'sales': return { folio:r.folio || null,date:r.date,total:r.total };
    default: throw new Error('Colección inválida.');
  }
}
async function insert(c, table, fields, conflict) {
  const names = Object.keys(fields), values = Object.values(fields);
  const update = names.filter(n=>!conflict.includes(n)).map(n=>`${n}=EXCLUDED.${n}`).join(',');
  await c.query(`INSERT INTO ${table} (${names.join(',')}) VALUES (${names.map((_,i)=>`$${i+1}`).join(',')}) ON CONFLICT (${conflict.join(',')}) DO UPDATE SET ${update}`, values);
}
export async function writeDataset(c, data, counters) {
  // Solo se invoca tras reglas de dominio completas. Las FKs diferidas se validan al COMMIT.
  for (const [name, table] of Object.entries(collections)) {
    const rows = data[name] ?? data.procurement[name];
    for (const [position, row] of rows.entries()) {
      let record = row;
      if (name === 'purchases') record = { ...omit(row,['items','revisions','receipt']), items:[], ...(Object.hasOwn(row,'revisions') ? {revisions:[]} : {}), ...(row.receipt ? {receipt:true} : Object.hasOwn(row,'receipt') ? {receipt:row.receipt} : {}) };
      if (name === 'sales') record = {...row,items:[]};
      await insert(c, table, {id:key(row.id),position,record:JSON.stringify(record),...columns(name,row,data.procurement.wholesalePricingSchema===2)}, ['id']);
    }
    await c.query(`DELETE FROM ${table} WHERE NOT(id=ANY($1::text[]))`,[rows.map(r=>key(r.id))]);
  }
  if(data.procurement.organizationSchema===1)for(const supplier of data.procurement.suppliers)await c.query('UPDATE suppliers SET business_activity=$2 WHERE id=$1',[key(supplier.id),supplier.businessActivity??null]);
  const commerce=data.procurement.commerceSchema===1;
  if(commerce){
    for(const p of data.products)await c.query('UPDATE products SET activity=$2 WHERE id=$1',[key(p.id),p.activity??null]);
    for(const p of data.procurement.presentations||[])await insert(c,'commercial_presentations',{id:p.id,product_id:key(p.productId),record:JSON.stringify(p),unit:p.unit,factor:p.factor,price:p.price},['id']);
    for(const s of data.procurement.services||[])await insert(c,'commercial_services',{id:s.id,record:JSON.stringify(s),unit:s.unit,price_mode:s.priceMode,price:s.price??null},['id']);
  }
  // Detalles derivados del agregado validado; historial íntegro en cada revisión.
  for (const table of ['source_yield_overrides','purchase_items','purchase_revisions','purchase_receipts','sale_items']) await c.query(`DELETE FROM ${table}`);
  for (const source of data.procurement.supplyItems) for (const [conversionId,rule] of Object.entries(source.yieldOverrides || {})) {
    await insert(c,'source_yield_overrides',{source_id:key(source.id),conversion_id:conversionId,purchased_item_id:key(source.purchasedItemId),record:JSON.stringify(rule),input_quantity:rule.inputQuantity,output_quantity:rule.outputQuantity},['source_id','conversion_id']);
  }
  for (const p of data.procurement.purchases) {
    for (const [ordinal,r] of p.items.entries()) await insert(c,'purchase_items',{purchase_id:key(p.id),ordinal,legacy_id:key(r.id),record:JSON.stringify(r),source_id:key(r.supplyItemId),purchased_item_id:key(r.purchasedItemId),product_id:key(r.productId),quantity:r.quantity,unit:r.unit,total:r.total},['purchase_id','ordinal']);
    for (const [ordinal,r] of (p.revisions ?? []).entries()) await insert(c,'purchase_revisions',{purchase_id:key(p.id),ordinal,record:JSON.stringify(r)},['purchase_id','ordinal']);
    if (p.receipt) await insert(c,'purchase_receipts',{purchase_id:key(p.id),record:JSON.stringify(p.receipt),sha256:digest(Buffer.from(p.receipt.dataUrl.split(',')[1],'base64'))},['purchase_id']);
  }
  for (const s of data.sales) for (const [ordinal,r] of s.items.entries()) await insert(c,'sale_items',{sale_id:key(s.id),ordinal,product_id:key(r.productId),record:JSON.stringify(r),quantity:r.quantity,unit:r.unit,price:r.price,amount:r.amount,...(commerce?{activity:r.activity??null,line_type:r.lineType??null,presentation_id:r.presentationId??null,service_id:r.serviceId??null,base_quantity:r.baseQuantity??null}:{})},['sale_id','ordinal']);
  await c.query('UPDATE dataset_state SET revision=revision+1,metadata=$1,counters=$2 WHERE singleton=true',[
    JSON.stringify(omit(data.procurement,[...Object.keys(collections),'presentations','services'])),JSON.stringify(counters),
  ]);
}
