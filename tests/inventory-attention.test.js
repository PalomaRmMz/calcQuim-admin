import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable,getCoreRowModel,getFilteredRowModel,getPaginationRowModel} from '@tanstack/table-core';
import {filterInventoryProducts,inventoryAttention,inventoryShoppingList,packDescription} from '../src/domain/inventoryAttention.mjs';
test('inventory alerts distinguish unknown, empty, low and sufficient without inventing a minimum',()=>{
 const state=(quantity,minimum)=>inventoryAttention({quantity,minimum}).key;
 assert.equal(state(null,5),'unknown');assert.equal(state(0,5),'empty');
 assert.equal(state(2,5),'low');assert.equal(state(5,5),'low');assert.equal(state(6,5),'sufficient');
 assert.equal(state(6,null),'unconfigured');assert.equal(state(-1,5),'negative');
});
test('closed packages count toward availability even when loose stock is zero',()=>{
 const pack={known:true,closedPackages:'5',looseUnits:'0',total:'20'};
 assert.equal(inventoryAttention({quantity:'20',minimum:'4'},pack).key,'sufficient');
 assert.match(packDescription({...pack,looseUnits:'3',total:'23'},'rollos'),/5 paquetes cerrados \+ 3 rollos sueltos = 23 rollos disponibles/);
 assert.match(packDescription({known:false,total:'23'}),/sin confirmar/);
 assert.doesNotMatch(packDescription({known:false,total:'23'}),/paquetes cerrados/);
});

test('lista de limpieza incluye toda la búsqueda filtrada, conserva litros y no modifica sus datos',()=>{
 const products=Object.freeze([
  ...Array.from({length:12},(_,i)=>({productId:i+1,name:`Jabón ${i+1}`,categoryId:1,lineId:2,unit:'litro',quantity:'0',minimum:i===0?null:'3'})),
  {productId:13,name:'Jabón surtido',categoryId:1,lineId:2,unit:'litro',quantity:'1.25',minimum:'3'},
  {productId:14,name:'Jabón al mínimo',categoryId:1,lineId:2,unit:'litro',quantity:'3',minimum:'3'},
  {productId:15,name:'Jabón sin mínimo',categoryId:1,lineId:2,unit:'litro',quantity:'1',minimum:null},
  {productId:16,name:'Jabón sin conteo',categoryId:1,lineId:2,unit:'litro',quantity:null,minimum:'3'},
  {productId:17,name:'Jabón negativo',categoryId:1,lineId:2,unit:'litro',quantity:'-1',minimum:'3'},
  {productId:18,name:'Cloro',categoryId:1,lineId:2,unit:'litro',quantity:'0',minimum:'3'},
  {productId:19,name:'Jabón otra línea',categoryId:1,lineId:3,unit:'litro',quantity:'0',minimum:'3'},
  {productId:20,name:'Jabón otra categoría',categoryId:2,lineId:2,unit:'litro',quantity:'0',minimum:'3'},
 ].map(Object.freeze));
 const before=JSON.stringify(products),filters={activity:'LIMPIEZA',category:'1',line:'2'};
 const rows=filterInventoryProducts(products,filters,inventoryAttention);
 const table=createTable({
  data:rows,columns:[{accessorKey:'name'}],globalFilterFn:'includesString',
  state:{globalFilter:'Jabón',columnFilters:[],pagination:{pageIndex:0,pageSize:10}},
  getCoreRowModel:getCoreRowModel(),getFilteredRowModel:getFilteredRowModel(),getPaginationRowModel:getPaginationRowModel(),
 });
 assert.equal(table.getRowModel().rows.length,10);
 const filtered=table.getFilteredRowModel().rows.map(row=>row.original);
 const message=inventoryShoppingList(filtered,{activity:'LIMPIEZA',catalogRows:products,productLines:[{id:2,categoryId:1,name:'Concentrados'}]});
 assert.equal(message.split('\n').filter(line=>line.startsWith('•')).length,13);
 assert.match(message,/Agotados[\s\S]*Concentrados Jabón 1 · 0 L\n/);
 assert.match(message,/Por debajo del mínimo[\s\S]*Concentrados Jabón surtido · 1.25 L · mín. 3 L/);
 assert.doesNotMatch(message,/al mínimo|sin mínimo|sin conteo|negativo|otra línea|otra categoría|Cloro|Jarcería/);
 const chosen=filterInventoryProducts(products,{...filters,only:'empty',productId:'12'},inventoryAttention);
 assert.deepEqual(chosen.map(row=>row.productId),[12]);
 assert.equal(JSON.stringify(products),before);
});

test('lista de jarcería usa piezas equivalentes y distingue nombres repetidos con su presentación',()=>{
 const rows=[
  {productId:1,name:'Naturela Nocturna',hardwareCategoryId:4,unit:'pieza',quantity:'0',minimum:null},
  {productId:2,name:'Naturela Nocturna',hardwareCategoryId:4,unit:'pieza',quantity:'1',minimum:'3'},
  {productId:3,name:'Guante mediano',hardwareCategoryId:7,unit:'pieza',quantity:'0',minimum:'3'},
 ];
 const packs=[{productId:2,known:true,closedPackages:'4',looseUnits:'5',total:'37'}];
 const options={activity:'JARCERIA',catalogRows:rows,packs,
  categories:[{id:4,name:'Higiene'}],
  presentations:[{productId:1,name:'Paquete de 8 piezas',active:true},{productId:2,name:'Paquete de 12 piezas',active:true}]};
 const attention=row=>inventoryAttention(row,packs.find(pack=>pack.productId===row.productId));
 const filtered=filterInventoryProducts(rows,{activity:'JARCERIA',category:'4'},attention);
 const message=inventoryShoppingList(filtered,options);
 assert.match(message,/Jarcería/);
 assert.match(message,/Naturela Nocturna.*Paquete de 8 piezas.*0 pieza/);
 assert.doesNotMatch(message,/12 piezas|Guante|Limpieza/);
 assert.equal(inventoryShoppingList([rows[1]],options),'');
 assert.equal(attention(rows[1]).quantity,37);
 const special={productId:8,name:'Fibra a granel',unit:'gramo',quantity:'125',minimum:'200'};
 assert.match(inventoryShoppingList([special],{activity:'JARCERIA'}),/125 g · mín. 200 g/);
});
