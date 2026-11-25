import {procurementAnalytics} from '../utils/purchaseAnalytics.js';
import {supplyPresentation, yieldText} from '../utils/procurementUtils.js';
import {effectiveSourceYield} from '../services/supplyModel.js';
import {inventoryDecimal} from '../services/inventoryUnits.js';
import {productActivity} from './activityScope.mjs';
import {getProductDisplayName,normalizeText} from '../utils/catalogUtils.js';

export const supplyTypes = ['BASE','HYDRONEO','CONCENTRATE'];
export const supplyStates = {
  empty:'Agotado',low:'Bajo',sufficient:'Suficiente',
  unknown:'Sin inventario configurado',unconfigured:'Sin mínimo configurado',
};

export function supplyInventoryRows(data, inventory){
  const procurement=data.procurement;
  const analytics=procurementAnalytics(procurement,data.products);
  const minimums=inventory.policy?.policy?.supplyMinimums;
  const stockById=new Map((inventory.supplies??[]).map(row=>[row.purchasedItemId,row]));
  return procurement.purchasedItems.filter(article=>supplyTypes.includes(article.sourcingType)).map(article=>{
    const stock=stockById.get(article.id);
    // The existing replenishment command records the current settings in its audit event.
    const replenishment=stock&&inventory.changes.find(event=>event.action==='replenishment'&&String(event.reference.productId)===String(stock.productId))?.reference.next;
    const minimum=minimums?Number(minimums.overrides[article.id]??minimums.defaultPackages):replenishment?.minimum==null?null:Number(replenishment.minimum)/Number(stock.bottleLiters);
    const threshold=minimums&&stock?inventoryDecimal(minimum)*inventoryDecimal(stock.bottleLiters)/1000000n:inventoryDecimal(replenishment?.minimum??0);
    const state=!stock?'unknown':Number(stock.closed)===0?'empty':minimum==null?'unconfigured':BigInt(stock.closed)*inventoryDecimal(stock.bottleLiters)<=threshold?'low':'sufficient';
    const sources=procurement.supplyItems.filter(source=>source.purchasedItemId===article.id).map(source=>{
      const supplier=analytics.supplierMap.get(source.supplierId);
      const costs=analytics.bySupply?.get(source.id);
      return {...source,eligible:source.active&&supplier?.active&&supplier.businessActivity!=='JARCERIA'&&source.purchaseUnit==='litro'&&Number(source.purchaseQuantity)>0&&Boolean(source.presentation?.trim()),supplierName:supplier?.name??'Proveedor sin identificar',active:source.active&&supplier?.active,
        presentationText:supplyPresentation(source),cost:costs?.lastPurchase??costs?.lastQuote??null};
    });
    const outputs=procurement.supplyConversions.filter(link=>link.purchasedItemId===article.id).map(link=>{
      const product=analytics.productMap.get(link.outputProductId);
      return {...link,name:product?getProductDisplayName(product,data.categories,data.productLines):'Producto sin identificar',
        active:link.active&&product?.active&&productActivity(product)==='LIMPIEZA'&&!product.inventorySupplyId,unit:product?.unit,expected:yieldText(link.yield),
        overrides:sources.filter(source=>source.yieldOverrides?.[link.id]).map(source=>({
          id:source.id,supplier:source.supplierName,expected:yieldText(effectiveSourceYield(source,link))
        }))};
    });
    const sale=stock&&(procurement.presentations??[]).find(p=>p.supplyInventory&&p.active&&p.saleEnabled!==false&&String(p.productId)===String(stock.productId));
    const activeSources=sources.filter(source=>source.active);
    const formats=new Set(activeSources.map(source=>[normalizeText(source.presentation??''),source.purchaseQuantity,source.purchaseUnit].join('|')));
    const formatPending=!stock&&(formats.size!==1||activeSources.some(source=>!source.eligible));
    return {...article,stock,sale,minimum,formatPending,usualBatch:replenishment?.usualBatch??null,state,sources,outputs};
  }).sort((a,b)=>a.name.localeCompare(b.name,'es'));
}

export function supplyInventoryHistory(row, inventory, data){
  if(!row.stock)return [];
  const sales=new Map(data.sales.map(sale=>[String(sale.id),sale.folio]));
  const purchases=new Map(data.procurement.purchases.map(purchase=>[String(purchase.id),purchase.reference]));
  const movements=inventory.movements.filter(move=>String(move.product_id)===String(row.stock.productId)).map(move=>{
    const labels={receipt:'Compra',sale:'Venta directa',return:'Devolución',reversal:'Corrección de venta'};
    const type=move.reference.supplyConsumption?'Consumo por elaboración':
      move.reference.supplyPurchaseReturn?'Devolución de compra':labels[move.kind]??'Ajuste';
    const reference=move.purchase_id!=null?(purchases.get(String(move.purchase_id))||move.purchase_id):
      move.sale_id!=null?(sales.get(String(move.sale_id))||move.sale_id):move.id;
    return {id:move.id,date:move.occurred_at,quantity:move.quantity,unit:move.unit,type,reference,reason:move.reason};
  });
  const counts=inventory.changes.filter(change=>['supply_inventory_enabled','supply_inventory_count'].includes(change.action)&&change.reference.purchasedItemId===row.id).map(change=>({
    id:'count:'+change.seq,date:change.recorded_at,quantity:change.reference.closed,unit:change.reference.unit??'botella',
    type:change.action==='supply_inventory_enabled'?'Conteo inicial':'Conteo físico',reference:change.seq,reason:change.reference.reason
  }));
  return [...movements,...counts].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
}
