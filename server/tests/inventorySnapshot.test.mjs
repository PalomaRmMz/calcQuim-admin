import test from 'node:test';
import assert from 'node:assert/strict';
import {inventorySnapshot} from '../src/repositories/inventory.mjs';
test('respaldo anterior conserva su hash y versión nueva protege el inicial sin mutar la vista',()=>{
  const old={enabled:true,products:[{productId:1,quantity:'12',anchorId:'synthetic-anchor'}],movements:[],changes:[]};
  const current={...structuredClone(old),initialControlEnabled:true,initialCaptureMode:'automatic'};Object.assign(current.products[0],{initialMovementId:'synthetic-anchor',initialOriginalQuantity:'12',initialQuantity:'12',initialRecordedAt:'2026-10-29T00:00:00Z',initialCorrectionAllowed:true,initialCorrectionBlockedReason:null});
  assert.deepEqual(inventorySnapshot(current,1),old);assert.deepEqual(inventorySnapshot(current,3),current);assert.ok(!Object.hasOwn(inventorySnapshot(current,2),'initialCaptureMode'));assert.ok(current.products[0].initialMovementId);assert.throws(()=>inventorySnapshot(current,4));
});
