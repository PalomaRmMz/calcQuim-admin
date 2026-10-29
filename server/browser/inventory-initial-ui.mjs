import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

export async function runInventoryInitialUI(page){
  const fixture=JSON.parse(await readFile(new URL('../artifacts/inventory/ui-fixture.private.json',import.meta.url),'utf8'));
  assert.equal(fixture.database,'calcquim_activation_test');assert.equal(fixture.active,true);
  const context=await page.context().browser().newContext();
  try{
    await context.route('**/api/**',async route=>{
      const req=route.request(),url=new URL(req.url());
      const response=await route.fetch({url:fixture.api+url.pathname+url.search,headers:{...req.headers(),'x-calcquim-mode':'synthetic'}});await route.fulfill({response});
    });
    const p=await context.newPage();await p.goto('http://127.0.0.1:5173/inventario');
    const d=p.getByRole('dialog');
    const open=async()=>{await p.getByRole('row').filter({hasText:'Producto A sintético'}).getByRole('button',{name:/^Editar /}).click();await d.waitFor();};
    const read=async()=>{const r=await context.request.get(fixture.api+'/api/v1/inventory');assert.equal(r.status(),200);return r.json();};
    const check=async(initial,current)=>{const data=await read(),product=data.products.find(p=>p.productId===1);assert.equal(product.initialQuantity,initial);assert.equal(product.quantity,current);};
    const save=async label=>{await d.getByRole('button',{name:label,exact:true}).click();await d.waitFor({state:'hidden'});};
    await open();assert.equal(await d.getByLabel(/^Motivo/).count(),0);assert.equal(await d.getByRole('button',{name:'Movimientos',exact:true}).count(),0);await d.getByRole('button',{name:'Registrar inventario inicial',exact:true}).click();assert.equal((await read()).movements.length,0);await d.getByLabel(/^Cantidad/).fill('12');await save('Registrar inventario inicial');await check('12','12');
    await open();await d.getByRole('button',{name:'Inventario inicial',exact:true}).click();assert.equal(await d.getByRole('button',{name:'Registrar inventario inicial',exact:true}).count(),0);
    await d.getByRole('button',{name:'Correcciones',exact:true}).click();await d.getByLabel(/^Nuevo inventario inicial aproximado/).fill('8');
    assert.ok((await d.getByRole('status').last().innerText()).includes('Diferencia: -4'));await save('Guardar corrección del inicial');await check('8','8');
    assert.equal((await read()).movements.length,1);
    await open();await d.getByLabel(/^Cantidad/).fill('20');await d.getByLabel(/^Motivo/).selectOption('prepared_product');await save('Registrar movimiento');await check('8','28');
    await open();await d.getByLabel(/^Tipo de movimiento/).selectOption('outflow');await d.getByLabel(/^Cantidad/).fill('1.5');await d.getByLabel(/^Motivo/).selectOption('internal_use');await save('Registrar movimiento');await check('8','26.5');
    await open();await d.getByRole('button',{name:'Correcciones',exact:true}).click();await d.getByLabel(/^Nuevo inventario inicial aproximado/).fill('9');await save('Guardar corrección del inicial');await check('9','27.5');
    await open();await d.getByLabel(/^Tipo de movimiento/).selectOption('count');await d.getByLabel(/^Cantidad/).fill('25');await d.getByLabel(/^Motivo/).selectOption('physical_count');await save('Guardar conteo físico');await check('9','25');
    await open();await d.getByRole('button',{name:'Correcciones',exact:true}).click();await d.getByRole('alert').filter({hasText:'Existe un conteo posterior'}).waitFor();assert.equal(await d.getByRole('button',{name:'Guardar corrección del inicial',exact:true}).count(),0);
    await d.getByRole('button',{name:'Historial',exact:true}).click();await d.getByText('Correcciones del inventario inicial',{exact:true}).waitFor();assert.equal((await read()).changes.filter(c=>c.action==='initial_correction').length,2);
    await d.getByRole('button',{name:'Cerrar',exact:true}).last().click();
    const restarted=await context.request.post(fixture.control+'/restart',{headers:{Authorization:`Bearer ${fixture.token}`}});assert.equal(restarted.status(),200);await p.reload();await p.locator('.data-table-wrapper').waitFor();await check('9','25');
    return {passed:true,syntheticOnly:true,initial12:true,correction8:true,prepared20:true,outflow1_5:true,correctionPreservesLaterMovements:true,physicalCountPreservesInitial:true,ambiguousCorrectionBlocked:true,historyIntact:true,restartPersisted:true};
  }finally{await context.close();await fetch(fixture.control+'/stop',{method:'POST',headers:{Authorization:`Bearer ${fixture.token}`}});}
}
