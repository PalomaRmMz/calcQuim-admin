// Run this function with a Playwright Page against server.mjs, before and after
// changes. Keep viewport, fixture, samples, warm-up and browser identical.
export default async function measure(page) {
    const results = [];
    const read = () => ({ mount: window.__perf.commits[0]?.duration, total: window.__perf.commits.reduce((s, c) => s + c.duration, 0), commits: window.__perf.commits.length, counts: { ...window.__perf.counts }, dom: document.querySelectorAll('*').length, heap: performance.memory?.usedJSHeapSize });
    const resetAndClick = async selector => {
        window.__perf.counts = {}; window.__perf.commits = [];
        const start = performance.now();
        document.querySelector(selector).click();
        await new Promise(resolve => setTimeout(resolve, 0));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return { wall: performance.now() - start, react: window.__perf.commits.reduce((s, c) => s + c.duration, 0), commits: window.__perf.commits.length, counts: { ...window.__perf.counts } };
    };
    for (const size of [20, 200, 1000]) for (const width of [390, 1440]) {
        const samples = [];
        for (let run = 0; run < 3; run++) {
            await page.setViewportSize({ width, height: 900 });
            await page.goto(`http://127.0.0.1:5173/benchmarks/comparator/?size=${size}`);
            await page.waitForFunction(() => window.__perf?.ready);
            await page.waitForTimeout(100);
            const initial = await page.evaluate(read);
            const selector = width < 768 ? '.comparator-details summary' : 'button[aria-label="Expandir"]';
            const open = await page.evaluate(resetAndClick, selector);
            const close = await page.evaluate(resetAndClick, selector);
            await page.evaluate(resetAndClick, selector);
            const history = await page.evaluate(resetAndClick, 'button[aria-label^="Historial de"]');
            samples.push({ initial, open, close, history });
        }
        results.push({ size, width, samples });
    }
    return results;
}
