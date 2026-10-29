import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryConvert,inventoryDecimal,inventoryText } from '../../src/services/inventoryUnits.js';
test('cantidades físicas exactas y equivalencias existentes, sin inferir envases',()=>{
  assert.equal(inventoryConvert('500','mililitro','litro'),'0.5');
  assert.equal(inventoryConvert('1.5','kg','gramo'),'1500');
  assert.equal(inventoryText(inventoryDecimal('-0.125')),'-0.125');
  assert.equal(inventoryText(inventoryDecimal('12345678901234567890.000001')),'12345678901234567890.000001');
  for(const args of [['1','garrafa','litro'],['1','kg','litro'],['0.000001','mililitro','litro'],['0.1234567','litro','litro'],['','litro','litro']])assert.throws(()=>inventoryConvert(...args));
});
