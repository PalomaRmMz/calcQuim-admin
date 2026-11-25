import {configureSupplyMinimumDefaults} from '../src/services/supplyInventory.mjs';
import {supplyInventoryHistory,supplyInventoryRows} from '../../src/domain/supplyInventoryView.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {loadOperationalConfig} from '../src/config/operational.mjs';
import {migrate} from '../src/db/migrate.mjs';
import {createDatasetService} from '../src/services/dataset.mjs';
import {writeDataset} from '../src/repositories/dataset.mjs';
import {catalogChoices,PRICING_VERSION} from '../src/mobile/catalog.mjs';
import {makeLine,requestBody} from '../src/mobile/sale.mjs';
import {localDate} from '../../src/utils/salesUtils.js';
import {pinolBlancoId,supplyBottleId} from '../../src/domain/supplyInventory.mjs';

test('Pinol Blanco and sealed supply formats share stock in isolated PostgreSQL QA',async()=>{
  const target='calcquim_activation_test';
  const pool=new pg.Pool((await loadOperationalConfig(target)).database);
  const schema='calcquim_test_supply_'+randomUUID().slice(0,8);
  let isolated=false;
  try{
    assert.equal((await pool.query('SELECT current_database() AS db')).rows[0].db,target);
    isolated=true;
    await migrate(pool,schema);
    await migrate(pool,schema,'down');
    const service=createDatasetService(pool,schema);
    const request=async(name,...args)=>{
      const {revision,generation}=await service.read();
      return {name,args,revision,generation,requestKey:randomUUID()};
    };
    const run=async(...args)=>service.command(await request(...args));
    await run('addProduct',{name:'Blanco QA',unit:'litro',price:20,active:true});
    await run('addProduct',{name:'Ajeno QA',unit:'litro',price:10,active:true});
    await run('savePurchasedItem',{name:'Base P/Pinol Blanco',unit:'litro',sourcingType:'BASE',active:true});
    const fixture=await service.read();
    fixture.data.products[0].id=44;
    fixture.data.procurement.purchasedItems[0].id=pinolBlancoId;
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`);
      await client.query("UPDATE products SET id='44' WHERE id='1'");
      await client.query('UPDATE purchased_items SET id=$1',[pinolBlancoId]);
      await writeDataset(client,fixture.data,fixture.counters);
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    await run('saveSupplier',{name:'Proveedor QA',businessActivity:'LIMPIEZA'});
    const supplierId=(await service.read()).data.procurement.suppliers[0].id;
    await run('saveSupplyConversion',{purchasedItemId:pinolBlancoId,outputProductId:44,active:true,yield:{inputQuantity:1,inputUnit:'litro',outputQuantity:20,outputUnit:'litro'}});
    await run('saveSupplySource',{purchasedItemId:pinolBlancoId,supplierId,purchaseUnit:'litro',purchaseQuantity:1,presentation:'Botella',active:true});
    const source=(await service.read()).data.procurement.supplyItems[0];
    const buy=quantity=>({supplierId,activity:'LIMPIEZA',date:localDate(),items:[{supplyItemId:source.id,quantity,costMode:'total',cost:200}]});
    await run('savePurchase',buy('2'));
    const historical=(await service.read()).data.procurement.purchases[0];
    await run('configurePurchaseInventory',{acknowledgeHistorical:true});
    await run('inventoryInitial',{productId:44,quantity:'0',unit:'litro'});
    await run('inventoryInitial',{productId:2,quantity:'8',unit:'litro'});
    await run('enablePinolBlancoInventory',{confirmed:true,reason:'Conteo inicial autorizado QA'});
    const stock=async()=>(await service.inventory()).supplies.find(s=>s.purchasedItemId===pinolBlancoId);
    const expectStock=async count=>{
      const view=await service.inventory();
      assert.equal(view.supplies.length,1);
      assert.equal(view.supplies[0].closed,count);
      assert.equal(view.supplies[0].totalLiters,count);
      assert.ok(!view.products.some(p=>String(p.productId)===view.supplies[0].productId));
    };
    await expectStock('0');
    const projected=async()=>{
      const {data}=await service.read();
      const view=await service.inventory();
      const rows=supplyInventoryRows(data,view);
      assert.equal(rows.length,1);
      return {row:rows[0],history:supplyInventoryHistory(rows[0],view,data)};
    };
    const initial=await projected();
    assert.equal(initial.row.state,'empty');
    assert.equal(initial.row.minimum,null);
    assert.equal(initial.history[0].type,'Conteo inicial');
    await run('inventoryReplenishment',{productId:initial.row.stock.productId,minimum:'2',unit:'litro',reason:'Minimo QA'});
    assert.equal((await projected()).row.minimum,2);
    await expectStock('0');

    const sale=async(value)=>{
      const state=await service.read();
      const choice=catalogChoices(state.data).find(c=>c.refId===supplyBottleId(pinolBlancoId));
      assert.equal(choice.tariffs[0].price,130);
      return requestBody({payment:'Efectivo',lines:[makeLine(choice,choice.tariffs[0],'quantity',value,randomUUID())]},{...state,pricingVersion:PRICING_VERSION});
    };
    await assert.rejects(run('createCommercialSale',await sale('1')),/insuficiente/);
    await assert.rejects(sale('0.5'),/entera/);
    const fractionalSale=await sale('1');
    fractionalSale.items[0].value='0.5';
    await assert.rejects(run('createCommercialSale',fractionalSale),/entera/);
    await expectStock('0');
    const receipt=await request('savePurchase',buy('3'));
    await Promise.all([service.command(receipt),service.command(receipt)]);
    await expectStock('3');
    assert.equal((await projected()).row.state,'sufficient');
    const sold=await run('createCommercialSale',await sale('1'));
    const soldId=sold.data.sales[0].id;
    assert.equal(sold.data.sales[0].total,130);
    assert.ok((await service.inventory()).movements.some(m=>m.sale_id===soldId&&m.quantity==='-1'&&m.product_id===(String(sold.data.sales[0].items[0].productId))));
    await expectStock('2');
    assert.equal((await projected()).row.state,'low');
    const prep={purchasedItemId:pinolBlancoId,inputLiters:'1',quantity:'19.5',unit:'litro',reason:'Elaboracion QA'};
    await assert.rejects(run('prepareFromSupplyInventory',{...prep,inputLiters:'0.4'}),/enteras/);
    await assert.rejects(run('countSupplyInventory',{...prep,closed:'2',expectedVersion:'1'}),/cambio/);
    await assert.rejects(run('countSupplyInventory',{...prep,closed:'1.5',expectedVersion:(await stock()).version}),/enteras/);
    await run('countSupplyInventory',{...prep,closed:'2',expectedVersion:(await stock()).version});
    const row=(await service.purchaseInventory()).rows.find(r=>!r.historical&&r.state==='prepare');
    assert.ok(row);
    const prepareRequest=await request('prepareFromSupplyInventory',{...prep,purchaseId:row.purchase_id,itemId:row.item_id});
    await service.command(prepareRequest);
    assert.equal((await service.command(prepareRequest)).replayed,true);
    const applied=(await service.purchaseInventory()).rows.find(r=>r.item_id===row.item_id);
    assert.equal(applied.state,'applied');
    assert.equal(applied.consumedLiters,'1');
    const logged=(await projected()).history;
    assert.ok(['Compra','Venta directa','Conteo físico','Consumo por elaboración'].every(type=>logged.some(event=>event.type===type)));

    await expectStock('1');
    await run('correctPurchasePreparation',{purchaseId:row.purchase_id,itemId:row.item_id,quantity:'19.6',unit:'litro',reason:'QA confirma cantidad final corregida'});
    await expectStock('1');
    const snapshot=await service.inventory();
    assert.equal(snapshot.products.find(p=>p.productId===44).quantity,'19.6');
    assert.equal(snapshot.products.find(p=>p.productId===2).quantity,'8');
    await assert.rejects(run('prepareFromSupplyInventory',{...prep,inputLiters:'5'}),/insuficiente/);
    await assert.rejects(run('savePurchase',buy('1.5')),/enteras/);
    assert.deepEqual(await service.inventory(),snapshot);
    await assert.rejects(run('voidSale',soldId,{inventoryReturn:'returned',baselineTreatment:'apply_now',reason:'QA sin confirmar envase'}),/cerradas/);
    await assert.rejects(run('returnSupplyInventory',{...prep,saleId:soldId,quantity:'0.5',disposition:'sealed'}),/enteras/);
    await run('returnSupplyInventory',{...prep,saleId:soldId,quantity:'1',disposition:'sealed'});
    await expectStock('2');
    await assert.rejects(run('returnSupplyInventory',{...prep,saleId:soldId,quantity:'1',disposition:'sealed'}),/excede/);
    const soldAgain=await run('createCommercialSale',await sale('1'));
    const secondId=soldAgain.data.sales.find(s=>s.id!==soldId).id;
    await run('voidSale',secondId,{inventoryReturn:'returned',packReturnDisposition:'sealed',reason:'Botella cerrada confirmada en QA'});
    await expectStock('2');
    const correction=await run('createCommercialSale',await sale('1'));
    const correctedId=correction.result.receipt.id;
    const beforeCorrection=await service.inventory();
    await assert.rejects(run('correctMobileSale',correctedId,{values:['3'],physicalTreatment:'apply_difference',packReturnDisposition:'sealed',reason:'QA insuficiente'}),/insuficiente/);
    assert.deepEqual(await service.inventory(),beforeCorrection);
    await run('voidSale',correctedId,{inventoryReturn:'returned',packReturnDisposition:'sealed',reason:'QA retorna botella'});
    const fresh=await run('savePurchase',buy('3'));
    const purchase=fresh.data.procurement.purchases[0];
    await expectStock('5');
    await assert.rejects(run('voidPurchase',purchase.id,{confirmed:false,disposition:'returned',reason:'QA sin confirmacion'}),/Confirma/);
    await run('voidPurchase',purchase.id,{confirmed:true,disposition:'returned',reason:'QA devuelve las botellas recibidas'});
    await expectStock('2');
    await run('savePurchase',buy('2'));
    const oldSale=await run('createCommercialSale',await sale('2'));
    await run('correctMobileSale',oldSale.result.receipt.id,{values:['1'],physicalTreatment:'apply_difference',packReturnDisposition:'sealed',reason:'QA correccion de botellas cerradas'});
    await expectStock('3');
    assert.equal((await service.read()).data.sales.find(s=>s.id===oldSale.result.receipt.id).items[0].quantity,1);
    assert.deepEqual((await service.read()).data.procurement.purchases.find(p=>p.id===historical.id),historical);
    assert.equal((await service.inventory()).movements.filter(m=>m.purchase_id===historical.id).length,0);
    const originalPinol=await stock();
    assert.equal((await service.inventory()).supplyActivationEnabled,false);
    await migrate(pool,schema);
    assert.equal((await service.inventory()).supplyActivationEnabled,true);
    assert.deepEqual(await stock(),originalPinol);
    const configState=await service.read();
    const configClient=await pool.connect();
    try{
      await configClient.query('BEGIN');
      await configClient.query('SET LOCAL search_path TO '+schema+', pg_catalog');
      assert.deepEqual(await configureSupplyMinimumDefaults(configClient,configState.data),{configured:1,physicalAccounts:1,defaultPackages:'2'});
      await configClient.query('COMMIT');
    }catch(error){await configClient.query('ROLLBACK');throw error;}
    finally{configClient.release();}
    assert.deepEqual(await stock(),originalPinol);
    for(const [label,liters,initialCount,type] of [
      ['Botella','1',0,'BASE'],['Bolsa','2.5',2,'BASE'],['Garrafa','5',1,'HYDRONEO']
    ]){
      const created=await run('addProduct',{name:'Terminado QA '+label,unit:'litro',price:20,active:true});
      const outputProductId=created.data.products.find(p=>p.name==='Terminado QA '+label).id;
      const article=await run('savePurchasedItem',{name:'Insumo QA '+label,unit:'litro',sourcingType:type,active:true});
      const purchasedItemId=article.data.procurement.purchasedItems.find(p=>p.name==='Insumo QA '+label).id;
      await run('saveSupplyConversion',{purchasedItemId,outputProductId,active:true,yield:{inputQuantity:Number(liters),inputUnit:'litro',outputQuantity:20,outputUnit:'litro'}});
      const sourcing=await run('saveSupplySource',{purchasedItemId,supplierId,purchaseUnit:'litro',purchaseQuantity:Number(liters),presentation:label,active:true});
      const sourceId=sourcing.data.procurement.supplyItems.find(s=>s.purchasedItemId===purchasedItemId).id;
      const packageBuy=quantity=>({supplierId,activity:'LIMPIEZA',date:localDate(),items:[{supplyItemId:sourceId,quantity,costMode:'total',cost:200}]});
      const pendingState=await service.read();
      const pendingRow=supplyInventoryRows(pendingState.data,await service.inventory()).find(r=>r.id===purchasedItemId);
      assert.equal(pendingRow.state,'unknown');
      assert.equal(pendingRow.minimum,2);
      assert.equal(pendingRow.stock,undefined);
      if(label==='Garrafa'){
        await run('configureSupplyMinimum',{purchasedItemId,minimum:'3'});
        await assert.rejects(run('configureSupplyMinimum',{purchasedItemId,minimum:'1.5'}),/enteras/);
      }
      const priorPurchase=(await run('savePurchase',packageBuy(liters))).data.procurement.purchases[0];
      const priorInventory=await service.inventory();
      const activation={confirmed:true,purchasedItemId,sourceId,outputProductId,closed:String(initialCount),reason:'Conteo fisico inicial QA'};
      const getStock=async()=>(await service.inventory()).supplies.find(s=>s.purchasedItemId===purchasedItemId);
      await assert.rejects(run('enableSupplyInventory',{...activation,closed:''}),/cantidad/);
      await assert.rejects(run('enableSupplyInventory',{...activation,closed:'0.5'}),/enteras/);
      assert.equal(await getStock(),undefined);
      const enable=await request('enableSupplyInventory',activation);
      const [first,second]=await Promise.all([service.command(enable),service.command(enable)]);
      assert.ok(first.replayed!==second.replayed);
      assert.equal(first.result.productId,second.result.productId);
      await assert.rejects(run('enableSupplyInventory',activation),/sin cuenta/);
      const opening=await getStock();
      assert.deepEqual([opening.closed,opening.bottleLiters,opening.packageLabel],[String(initialCount),liters,label]);
      const afterEnable=await service.inventory();
      const expectedMinimum=label==='Garrafa'?3:2;
      const minimum=(await pool.query('SELECT minimum FROM "'+schema+'".inventory_replenishment WHERE product_id=$1',[opening.productId])).rows[0].minimum;
      assert.equal(Number(minimum),expectedMinimum*Number(liters));
      const minimumRow=supplyInventoryRows((await service.read()).data,afterEnable).find(r=>r.id===purchasedItemId);
      assert.equal(minimumRow.minimum,expectedMinimum);
      assert.equal(minimumRow.state,initialCount===0?'empty':'low');
      await run('configureSupplyMinimum',{purchasedItemId,minimum:'0'});
      assert.deepEqual(await getStock(),opening);
      assert.equal(supplyInventoryRows((await service.read()).data,await service.inventory()).find(r=>r.id===purchasedItemId).minimum,0);

      assert.deepEqual(afterEnable.movements,priorInventory.movements);
      assert.equal(afterEnable.changes.filter(e=>e.action==='supply_inventory_enabled'&&e.reference.purchasedItemId===purchasedItemId).length,1);
      assert.deepEqual((await service.read()).data.procurement.purchases.find(p=>p.id===priorPurchase.id),priorPurchase);
      assert.equal(catalogChoices((await service.read()).data).some(choice=>choice.tariffs.some(t=>t.productIds.includes(first.result.productId))),false);
      await assert.rejects(run('savePurchase',packageBuy(Number(liters)/2)),/envases completos/);
      const intake=await request('savePurchase',packageBuy(Number(liters)*2));
      await service.command(intake);
      assert.ok((await service.command(intake)).replayed);
      assert.equal((await getStock()).closed,String(initialCount+2));
      const preparation={purchasedItemId,inputPackages:'2',quantity:'39',unit:'litro',reason:'Elaboracion QA'};
      await assert.rejects(run('prepareFromSupplyInventory',{...preparation,inputPackages:String(initialCount+3)}),/insuficiente/);
      await run('inventoryInitial',{productId:outputProductId,quantity:'0',unit:'litro'});
      const prepared=await run('prepareFromSupplyInventory',preparation);
      assert.equal((await getStock()).closed,String(initialCount));
      const produced=await service.inventory();
      assert.equal(produced.movements.find(m=>m.id===prepared.result.consumptionId).quantity,String(-Number(liters)*2));
      assert.equal(produced.products.find(p=>p.productId===outputProductId).quantity,'39');
      await run('countSupplyInventory',{purchasedItemId,closed:'4',expectedVersion:(await getStock()).version,reason:'Conteo QA'});
      assert.equal((await getStock()).totalLiters,String(4*Number(liters)));
    }
    assert.deepEqual(await stock(),originalPinol);
  }finally{
    try{if(isolated)await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);}
    finally{await pool.end();}
  }
});
