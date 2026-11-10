import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';
import {composition,consumeUnits,consumeClosed} from '../src/domain/packInventory.mjs';
const pack={id:'pack',factor:4};
test('closed plus loose totals are exact, opening is minimal and never reconstructs sealed packages',()=>{
 const start=composition({presentationId:'pack',closedPackages:4,looseUnits:2},pack);assert.equal(start.total,'18');
 const loose=consumeUnits(start,1);assert.equal(loose.opened,'0');assert.equal(loose.after.closedPackages,'4');assert.equal(loose.after.looseUnits,'1');
 const open=consumeUnits({...start,looseUnits:'0',total:'16'},1);assert.equal(open.opened,'1');assert.equal(open.after.closedPackages,'3');assert.equal(open.after.looseUnits,'3');assert.equal(open.after.total,'15');
 const several=consumeUnits({...start,looseUnits:'0',total:'16'},9);assert.equal(several.opened,'3');assert.equal(several.after.closedPackages,'1');assert.equal(several.after.looseUnits,'3');
 assert.throws(()=>consumeClosed(composition({presentationId:'pack',closedPackages:0,looseUnits:18},pack),1));assert.throws(()=>consumeUnits(start,19));assert.throws(()=>composition({presentationId:'pack',closedPackages:'0.5',looseUnits:0},pack));
});
test('composition UI records both physical counts, does not prefill unknown counts or add sales controls',async()=>{
 const server=await createServer({server:{middlewareMode:true,ws:false},appType:'custom'});
 try{
  const {default:Fields}=await server.ssrLoadModule('/src/components/PhysicalCompositionFields.jsx');
  const html=renderToString(React.createElement(Fields,{value:{enabled:true,presentationId:'pack',closedPackages:'4',looseUnits:'2'},onChange:()=>{},presentations:[{...pack,name:'Paquete 4'}]})).replaceAll('<!-- -->','');assert.match(html,/Paquetes cerrados/);assert.match(html,/Unidades sueltas/);assert.match(html,/Total equivalente: 18/);assert.doesNotMatch(html,/Abrir paquete|Agregar a la venta/);
  const empty=renderToString(React.createElement(Fields,{value:{enabled:true,presentationId:'pack',closedPackages:'',looseUnits:''},onChange:()=>{},presentations:[pack]}));assert.doesNotMatch(empty,/Total equivalente: 0/);
  const {productInitialPayload}=await server.ssrLoadModule('/src/components/InitialInventoryFields.jsx');assert.deepEqual(productInitialPayload({composition:{enabled:true,presentationId:'pack',closedPackages:'4',looseUnits:'2'},observations:''},'pieza'),{unit:'pieza',observations:'',physicalComposition:{presentationId:'pack',closedPackages:'4',looseUnits:'2'}});
 }finally{await server.close();}
});
