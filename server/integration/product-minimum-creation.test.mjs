import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {loadOperationalConfig} from '../src/config/operational.mjs';
import {migrate} from '../src/db/migrate.mjs';
import {createDatasetService} from '../src/services/dataset.mjs';
import {installHardwareCreation} from '../src/mobile/hardware-creation.mjs';
import {hardwareCreationBundle} from '../../src/domain/hardwareCreation.mjs';

test('las altas web y móvil conservan mínimos y composición en PostgreSQL QA',async()=>{
 const target='calcquim_activation_test';
 const config=await loadOperationalConfig(target);
 assert.equal(config.database.database,target);
 const pool=new pg.Pool(config.database);
 const schema='calcquim_test_min_'+randomUUID().replaceAll('-','').slice(0,16);
 let verified=false;
 try{
  assert.equal((await pool.query('SELECT current_database() AS db')).rows[0].db,target);
  verified=true;
  await migrate(pool,schema);
  const service=createDatasetService(pool,schema);
  const version=async()=>{
   const {revision,generation}=await service.read();
   return {revision,generation};
  };
  const command=async(name,input)=>service.command({name,args:[input],...await version(),requestKey:randomUUID()});
  const stock=async id=>(await service.inventory()).products.find(row=>String(row.productId)===String(id));
  await command('configurePackInventory',{approved:true});
  await command('addProduct',{name:'Limpieza mínima QA',unit:'litro',price:20,minimum:'1.5'});
  const cleaner=(await service.read()).data.products.find(p=>p.name==='Limpieza mínima QA');
  assert.equal(Number((await stock(cleaner.id)).minimum),1.5);
  assert.equal((await stock(cleaner.id)).quantity,null);
  const piece=hardwareCreationBundle({name:'Pieza mínima QA',saleMode:'piece',piecePrice:'10',minimum:'',initialEnabled:true,quantity:'2'});
  const pieceId=(await command('saveHardwareProductBundle',piece)).result.id;
  assert.equal((await stock(pieceId)).minimum,null);
  assert.equal(Number((await stock(pieceId)).initialQuantity),2);
  const pack=hardwareCreationBundle({name:'Paquete mínimo QA',saleMode:'pack',packSize:'8',pricePending:true,minimum:'0',initialEnabled:true,closedPackages:'2',openPackages:'1',openPackagePieces:'3'});
  const packId=(await command('saveHardwareProductBundle',pack)).result.id;
  assert.equal(Number((await stock(packId)).minimum),0);
  assert.equal(Number((await stock(packId)).initialQuantity),19);
  const stored=await service.read();
  assert.equal(stored.data.products.find(p=>p.id===packId).available,false);
  assert.deepEqual(stored.data.procurement.presentations.filter(p=>p.productId===packId).map(p=>[p.unit,p.price]),[['paquete',0]]);

  const both=hardwareCreationBundle({name:'Naturela Nocturna QA',saleMode:'both',packSize:'8',packPrice:'30,50',piecePrice:'5',minimum:'3',initialEnabled:true,closedPackages:'4',looseUnits:'5',openPackages:'0'});
  let create,payload;
  installHardwareCreation({get(){},post(_path,handler){create=handler;}},service,{principal:{id:'qa',name:'QA',permissions:['hardware:create']}});
  await create({get:()=>randomUUID(),body:{confirmed:true,bundle:both,...await version()}},{json(value){payload=value;}});
  const bothId=payload.productId,view=await service.inventory();
  const physical=view.packInventory.products.find(row=>row.productId===bothId);
  assert.deepEqual([physical.closedPackages,physical.looseUnits,physical.total],['4','5','37']);
  assert.equal(Number((await stock(bothId)).minimum),3);
  assert.equal((await service.read()).data.products.find(p=>p.id===bothId).autoOpenPackages,true);
  await command('inventoryReplenishment',{productId:bothId,unit:'pieza',minimum:'6',reasonCode:'replenishment_configuration'});
  assert.equal(Number((await stock(bothId)).minimum),6);
  assert.equal(Number((await stock(bothId)).initialQuantity),37);
  await assert.rejects(command('saveHardwareProductBundle',{...both,product:{...both.product,name:'Mínimo inválido QA'},minimum:'1.5'}));
  assert.ok(!(await service.read()).data.products.some(p=>p.name==='Mínimo inválido QA'));
 }finally{
  try{if(verified)await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);}
  finally{await pool.end();}
 }
});
