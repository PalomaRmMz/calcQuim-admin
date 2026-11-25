import {ApiError} from './commands.mjs';
import {inventoryAccount,appendInventoryMovement,inventoryChange,purchaseAutomationPolicy,inventoryPolicy} from '../repositories/inventory.mjs';
import {inventoryDecimal,inventoryText,inventoryConvert} from '../../../src/services/inventoryUnits.js';
import {pinolBlancoId,supplyBottleId} from '../../../src/domain/supplyInventory.mjs';
import {normalizeText} from '../../../src/utils/catalogUtils.js';
import {productActivity} from '../../../src/domain/activityScope.mjs';
import {checkBaseline} from './inventoryBaseline.mjs';

const fail = message => {throw new ApiError(422,'SUPPLY_INVENTORY',message);};
const scale = 1000000n;
const available = async c => (await c.query("SELECT to_regclass('supply_inventory') IS NOT NULL AS ok")).rows[0].ok;
const product = (data,id) => data.products.find(p=>String(p.id)===String(id));

export async function supplyStocks(c,lock=false){
  if(!await available(c))return [];
  return (await c.query('SELECT * FROM supply_inventory ORDER BY purchased_item_id'+(lock?' FOR UPDATE':''))).rows;
}
export async function supplyPackagesAvailable(c){
  return (await c.query("SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('supply_inventory') AND attname='package_label' AND NOT attisdropped) AS ok")).rows[0].ok;
}

export function supplyStockView(stocks,data){
  return stocks.map(s=>({purchasedItemId:s.purchased_item_id,productId:s.product_id,closed:s.closed,
    version:s.stock_version,bottleLiters:s.bottle_liters,name:product(data,s.product_id)?.name,
    ...(s.package_label?{packageLabel:s.package_label,outputUnit:product(data,s.output_product_id)?.unit}:{}),
    totalLiters:inventoryText(BigInt(s.closed)*inventoryDecimal(s.bottle_liters))}));
}

function nonnegative(value){
  try{const amount=inventoryDecimal(value);if(amount>=0n)return amount;}catch{/* Invalid decimal. */}
  fail('Confirma una cantidad fisica no negativa.');
}
function packages(value){
  const amount=nonnegative(value);
  if(amount%scale)fail('Las cantidades de envases completos deben ser enteras.');
  return amount/scale;
}
const reason = input => {
  if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>1000)fail('Indica el motivo de la operacion.');
  return input.reason.trim();
};

async function update(c,s,closed){
  if(closed<0n)fail('Existencia insuficiente en el insumo.');
  await c.query('UPDATE supply_inventory SET closed=$2,stock_version=stock_version+1 WHERE purchased_item_id=$1',[s.purchased_item_id,String(closed)]);
}

const supplyTypes=['BASE','HYDRONEO','CONCENTRATE'];
const minimumPolicy=async c=>(await c.query("SELECT policy->'supplyMinimums' AS config FROM inventory_settings WHERE singleton=true FOR UPDATE")).rows[0]?.config;

async function saveMinimumPolicy(c,config){
  await c.query("UPDATE inventory_settings SET policy=jsonb_set(policy,'{supplyMinimums}',$1::jsonb) WHERE singleton=true",[JSON.stringify(config)]);
}

async function syncPhysicalMinimum(c,stock,minimum){
  const liters=inventoryText(packages(minimum)*inventoryDecimal(stock.bottle_liters));
  await c.query("INSERT INTO inventory_replenishment(product_id,minimum,unit) VALUES($1,$2,'litro') ON CONFLICT(product_id) DO UPDATE SET minimum=EXCLUDED.minimum",[stock.product_id,liters]);
}

export async function configureSupplyMinimumDefaults(c,data){
  if(await minimumPolicy(c))fail('El mínimo predeterminado ya está configurado.');
  const items=data.procurement.purchasedItems.filter(article=>supplyTypes.includes(article.sourcingType));
  const itemIds=new Set(items.map(article=>article.id));
  const stocks=(await supplyStocks(c,true)).filter(stock=>itemIds.has(stock.purchased_item_id));
  const config={defaultPackages:'2',overrides:{}};
  await saveMinimumPolicy(c,config);
  for(const stock of stocks)await syncPhysicalMinimum(c,stock,config.defaultPackages);
  await inventoryChange(c,'supply_minimum_default',{unit:'envase',minimum:config.defaultPackages,
    appliedItemIds:[...itemIds],physicalAccounts:stocks.map(stock=>stock.product_id)});
  return {configured:items.length,physicalAccounts:stocks.length,defaultPackages:config.defaultPackages};
}

