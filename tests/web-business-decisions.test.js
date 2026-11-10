import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';
import {ThemeProvider,createTheme} from '@mui/material';
import {replenishmentSuggestion} from '../src/domain/replenishmentSuggestion.mjs';
import {jarceriaInitialPolicy,initialCaptureAllowed} from '../src/domain/webBusinessDecisions.mjs';

test('replenishment suggestions exclude inputs, void purchases and ties without inventing a minimum',()=>{
 const product={id:1,unit:'litro'},data={products:[product],procurement:{purchases:[{items:[{productId:1,sourcingType:'READY_TO_USE',quantity:20,unit:'litro'}]},{items:[{productId:1,sourcingType:'CONCENTRATE',quantity:100,unit:'litro'}]},{voidedAt:'2026-11-06',items:[{productId:1,sourcingType:'READY_TO_USE',quantity:50,unit:'litro'}]}]}};
 assert.deepEqual(replenishmentSuggestion(product,data),{minimum:null,usualBatch:'20',observations:1});
 data.procurement.purchases.push({items:[{productId:1,sourcingType:'READY_TO_USE',quantity:10,unit:'litro'}]});assert.equal(replenishmentSuggestion(product,data).usualBatch,null);
 assert.equal(initialCaptureAllowed({activity:'JARCERIA',externalKey:'fc:article:fibra-chica'},jarceriaInitialPolicy),true);
 assert.equal(initialCaptureAllowed({activity:'JARCERIA',name:'Otro artículo',externalKey:'other'},jarceriaInitialPolicy),true);
});
test('cleaning capture radios and replenishment remain accessible without initial stock',async t=>{
 const server=await createServer({server:{middlewareMode:true,ws:false},appType:'custom'});
 try{
  const {default:Fields}=await server.ssrLoadModule('/src/components/CleaningSaleFields.jsx');
  await t.test('quantity and money share exclusive radio controls and money includes physical confirmation in a grid',()=>{
   const props={unit:'litro',value:'',confirmed:'',onMode:()=>{},onValue:()=>{},onConfirmed:()=>{}};
   const quantity=renderToString(React.createElement(Fields,{...props,mode:'quantity'})),amount=renderToString(React.createElement(Fields,{...props,mode:'amount'}));
   for(const html of [quantity,amount]){assert.equal((html.match(/type="radio"/g)||[]).length,2);assert.match(html,/Por cantidad/);assert.match(html,/Por monto/);assert.match(html,/cleaning-entry-grid/);assert.doesNotMatch(html,/<select/);}
   assert.match(quantity,/Cantidad \(litro\)/);assert.doesNotMatch(quantity,/física confirmada/);assert.match(amount,/Importe en pesos/);assert.match(amount,/física confirmada/);
  });
  const {default:Modal}=await server.ssrLoadModule('/src/components/InventoryProductModal.jsx');
  const product={productId:2,name:'Escoba',unit:'pieza',quantity:null,status:'unknown',initialMovementId:null,minimum:null,usualBatch:null};
  const data={products:[{id:2,name:'Escoba',activity:'JARCERIA',unit:'pieza',externalKey:'other'}],sales:[],procurement:{purchases:[]}},view={initialCaptureMode:'automatic',policy:{policy:{jarceriaInitialCapture:jarceriaInitialPolicy}},movements:[],changes:[]};
  await t.test('other hardware shows pending initial and editable replenishment instead of demanding a fictitious initial',()=>{
   const theme=createTheme({components:{MuiDialog:{defaultProps:{disablePortal:true}}}});
   const html=renderToString(React.createElement(ThemeProvider,{theme},React.createElement(Modal,{activity:'JARCERIA',product,data,view,categories:[],productLines:[],onClose:()=>{},onSave:()=>{},initialTab:'replenishment'})));
   assert.doesNotMatch(html,/Solo Fibra chica/);assert.match(html,/Registrar inventario inicial/);assert.match(html,/Punto de reposición/);assert.match(html,/Lote habitual/);assert.match(html,/Sugerencia del sistema, sin aprobar/);assert.match(html,/Guardar reposición/);assert.doesNotMatch(html,/sugerencia de 5 L/);
  });
 }finally{await server.close();}
});
