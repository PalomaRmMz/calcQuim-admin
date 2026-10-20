export default async function regression(page) {
    const checks = [];
    for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('http://127.0.0.1:5173/benchmarks/comparator/?size=1000');
        await page.waitForFunction(() => window.__perf?.ready);
        await page.waitForTimeout(100);
        if (await page.locator('.comparator-alternatives').count()) throw Error('Closed details mounted');
        await page.getByLabel('Producto final', { exact: true }).selectOption('1');
        await page.waitForTimeout(50);
        await page.evaluate(() => { window.__perf.counts = {}; });
        await page.getByRole('spinbutton').fill('80');
        await page.waitForTimeout(50);
        const quantity = await page.evaluate(() => ({ ...window.__perf.counts }));
        if (quantity.groups || quantity.tables) throw Error('Quantity recalculated groups or table');
        const expand = width < 768 ? page.locator('.comparator-details summary').first() : page.getByRole('button', { name: 'Expandir', exact: true }).first();
        await expand.click();
        const detail = page.locator('.comparator-alternatives').first();
        await detail.getByRole('heading', { name: 'Registros relacionados o no confirmados' }).waitFor();
        if (await detail.getByRole('button', { name: /Historial de/ }).count() !== 4) throw Error('Missing history action');
        await page.evaluate(() => { window.__perf.counts = {}; });
        await detail.getByRole('button', { name: /Historial de/ }).first().click();
        if (!(await page.getByRole('dialog').innerText()).includes('2026-09-01')) throw Error('Missing historical observation');
        const history = await page.evaluate(() => ({ ...window.__perf.counts }));
        if (history.groups || history.details) throw Error('History recalculated comparator');
        await page.getByRole('button', { name: 'Cerrar', exact: true }).first().click();
        await detail.getByRole('heading', { name: 'Alternativas comparables', exact: true }).waitFor();
        await page.getByLabel('Proveedor', { exact: true }).selectOption('supplier-2');
        await page.waitForTimeout(100);
        const text = await page.locator('body').innerText();
        if (!text.includes('$12.00 / L final') || !text.includes('1 producto · 1 alternativa visible')) throw Error('Filter changed meaning');
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Overflow');
        await page.waitForTimeout(400); const commits = await page.evaluate(() => window.__perf.commits.length);
        await page.waitForTimeout(250);
        if (await page.evaluate(() => window.__perf.commits.length) !== commits) throw Error('Render loop');
        checks.push({ width, quantity, history, commits, overflow: false });
    }
    return checks;
}

