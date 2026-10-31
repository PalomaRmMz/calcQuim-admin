import assert from 'node:assert/strict';
export async function runSalesDetailRefresh(page, origin='http://127.0.0.1:5173') {
    const context=await page.context().browser().newContext();
    try {
        await context.route('**/api/**',()=>{throw new Error('NO_API_ACCESS');});
        const p=await context.newPage();
        await p.goto(origin+'/tests/fixtures/sales-detail-refresh.html');
        await p.getByRole('button',{name:'Ver venta V-SINTETICA',exact:true}).click();
        const dialog=p.getByRole('dialog');
        await dialog.getByLabel('Valor vendido de Producto inicial sintético').waitFor();
        await p.getByRole('button',{name:'Actualizar snapshot sintético',includeHidden:true}).evaluate(e=>e.click());
        await dialog.getByLabel('Valor vendido de Producto actualizado sintético').waitFor();
        assert.equal(await dialog.getByLabel('Valor vendido de Producto actualizado sintético').inputValue(),'3');
        assert.ok((await dialog.innerText()).includes('60.00'));
        await dialog.getByText('Historial de modificaciones',{exact:true}).click();
        await dialog.getByText(/revision_sintetica/).waitFor();
        await p.getByRole('button',{name:'Retirar del snapshot sintético',includeHidden:true}).evaluate(e=>e.click());
        await dialog.getByLabel('Valor vendido de Producto actualizado sintético').waitFor();
        await dialog.getByRole('button',{name:'Cerrar detalle',exact:true}).click();
        await dialog.waitFor({state:'hidden'});
        assert.equal(await dialog.count(),0);
        return {latestItems:true,latestTotal:true,latestHistory:true,snapshotFallback:true,close:true};
    } finally { await context.close(); }
}
