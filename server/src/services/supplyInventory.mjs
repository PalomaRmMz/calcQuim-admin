import {ApiError} from './commands.mjs';
import {inventoryAccount,appendInventoryMovement,inventoryChange,purchaseAutomationPolicy,inventoryPolicy} from '../repositories/inventory.mjs';
import {inventoryDecimal,inventoryText,inventoryConvert} from '../../../src/services/inventoryUnits.js';
import {pinolBlancoId,supplyBottleId} from '../../../src/domain/supplyInventory.mjs';
import {checkBaseline} from './inventoryBaseline.mjs';

const fail = message => {throw new ApiError(422,'SUPPLY_INVENTORY',message);};
const scale = 1000000n;
const available = async c => (await c.query("SELECT to_regclass('supply_inventory') IS NOT NULL AS ok")).rows[0].ok;
const product = (data,id) => data.products.find(p=>String(p.id)===String(id));

export async function supplyStocks(c,lock=false){
  if(!await available(c))return [];
  return (await c.query('SELECT * FROM supply_inventory ORDER BY purchased_item_id'+(lock?' FOR UPDATE':''))).rows;
}
export function supplyStockView(stocks,data){
  return stocks.map(s=>({purchasedItemId:s.purchased_item_id,productId:s.product_id,closed:s.closed,
    version:s.stock_version,bottleLiters:s.bottle_liters,name:product(data,s.product_id)?.name,
    totalLiters:s.closed}));
}

function nonnegative(value){
  try{const amount=inventoryDecimal(value);if(amount>=0n)return amount;}catch{/* Invalid decimal. */}
  fail('Confirma una cantidad fisica no negativa.');
}
function bottles(value){
  const amount=nonnegative(value);
  if(amount%scale)fail('Las botellas cerradas deben ser enteras.');
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
  if(!amount||amount%factor)fail('Las botellas deben ser enteras y mayores que cero.');
  if(ref.includedInAnchorId)fail('Concilia con un conteo de botellas.');
  const supported=(
    (input.kind==='sale'&&amount<0n&&ref.physicalPresentation?.id===supplyBottleId(s.purchased_item_id))||
    (input.kind==='receipt'&&amount>0n&&ref.supplyReceipt===true)||
    (input.kind==='adjustment'&&amount<0n&&(ref.supplyConsumption===true||ref.supplyPurchaseReturn===true))||
    ((input.kind==='return'||input.kind==='reversal'&&ref.physicalReturnConfirmed)&&amount>0n&&ref.packReturnDisposition==='sealed')
  );
  if(!supported)fail('Usa una operacion de insumo y confirma el retorno de botellas originales cerradas cuando corresponda.');
  if(ref.supplyCountTreatment!=='already_included')await update(c,s,BigInt(s.closed)+amount/factor);
}

export const supplyInventoryCommands=['enablePinolBlancoInventory','countSupplyInventory','prepareFromSupplyInventory','returnSupplyInventory'];

export async function executeSupplyInventory(c,data,name,input){
  const stocks=await supplyStocks(c,true);
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
    const closed=bottles(input.closed);
    await inventoryChange(c,'supply_inventory_count',{purchasedItemId:s.purchased_item_id,previousClosed:s.closed,closed:String(closed),reason:why});
    await update(c,s,closed);
    return {};
  }
  if(name==='returnSupplyInventory'){
    const sales=(await c.query(`SELECT kind,quantity::text FROM inventory_movements m
      WHERE sale_id=$1 AND product_id=$2 AND kind IN ('sale','return')
      AND NOT EXISTS (SELECT 1 FROM inventory_movements r WHERE r.reversal_of=m.id)`,[String(input.saleId),s.product_id])).rows;
    const quantity=bottles(input.quantity)*scale;
    const outstanding=-sales.reduce((sum,m)=>sum+inventoryDecimal(m.quantity),0n);
    if(quantity<=0n||quantity>outstanding)fail('La devolucion excede la salida pendiente de retornar.');
    const movementId=await appendInventoryMovement(c,p,{kind:'return',quantity:inventoryText(quantity),saleId:String(input.saleId),reason:why,reference:{packReturnDisposition:input.disposition}});
    return {movementId};
  }
  const row=input.purchaseId==null?null:(await c.query("SELECT * FROM purchase_inventory WHERE purchase_id=$1 AND item_id=$2 FOR UPDATE",[String(input.purchaseId),String(input.itemId)])).rows[0];
  if(input.purchaseId!=null&&(!row||row.state!=='prepare'||row.source.purchasedItemId!==s.purchased_item_id||row.product_id!==s.output_product_id))
    fail('El renglon no tiene una elaboracion pendiente para este insumo.');
  const output=product(data,s.output_product_id),used=bottles(input.inputLiters)*scale;
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
    const format=data.procurement.presentations.find(p=>p.id===supplyBottleId(s.purchased_item_id));
    const previous=before.procurement.presentations.find(p=>p.id===format?.id);
    if(!p||p.inventorySupplyId!==s.purchased_item_id||p.price!=null||p.priceGroupId!=null||
      !format||!format.supplyInventory||format.purchaseEnabled!==false||!format.integerOnly||format.unit!=='botella'||format.price!==previous?.price||String(format.productId)!==s.product_id||Number(format.factor)!==Number(s.bottle_liters)||
      (data.procurement.presentations||[]).filter(f=>String(f.productId)===s.product_id).length!==1||
      old?.inventorySupplyId!==p.inventorySupplyId||p.unit!=='litro'||p.activity!=='LIMPIEZA')
      fail('Conserva la cuenta y la presentacion autorizadas del insumo.');
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
      if(item.presentation?.trim().toLowerCase()!=='botella'||
        item.purchaseUnit!=='litro'||item.purchaseQuantity!==1)
        fail('La compra debe corresponder a botellas originales de un litro.');
      await appendInventoryMovement(c,p,{kind:'receipt',quantity,purchaseId:purchase.id,originKey:key,reason:'Recepcion de insumo comprado',
        reference:{supplyReceipt:true,itemId:item.id,purchaseOrdinal:ordinal,supplierId:purchase.supplierId,cost:item.total}});
    }
    if(old&&!purchase.voidedAt&&old.items.some(i=>stocks.some(s=>s.purchased_item_id===i.purchasedItemId)&&!items.some(row=>row.id===i.id)))
      fail('Conserva el renglon de insumo o concilia la compra mediante anulacion.');
  }
}
