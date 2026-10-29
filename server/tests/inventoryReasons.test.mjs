import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryReasonOptions,inventoryReasonPayload,resolveInventoryReason,movementReasonContext } from '../../src/services/inventoryReasons.js';

test('motivos propios de cada operación con IDs estables y Otro excepcional',()=>{
  assert.deepEqual(inventoryReasonOptions('estimate').map(r=>r.id),['initial_inventory','physical_count','visual_estimate','stock_correction','other']);
  assert.deepEqual(inventoryReasonOptions('prepared').map(r=>r.id),['prepared_product','other']);
  assert.deepEqual(inventoryReasonOptions('receipt').map(r=>r.id),['finished_receipt','other']);
  assert.deepEqual(inventoryReasonOptions('outflow').map(r=>r.id),['internal_use','waste','exit_correction','other']);
  assert.deepEqual(inventoryReasonOptions('adjustment').map(r=>r.id),['count_correction','entry_correction','other']);
  assert.deepEqual(inventoryReasonOptions('positive_adjustment').map(r=>r.id),['positive_adjustment','other']);
  assert.equal(movementReasonContext('adjustment','-1',{entryType:'justified_outflow'}),'outflow');
});
test('Otro requiere explicación propia, no basta con observaciones',()=>{
  assert.throws(()=>inventoryReasonPayload({reasonCode:'other',observations:'No sustituye la explicación'},'estimate'));
  const value=inventoryReasonPayload({reasonCode:'other',reasonExplanation:'  Motivo excepcional  ',observations:'  Nota adicional  '},'estimate');
  assert.equal(value.reasonCode,'other');assert.equal(value.reasonExplanation,'Motivo excepcional');assert.equal(value.observations,'Nota adicional');
  assert.throws(()=>inventoryReasonPayload({reasonCode:'physical_count',observations:'x'.repeat(2001)},'estimate'));
});
test('rechaza códigos ajenos y etiquetas manipuladas no cambian el código ni el texto canónico',()=>{
  assert.throws(()=>inventoryReasonPayload({reasonCode:'prepared_product'},'estimate'));
  assert.throws(()=>inventoryReasonPayload({reasonCode:'unknown'},'prepared'));
  const result=inventoryReasonPayload({reasonCode:'physical_count',reason:'Etiqueta falsa'},'estimate');assert.equal(result.reason,'Conteo físico');
});
test('clientes anteriores conservan su texto sin inferir un motivo nuevo',()=>{
  const old=resolveInventoryReason({reason:'Texto anterior sin catálogo'},'estimate');
  assert.equal(old.text,'Texto anterior sin catálogo');assert.equal(old.metadata.reasonCode,'legacy_free_text');
  assert.throws(()=>inventoryReasonPayload({reason:'No sustituye seleccionar un motivo'},'estimate'));
});