async function configureSupplyMinimum(c,data,stocks,input){
  const id=input.purchasedItemId;
  if(!data.procurement.purchasedItems.some(article=>article.id===id&&supplyTypes.includes(article.sourcingType)))
    fail('Selecciona un insumo transformable.');
  const config=await minimumPolicy(c);
  if(!config)fail('Configura primero el mínimo predeterminado de insumos.');
  const minimum=String(packages(input.minimum));
  const previous=config.overrides[id]??config.defaultPackages;
  if(previous===minimum)return {};
  if(minimum===config.defaultPackages)delete config.overrides[id];
  else config.overrides[id]=minimum;
  await saveMinimumPolicy(c,config);
  const stock=stocks.find(row=>row.purchased_item_id===id);
  if(stock)await syncPhysicalMinimum(c,stock,minimum);
  await inventoryChange(c,'supply_minimum_updated',{purchasedItemId:id,productId:stock?.product_id,previous,minimum,unit:'envase'});
  return {};
}

export async function supplySaleBaseline(c,product,movement,treatment){
  const latest=(await c.query("SELECT max(recorded_at) AS at FROM inventory_changes WHERE action='supply_inventory_count' AND reference->>'purchasedItemId'=$1",[product.inventorySupplyId])).rows[0].at;
  if(!latest||latest<=movement.recorded_at)return {};
  if(!['apply_now','already_included'].includes(treatment))fail('Confirma si el retorno ya estaba incluido en el ultimo conteo del insumo.');
  return {supplyCountTreatment:treatment};
}

export async function applySupplyMovement(c,product,input){
  if(!product.inventorySupplyId)return;
  const s=(await supplyStocks(c,true)).find(row=>row.product_id===String(product.id));
  if(!s)fail('El inventario fisico de este insumo no esta habilitado.');
  const amount=inventoryDecimal(input.quantity),factor=inventoryDecimal(s.bottle_liters);
  const ref=input.reference??{};
  if(!amount||amount%factor)fail('Las cantidades deben corresponder a envases completos y ser enteras y mayores que cero.');
  if(ref.includedInAnchorId)fail('Concilia con un conteo de botellas.');
  const supported=(
    (input.kind==='sale'&&s.purchased_item_id===pinolBlancoId&&amount<0n&&ref.physicalPresentation?.id===supplyBottleId(s.purchased_item_id))||
    (input.kind==='receipt'&&amount>0n&&ref.supplyReceipt===true)||
    (input.kind==='adjustment'&&amount<0n&&(ref.supplyConsumption===true||ref.supplyPurchaseReturn===true))||
    ((input.kind==='return'||input.kind==='reversal'&&ref.physicalReturnConfirmed)&&s.purchased_item_id===pinolBlancoId&&amount>0n&&ref.packReturnDisposition==='sealed')
  );
  if(!supported)fail('Usa una operacion de insumo y confirma el retorno de botellas originales cerradas cuando corresponda.');
  if(ref.supplyCountTreatment!=='already_included')await update(c,s,BigInt(s.closed)+amount/factor);
}

export const supplyInventoryCommands=['enablePinolBlancoInventory','enableSupplyInventory','configureSupplyMinimum','countSupplyInventory','prepareFromSupplyInventory','returnSupplyInventory'];

