import { Profiler } from 'react';
import { createRoot } from 'react-dom/client';
import { CatalogContext } from '../../src/context/CatalogHooks.js';
import { ProcurementContext } from '../../src/context/ProcurementContext.js';
import DataTable from '../../src/components/DataTable.jsx';
import Comparator from '../../src/pages/ProcurementComparator.jsx';
import { fixture } from './fixture.mjs';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../../src/styles/DesignSystem.css';

const params = new URLSearchParams(location.search);
const input = fixture(Number(params.get('size')) || 200);
const catalog = { ...input, getProductPrice: p => p.price };
const controlColumns = [{ accessorKey: 'name', header: 'Producto' }];
window.__perf = { counts: {}, commits: [], ready: false };
const View = params.get('view') === 'legacy' ? (await import('virtual:comparator-legacy')).default : Comparator;
const control = params.get('view') === 'control';
createRoot(document.getElementById('root')).render(
    <Profiler id="comparator" onRender={(id, phase, duration) => { window.__perf.commits.push({ phase, duration }); window.__perf.ready = true; }}>
        <CatalogContext.Provider value={catalog}><ProcurementContext.Provider value={input}>
            {control ? <DataTable columns={controlColumns} data={input.products} mobileCards /> : <View />}
        </ProcurementContext.Provider></CatalogContext.Provider>
    </Profiler>
);
