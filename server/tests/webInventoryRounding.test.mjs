import test from 'node:test';
import assert from 'node:assert/strict';
import {exactSaleQuantity} from '../src/services/inventory.mjs';
const product={unit:'litro'};
const item=(amount,price)=>({entryMode:'amount',requestedAmount:amount,price,unit:'litro'});
test('ventas web por monto redondean a un decimal sin cambiar el cobro',()=>{
  for(const [amount,price,expected] of [[40,15,'2.7'],[10,15,'0.7'],[5,6,'0.8'],[1,4,'0.3'],[20,10,'2']]){
    const row=item(amount,price),before=structuredClone(row);
    assert.equal(exactSaleQuantity(row,product,'WEB'),expected);
    assert.deepEqual(row,before);
  }
});
test('usa la fracción de la tarifa aplicada y convierte la unidad después de redondear',()=>{
  const row={...item(40,15),quantityNumerator:'4000',quantityDenominator:'1500'};
  assert.equal(exactSaleQuantity(row,{unit:'mililitro'},'WEB'),'2700');
  assert.equal(exactSaleQuantity({...row,quantityNumerator:'25',quantityDenominator:'100'},product,'WEB'),'0.3');
});
test('no cambia ventas móviles, cantidades capturadas ni aplica salidas de cero',()=>{
  assert.equal(exactSaleQuantity(item(4,6),product,'MOVIL'),null);
  assert.equal(exactSaleQuantity(item(1,4),product,'MOVIL'),'0.25');
  assert.equal(exactSaleQuantity({entryMode:'quantity',quantity:'1.25',unit:'litro'},product,'WEB'),'1.25');
  assert.equal(exactSaleQuantity(item(0.01,15),product,'WEB'),null);
});