export async function executeSupplyInventory(c,data,name,input){
  const stocks=await supplyStocks(c,true);
  if(name==='configureSupplyMinimum')return configureSupplyMinimum(c,data,stocks,input);
  if(name==='enableSupplyInventory'){
    if(!await supplyPackagesAvailable(c))fail('La habilitaci?n de otros insumos requiere la migraci?n 017.');
    if(input.confirmed!==true||stocks.some(s=>s.purchased_item_id===input.purchasedItemId))
      fail('Confirma el conteo f?sico. El insumo debe estar sin cuenta.');
    if(!(await purchaseAutomationPolicy(c)).enabled)fail('Activa el seguimiento de compras antes de habilitar el insumo.');
    const article=data.procurement.purchasedItems.find(p=>p.id===input.purchasedItemId&&p.active&&['BASE','HYDRONEO','CONCENTRATE'].includes(p.sourcingType));
    if(!article||article.id===pinolBlancoId)fail('Selecciona un insumo transformable de limpieza.');
    const conversions=data.procurement.supplyConversions.filter(link=>link.purchasedItemId===article.id&&link.active)
      .map(link=>product(data,link.outputProductId)).filter(p=>p?.active&&!p.inventorySupplyId&&productActivity(p)==='LIMPIEZA');
    const output=conversions.find(p=>String(p.id)===String(input.outputProductId))??(input.outputProductId==null&&conversions.length===1?conversions[0]:null);
    if(!output)fail('Selecciona un producto final de limpieza vinculado.');
    const sources=data.procurement.supplyItems.filter(s=>s.purchasedItemId===article.id&&s.active&&data.procurement.suppliers.some(v=>v.id===s.supplierId&&v.active&&v.businessActivity!=='JARCERIA'));
    const source=sources.find(s=>s.id===input.sourceId);
    const label=source?.presentation?.trim();
    if(!label||source.purchaseQuantity==null||source.purchaseUnit!=='litro')
      fail('Selecciona una presentaci?n activa cuyo contenido en litros est? registrado.');
    const factor=inventoryConvert(source.purchaseQuantity,source.purchaseUnit,'litro');
    if(inventoryDecimal(factor)<=0n)fail('El contenido por envase debe ser positivo.');
    if(sources.some(s=>normalizeText(s.presentation??'')!==normalizeText(label)||s.purchaseUnit!=='litro'||inventoryDecimal(s.purchaseQuantity??0)!==inventoryDecimal(factor)))
      fail('Las fuentes activas tienen formatos distintos. Concilia sus presentaciones antes de habilitar un saldo ?nico por envase.');
    const closed=packages(input.closed),why=reason(input);
    const id=Math.max(0,...data.products.map(p=>Number(p.id)))+1;
    const account={id,name:article.name,unit:'litro',activity:'LIMPIEZA',active:true,available:false,price:null,
      inventorySupplyId:article.id,supplyPackage:{label,liters:factor}};
    data.products.push(account);
    await inventoryAccount(c,account);
    await c.query('INSERT INTO supply_inventory(purchased_item_id,product_id,output_product_id,bottle_liters,closed,package_label) VALUES($1,$2,$3,$4,$5,$6)',[article.id,String(id),String(output.id),factor,String(closed),label]);
    const config=await minimumPolicy(c);
    if(config)await syncPhysicalMinimum(c,{product_id:String(id),bottle_liters:factor},config.overrides[article.id]??config.defaultPackages);
    await inventoryChange(c,'supply_inventory_enabled',{purchasedItemId:article.id,productId:id,sourceId:source.id,closed:String(closed),unit:'envase',packageLabel:label,packageLiters:factor,reason:why});
    return {productId:id};
  }
  if(name==='enablePinolBlancoInventory'){
    if(!await available(c)||input.confirmed!==true||stocks.some(s=>s.purchased_item_id===pinolBlancoId))fail('La activacion requiere migracion y confirmacion explicita.');
    const article=data.procurement.purchasedItems.find(p=>p.id===pinolBlancoId&&p.active&&p.unit==='litro'&&p.sourcingType==='BASE');
    const conversion=data.procurement.supplyConversions.find(r=>r.purchasedItemId===pinolBlancoId&&r.active&&String(r.outputProductId)==='44');
    const source=data.procurement.supplyItems.some(s=>s.purchasedItemId===pinolBlancoId&&s.active&&s.purchaseUnit==='litro'&&s.purchaseQuantity===1&&s.presentation?.trim().toLowerCase()==='botella');
    const y=conversion?.yield;
    if(!article||!source||y?.inputQuantity!==1||y.inputUnit!=='litro'||y.outputQuantity!==20||y.outputUnit!=='litro'||product(data,44)?.unit!=='litro'||!(await purchaseAutomationPolicy(c)).enabled||!(await inventoryPolicy(c)).sales_enabled)
      fail('Verifica el insumo, su conversion y la integracion de inventario.');
    data.procurement.commerceSchema=1;
    const id=Math.max(0,...data.products.map(p=>Number(p.id)))+1;
    const p={id,name:article.name,unit:'litro',activity:'LIMPIEZA',active:true,available:true,price:null,inventorySupplyId:article.id};
    data.products.push(p);
    (data.procurement.presentations??=[]).push({id:supplyBottleId(article.id),productId:id,name:article.name+' — Botella de 1 litro',unit:'botella',baseUnit:'litro',factor:1,price:130,integerOnly:true,active:true,purchaseEnabled:false,supplyInventory:true});
    await c.query('INSERT INTO supply_inventory(purchased_item_id,product_id,output_product_id,bottle_liters,closed) VALUES($1,$2,$3,1,0)',[article.id,String(id),'44']);
    await inventoryChange(c,'supply_inventory_enabled',{purchasedItemId:article.id,closed:'0',reason:reason(input)});
    return {productId:id};
  }
  const s=stocks.find(row=>row.purchased_item_id===input.purchasedItemId);
  if(!s)fail('Selecciona un insumo habilitado.');
  const p=product(data,s.product_id),why=reason(input);
  await inventoryAccount(c,p);
  if(name==='countSupplyInventory'){
    if(String(input.expectedVersion)!==s.stock_version)fail('El saldo cambio durante el conteo. Vuelve a abrir la ficha y verifica el saldo fisico.');
    const closed=packages(input.closed);
    await inventoryChange(c,'supply_inventory_count',{purchasedItemId:s.purchased_item_id,previousClosed:s.closed,closed:String(closed),...(s.package_label?{unit:'envase',packageLabel:s.package_label,packageLiters:s.bottle_liters}:{}),reason:why});
    await update(c,s,closed);
    return {};
  }
  if(name==='returnSupplyInventory'){
    const sales=(await c.query(`SELECT kind,quantity::text FROM inventory_movements m
      WHERE sale_id=$1 AND product_id=$2 AND kind IN ('sale','return')
      AND NOT EXISTS (SELECT 1 FROM inventory_movements r WHERE r.reversal_of=m.id)`,[String(input.saleId),s.product_id])).rows;
    const quantity=packages(input.quantity)*scale;
    const outstanding=-sales.reduce((sum,m)=>sum+inventoryDecimal(m.quantity),0n);
    if(quantity<=0n||quantity>outstanding)fail('La devolucion excede la salida pendiente de retornar.');
    const movementId=await appendInventoryMovement(c,p,{kind:'return',quantity:inventoryText(quantity),saleId:String(input.saleId),reason:why,reference:{packReturnDisposition:input.disposition}});
    return {movementId};
  }
  const row=input.purchaseId==null?null:(await c.query("SELECT * FROM purchase_inventory WHERE purchase_id=$1 AND item_id=$2 FOR UPDATE",[String(input.purchaseId),String(input.itemId)])).rows[0];
  if(input.purchaseId!=null&&(!row||row.state!=='prepare'||row.source.purchasedItemId!==s.purchased_item_id||row.product_id!==s.output_product_id))
    fail('El renglon no tiene una elaboracion pendiente para este insumo.');
  const output=product(data,s.output_product_id),used=packages(input.inputPackages??(s.purchased_item_id===pinolBlancoId?input.inputLiters:undefined))*inventoryDecimal(s.bottle_liters);
  if(!output?.active||!data.procurement.supplyConversions.some(link=>link.active&&link.purchasedItemId===s.purchased_item_id&&String(link.outputProductId)===s.output_product_id))fail('El producto final vinculado ya no est? disponible para elaboraci?n.');
  const quantity=inventoryConvert(input.quantity,input.unit,output.unit);
  if(used<=0n||inventoryDecimal(quantity)<=0n)fail('Confirma consumo y produccion reales positivos.');
  const baseline=await checkBaseline(c,output,{createdAt:new Date().toISOString()},input.baselineTreatment);
  const consumptionId=await appendInventoryMovement(c,p,{kind:'adjustment',quantity:inventoryText(-used),reason:why,reference:{supplyConsumption:true,outputProductId:output.id}});
  const movementId=await appendInventoryMovement(c,output,{kind:'prepared',quantity,reason:why,purchaseId:row?.purchase_id,reference:{...baseline,...(row?{purchaseLotKey:row.purchase_id+':'+row.item_id,purchaseOrdinal:row.ordinal}:{}),consumptionId,purchasedItemId:s.purchased_item_id,inputLiters:inventoryText(used)}});
  if(row)await c.query("UPDATE purchase_inventory SET state='applied',actual_quantity=$3,version=version+1,updated_at=now() WHERE purchase_id=$1 AND item_id=$2",[row.purchase_id,row.item_id,quantity]);
  await inventoryChange(c,row?'purchase_inventory_supply_consumed':'supply_prepared',{purchasedItemId:s.purchased_item_id,consumptionId,movementId,purchaseId:row?.purchase_id,itemId:row?.item_id,inputLiters:inventoryText(used),reason:why});
  return {consumptionId,movementId};
}

