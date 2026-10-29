import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { loadOperationalConfig } from '../src/config/operational.mjs';
import { migrate } from '../src/db/migrate.mjs';
import { createDatasetService } from '../src/services/dataset.mjs';
import { startServer } from '../src/runtime.mjs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPgTool,verifyPgArchive } from '../src/db/pgTools.mjs';
import { localDate } from '../../src/utils/salesUtils.js';
const config={...await loadOperationalConfig('calcquim_activation_test'),mode:'test'};
assert.equal(config.database.database,'calcquim_activation_test');
const pool=new pg.Pool(config.database),schema='calcquim_test_inv_'+randomUUID().replaceAll('-','');
let service,state,runtime;
async function command(name,...args){state=await service.command({name,args,revision:state.revision,generation:state.generation,requestKey:randomUUID()});return state;}
const input=(productId,quantity,extra={})=>({productId,quantity,unit:'litro',reason:'Motivo sintético confirmado',...extra});
const stock=async id=>(await service.inventory()).products.find(p=>p.productId===id);
const saleInput=(quantity,extra={})=>({date:localDate(),payment:'Efectivo',items:[{productId:1,price:10,unit:'litro',quantity}],...extra});

test('inventario íntegro en esquema nuevo y datos exclusivamente sintéticos',async t=>{
  try{
    const isolated=await pool.connect();try{await isolated.query('BEGIN');await migrate(pool,schema,'up',{client:isolated});await isolated.query('ROLLBACK');}finally{isolated.release();}
    assert.equal((await pool.query('SELECT to_regnamespace($1) AS schema',[schema])).rows[0].schema,null);
    await migrate(pool,schema);await migrate(pool,schema);await migrate(pool,schema,'down');assert.equal((await createDatasetService(pool,schema).inventory()).enabled,false);await migrate(pool,schema);
    service=createDatasetService(pool,schema);state=await service.read();
    await command('addCategory',{name:'Grupo sintético',active:true});await command('addProductLine',{name:'Línea sintética',categoryId:1,active:true});
    for(const name of ['Producto físico A sintético','Producto físico B sintético'])await command('addProduct',{name,unit:'litro',price:10,categoryId:1,lineId:1,active:true,available:true});
    await command('addCategory',{name:'Otro grupo sintético',active:true});await command('addProduct',{name:'Producto fuera del grupo sintético',unit:'litro',price:10,categoryId:2,lineId:null,active:true,available:true});
    await t.test('desconocido no equivale a cero; primera estimación ancla movimientos posteriores',async()=>{
      assert.equal((await stock(1)).quantity,null);assert.equal((await stock(1)).status,'unknown');
      await command('inventoryReplenishment',input(1,undefined,{minimum:'5',usualBatch:'20'}));assert.equal((await stock(1)).low,false);
      await assert.rejects(command('inventoryMovement',input(1,'2',{kind:'prepared'})),{code:'INITIAL_REQUIRED'});assert.equal((await stock(1)).quantity,null);
      await command('inventoryEstimate',input(1,'12'));assert.equal((await stock(1)).quantity,'12');assert.equal((await stock(1)).status,'estimated');
      await command('inventoryMovement',input(1,'3000',{kind:'prepared',unit:'mililitro'}));assert.equal((await stock(1)).quantity,'15');assert.equal((await stock(1)).status,'calculated');
      await command('inventoryEstimate',input(2,'0'));assert.equal((await stock(2)).quantity,'0');
    });
    await t.test('venta directa atómica, duplicados concurrentes y saldo negativo permitido',async()=>{
      const req={name:'createSale',args:[saleInput(2)],revision:state.revision,generation:state.generation,requestKey:randomUUID()};
      const [a,b]=await Promise.all([service.command(req),service.command(req)]);assert.equal(a.data.sales[0].id,b.data.sales[0].id);state=await service.read();assert.equal((await stock(1)).quantity,'13');
      await command('createSale',{...saleInput(1),items:[{productId:2,price:10,unit:'litro',quantity:1}]});assert.equal((await stock(2)).quantity,'-1');assert.equal((await stock(2)).negative,true);
    });
    await t.test('venta agrupada pendiente; desglose exacto y una sola aplicación',async()=>{
      await command('createSale',saleInput(1.5,{inventory:{1:{pendingGroup:true,scope:'line'}}}));const sale=structuredClone(state.data.sales[0]);
      const pending=(await service.inventory()).pending.find(p=>p.sale_id===sale.id);assert.equal(pending.state,'pending');assert.equal((await stock(1)).quantity,'13');
      await assert.rejects(command('inventoryAllocate',{pendingId:pending.id,reason:'Inválido sintético',allocations:[{productId:3,quantity:'1.5',unit:'litro'}]}));
      await assert.rejects(command('inventoryAllocate',{pendingId:pending.id,reason:'Total incompleto sintético',allocations:[{productId:1,quantity:'1',unit:'litro'}]}));
      state=await service.read();
      const args=[{pendingId:pending.id,reason:'Desglose sintético confirmado',allocations:[{productId:1,quantity:'1',unit:'litro'},{productId:2,quantity:'500',unit:'mililitro'}]}];
      const req={name:'inventoryAllocate',args,revision:state.revision,generation:state.generation,requestKey:randomUUID()};await service.command(req);await service.command(req);state=await service.read();
      assert.equal((await stock(1)).quantity,'12');assert.equal((await stock(2)).quantity,'-1.5');assert.deepEqual(state.data.sales.find(s=>s.id===sale.id),sale);
      await assert.rejects(command('inventoryAllocate',args[0]));
    });
    await t.test('importe monetario conserva pendiente hasta confirmar cantidad física',async()=>{
      await command('createSale',{...saleInput(2),items:[{productId:1,price:10,unit:'litro',entryMode:'amount',requestedAmount:20,quantity:2}]});const sale=state.data.sales[0];
      const pending=(await service.inventory()).pending.find(p=>p.sale_id===sale.id);assert.equal(pending.quantity,null);assert.equal((await stock(1)).quantity,'12');
      await assert.rejects(command('inventoryAllocate',{pendingId:pending.id,reason:'Sin cantidad sintética',allocations:[{productId:1,quantity:'2',unit:'litro'}]}));
      await command('inventoryAllocate',{pendingId:pending.id,confirmedQuantity:'2',confirmedUnit:'litro',reason:'Cantidad física sintética',allocations:[{productId:1,quantity:'2',unit:'litro'}]});assert.equal((await stock(1)).quantity,'10');
    });
    await t.test('mermas y correcciones inmutables; anulación con confirmación física',async()=>{
      await command('inventoryMovement',input(1,'-0.5',{kind:'waste'}));const id=state.result.movementId;assert.equal((await stock(1)).quantity,'9.5');
      await command('inventoryReverse',{movementId:id,reason:'Corrección sintética'});assert.equal((await stock(1)).quantity,'10');
      await assert.rejects(command('inventoryReverse',{movementId:id,reason:'No duplicar sintético'}));
      await assert.rejects(pool.query(`UPDATE ${schema}.inventory_movements SET reason='No permitido' WHERE id=$1`,[id]),{code:'23514'});
      await command('createSale',saleInput(1));const sale=state.data.sales[0];assert.equal((await stock(1)).quantity,'9');
      await assert.rejects(command('voidSale',sale.id),{code:'PHYSICAL_RETURN_REQUIRED'});state=await service.read();assert.ok(!state.data.sales[0].voidedAt);
      await command('voidSale',sale.id,{inventoryReturn:'returned',reason:'No salió físicamente, sintético'});assert.equal((await stock(1)).quantity,'10');
      await command('createSale',saleInput(1));await command('voidSale',state.data.sales[0].id,{inventoryReturn:'not_returned',reason:'Mercancía fuera, sintético'});assert.equal((await stock(1)).quantity,'9');
    });
    await t.test('devolución parcial explícita no se suma dos veces al anular',async()=>{
      await command('createSale',saleInput(2));const id=state.data.sales[0].id;
      await command('inventoryMovement',input(1,'0.5',{kind:'return',saleId:id}));assert.equal((await stock(1)).quantity,'7.5');
      await assert.rejects(command('voidSale',id,{inventoryReturn:'returned',reason:'Evitar retorno doble'}));
      await assert.rejects(command('inventoryMovement',input(1,'2',{kind:'return',saleId:id})));
      await command('voidSale',id,{inventoryReturn:'not_returned',reason:'Retorno parcial ya registrado'});assert.equal((await stock(1)).quantity,'7.5');
    });
    await t.test('compras no suman stock; recepción explícita y revisión de anulación',async()=>{
      await command('saveSupplier',{name:'Proveedor sintético',active:true});await command('savePurchasedItem',{name:'Base sintética',unit:'litro',sourcingType:'BASE',active:true});
      const p=state.data.procurement;await command('saveSupplySource',{purchasedItemId:p.purchasedItems[0].id,supplierId:p.suppliers[0].id,purchaseUnit:'litro',purchaseQuantity:1,active:true});
      await command('savePurchase',{supplierId:p.suppliers[0].id,date:'2026-01-02',items:[{supplyItemId:state.data.procurement.supplyItems[0].id,quantity:2,costMode:'unit',cost:30}]});const purchase=structuredClone(state.data.procurement.purchases[0]);
      assert.equal((await stock(1)).quantity,'7.5');await command('inventoryMovement',input(1,'5',{kind:'receipt',purchaseId:purchase.id,purchaseOrdinal:0}));assert.equal((await stock(1)).quantity,'12.5');
      assert.deepEqual(state.data.procurement.purchases[0],purchase);await command('voidPurchase',purchase.id);assert.equal((await stock(1)).quantity,'12.5');assert.equal((await service.inventory()).purchaseReviews.length,1);
      await command('inventoryReviewPurchase',{purchaseId:purchase.id,reason:'Revisión física sintética'});assert.equal((await service.inventory()).purchaseReviews.length,0);
    });
    await t.test('HTTP, reinicio, fallos de conexión y protección de unidad/historia',async()=>{
      runtime=await startServer({...config,port:0,schema});let base=`http://127.0.0.1:${runtime.server.address().port}`;
      assert.equal((await fetch(base+'/api/v1/inventory')).status,200);
      const key=randomUUID(),headers={'Content-Type':'application/json','X-CalcQuim-Mode':'synthetic','If-Match':String(state.revision),'X-Dataset-Generation':state.generation,'Idempotency-Key':key},body=JSON.stringify({args:[input(3,'0')]});
      const saved=await fetch(base+'/api/v1/commands/inventoryEstimate',{method:'POST',headers,body});assert.equal(saved.status,200);state=await saved.json();
      assert.equal((await fetch(base+'/api/v1/commands/inventoryEstimate',{method:'POST',headers,body})).status,200);assert.equal((await stock(3)).quantity,'0');
      await assert.rejects(command('inventoryReverse',{movementId:'malformed',reason:'UUID inválido sintético'}),{code:'INVENTORY_VALIDATION'});
      const before=await service.inventory();await runtime.close();runtime=null;
      runtime=await startServer({...config,port:0,schema});base=`http://127.0.0.1:${runtime.server.address().port}`;assert.deepEqual(await(await fetch(base+'/api/v1/inventory')).json(),JSON.parse(JSON.stringify(before)));
      await assert.rejects(command('updateProduct',1,{...state.data.products[0],unit:'kg'}));await assert.rejects(command('deleteProduct',1));
      const broken=createDatasetService({connect:async()=>{throw new Error('No disponible sintético');}},schema);await assert.rejects(broken.inventory(),{code:'DATABASE_UNAVAILABLE'});
      await assert.rejects(migrate(pool,schema,'down'));assert.equal((await stock(1)).quantity,'12.5');
    });
    await t.test('anular pendiente no repone cantidades nunca descontadas; agrupada resuelta revierte una sola vez',async()=>{
      await command('createSale',saleInput(1,{inventory:{1:{pendingGroup:true,scope:'category'}}}));let sale=state.data.sales[0];
      await command('voidSale',sale.id,{inventoryReturn:'returned',reason:'Anulación pendiente sintética'});assert.equal((await stock(1)).quantity,'12.5');assert.equal((await service.inventory()).pending.find(p=>p.sale_id===sale.id).state,'cancelled');
      await command('createSale',saleInput(1,{inventory:{1:{pendingGroup:true,scope:'line'}}}));sale=state.data.sales[0];const pending=(await service.inventory()).pending.find(p=>p.sale_id===sale.id);
      await command('inventoryAllocate',{pendingId:pending.id,reason:'Desglose para reversa sintética',allocations:[{productId:1,quantity:'0.5',unit:'litro'},{productId:2,quantity:'0.5',unit:'litro'}]});
      await command('voidSale',sale.id,{inventoryReturn:'returned',reason:'Retorno completo sintético'});assert.equal((await stock(1)).quantity,'12.5');assert.equal((await stock(2)).quantity,'-1.5');
      await assert.rejects(command('voidSale',sale.id,{inventoryReturn:'returned',reason:'No duplicar retorno'}));
    });
    await t.test('operaciones anteriores a una estimación exigen confirmar si ya estaban incluidas',async()=>{
      await command('createSale',saleInput(1,{inventory:{1:{pendingGroup:true,scope:'line'}}}));let sale=state.data.sales[0];let pending=(await service.inventory()).pending.find(p=>p.sale_id===sale.id);
      await command('inventoryEstimate',input(1,'12'));
      const allocation={pendingId:pending.id,reason:'Desglose anterior a conteo sintético',allocations:[{productId:1,quantity:'1',unit:'litro'}]};
      await assert.rejects(command('inventoryAllocate',allocation),{code:'INVENTORY_BASELINE_REVIEW_REQUIRED'});
      await command('inventoryAllocate',{...allocation,baselineTreatment:'already_included'});assert.equal((await stock(1)).quantity,'12');
      await assert.rejects(command('voidSale',sale.id,{inventoryReturn:'returned',reason:'Retorno anterior sintético'}),{code:'INVENTORY_BASELINE_REVIEW_REQUIRED'});
      await command('voidSale',sale.id,{inventoryReturn:'returned',reason:'Retorno ya incluido sintético',baselineTreatment:'already_included'});assert.equal((await stock(1)).quantity,'12');
      await command('createSale',saleInput(1,{inventory:{1:{pendingGroup:true,scope:'line'}}}));sale=state.data.sales[0];pending=(await service.inventory()).pending.find(p=>p.sale_id===sale.id);
      await command('inventoryEstimate',input(1,'12'));
      await command('inventoryAllocate',{pendingId:pending.id,reason:'Salida no incluida sintética',baselineTreatment:'apply_now',allocations:[{productId:1,quantity:'1',unit:'litro'}]});assert.equal((await stock(1)).quantity,'11');
      await command('voidSale',sale.id,{inventoryReturn:'returned',reason:'Retorno físico posterior sintético',baselineTreatment:'apply_now'});assert.equal((await stock(1)).quantity,'12');
      const anchor=(await stock(1)).anchorId;
      await command('inventoryMovement',input(1,'1',{kind:'adjustment',reference:{includedInAnchorId:anchor}}));assert.equal((await stock(1)).quantity,'13');
      await assert.rejects(command('inventoryMovement',input(1,'1',{kind:'adjustment',occurredAt:'2026-01-01T12:00:00Z'})),{code:'INVENTORY_BASELINE_REVIEW_REQUIRED'});
      await command('inventoryMovement',input(1,'1',{kind:'adjustment',occurredAt:'2026-01-01T12:00:00Z',baselineTreatment:'already_included'}));assert.equal((await stock(1)).quantity,'13');
    });
    await t.test('motivos codificados, Otro y observaciones persisten sin reescribir historial libre',async()=>{
      const previous=(await pool.query(`SELECT id,reason,reference FROM ${schema}.inventory_movements ORDER BY seq`)).rows;
      await command('inventoryEstimate',{productId:3,quantity:'7',unit:'litro',reasonCode:'physical_count',observations:'Observación sintética separada'});
      let m=(await service.inventory()).movements.find(m=>m.id===state.result.movementId);assert.equal(m.reason,'Conteo físico');assert.equal(m.reference.reasonCode,'physical_count');assert.equal(m.reference.observations,'Observación sintética separada');
      await assert.rejects(command('inventoryMovement',{productId:3,kind:'prepared',quantity:'1',unit:'litro',reasonCode:'physical_count'}),{code:'INVENTORY_REASON_INVALID'});
      await assert.rejects(command('inventoryMovement',{productId:3,kind:'prepared',quantity:'1',unit:'litro',reasonCode:'other',observations:'No es explicación'}),{code:'INVENTORY_REASON_INVALID'});
      const request={name:'inventoryMovement',args:[{productId:3,kind:'prepared',quantity:'1',unit:'litro',reasonCode:'other',reasonExplanation:'Caso excepcional sintético',observations:'Nota sintética'}],revision:state.revision,generation:state.generation,requestKey:randomUUID()};
      const first=await service.command(request);await service.command(request);state=await service.read();m=(await service.inventory()).movements.find(m=>m.id===first.result.movementId);
      assert.equal(m.reference.reasonCode,'other');assert.equal(m.reference.reasonExplanation,'Caso excepcional sintético');assert.equal((await stock(3)).quantity,'8');
      await assert.rejects(command('inventoryMovement',{productId:3,kind:'adjustment',quantity:'-2',unit:'litro',reference:{entryType:'positive_adjustment'},reasonCode:'positive_adjustment'}));
      await command('inventoryMovement',{productId:3,kind:'adjustment',quantity:'2',unit:'litro',reference:{entryType:'positive_adjustment'},reasonCode:'positive_adjustment'});assert.equal((await stock(3)).quantity,'10');
      await command('inventoryMovement',{productId:3,kind:'adjustment',quantity:'-2',unit:'litro',reasonCode:'count_correction'});assert.equal((await stock(3)).quantity,'8');
      assert.deepEqual((await pool.query(`SELECT id,reason,reference FROM ${schema}.inventory_movements WHERE id=ANY($1::uuid[]) ORDER BY seq`,[previous.map(m=>m.id)])).rows,previous);
    });
    await t.test('inicial corregible sin movimientos ficticios, conteo independiente e idempotencia',async()=>{
      await command('addProduct',{name:'Inicial independiente sintético',unit:'litro',price:10,categoryId:1,lineId:1,active:true,available:true});
      const p=4;assert.equal((await stock(p)).initialQuantity,null);
      await command('inventoryInitial',input(p,'12',{reasonCode:'initial_inventory'}));const initialId=(await stock(p)).initialMovementId;
      const correct={productId:p,quantity:'8',unit:'litro',initialMovementId:initialId,previousQuantity:'12',reasonCode:'capture_error',observations:'Solo prueba aislada'};
      const request={name:'inventoryCorrectInitial',args:[correct],revision:state.revision,generation:state.generation,requestKey:randomUUID()};
      await Promise.all([service.command(request),service.command(request)]);state=await service.read();
      assert.equal((await stock(p)).quantity,'8');assert.equal((await stock(p)).initialOriginalQuantity,'12');assert.equal((await stock(p)).initialQuantity,'8');
      assert.equal((await service.inventory()).movements.filter(m=>m.product_id===String(p)).length,1);
      await assert.rejects(command('inventoryInitial',input(p,'99',{reasonCode:'initial_inventory'})),{code:'INITIAL_ALREADY_EXISTS'});
      await command('inventoryMovement',input(p,'20',{kind:'prepared',reasonCode:'prepared_product'}));
      await command('inventoryMovement',input(p,'-1.5',{kind:'adjustment',reference:{entryType:'justified_outflow'},reasonCode:'internal_use'}));assert.equal((await stock(p)).quantity,'26.5');
      const originalRows=(await service.inventory()).movements.filter(m=>m.product_id===String(p));
      await command('inventoryCorrectInitial',{...correct,previousQuantity:'8',quantity:'9'});assert.equal((await stock(p)).quantity,'27.5');
      assert.deepEqual((await service.inventory()).movements.filter(m=>m.product_id===String(p)),originalRows);
      await assert.rejects(command('inventoryCorrectInitial',correct),{code:'INITIAL_CORRECTION_STALE'});
      const corrections=(await service.inventory()).changes.filter(c=>c.action==='initial_correction'&&c.reference.productId===p);
      assert.equal(corrections.length,2);assert.equal(corrections[1].reference.difference,'-4');assert.equal(corrections[0].reference.nextCurrentQuantity,'27.5');
      await command('inventoryCount',input(p,'25',{reasonCode:'physical_count'}));assert.equal((await stock(p)).quantity,'25');assert.equal((await stock(p)).initialQuantity,'9');
      const afterCount=await service.inventory();await assert.rejects(command('inventoryCorrectInitial',{...correct,previousQuantity:'9',quantity:'10'}),{code:'INITIAL_CORRECTION_REVIEW_REQUIRED'});assert.deepEqual(await service.inventory(),afterCount);
      await command('inventoryMovement',input(p,'2',{kind:'prepared',reasonCode:'prepared_product'}));assert.equal((await stock(p)).quantity,'27');
      await runtime.close();runtime=await startServer({...config,port:0,schema,persistenceEnabled:true});
      const response=await fetch(`http://127.0.0.1:${runtime.server.address().port}/api/v1/inventory`);const restored=(await response.json()).products.find(p=>p.productId===4);assert.equal(restored.initialQuantity,'9');assert.equal(restored.quantity,'27');
      await command('addProduct',{name:'Inicial legado sintético',unit:'litro',price:10,categoryId:1,lineId:1,active:true,available:true});
      await command('inventoryEstimate',input(5,'12'));const legacy=(await stock(5));
      await command('inventoryCorrectInitial',{productId:5,quantity:'8',unit:'litro',initialMovementId:legacy.initialMovementId,previousQuantity:'12',reasonCode:'capture_error'});
      assert.equal((await stock(5)).quantity,'8');assert.equal((await service.inventory()).movements.find(m=>m.id===legacy.initialMovementId).quantity,'12');
    });
    await t.test('dump y restauración incluyen historial, pendientes, reversas y configuración íntegros',async()=>{
      await runtime.close();runtime=null;
      const before=await service.inventory(),snapshot=await service.read();
      const directory=await mkdtemp(join(tmpdir(),'calcquim-inventory-synthetic-')),dump=join(directory,'synthetic.dump');
      runPgTool('pg_dump',['--schema',schema,'--no-owner','--no-acl','-Fc','-f',dump],config.database);verifyPgArchive(dump);
      assert.match(schema,/^calcquim_test_inv_[a-f0-9]{32}$/);await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
      runPgTool('pg_restore',['--no-owner','--no-acl','--exit-on-error','--single-transaction',dump],config.database);
      assert.deepEqual(await service.inventory(),before);assert.deepEqual(await service.read(),snapshot);
    });
  }finally{await runtime?.close();assert.match(schema,/^calcquim_test_inv_[a-f0-9]{32}$/);await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await pool.end();}
});
