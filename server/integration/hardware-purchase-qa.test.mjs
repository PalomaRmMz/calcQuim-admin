import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {loadOperationalConfig} from '../src/config/operational.mjs';
import {migrate} from '../src/db/migrate.mjs';
import {createDatasetService} from '../src/services/dataset.mjs';
import {hardwareCreationBundle} from '../../src/domain/hardwareCreation.mjs';
import {localDate} from '../../src/utils/salesUtils.js';

test('QA compra mixta de jarcería con alta, recepción, reintento y rollback',async()=>{
 const target='calcquim_activation_test';
 const config=await loadOperationalConfig(target);
 assert.equal(config.database.database,target);
 const pool=new pg.Pool(config.database);
 const schema='calcquim_test_hardware_'+randomUUID().replaceAll('-','').slice(0,16);
 let verified=false;
 try{
  assert.equal((await pool.query('SELECT current_database() AS db')).rows[0].db,target);
  verified=true;
  await migrate(pool,schema);
  const service=createDatasetService(pool,schema);
  const request=async(name,input)=>{
   const {revision,generation}=await service.read();
   return {name,args:[input],revision,generation,requestKey:randomUUID()};
  };
  const save=async(name,input)=>service.command(await request(name,input));
  await save('configurePurchaseInventory',{acknowledgeHistorical:true});
  await save('configurePackInventory',{approved:true});
  const supplier=await save('saveSupplier',{name:'Proveedor QA',businessActivity:'JARCERIA'});
  const supplierId=supplier.data.procurement.suppliers[0].id;
  const {result:{id:hardwareCategoryId}}=await save('saveHardwareCategory',{name:'Categoría QA'});
  const piece=(name)=>hardwareCreationBundle({name,hardwareCategoryId,saleMode:'piece',piecePrice:'12.50'});
  const existing=await save('saveHardwareProductBundle',{...piece('Cepillo QA'),initialInventory:{quantity:'10',unit:'pieza'}});
  const presentationId=existing.data.procurement.presentations[0].id;
  const draft=(id,bundle)=>({id,bundle});
  const items=[
   {draftId:'piece',presentationIndex:0,quantity:'2',totalAmount:'7.55'},
   {draftId:'both',presentationIndex:0,quantity:'2',cost:'18.50'},
   {draftId:'both',presentationIndex:1,quantity:'3',cost:'3.25'},
   {presentationId,quantity:'3',totalAmount:'20.01'}
  ];
  const date=localDate();
  const drafts=[
   draft('piece',{...piece('Fibra QA'),minimum:'2'}),
   draft('both',hardwareCreationBundle({name:'Esponja QA',hardwareCategoryId,saleMode:'both',packSize:'6',piecePrice:'9',packPrice:'49'}))
  ];
  const input={supplierId,date,items,drafts};
  const before=await service.read();
  const inventoryBefore=await service.inventory();
  await assert.rejects(save('saveHardwarePurchase',{...input,supplierId:''}),/proveedor/);
  await assert.rejects(save('saveHardwarePurchase',{...input,drafts:[draft('piece',piece('Cepillo QA')),drafts[1]]}),/Ya existe/);
  await assert.rejects(save('saveHardwarePurchase',{...input,items:items.map((row,index)=>index===1?{...row,quantity:'1.5'}:row)}),/entera/);
  // The last line is backdated against an existing count, after earlier lines have posted.
  await assert.rejects(save('saveHardwarePurchase',{...input,date:'2000-01-01'}),{code:'INVENTORY_BASELINE_REVIEW_REQUIRED'});
  assert.equal((await service.read()).revision,before.revision);
  assert.deepEqual((await service.read()).data,before.data);
  assert.deepEqual(await service.inventory(),inventoryBefore);
  assert.equal((await service.purchaseInventory()).rows.length,0);

  const command=await request('saveHardwarePurchase',input);
  const responses=await Promise.all([service.command(command),service.command(command)]);
  assert.equal(responses.filter(r=>r.replayed).length,1);
  const after=await service.read();
  const [purchase]=after.data.procurement.purchases;
  assert.equal(after.data.procurement.purchases.length,1);
  assert.equal(purchase.supplierId,supplierId);
  assert.deepEqual(purchase.items.map(item=>item.total),[7.55,37,9.75,20.01]);
  assert.deepEqual(purchase.items.map(item=>item.commercialPurchase.baseQuantity),[2,12,3,3]);
  assert.equal(after.data.procurement.presentations.find(p=>p.id===presentationId).price,12.5);
  const inventory=await service.inventory();
  assert.equal(inventory.movements.filter(m=>m.kind==='receipt'&&m.purchase_id===purchase.id).length,4);
  const stock=name=>inventory.products.find(p=>p.name===name);
  assert.equal(Number(stock('Cepillo QA').quantity),13);
  assert.equal(Number(stock('Fibra QA').quantity),2);
  assert.equal(Number(stock('Fibra QA').minimum),2);
  assert.equal(Number(stock('Esponja QA').quantity),15);
  const pack=inventory.packInventory.products.find(p=>p.productId===stock('Esponja QA').productId);
  assert.equal(pack.closedPackages,'2');
  assert.equal(pack.looseUnits,'3');
  assert.equal(after.data.products.find(p=>p.name==='Esponja QA').hardwareCategoryId,hardwareCategoryId);
  assert.deepEqual((await service.purchaseInventory()).rows.map(row=>row.state),Array(4).fill('applied'));

  const other=await save('saveSupplier',{name:'Otro proveedor QA',businessActivity:'JARCERIA'});
  const otherId=other.data.procurement.suppliers.find(s=>s.name==='Otro proveedor QA').id;
  const revisedItems=purchase.items.slice(1).map((item,index)=>({
   id:item.id,presentationId:item.commercialPurchase.presentationId,
   quantity:String(index===0?1:item.commercialPurchase.quantity),
   ...(index===0?{cost:'21'}:{totalAmount:String(item.total)})
  }));
  revisedItems.push({presentationId,quantity:'1',totalAmount:'8'});
  const edit={supplierId:otherId,date,items:revisedItems,inventoryCorrection:{confirmed:false,disposition:'adjust',reason:'Correccion QA'}};
  const invalid=await request('editHardwarePurchase',edit);
  invalid.args.push(purchase.id);
  await assert.rejects(service.command(invalid),/tratamiento físico/);
  assert.deepEqual(await service.inventory(),inventory);
  const revision=await request('editHardwarePurchase',{...edit,inventoryCorrection:{...edit.inventoryCorrection,confirmed:true}});
  revision.args.push(purchase.id);
  const edited=await service.command(revision);
  assert.equal((await service.command(revision)).replayed,true);
  const updated=edited.data.procurement.purchases[0];
  assert.equal(updated.id,purchase.id);
  assert.equal(updated.supplierId,otherId);
  assert.deepEqual(updated.items.slice(0,3).map(i=>i.id),purchase.items.slice(1).map(i=>i.id));
  assert.equal(updated.revisions.at(-1).total,purchase.total);
  assert.equal(updated.total,58.76);
  const updatedInventory=await service.inventory();
  const updatedStock=name=>Number(updatedInventory.products.find(p=>p.name===name).quantity);
  assert.equal(updatedStock('Cepillo QA'),14);
  assert.equal(updatedStock('Fibra QA'),0);
  assert.equal(updatedStock('Esponja QA'),9);
  assert.equal(updatedInventory.packInventory.products.find(p=>p.productId===stock('Esponja QA').productId).closedPackages,'1');
  assert.equal((await service.purchaseInventory()).rows.filter(r=>r.state==='applied').length,4);

  const editDraft={id:'new-pack',bundle:hardwareCreationBundle({name:'Paños nuevos QA',hardwareCategoryId,
   saleMode:'both',packSize:'4',piecePrice:'10',packPrice:'35',minimum:'3'})};
  const historyBefore=await service.inventory();
  const existingLines=updated.items.map(item=>({id:item.id,presentationId:item.commercialPurchase.presentationId,
   quantity:String(item.commercialPurchase.quantity),totalAmount:String(item.total)}));
  const newLines=[{draftId:editDraft.id,presentationIndex:0,quantity:'2',cost:'20'},
   {draftId:editDraft.id,presentationIndex:1,quantity:'1',totalAmount:'7.50'}];
  const withDraft={...edit,items:[...existingLines,...newLines],drafts:[editDraft],
   inventoryCorrection:{confirmed:true,disposition:'adjust',reason:'Agregar recepción omitida QA'}};
  const makeEdit=async input=>{
   const command=await request('editHardwarePurchase',input);
   command.args.push(purchase.id);
   return command;
  };
  const cancelled=await makeEdit(withDraft);
  assert.ok(cancelled);
  assert.ok(!(await service.read()).data.products.some(p=>p.name==='Paños nuevos QA'));
  await assert.rejects(service.command(await makeEdit({...withDraft,inventoryCorrection:{...withDraft.inventoryCorrection,confirmed:false}})),/tratamiento físico/);
  assert.deepEqual(await service.inventory(),historyBefore);
  assert.deepEqual((await service.read()).data,edited.data);
  const newEdit=await makeEdit(withDraft);
  const saved=await service.command(newEdit);
  assert.equal((await service.command(newEdit)).replayed,true);
  const newProduct=saved.data.products.find(p=>p.name==='Paños nuevos QA');
  const finalPurchase=saved.data.procurement.purchases.find(p=>p.id===purchase.id);
  assert.deepEqual(finalPurchase.items.slice(0,existingLines.length).map(i=>i.id),existingLines.map(i=>i.id));
  assert.deepEqual(finalPurchase.items.slice(-2).map(i=>i.total),[40,7.5]);
  assert.equal(finalPurchase.total,106.26);
  const finalInventory=await service.inventory();
  assert.deepEqual(finalInventory.movements.filter(m=>String(m.product_id)!==String(newProduct.id)),historyBefore.movements);
  assert.deepEqual(finalInventory.movements.filter(m=>m.purchase_id===purchase.id&&String(m.product_id)===String(newProduct.id)).map(m=>m.quantity),['1','8']);
  const newStock=finalInventory.products.find(p=>p.productId===newProduct.id);
  assert.equal(newStock.quantity,'9');
  assert.equal(newStock.minimum,'3');
  const newPack=finalInventory.packInventory.products.find(p=>p.productId===newProduct.id);
  assert.equal(newPack.closedPackages,'2');
  assert.equal(newPack.looseUnits,'1');
 }finally{
  try{if(verified)await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);}
  finally{await pool.end();}
 }
});
