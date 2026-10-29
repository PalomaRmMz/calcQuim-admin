import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createServer } from 'vite';
import { MemoryRouter } from 'react-router';

test('inicio operativo omite la aceptación sintética y nunca accede a localStorage',async()=>{
    const server=await createServer({server:{middlewareMode:true,ws:false},appType:'custom'});
    const oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
    const oldStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
    Object.defineProperty(globalThis,'window',{configurable:true,value:{sessionStorage:null}});
    Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('LOCALSTORAGE_FORBIDDEN');}});
    try {
        const {default:Application}=await server.ssrLoadModule('/src/PostgresApplication.jsx');
        const html=renderToString(React.createElement(MemoryRouter,null,React.createElement(Application,{operational:true})));
        assert.ok(html.includes('CalcQuim'));
        assert.ok(!html.includes('Abrir entorno'));
        assert.ok(!html.includes('LOCALSTORAGE_FORBIDDEN'));
    }finally{
        if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else delete globalThis.window;
        if(oldStorage)Object.defineProperty(globalThis,'localStorage',oldStorage);else delete globalThis.localStorage;
        await server.close();
    }
});
