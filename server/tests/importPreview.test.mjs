import test from 'node:test';
import assert from 'node:assert/strict';
import { previewOriginal } from '../src/services/importPreview.mjs';
import { STORAGE_KEYS } from '../../src/services/catalogStorage.js';

function syntheticBackup() {
  const storage=Object.fromEntries(Object.values(STORAGE_KEYS).map(k=>[k,null]));
  for(const name of ['categories','productLines','priceGroups','products','sales'])storage[STORAGE_KEYS[name]]='[]';
  storage[STORAGE_KEYS.procurement]=JSON.stringify({version:1,supplyConfigurationVersion:3,supplyModelVersion:2,suppliers:[],purchasedItems:[],supplyItems:[],supplyConversions:[],supplierPrices:[],purchases:[]});
  return {application:'CalcQuim',formatVersion:1,storage};
}
test('prevalidación conserva originales y campos desconocidos sin semillas ni escrituras',()=>{
  const source=syntheticBackup();source.storage[STORAGE_KEYS.products]=JSON.stringify([{id:27,name:'Ficticio',unit:'litro',categoryId:null,lineId:null,priceGroupId:null,price:0,active:true,extra:{original:'conservar'}}]);
  const raw=JSON.stringify(source),result=previewOriginal(raw);
  assert.equal(result.report.canTransfer,true);assert.equal(result.report.applyEnabled,false);
  assert.deepEqual(result.data.products[0].extra,{original:'conservar'});assert.deepEqual(result.original,source);
  assert.equal(result.data.products[0].id,27);
});
test('rechaza claves ausentes, operación pendiente, archivo legacy y precisión perdida',()=>{
  const absent=syntheticBackup();absent.storage[STORAGE_KEYS.products]=null;assert.equal(previewOriginal(JSON.stringify(absent)).report.canTransfer,false);
  const pending=syntheticBackup();pending.storage[STORAGE_KEYS.resetPending]='pending';assert.ok(previewOriginal(JSON.stringify(pending)).report.issues.includes('PENDING_STORAGE_OPERATION'));
  const legacy=syntheticBackup();legacy.storage[STORAGE_KEYS.purchases]='[{"id":"original"}]';assert.ok(previewOriginal(JSON.stringify(legacy)).report.issues.includes('LEGACY_ARCHIVE_REQUIRES_SEPARATE_MAPPING'));
  const precision=syntheticBackup();precision.storage[STORAGE_KEYS.products]='[{"id":9007199254740993,"name":"Ficticio","unit":"litro"}]';assert.equal(previewOriginal(JSON.stringify(precision)).report.canTransfer,false);
});
test('huérfanos e IDs ausentes bloquean sin crear identidades',()=>{
  const source=syntheticBackup();source.storage[STORAGE_KEYS.products]='[{"name":"Ficticio","unit":"litro","categoryId":999}]';
  const result=previewOriginal(JSON.stringify(source));assert.equal(result.report.canTransfer,false);assert.equal(result.data.products[0].id,undefined);
  assert.equal(previewOriginal('{bad').report.canTransfer,false);
});
