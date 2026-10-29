import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

// Ejecutar con una página Playwright y el fixture efímero ya iniciado.
// Toda solicitud /api se redirige al esquema sintético antes de abrir React.
export async function runInventoryUI(page){
  const fixture=JSON.parse(await readFile(new URL('../artifacts/inventory/ui-fixture.private.json',import.meta.url),'utf8'));
  assert.equal(fixture.database,'calcquim_activation_test');assert.equal(fixture.active,true);
  const browser=page.context().browser();assert.ok(browser);
  const context=await browser.newContext();
  let requests=0,estimateRequest;
  try{
    await context.route('**/api/**',async route=>{
      const req=route.request(),url=new URL(req.url());requests++;
      if(url.pathname.endsWith('/inventoryInitial')&&req.method()==='POST')estimateRequest={headers:req.headers(),body:req.postData()};
      const response=await route.fetch({url:fixture.api+url.pathname+url.search,headers:{...req.headers(),'x-calcquim-mode':'synthetic'}});
      await route.fulfill({response});
    });
    await context.addInitScript(()=>Object.defineProperty(globalThis,'localStorage',{get(){throw new Error('LOCAL_STORAGE_FORBIDDEN_IN_SYNTHETIC_UI');}}));
    const p=await context.newPage();await p.goto('http://127.0.0.1:5173/inventario');
    await p.locator('.data-table-wrapper').first().waitFor({state:'visible'});
    assert.equal(await p.locator('.inventory-category').count(),0);
    assert.equal(await p.locator('.data-table-wrapper').count(),1);
    const header=p.getByRole('columnheader').filter({hasText:'Producto'});await header.locator('.Mui-TableHeadCell-Content-Labels').click();assert.equal(await header.getAttribute('aria-sort'),'ascending');await header.locator('.Mui-TableHeadCell-Content-Labels').click();assert.equal(await header.getAttribute('aria-sort'),'descending');
    const openProduct=async()=>{await p.getByRole('row').filter({hasText:'Producto A sintético'}).getByRole('button',{name:/^Editar /}).click();await p.getByRole('dialog').waitFor();};
    const dialog=p.getByRole('dialog');
    const stock=async value=>{await p.waitForFunction(value=>globalThis.document.querySelector('.inventory-stock-summary strong')?.textContent===value,value);};
    await openProduct();await stock('Sin determinar');assert.equal(await dialog.getByLabel(/^Cantidad/).inputValue(),'');
    await dialog.getByLabel(/^Cantidad/).fill('12');await dialog.getByLabel(/^Observaciones/).fill('Estimación UI sintética');
    await dialog.getByRole('button',{name:'Registrar inventario inicial',exact:true}).click();await dialog.waitFor({state:'hidden'});await openProduct();await stock('12 L');
    const repeatedEstimate=await context.request.post(fixture.api+'/api/v1/commands/inventoryInitial',{headers:{...estimateRequest.headers,'x-calcquim-mode':'synthetic'},data:estimateRequest.body});assert.equal(repeatedEstimate.status(),200);assert.equal((await repeatedEstimate.json()).replayed,true);
    await dialog.getByRole('button',{name:'Movimientos',exact:true}).click();
    assert.equal((await dialog.getByLabel(/^Motivo/).locator('option').evaluateAll(nodes=>nodes.map(n=>n.value))).join(','),',prepared_product,other');
    await dialog.getByLabel(/^Cantidad/).fill('20');await dialog.getByLabel(/^Motivo/).selectOption('prepared_product');await dialog.getByLabel(/^Observaciones/).fill('Preparación UI sintética');
    await dialog.getByRole('button',{name:'Registrar movimiento',exact:true}).click();await dialog.waitFor({state:'hidden'});await openProduct();await stock('32 L');
    await dialog.getByLabel(/^Tipo de movimiento/).selectOption('prepared');await dialog.getByLabel(/^Motivo/).selectOption('other');await dialog.getByLabel(/^Cantidad/).fill('1');
    await dialog.getByLabel(/^Observaciones/).fill('Observaciones no sustituyen explicación');await dialog.getByRole('button',{name:'Registrar movimiento',exact:true}).click();
    assert.equal(await dialog.getByLabel(/^Explicación de Otro/).getAttribute('aria-invalid'),'true');
    const blocked=await(await context.request.get(fixture.api+'/api/v1/inventory')).json();assert.equal(blocked.products.find(p=>p.productId===1).quantity,'32');
    await dialog.getByLabel(/^Explicación de Otro/).fill('Explicación excepcional sintética');await dialog.getByRole('button',{name:'Registrar movimiento',exact:true}).click();await dialog.waitFor({state:'hidden'});await openProduct();await stock('33 L');
    const exceptional=await(await context.request.get(fixture.api+'/api/v1/inventory')).json();assert.equal(exceptional.movements[0].reference.reasonCode,'other');assert.equal(exceptional.movements[0].reference.reasonExplanation,'Explicación excepcional sintética');
    await dialog.getByRole('button',{name:'Historial',exact:true}).click();await dialog.getByRole('row').filter({hasText:'Explicación excepcional sintética'}).getByRole('button',{name:'Compensar movimiento'}).click();
    await dialog.getByLabel(/^Motivo/).selectOption('entry_correction');await dialog.getByRole('button',{name:'Registrar compensación',exact:true}).click();await dialog.waitFor({state:'hidden'});await openProduct();await stock('32 L');
    await dialog.getByRole('button',{name:'Movimientos',exact:true}).click();
    await dialog.getByLabel(/^Tipo de movimiento/).selectOption('positive_adjustment');assert.equal((await dialog.getByLabel(/^Motivo/).locator('option').evaluateAll(nodes=>nodes.map(n=>n.value))).join(','),',positive_adjustment,other');
    await dialog.getByLabel(/^Cantidad/).fill('2');await dialog.getByLabel(/^Motivo/).selectOption('positive_adjustment');await dialog.getByRole('button',{name:'Registrar movimiento',exact:true}).click();await dialog.waitFor({state:'hidden'});await openProduct();await stock('34 L');
    await dialog.getByRole('button',{name:'Historial',exact:true}).click();await dialog.getByRole('row').filter({hasText:'Ajuste positivo'}).getByRole('button',{name:'Compensar movimiento'}).click();await dialog.getByLabel(/^Motivo/).selectOption('entry_correction');await dialog.getByRole('button',{name:'Registrar compensación',exact:true}).click();await dialog.waitFor({state:'hidden'});await openProduct();await stock('32 L');
    await dialog.getByRole('button',{name:'Movimientos',exact:true}).click();
    await dialog.getByLabel(/^Tipo de movimiento/).selectOption('receipt');await dialog.getByLabel(/^Cantidad/).fill('4');await dialog.getByLabel(/^Motivo/).selectOption('finished_receipt');await dialog.getByLabel(/^Observaciones/).fill('Recepción UI sintética');
    await dialog.getByRole('button',{name:'Registrar movimiento',exact:true}).click();await dialog.waitFor({state:'hidden'});await openProduct();await stock('36 L');
    await dialog.getByRole('button',{name:'Historial',exact:true}).click();await dialog.getByRole('row').filter({hasText:'Recepción UI sintética'}).getByRole('button',{name:'Compensar movimiento'}).click();
    await dialog.getByLabel(/^Motivo/).selectOption('entry_correction');await dialog.getByLabel(/^Observaciones/).fill('Corregir recepción UI sintética');await dialog.getByRole('button',{name:'Registrar compensación',exact:true}).click();await dialog.waitFor({state:'hidden'});await openProduct();await stock('32 L');
    await dialog.getByRole('button',{name:'Reposición',exact:true}).click();
    await dialog.getByLabel('Punto de reposición',{exact:true}).fill('5');await dialog.getByLabel('Lote habitual',{exact:true}).fill('20');await dialog.getByLabel(/^Motivo/).selectOption('replenishment_configuration');await dialog.getByLabel(/^Observaciones/).fill('Reposición UI sintética');
    await dialog.getByRole('button',{name:'Guardar reposición',exact:true}).click();
    await dialog.waitFor({state:'hidden'});await p.getByText('Guardado en PostgreSQL.',{exact:true}).waitFor();await openProduct();
    await dialog.getByRole('button',{name:'Cerrar',exact:true}).last().click();
    const request=async(path,options={})=>{const r=await context.request.fetch(fixture.api+'/api/v1'+path,options);assert.ok(r.ok());return r.json();};
    let inventory=await request('/inventory');let product=inventory.products.find(p=>p.productId===1);
    assert.equal(inventory.movements.find(m=>m.kind==='estimate').reference.reasonCode,'initial_inventory');assert.equal(inventory.movements.find(m=>m.kind==='prepared'&&m.reference.reasonCode==='prepared_product').reference.reasonCode,'prepared_product');assert.equal(product.quantity,'32');assert.equal(product.minimum,'5');assert.equal(product.usualBatch,'20');
    const restart=await context.request.post(fixture.control+'/restart',{headers:{Authorization:`Bearer ${fixture.token}`}});assert.ok(restart.ok());
    await p.reload();await p.locator('.data-table-wrapper').first().waitFor({state:'visible'});await openProduct();await stock('32 L');
    await dialog.getByRole('button',{name:'Movimientos',exact:true}).click();await dialog.getByLabel(/^Tipo de movimiento/).selectOption('outflow');
    await dialog.getByLabel(/^Cantidad/).fill('2');await dialog.getByLabel(/^Motivo/).selectOption('internal_use');await dialog.getByLabel(/^Observaciones/).fill('Salida justificada UI sintética');await dialog.getByRole('button',{name:'Registrar movimiento',exact:true}).click();await dialog.waitFor({state:'hidden'});await openProduct();await stock('30 L');
    await dialog.getByRole('button',{name:'Historial',exact:true}).click();await dialog.getByRole('row').filter({hasText:'Salida justificada UI sintética'}).getByRole('button',{name:'Compensar movimiento'}).click();
    await dialog.getByLabel(/^Motivo/).selectOption('entry_correction');await dialog.getByLabel(/^Observaciones/).fill('Corregir salida UI sintética');await dialog.getByRole('button',{name:'Registrar compensación',exact:true}).click();await dialog.waitFor({state:'hidden'});await openProduct();await stock('32 L');
    await dialog.getByRole('button',{name:'Reposición',exact:true}).click();assert.equal(await dialog.getByLabel('Punto de reposición',{exact:true}).inputValue(),'5');assert.equal(await dialog.getByLabel('Lote habitual',{exact:true}).inputValue(),'20');
    await dialog.getByRole('button',{name:'Cerrar',exact:true}).last().click();
    const command=async(name,args,key=randomUUID())=>{
      const state=await request('/dataset');
      const response=await context.request.post(fixture.api+'/api/v1/commands/'+name,{headers:{'X-CalcQuim-Mode':'synthetic','If-Match':String(state.revision),'X-Dataset-Generation':state.generation,'Idempotency-Key':key},data:{args}});
      assert.equal(response.status(),200);return response.json();
    };
    const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City'}).format(new Date());
    const sale={date,payment:'Efectivo',items:[{productId:1,price:10,unit:'litro',quantity:1.5}]};
    const key=randomUUID();let state=await command('createSale',[sale],key);await command('createSale',[sale],key);
    inventory=await request('/inventory');assert.equal(inventory.products.find(p=>p.productId===1).quantity,'30.5');
    await command('voidSale',[state.data.sales[0].id,{inventoryReturn:'returned',reason:'Retorno UI sintético'}]);
    state=await command('createSale',[{...sale,items:[{...sale.items[0],quantity:1.5}],inventory:{1:{pendingGroup:true,scope:'line'}}}]);
    inventory=await request('/inventory');const grouped=inventory.pending.find(p=>p.sale_id===state.data.sales[0].id);assert.equal(grouped.state,'pending');assert.equal(inventory.products.find(p=>p.productId===1).quantity,'32');
    await command('inventoryAllocate',[{pendingId:grouped.id,reason:'Desglose UI sintético',allocations:[{productId:1,quantity:'1',unit:'litro'},{productId:2,quantity:'0.5',unit:'litro'}]}]);
    assert.equal((await request('/inventory')).products.find(p=>p.productId===1).quantity,'31');
    await command('voidSale',[state.data.sales[0].id,{inventoryReturn:'returned',reason:'Retorno agrupado UI sintético'}]);
    state=await command('createSale',[{...sale,items:[{...sale.items[0],entryMode:'amount',requestedAmount:20}]}]);
    inventory=await request('/inventory');assert.equal(inventory.pending.find(p=>p.sale_id===state.data.sales[0].id).quantity,null);assert.equal(inventory.products.find(p=>p.productId===1).quantity,'32');
    await p.reload();await p.locator('.data-table-wrapper').first().waitFor({state:'visible'});await openProduct();await stock('32 L');
    await dialog.getByRole('button',{name:'Movimientos',exact:true}).click();await dialog.getByLabel(/^Tipo de movimiento/).selectOption('waste');
    await dialog.getByLabel(/^Cantidad/).fill('0.5');await dialog.getByLabel(/^Motivo/).selectOption('waste');await dialog.getByLabel(/^Observaciones/).fill('Merma UI sintética');await dialog.getByRole('button',{name:'Registrar movimiento',exact:true}).click();await dialog.waitFor({state:'hidden'});await openProduct();await stock('31.5 L');
    await dialog.getByRole('button',{name:'Historial',exact:true}).click();await dialog.getByRole('row').filter({hasText:'Merma UI sintética'}).getByRole('button',{name:'Compensar movimiento'}).click();
    await dialog.getByLabel(/^Motivo/).selectOption('entry_correction');await dialog.getByLabel(/^Observaciones/).fill('Corrección UI sintética');await dialog.getByRole('button',{name:'Registrar compensación',exact:true}).click();await dialog.waitFor({state:'hidden'});await openProduct();await stock('32 L');
    inventory=await request('/inventory');assert.equal(inventory.products.find(p=>p.productId===2).quantity,null);
    const result={passed:true,database:'calcquim_activation_test',singleDataTable:true,headerSorting:true,pencilAction:true,modalEstimate:true,preparedEntry:true,replenishment:true,expressRestart:true,reactRemount:true,directSale:true,duplicateSalePrevented:true,groupedPendingAndAllocation:true,amountPending:true,wasteAndCompensation:true,unknownNotZero:true,interceptedRequests:requests,at:new Date().toISOString()};
    await writeFile(new URL('../artifacts/inventory/ui-validation.private.json',import.meta.url),JSON.stringify(result,null,2));return result;
  }finally{
    await context.close();
    await fetch(fixture.control+'/stop',{method:'POST',headers:{Authorization:`Bearer ${fixture.token}`}});
  }
}
