import test from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { generalCatalogWorkbook, fetchGeneralCatalog } from '../src/services/generalCatalogReport.js';
import { generateWorkbookBlob, exportFileName } from '../src/services/excelExport.js';

test('catálogo: relaciones, IDs, precios, XML Excel seguro, filtros e inmovilización', async () => {
    const data = { categories: [{ id: 1, name: 'Categoría', color: '#123456', order: 2, active: false }], productLines: [{ id: 2, categoryId: 1, name: 'Línea', order: 1 }], priceGroups: [{ id: 3, name: 'Grupo', price: 25, active: true }, { id: 4, name: 'Inactivo', price: 99, active: false }], products: [
        { id: '001', name: '=HYPERLINK("bad")', categoryId: 1, lineId: 2, priceGroupId: 3, price: null, unit: 'litro' },
        { id: 2, name: '+Especial', price: 0, unit: 'pieza', active: false },
        { id: 3, name: '@Especial', priceGroupId: 4, unit: 'kg' },
        { id: 4, name: '-Especial', priceGroupId: 99, unit: 'litro' },
        { id: 5, name: 'Sin precio', price: null, unit: 'litro' },
    ] };
    const before = JSON.stringify(data);
    const workbook = generalCatalogWorkbook({ data, generatedAt: '2026-10-30T01:00:00Z' });
    assert.equal(exportFileName(workbook), 'CalcQuim_Catalogo_General_2026-10-29.xlsx');
    assert.deepEqual(workbook.sheets.map(s => s.rows.length), [5, 1, 1, 2]);
    assert.deepEqual(workbook.sheets[0].rows.map(p => p.effectivePrice), [25, 0, 'No determinado', 'No determinado', 'No determinado']);
    assert.equal(workbook.sheets[0].rows[0].id, '001');
    assert.equal(workbook.sheets[0].rows[0].category, 'Categoría');
    assert.equal(workbook.sheets[3].rows[0].productIds, '001');
    assert.equal(workbook.sheets[3].rows[0].units, 'litro');
    assert.equal(JSON.stringify(data), before);
    const blob = await generateWorkbookBlob(workbook);
    const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const bookXml = strFromU8(zip['xl/workbook.xml']);
    for (const sheet of workbook.sheets) assert.ok(bookXml.includes(sheet.name));
    for (let i = 1; i <= 4; i++) {
        const xml = strFromU8(zip[`xl/worksheets/sheet${i}.xml`]);
        assert.match(xml, /<autoFilter ref="A1:/);
        assert.match(xml, /state="frozen"/);
        assert.doesNotMatch(xml, /<f[ >]/);
    }
    const strings = strFromU8(zip['xl/sharedStrings.xml']);
    assert.ok(strings.includes('HYPERLINK'));
    assert.match(strFromU8(zip['xl/worksheets/sheet1.xml']), /<v>25<\/v>/);
});

test('consulta fresca sin almacenamiento local y error explícito', async () => {
    await assert.rejects(fetchGeneralCatalog(async () => ({ ok: false })), /PostgreSQL/);
    const result = await fetchGeneralCatalog(async (url, options) => { assert.equal(url, '/api/v1/reports/general-catalog'); assert.equal(options.cache, 'no-store'); return { ok: true, json: async () => ({ fresh: true }) }; });
    assert.equal(result.fresh, true);
    const calls = [];
    const legacy = await fetchGeneralCatalog(async url => {
        calls.push(url);
        return calls.length === 1 ? { ok: false, status: 404 } : { ok: true, json: async () => ({ data: { products: [], categories: [], productLines: [], priceGroups: [], sales: ['excluded'] } }) };
    });
    assert.deepEqual(calls, ['/api/v1/reports/general-catalog', '/api/v1/dataset']);
    assert.equal(Object.hasOwn(legacy.data, 'sales'), false);
    assert.ok(legacy.generatedAt);
});
