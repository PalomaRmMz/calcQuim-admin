import { performance } from 'node:perf_hooks';
import { fixture } from './fixture.mjs';
import { comparatorGroups, comparableCost, sortComparatorGroups } from '../../src/utils/comparatorGroups.js';
import { getProductChoiceLabels } from '../../src/utils/catalogUtils.js';
import { matchesClassification } from '../../src/utils/classificationUtils.js';

const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
function measure(fn) {
    fn(); // JIT warm-up excluded
    return Number(median(Array.from({ length: 9 }, () => { const start = performance.now(); fn(); return performance.now() - start; })).toFixed(3));
}
for (const size of [20, 200, 1000]) {
    const f = fixture(size), rows = f.analytics.rows;
    const args = { ...f, rows, filters: { status: 'active' } };
    const groups = comparatorGroups(args);
    const costs = groups.flatMap(g => g.comparable);
    console.log(JSON.stringify({ size, alternatives: rows.length,
        // Full selector includes filtering, normalization, best selection and sorting.
        selector: measure(() => comparatorGroups(args)),
        // Isolated kernels overlap with selector; do not add these durations.
        costs: measure(() => rows.forEach(r => comparableCost(r.reference, f.analytics.productMap.get(r.productId)))),
        filter: measure(() => rows.filter(r => matchesClassification(f.analytics.productMap.get(r.productId), '', '') && r.display.active)),
        best: measure(() => { const best = new Map(); for (const c of costs) if (!best.has(c.row.productId) || c.cost < best.get(c.row.productId).cost) best.set(c.row.productId, c); }),
        sort: measure(() => sortComparatorGroups([...groups].reverse(), f.categories, f.productLines)),
        labels: measure(() => getProductChoiceLabels(f.products, f.categories, f.productLines)),
    }));
}
