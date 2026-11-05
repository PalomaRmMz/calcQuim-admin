import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';
const data={products:[{id:1,name:'Artículo físico exclusivo QA',unit:'pieza',activity:'JARCERIA',active:true}],sales:[],categories:[],productLines:[],priceGroups:[],procurement:{commerceSchema:1,organizationSchema:1,presentations:[],services:[{id:'qa-wash',name:'Lavado exclusivo QA',unit:'carga',priceMode:'fixed',price:60,active:true,addons:[]}],suppliers:[],purchases:[],supplyItems:[],supplierPrices:[]}};
test('independent administrative screens render actual activity-specific controls',async t=>{
 const server=await createServer({server:{middlewareMode:true,ws:false},appType:'custom'});
 try{
  const {PersistenceContext}=await server.ssrLoadModule('/src/context/PersistenceContext.js');
  async function render(path,props={}){const {default:Page}=await server.ssrLoadModule(path);return renderToString(React.createElement(PersistenceContext.Provider,{value:{snapshot:{data,revision:1,generation:'qa'},command:()=>{throw Error('SSR must not write');}}},React.createElement(Page,props)));}
  await t.test('hardware has physical article controls and no laundry catalog',async()=>{const html=await render('/src/pages/HardwareProductsPage.jsx');assert.match(html,/Productos de jarcería/);assert.match(html,/Artículo físico exclusivo QA/);assert.match(html,/Agregar producto/);assert.match(html,/Herramientas de carga inicial/);assert.doesNotMatch(html,/Guardar producto|Unidad base/);assert.doesNotMatch(html,/Lavado exclusivo QA|Guardar servicio|Conceptos y tarifas/);});
  await t.test('laundry has tariff/addon controls and no hardware product grid',async()=>{const html=await render('/src/pages/LaundryPage.jsx');assert.match(html,/Lavandería/);assert.match(html,/Lavado exclusivo QA/);assert.match(html,/Agregar servicio/);assert.match(html,/Adicionales disponibles/);assert.doesNotMatch(html,/Guardar servicio/);assert.doesNotMatch(html,/Artículo físico exclusivo QA|Guardar artículo|Guardar presentación/);});
  await t.test('commercial reports keep their view and no generic mixed administration tabs',async()=>{const html=await render('/src/pages/CommercePage.jsx',{reportOnly:true});assert.match(html,/Reportes comerciales/);assert.match(html,/Ingresos por actividad/);assert.doesNotMatch(html,/>Artículos<\/button>|>Servicios<\/button>|Guardar artículo|Guardar servicio/);});
 }finally{await server.close();}
});
