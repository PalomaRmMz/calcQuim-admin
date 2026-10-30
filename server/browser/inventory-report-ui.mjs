import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {localDate} from '../../src/utils/salesUtils.js';
export async function runInventoryReportUI(page){
  const fixture=JSON.parse(await readFile(new URL('../artifacts/inventory/ui-fixture.private.json',import.meta.url),'utf8'));
  assert.equal(fixture.database,'calcquim_activation_test');assert.equal(fixture.active,true);
  const context=await page.context().browser().newContext();let writes=0,failRead=false;
  try{
    const api=async(path,options={})=>{const r=await context.request.fetch(fixture.api+'/api/v1'+path,options);assert.equal(r.status(),200);return r.json();};
    const command=async(name,input)=>{const s=await api('/dataset');return api('/commands/'+name,{method:'POST',headers:{'X-CalcQuim-Mode':'synthetic','If-Match':String(s.revision),'X-Dataset-Generation':s.generation,'Idempotency-Key':randomUUID()},data:{args:[input]}});};
    await command('inventoryInitial',{productId:1,quantity:'2',unit:'litro'});
    await command('inventoryReplenishment',{productId:1,minimum:'5',usualBatch:'20',unit:'litro',reasonCode:'replenishment_configuration'});
    await context.route('**/api/**',async route=>{
      const req=route.request(),url=new URL(req.url());if(req.method()!=='GET')writes++;
      if(failRead&&url.pathname.endsWith('/inventory')){failRead=false;await route.fulfill({status:503,contentType:'application/json',body:'{}'});return;}
      const response=await route.fetch({url:fixture.api+url.pathname+url.search,headers:{...req.headers(),'x-calcquim-mode':'synthetic'}});await route.fulfill({response});
    });
    await context.addInitScript(()=>{Object.defineProperty(globalThis,'localStorage',{get(){throw new Error('LOCAL_STORAGE_FORBIDDEN');}});globalThis.print=()=>{globalThis.__reportPrinted=true;};const original=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{globalThis.__reportBlob=blob;return original(blob);};});
    const p=await context.newPage();await p.goto('http://127.0.0.1:5173/reportes');await p.getByRole('button',{name:'Existencias y reposición',exact:true}).click();const report=p.getByRole('region',{name:'Reporte de existencias y reposición'});await report.locator('.data-table-wrapper').waitFor();
    await report.getByRole('button',{name:'Necesito surtir',exact:true}).click();assert.equal(await report.locator('.table-action-button.edit').count(),1);
    await report.getByLabel('Producto',{exact:true}).fill('Producto A sintético');assert.equal(await report.locator('.table-action-button.edit').count(),1);
    const csv=await Promise.all([p.waitForEvent('download'),report.getByRole('button',{name:'Exportar CSV',exact:true}).click()]);assert.ok(csv[0].suggestedFilename().endsWith('.csv'));
    const csvText=await p.evaluate(()=>globalThis.__reportBlob.text());assert.ok(csvText.includes('POR REPONER'));assert.ok(csvText.includes('litro'));assert.ok(csvText.includes('"20"'));assert.ok(!csvText.includes('Producto B sintético'));
    const excel=await Promise.all([p.waitForEvent('download'),report.getByRole('button',{name:'Exportar Excel',exact:true}).click()]);assert.ok(excel[0].suggestedFilename().endsWith('.xlsx'));assert.equal(await p.evaluate(async()=>new Uint8Array(await globalThis.__reportBlob.arrayBuffer())[0]),80);
    await report.getByRole('button',{name:'Lista imprimible',exact:true}).click();const d=p.getByRole('dialog');assert.equal(await d.locator('tbody tr').count(),1);await p.emulateMedia({media:'print'});assert.equal(await p.locator('.app-layout').evaluate(e=>globalThis.getComputedStyle(e).display),'none');assert.equal(await d.locator('.inventory-report-print table').isVisible(),true);await p.emulateMedia({media:'screen'});await d.getByRole('button',{name:'Imprimir',exact:true}).click();assert.equal(await p.evaluate(()=>globalThis.__reportPrinted),true);await d.getByRole('button',{name:'Cerrar',exact:true}).last().click();assert.equal(writes,0);
    failRead=true;await report.getByRole('button',{name:'Actualizar',exact:true}).click();await report.getByRole('alert').waitFor();assert.equal(await report.getByRole('button',{name:'Exportar CSV',exact:true}).isDisabled(),true);await report.getByRole('button',{name:'Actualizar',exact:true}).click();await report.getByRole('alert').waitFor({state:'hidden'});
    await report.locator('.table-action-button.edit').click();await d.getByRole('button',{name:'Reposición',exact:true}).click();await d.getByLabel('Punto de reposición',{exact:true}).fill('1');await d.getByLabel(/^Motivo/).selectOption('replenishment_configuration');await d.getByRole('button',{name:'Guardar reposición',exact:true}).click();await d.waitFor({state:'hidden'});
    await p.waitForFunction(()=>globalThis.document.querySelector('.inventory-report tbody')?.textContent.includes('No hay registros'));assert.equal(writes,1);
    const sale=quantity=>command('createSale',{date:localDate(),payment:'Efectivo',items:[{productId:1,price:10,unit:'litro',quantity}]});await sale(2);await p.evaluate(()=>globalThis.dispatchEvent(new Event('focus')));
    await report.getByRole('cell',{name:'AGOTADO',exact:true}).waitFor();await sale(1);await p.evaluate(()=>globalThis.dispatchEvent(new Event('focus')));await report.getByText('AGOTADO · SALDO NEGATIVO: CONCILIAR',{exact:true}).waitFor();assert.equal(writes,1);
    return {passed:true,syntheticOnly:true,filters:true,csvDownload:true,excelDownload:true,printAllFiltered:true,readOnlyViewingAndExports:true,thresholdEditInInventoryModal:true,saleAlerts:true,negativeIncidenceVisible:true,staleDataErrorHandled:true};
  }finally{await context.close();await fetch(fixture.control+'/stop',{method:'POST',headers:{Authorization:`Bearer ${fixture.token}`}});}
}
