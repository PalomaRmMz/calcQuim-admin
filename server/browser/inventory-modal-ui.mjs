import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Requiere inventory-ui-fixture.mjs. Todas las escrituras se redirigen a su esquema sintético.
export async function runInventoryModalUI(page){
  const fixture=JSON.parse(await readFile(new URL('../artifacts/inventory/ui-fixture.private.json',import.meta.url),'utf8'));
  assert.equal(fixture.database,'calcquim_activation_test');assert.equal(fixture.active,true);
  const context=await page.context().browser().newContext();
  let fault='',release,posts=0;const keys=[];
  try{
    await context.route('**/api/**',async route=>{
      const req=route.request(),url=new URL(req.url()),write=req.method()==='POST';
      if(write){posts++;keys.push(req.headers()['idempotency-key']);}
      if(write&&fault==='before'){fault='';await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'Error de guardado sintético'}})});return;}
      const response=await route.fetch({url:fixture.api+url.pathname+url.search,headers:{...req.headers(),'x-calcquim-mode':'synthetic'}});
      if(write&&fault==='after'){fault='';await route.abort('failed');return;}
      if(write&&fault==='delay'){fault='';await new Promise(resolve=>{release=resolve;});}
      await route.fulfill({response});
    });
    await context.addInitScript(()=>Object.defineProperty(globalThis,'localStorage',{get(){throw new Error('LOCAL_STORAGE_FORBIDDEN_IN_SYNTHETIC_UI');}}));
    const p=await context.newPage();await p.goto('http://127.0.0.1:5173/inventario');
    const dialog=p.getByRole('dialog');
    const open=async()=>{await p.getByRole('row').filter({hasText:'Producto A sintético'}).getByRole('button',{name:/^Editar /}).click();await dialog.waitFor();};
    const inventory=async()=>{const r=await context.request.get(fixture.api+'/api/v1/inventory');assert.equal(r.status(),200);return r.json();};
    const quantity=async()=> (await inventory()).products.find(p=>p.productId===1).quantity;
    const closed=async()=>{await dialog.waitFor({state:'hidden'});await p.getByRole('status').filter({hasText:'Guardado en PostgreSQL.'}).waitFor();};
    await open();
    await dialog.getByRole('button',{name:'Registrar inventario inicial',exact:true}).click();assert.equal(posts,0);assert.equal(await dialog.getByLabel(/^Cantidad/).getAttribute('aria-invalid'),'true');
    await dialog.getByLabel(/^Cantidad/).fill('12');assert.equal(await dialog.getByLabel(/^Motivo/).count(),0);
    
    fault='delay';await dialog.locator('form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
    await dialog.getByRole('button',{name:'Guardando…',exact:true}).waitFor();
    for(let i=0;!release&&i<100;i++)await p.waitForTimeout(50);
    assert.ok(release);assert.equal(posts,1);assert.equal(await dialog.getByLabel(/^Cantidad/).isDisabled(),true);
    await p.keyboard.press('Escape');assert.equal(await dialog.isVisible(),true);
    release();await closed();assert.equal(await quantity(),'12');assert.equal((await inventory()).movements.length,1);

    await open();await dialog.getByLabel(/^Cantidad/).fill('20');await dialog.getByLabel(/^Motivo/).selectOption('prepared_product');
    fault='before';await dialog.getByRole('button',{name:'Registrar movimiento',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'Error de guardado sintético'}).waitFor();
    assert.equal(await dialog.getByLabel(/^Cantidad/).inputValue(),'20');assert.equal(await dialog.getByLabel(/^Motivo/).inputValue(),'prepared_product');assert.equal(await quantity(),'12');
    await dialog.getByRole('button',{name:'Registrar movimiento',exact:true}).click();await closed();assert.equal(await quantity(),'32');assert.equal(keys[1],keys[2]);

    await open();await dialog.getByLabel(/^Cantidad/).fill('3');await dialog.getByLabel(/^Motivo/).selectOption('prepared_product');
    fault='after';await dialog.getByRole('button',{name:'Registrar movimiento',exact:true}).click();await dialog.getByRole('alert').waitFor();
    assert.equal(await dialog.getByLabel(/^Cantidad/).inputValue(),'3');assert.equal(await quantity(),'35');
    await dialog.getByRole('button',{name:'Registrar movimiento',exact:true}).click();await closed();assert.equal(await quantity(),'35');assert.equal(keys[3],keys[4]);assert.equal((await inventory()).movements.length,3);

    const operations=[['receipt','4','finished_receipt','39'],['outflow','2','internal_use','37'],['adjustment','-1','count_correction','36'],['waste','0.5','waste','35.5'],['correction','1','entry_correction','36.5'],['positive_adjustment','2','positive_adjustment','38.5']];
    for(const [kind,amount,reason,expected] of operations){await open();await dialog.getByLabel(/^Tipo de movimiento/).selectOption(kind);await dialog.getByLabel(/^Cantidad/).fill(amount);await dialog.getByLabel(/^Motivo/).selectOption(reason);await dialog.getByRole('button',{name:'Registrar movimiento',exact:true}).click();await closed();assert.equal(await quantity(),expected);}
    await open();await dialog.getByRole('button',{name:'Reposición',exact:true}).click();await dialog.getByLabel('Punto de reposición',{exact:true}).fill('5');await dialog.getByLabel('Lote habitual',{exact:true}).fill('20');await dialog.getByLabel(/^Motivo/).selectOption('replenishment_configuration');await dialog.getByRole('button',{name:'Guardar reposición',exact:true}).click();await closed();
    await open();await dialog.getByRole('button',{name:'Reposición',exact:true}).click();assert.equal(await dialog.getByLabel('Punto de reposición',{exact:true}).inputValue(),'5');await dialog.getByRole('button',{name:'Movimientos',exact:true}).click();
    await dialog.getByLabel(/^Cantidad/).fill('7');const beforeDiscard=posts;
    await dialog.getByRole('button',{name:'Cerrar',exact:true}).last().click();const confirm=p.getByRole('dialog',{name:'Descartar cambios',exact:true});await confirm.waitFor();await confirm.getByRole('button',{name:'Cancelar',exact:true}).click();await confirm.waitFor({state:'hidden'});assert.equal(await dialog.getByLabel(/^Cantidad/).inputValue(),'7');
    await p.keyboard.press('Escape');await confirm.waitFor();await confirm.getByRole('button',{name:'Descartar',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(posts,beforeDiscard);
    await open();assert.equal(await dialog.getByLabel(/^Cantidad/).inputValue(),'');await dialog.getByRole('button',{name:'Cerrar',exact:true}).last().click();await dialog.waitFor({state:'hidden'});
    await p.reload();await p.locator('.data-table-wrapper').waitFor();assert.equal(await quantity(),'38.5');
    return {passed:true,syntheticOnly:true,successClosesAllOperations:true,validationPreservesModal:true,errorsPreserveValues:true,doubleSubmitBlocked:true,lateResponseClosesOnce:true,lostResponseRetryIdempotent:true,discardConfirmation:true,replenishmentPersisted:true};
  }finally{
    release?.();await context.close();await fetch(fixture.control+'/stop',{method:'POST',headers:{Authorization:`Bearer ${fixture.token}`}});
  }
}
