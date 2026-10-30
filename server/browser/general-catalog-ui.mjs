import assert from 'node:assert/strict';

export async function runGeneralCatalogUI(page, fixture, origin = 'http://127.0.0.1:5173') {
    assert.equal(fixture.database, 'calcquim_activation_test');
    assert.equal(fixture.active, true);
    const context = await page.context().browser().newContext();
    let writes = 0;
    try {
        await context.route('**/api/**', async route => {
            if (route.request().method() !== 'GET') writes++;
            const url = new URL(route.request().url());
            const response = await route.fetch({ url: fixture.api + url.pathname + url.search });
            await route.fulfill({ response });
        });
        const p = await context.newPage();
        for (let restart = 0; restart < 2; restart++) {
            await p.goto(origin + '/reportes');
            await p.getByRole('button', { name: 'Catálogo general', exact: true }).click();
            const [download] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Exportar a Excel', exact: true }).click()]);
            assert.match(download.suggestedFilename(), /^CalcQuim_Catalogo_General_\d{4}-\d{2}-\d{2}\.xlsx$/);
            assert.equal(await download.failure(), null);
            await p.getByRole('status').filter({ hasText: 'Archivo generado' }).waitFor();
            if (!restart) {
                const response = await context.request.post(fixture.control + '/restart', { headers: { Authorization: 'Bearer ' + fixture.token } });
                assert.equal(response.status(), 200);
            }
        }
        assert.equal(writes, 0);
        return { download: true, afterExpressRestartAndReactReload: true, writes };
    } finally { await context.close(); }
}
