import { createServer } from 'vite';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const legacyModule = fileURLToPath(new URL('./legacy.virtual.jsx', import.meta.url)).replaceAll('\\', '/');

// Instrument only this dedicated server; application source files stay untouched.
const server = await createServer({ server: { host: '127.0.0.1', port: 5173, strictPort: true }, plugins: [{
    name: 'comparator-benchmark-counters', enforce: 'pre',
    resolveId(id) {
        if (id === 'virtual:comparator-legacy' || id.replaceAll('\\', '/').endsWith('/benchmarks/comparator/legacy.virtual.jsx')) return legacyModule;
    },
    load(id) {
        if (id === legacyModule) return execFileSync('git', ['show', 'HEAD:src/pages/ProcurementComparator.jsx'], { encoding: 'utf8' }).replaceAll('../', '/src/');
    },
    transform(code, id) {
        const points = [
            ['/src/pages/ProcurementComparator.jsx', 'export default function ProcurementComparator() {', 'page'],
            ['/src/utils/comparatorGroups.js', '    const map = new Map', 'groups'],
            ['/src/components/ComparatorAlternatives.jsx', 'function ComparatorAlternatives({ group, columns }) {', 'details'],
            ['/src/components/DataTable.jsx', "    const smallScreen = useMediaQuery", 'tables'],
        ];
        const point = points.find(([file]) => id.replaceAll('\\', '/').endsWith(file));
        if (!point) return;
        const [, marker, key] = point;
        const count = `if(globalThis.__perf) globalThis.__perf.counts.${key} = (globalThis.__perf.counts.${key} || 0) + 1;`;
        const replacement = marker.endsWith('{') ? `${marker}\n${count}` : `${count}\n${marker}`;
        return code.replace(marker, replacement);
    },
}] });
await server.listen();
server.printUrls();
