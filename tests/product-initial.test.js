import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToString} from 'react-dom/server';
import {createServer} from 'vite';
import {ThemeProvider,createTheme} from '@mui/material';
import {productInitialInventory} from '../src/domain/productInitialInventory.mjs';
test('initial conversion preserves explicit zero and rejects guessed packages, inactive or foreign presentations and rounding',()=>{
 const product={id:1,unit:'pieza'},presentation={id:'pack',productId:1,unit:'paquete',baseUnit:'pieza',factor:4,active:true,integerOnly:true};
 assert.equal(productInitialInventory({quantity:'4',unit:'paquete',presentationId:'pack'},product,[presentation]).quantity,'16');
 assert.equal(productInitialInventory({quantity:'0',unit:'pieza'},product).quantity,'0');
 for(const i of [{quantity:'',unit:'pieza'},{quantity:'-1',unit:'pieza'},{quantity:'4',unit:'paquete'},{quantity:'0.5',unit:'paquete',presentationId:'pack'}])assert.throws(()=>productInitialInventory(i,product,[presentation]));
 for(const p of [{...presentation,active:false},{...presentation,productId:2},{...presentation,factor:'0.000001',integerOnly:false}])assert.throws(()=>productInitialInventory({quantity:'0.000001',unit:'paquete',presentationId:'pack'},product,[p]));
 assert.equal(productInitialInventory({quantity:'500',unit:'mililitro'},{id:1,unit:'litro'}).quantity,'0.5');
});
test('optional initial UI distinguishes blank from zero and is absent from editing existing products',async t=>{
 const server=await createServer({server:{middlewareMode:true,ws:false},appType:'custom'});
 try{
  const {default:Fields,productInitialPayload}=await server.ssrLoadModule('/src/components/InitialInventoryFields.jsx');
  const render=value=>renderToString(React.createElement(Fields,{value,onChange:()=>{},unit:'litro'}));
  await t.test('unchecked remains unknown; checked zero is explicit with unit and preview',()=>{
   const blank=render({enabled:false,quantity:'',selection:'base',observations:''});assert.match(blank,/existencia desconocida/);assert.doesNotMatch(blank,/type="number"/);
   const zero=render({enabled:true,quantity:'0',selection:'base',observations:''});assert.match(zero,/value="0"/);assert.match(zero,/Inicial que se registrará: 0 L/);assert.match(zero,/required=""/);
   assert.equal(productInitialPayload({quantity:'500',selection:'unit:mililitro',observations:''},'litro').unit,'mililitro');
  });
  await t.test('cleaning create form offers optional initial only in PostgreSQL; edit keeps authorized inventory flow',async()=>{
   const {default:Form}=await server.ssrLoadModule('/src/components/ProductFormModal.jsx'),{PersistenceContext}=await server.ssrLoadModule('/src/context/PersistenceContext.js');
   const theme=createTheme({components:{MuiDialog:{defaultProps:{disablePortal:true}}}}),html=product=>renderToString(React.createElement(ThemeProvider,{theme},React.createElement(PersistenceContext.Provider,{value:{snapshot:{},command:()=>{throw Error('SSR_NO_WRITES');}}},React.createElement(Form,{show:true,product,categories:[],productLines:[],priceGroups:[],onClose:()=>{},onSave:()=>{throw Error('SSR_NO_WRITES');}}))));
   assert.match(html(null),/Registrar inventario inicial ahora/);assert.doesNotMatch(html({id:1,name:'Existente',unit:'litro'}),/Registrar inventario inicial ahora/);assert.match(html({id:1,name:'Existente',unit:'litro'}),/utiliza Correcciones/);
  });
 }finally{await server.close();}
});
