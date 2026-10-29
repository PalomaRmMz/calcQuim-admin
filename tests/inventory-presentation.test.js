import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ThemeProvider,createTheme } from '@mui/material';
import { createServer } from 'vite';
import { categoryStyle } from '../src/utils/categoryColors.js';
import { saveInventory } from '../src/services/inventoryClient.js';

test('una recarga fallida después de guardar no invita a duplicar el movimiento confirmado',async()=>{
    let writes=0;
    const result=await saveInventory(async()=>{writes++;return {ok:true};},'inventoryMovement',{},async()=>{throw new Error('Read connection lost');});
    assert.equal(writes,1);assert.equal(result.ok,true);assert.ok(result.viewWarning.includes('No repitas'));
    let refreshed=false;
    const failed=await saveInventory(async()=>({ok:false,message:'No se guardó'}),'inventoryEstimate',{},async()=>{refreshed=true;});
    assert.equal(failed.ok,false);assert.equal(refreshed,false);
});

const categories=[{id:2,name:'Zeta sintética',colorKey:'rose'},{id:1,name:'Alfa sintética',colorKey:'teal'}];
const lines=[{id:12,categoryId:1,name:'Línea 10'},{id:11,categoryId:1,name:'Línea 2'}];
const row=(productId,name,categoryId,lineId)=>({productId,name,categoryId,lineId,unit:'litro',quantity:null,status:'unknown',minimum:null,usualBatch:null,low:false,negative:false,movementsWithoutBasis:0});
const rows=[row(4,'Último',2,null),row(3,'Beta',1,12),row(2,'Alfa',1,11),row(1,'Sin clasificación',null,null)];
test('tabla de inventario reutiliza DataTable y ficha sin cantidad predeterminada',async()=>{
    const server=await createServer({server:{middlewareMode:true,ws:false},appType:'custom'});
    try{
        const {default:List}=await server.ssrLoadModule('/src/components/InventoryProductList.jsx');
        const html=renderToString(React.createElement(List,{rows,categories,productLines:lines,onSelect(){}}));
        assert.ok(!html.includes('inventory-category'));assert.ok(html.includes('data-table-wrapper'));assert.ok(html.includes('data-table-header-cell'));assert.ok(html.includes('Acciones'));assert.ok(html.includes('table-action-button edit'));
        assert.ok(html.includes(categoryStyle(categories[1])['--category-accent']));assert.ok(html.includes('Editar '));
        assert.ok(html.includes('Sin determinar'));assert.ok(!html.includes('0 L'));
        const {default:Modal}=await server.ssrLoadModule('/src/components/InventoryProductModal.jsx');
        const theme=createTheme({components:{MuiDialog:{defaultProps:{disablePortal:true}}}});
        const modal=renderToString(React.createElement(ThemeProvider,{theme},React.createElement(Modal,{product:rows[2],categories,productLines:lines,view:{initialControlEnabled:true,initialCaptureMode:'automatic',movements:[],changes:[]},data:{sales:[],procurement:{purchases:[]}},onClose(){},onSave(){throw new Error('SSR_NO_WRITES');}})));
        for(const text of ['app-dialog','sale-modal','Sin determinar','Registrar inventario inicial'])assert.ok(modal.includes(text),text);
        assert.match(modal,/<input(?=[^>]*id="inventory-quantity")(?=[^>]*value="")/);
        assert.ok(!modal.includes('id="inventory-reason"'));assert.ok(!modal.includes('Ficha de inventario'));assert.ok(modal.includes('INVENTARIO_INICIAL'));assert.ok(modal.includes('inventory-observations'));assert.ok(!modal.includes('value="prepared_product"'));
        const {default:ReasonFields}=await server.ssrLoadModule('/src/components/InventoryReasonFields.jsx');
        const fields=renderToString(React.createElement(ReasonFields,{context:'prepared',value:{reasonCode:'other',reasonExplanation:'',observations:''},onChange(){}}));
        assert.ok(fields.includes('value="prepared_product"'));assert.ok(!fields.includes('value="physical_count"'));
        assert.match(fields,/<textarea(?=[^>]*id="inventory-reason-explanation")(?=[^>]*required)/);
        assert.ok(!fields.match(/<textarea(?=[^>]*id="inventory-observations")(?=[^>]*required)/));
        const {default:ReasonSummary}=await server.ssrLoadModule('/src/components/InventoryReasonSummary.jsx');
        assert.ok(renderToString(React.createElement(ReasonSummary,{legacyReason:'Motivo histórico libre intacto'})).includes('Motivo histórico libre intacto'));
    }finally{await server.close();}
});
