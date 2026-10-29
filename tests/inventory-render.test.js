import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
test('inventario sin migración muestra estado seguro sin leer almacenamiento del navegador',async()=>{
    const server=await createServer({server:{middlewareMode:true,ws:false},appType:'custom'});
    const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
    Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('LOCAL_STORAGE_FORBIDDEN');}});
    try{
        const {default:Page}=await server.ssrLoadModule('/src/pages/InventoryPage.jsx');
        const {PersistenceContext}=await server.ssrLoadModule('/src/context/PersistenceContext.js');
        const {CatalogContext}=await server.ssrLoadModule('/src/context/CatalogHooks.js');
        const html=renderToString(React.createElement(CatalogContext.Provider,{value:{products:[],categories:[],productLines:[]}},React.createElement(PersistenceContext.Provider,{value:{snapshot:{revision:0,data:{}},command:()=>{throw new Error('NO_WRITES');}}},React.createElement(Page))));
        assert.ok(html.includes('Inventario pendiente de activación'));assert.ok(html.includes('No se asignaron existencias iniciales'));
    }finally{if(old)Object.defineProperty(globalThis,'localStorage',old);else delete globalThis.localStorage;await server.close();}
});
