import { createCatalogActions } from '../../../src/services/catalogDomain.js';
import { catalogCollectionError } from '../../../src/services/catalogValidation.js';
import { STORAGE_KEYS } from '../../../src/services/catalogStorage.js';
import { assertProcurementValid, productHasHistory } from '../../../src/services/procurementStorage.js';
import * as supply from '../../../src/services/supplyModel.js';
import * as procurement from '../../../src/services/procurementDomain.js';
import { prepareFinishedPurchase, configureFinishedProducts } from '../../../src/services/finishedProductFlow.js';
import { preparePurchasedItemSetup } from '../../../src/services/purchasedItemSetup.js';
import { preparePurchasedItemBatch } from '../../../src/services/purchasedItemBatch.js';
import { prepareSupplyYieldBatch } from '../../../src/services/supplyYieldBatch.js';
import { configureProductBatch } from '../../../src/services/supplyModelBatch.js';
import { createSale, voidSale, validateSales } from '../../../src/services/salesStorage.js';
import { getProductDisplayName } from '../../../src/utils/catalogUtils.js';

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status=status; this.code=code; }
}
export const catalogCommands = ['addCategory','updateCategory','deleteCategory','addProductLine','updateProductLine','deleteProductLine','addPriceGroup','updatePriceGroup','deletePriceGroup','addProduct','updateProduct','deleteProduct','addProductsBatch','updateProductsBatch'];
export const procurementCommands = ['savePurchasedItem','savePurchasedItemsBatch','saveSupplyYieldBatch','savePurchasedItemSetup','saveSupplySource','saveSupplyConversion','configureSupplyBatch','configureProductBatch','saveSources','saveSupplier','setSupplyActive','addSupplierPrice','deleteEntity','savePurchase','voidPurchase'];
export const commandNames = [...catalogCommands,...procurementCommands,'createSale','voidSale'];
export function memoryStorage(data) {
  const values = {
    [STORAGE_KEYS.products]: data.products,[STORAGE_KEYS.categories]:data.categories,
    [STORAGE_KEYS.productLines]:data.productLines,[STORAGE_KEYS.priceGroups]:data.priceGroups,
    [STORAGE_KEYS.procurement]:data.procurement,[STORAGE_KEYS.sales]:data.sales,
  };
  return {getItem:key=>Object.hasOwn(values,key) ? JSON.stringify(values[key]) : null};
}
export function validateDataset(data) {
  for (const field of ['categories','productLines','priceGroups','products']) {
    const error = catalogCollectionError(STORAGE_KEYS[field],data[field]);
    if (error) throw new ApiError(422,'INVALID_CATALOG',error);
  }
  for (const l of data.productLines) if (!data.categories.some(c=>c.id===l.categoryId)) throw new ApiError(422,'INVALID_RELATION','La línea no tiene categoría válida.');
  for (const p of data.products) {
    if (p.categoryId != null && !data.categories.some(c=>c.id===p.categoryId)) throw new ApiError(422,'INVALID_RELATION','Categoría inválida.');
    if (p.lineId != null && !data.productLines.some(l=>l.id===p.lineId && l.categoryId===p.categoryId)) throw new ApiError(422,'INVALID_RELATION','Línea inválida.');
    if (p.priceGroupId != null && !data.priceGroups.some(g=>g.id===p.priceGroupId)) throw new ApiError(422,'INVALID_RELATION','Grupo de precio inválido.');
  }
  assertProcurementValid(data.procurement);
  // Los diagnósticos archivados no son relaciones que deban repararse.
  const issues = supply.supplyModelIssues({...data.procurement,supplyMigration:undefined}, data.products);
  if (issues.length) throw new ApiError(422,'INVALID_RELATION',issues[0]);
  validateSales(data.sales);
  if (data.sales.some(s=>s.items.some(i=>!data.products.some(p=>p.id===i.productId)))) throw new ApiError(422,'INVALID_RELATION','Venta con producto inexistente.');
}
export function executeCommand(data, counters, name, args) {
  if (!commandNames.includes(name) || !Array.isArray(args) || args.length>3) throw new ApiError(400,'INVALID_COMMAND','Operación no válida.');
  const catalog = {categories:data.categories,productLines:data.productLines,priceGroups:data.priceGroups,products:data.products};
  const named = data.products.map(p=>({...p,displayName:getProductDisplayName(p,data.categories,data.productLines)}));
  let result={ok:true};
  if (catalogCommands.includes(name)) {
    const fields = {Category:'categories',ProductLine:'productLines',PriceGroup:'priceGroups',Product:'products'};
    const idCollection = Object.entries(fields).find(([suffix])=>name.includes(suffix))?.[1] ?? 'products';
    const setters = Object.fromEntries(Object.keys(catalog).map(k=>[`set${k[0].toUpperCase()+k.slice(1)}`,fn=>{ data[k]=typeof fn==='function'?fn(data[k]):fn; }]));
    const actions = createCatalogActions(catalog,{...setters,productHasHistory:id=>productHasHistory(id,memoryStorage(data)),getNextId:items=>Math.max(counters[idCollection]??0,0,...items.map(i=>Number(i.id)))+1});
    result = actions[name](...args);
    if (!result.ok) throw new ApiError(422,'DOMAIN_VALIDATION',result.message);
  } else {
    let p=data.procurement;
    switch (name) {
      case 'savePurchasedItem': p=supply.savePurchasedItem(p,args[0]); break;
      case 'savePurchasedItemsBatch': p=preparePurchasedItemBatch(p,args[0]).next; break;
      case 'saveSupplyYieldBatch': p=prepareSupplyYieldBatch(p,named,args[0]).next; break;
      case 'savePurchasedItemSetup': p=preparePurchasedItemSetup(p,args[0],named); break;
      case 'saveSupplySource': p=supply.saveSupplySource(p,args[0]); break;
      case 'saveSupplyConversion': p=supply.saveSupplyConversion(p,args[0],named); break;
      case 'configureSupplyBatch': p=supply.configureSupplyBatch(p,args[0],named); break;
      case 'configureProductBatch': p=args[0].finished ? configureFinishedProducts(p,args[0],named) : configureProductBatch(p,args[0],named); break;
      case 'saveSources':
        for (const [index,source] of args[0].entries()) {
          p=supply.saveSupplySource(p,source);
          if (args[1]?.[index]) p=procurement.addSupplierPrice(p,{...args[1][index],supplyItemId:source.id||p.supplyItems.at(-1).id},named);
        } break;
      case 'saveSupplier': p=procurement.saveSupplier(p,args[0]); break;
      case 'setSupplyActive': p=procurement.setSupplyActive(p,...args,named); break;
      case 'addSupplierPrice': p=procurement.addSupplierPrice(p,args[0],named); break;
      case 'deleteEntity': p=procurement.deleteEntity(p,...args); break;
      case 'savePurchase': {
        if (args[1] != null && !p.purchases.some(x=>x.id===args[1])) throw new ApiError(404,'NOT_FOUND','Compra no encontrada.');
        // Alta rápida usa el contador histórico para no reutilizar IDs eliminados.
        let nextId=Math.max(counters.products??0,0,...data.products.map(p=>p.id));
        const prepared=prepareFinishedPurchase(p,args[0],{...catalog,nextProductId:()=>++nextId},args[1]);
        data.products=prepared.products; p=prepared.data;
        break;
      }
      case 'voidPurchase':
        if (!p.purchases.some(x=>x.id===args[0]&&!x.voidedAt)) throw new ApiError(404,'NOT_FOUND','Compra no encontrada o anulada.');
        p=procurement.voidPurchase(p,args[0]); break;
      case 'createSale': data.sales=createSale(data.sales,args[0],catalog,counters.sales??0); break;
      case 'voidSale': data.sales=voidSale(data.sales,args[0]); break;
      default: throw new ApiError(400,'INVALID_COMMAND','Operación no disponible.');
    }
    data.procurement=p;
  }
  for (const field of ['categories','productLines','priceGroups','products']) counters[field]=Math.max(counters[field]??0,0,...data[field].map(x=>Number(x.id)));
  counters.sales=Math.max(counters.sales??0,0,...data.sales.map(x=>Number(String(x.folio??'').replace(/^V-/,''))||0));
  validateDataset(data);
  return result;
}