export async function syncSupplyPurchases(c,before,data,name,args){
  const stocks=await supplyStocks(c,true);
  if(!stocks.length)return;
  for(const s of stocks){
    const p=product(data,s.product_id),old=product(before,s.product_id);
    if(!p||p.inventorySupplyId!==s.purchased_item_id||p.price!=null||p.priceGroupId!=null||
      old?.inventorySupplyId!==p.inventorySupplyId||p.unit!=='litro'||p.activity!=='LIMPIEZA')
      fail('Conserva la cuenta f?sica del insumo.');
    const formats=(data.procurement.presentations??[]).filter(f=>String(f.productId)===s.product_id);
    if(s.purchased_item_id!==pinolBlancoId){
      if(formats.length||p.available!==false||p.supplyPackage?.label!==s.package_label||
        inventoryDecimal(p.supplyPackage?.liters??0)!==inventoryDecimal(s.bottle_liters))
        fail('Conserva la presentaci?n f?sica autorizada del insumo.');
      continue;
    }
    const [format]=formats;
    const previous=before.procurement.presentations.find(p=>p.id===supplyBottleId(s.purchased_item_id));
    if(formats.length!==1||format.id!==previous?.id||!format.supplyInventory||format.purchaseEnabled!==false||!format.integerOnly||
      format.unit!=='botella'||format.price!==previous.price||Number(format.factor)!==Number(s.bottle_liters))
      fail('Conserva la presentaci?n de venta de Pinol Blanco.');
  }
  if(!['savePurchase','voidPurchase'].includes(name))return;
  for(const purchase of data.procurement.purchases){
    const old=before.procurement.purchases.find(p=>p.id===purchase.id);
    if(old&&JSON.stringify(old)===JSON.stringify(purchase))continue;
    const items=purchase.items;
    for(const [ordinal,item] of items.entries()){
      const s=stocks.find(row=>row.purchased_item_id===item.purchasedItemId);
      if(!s||old?.voidedAt)continue;
      const p=product(data,s.product_id);
      const key='supply-purchase:'+purchase.id+':'+item.id;
      if(old){
        const receipt=(await c.query('SELECT * FROM inventory_movements WHERE origin_key=$1',[key])).rows[0];
        if(purchase.voidedAt&&receipt){
          const options=args[1]??{};
          if(!options.confirmed||!['retained','returned'].includes(options.disposition))fail('Confirma el destino fisico del insumo.');
          if(options.disposition==='returned'){
            await appendInventoryMovement(c,p,{kind:'adjustment',quantity:inventoryText(-inventoryDecimal(receipt.quantity)),purchaseId:purchase.id,originKey:key+':return',reason:reason(options),reference:{supplyPurchaseReturn:true,receiptId:receipt.id}});
          }
        }else if(!purchase.voidedAt){
          const previous=old.items.find(i=>i.id===item.id);
          if(!previous||previous.quantity!==item.quantity)fail('Para cambiar la cantidad del insumo, concilia y anula la compra antes de volver a capturarla.');
        }
        continue;
      }
      const cutoff=s.enabled_at.toLocaleDateString('en-CA',{timeZone:'America/Mexico_City'});
      if(purchase.date<cutoff)fail('La compra es anterior al corte fisico del insumo.');
      const quantity=inventoryConvert(item.quantity,item.unit,p.unit);
      if(normalizeText(item.presentation??'')!==normalizeText(s.package_label??'Botella')||
        item.purchaseUnit!=='litro'||inventoryDecimal(item.purchaseQuantity??0)!==inventoryDecimal(s.bottle_liters))
        fail('La compra debe coincidir con la presentaci?n y el contenido de la cuenta f?sica.');
      await appendInventoryMovement(c,p,{kind:'receipt',quantity,purchaseId:purchase.id,originKey:key,reason:'Recepcion de insumo comprado',
        reference:{supplyReceipt:true,itemId:item.id,purchaseOrdinal:ordinal,supplierId:purchase.supplierId,cost:item.total}});
    }
    if(old&&!purchase.voidedAt&&old.items.some(i=>stocks.some(s=>s.purchased_item_id===i.purchasedItemId)&&!items.some(row=>row.id===i.id)))
      fail('Conserva el renglon de insumo o concilia la compra mediante anulacion.');
  }
}
