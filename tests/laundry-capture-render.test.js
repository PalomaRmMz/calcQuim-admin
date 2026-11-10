import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';
import {officialServices} from '../src/domain/officialLaundryServices.mjs';
import {calculateLaundryLoad} from '../src/domain/laundryPricing.mjs';

test('laundry fields reuse existing form controls and hide unit tariffs and calculation details',async t=>{
 const server=await createServer({server:{middlewareMode:true,ws:false},appType:'custom'});
 try{
  const {default:Fields}=await server.ssrLoadModule('/src/components/LaundrySaleFields.jsx');
  const render=(service,value,addons=[],description='')=>renderToString(React.createElement(Fields,{service,value,addons,description,onValue:()=>{},onAddons:()=>{},onDescription:()=>{},preview:value&&service.loadPricing?calculateLaundryLoad(service,value,addons):null,error:''}));
  await t.test('wash shows four labels, half-step input and only its subtotal',()=>{const html=render(officialServices[0],'4.5',['insumos','secado']);assert.match(html,/Tipo de lavado/);assert.match(html,/Cantidad de cargas/);assert.match(html,/Subtotal del concepto/);assert.match(html,/step="0.5"/);assert.match(html,/\$450\.00/);assert.doesNotMatch(html,/\$100|\$50|Tarifa|Carga completa:|Media carga:|×/);assert.match(html,/procurement-field/);assert.match(html,/form-select/);});
  await t.test('custom description is required and has no prefilled amount',()=>{const html=render(officialServices[3],'');assert.match(html,/Descripción del trabajo/);assert.match(html,/required=""/);assert.match(html,/Importe en pesos/);assert.match(html,/value=""/);assert.doesNotMatch(html,/Tarifa|Tipo de lavado/);});
  await t.test('standalone drying retains whole-load increments',()=>{const html=render(officialServices[1],'1');assert.match(html,/step="1"/);assert.match(html,/\$30\.00/);assert.doesNotMatch(html,/Media carga|Tarifa/);});
 }finally{await server.close();}
});
