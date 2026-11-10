import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {purchaseInventorySnapshot} from '../src/services/purchaseInventory.mjs';
test('purchase backup snapshot protects ledger and audit independently of display labels',()=>{
 const view={available:true,enabled:true,rows:[{purchase_id:'qa',item_id:'i',state:'applied',quantity:'3',actual_quantity:'3',source:{total:100},updated_at:new Date('2026-11-06T12:00:00Z'),name:'Etiqueta',intent:{expectedOutput:20}}],events:[{action:'purchase_inventory_receipt',reference:{quantity:'3'}}]};
 const hash=v=>createHash('sha256').update(JSON.stringify(purchaseInventorySnapshot(v))).digest('hex'),before=hash(view),copy=structuredClone(view);
 copy.rows[0].name='Etiqueta nueva';copy.rows[0].intent.expectedOutput=30;assert.equal(hash(copy),before);
 copy.rows[0].actual_quantity='4';assert.notEqual(hash(copy),before);copy.rows[0].actual_quantity='3';copy.events[0].reference.quantity='4';assert.notEqual(hash(copy),before);
 assert.equal(view.rows[0].actual_quantity,'3');assert.throws(()=>purchaseInventorySnapshot(view,2));
});
