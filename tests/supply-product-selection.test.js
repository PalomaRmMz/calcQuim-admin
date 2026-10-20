import test from 'node:test';
import assert from 'node:assert/strict';
import { supplySelectionLines, compatibleSupplyLine, visibleSupplyProducts } from '../src/utils/supplyProductSelection.js';

const categories = [{ id: 1, name: 'Lavatrastes' }, { id: 2, name: 'Multiusos' }, { id: 3, name: 'Sin líneas' }];
const lines = [{ id: 7, categoryId: 2, name: 'Fabuloso' }];
const products = [
    { id: 11, name: 'Naranja', categoryId: 1 },
    { id: 12, name: 'Mandarina', categoryId: 1 },
    { id: 13, name: 'Blueberry', categoryId: 1 },
    { id: 14, name: 'Madera', categoryId: 2, lineId: 7 },
    { id: 15, name: 'Naranja', categoryId: 2 },
];
const visible = (criteria = {}, selected = []) => visibleSupplyProducts(products, selected, categories, lines, criteria).map(p => p.id);

test('supply selection opens empty and searches specific name, visible name, category and line freely', () => {
    assert.deepEqual(visible(), []);
    assert.deepEqual(visible({ search: '  ' }), []);
    assert.deepEqual(visible({ search: 'fab' }), [14]);
    assert.deepEqual(visible({ search: 'Fabuloso Madera' }), [14]);
    assert.deepEqual(visible({ search: 'lavatrastes' }), [11, 12, 13]);
    assert.deepEqual(visible({ search: 'BLUE' }), [13]);
});

test('selected IDs remain visible across queries and incompatible category/line filters', () => {
    assert.deepEqual(visible({ search: 'no match', categoryId: '2', lineId: '7' }, [12, 13]), [12, 13]);
    assert.deepEqual(visible({}, [11]), [11]);
    assert.deepEqual(visible({ search: 'Naranja' }, [14]), [11, 14, 15]);
});

test('category IDs determine results without inferring classification from names', () => {
    const before = structuredClone(products);
    assert.deepEqual(visible({ categoryId: '1' }), [11, 12, 13]);
    assert.deepEqual(visible({ categoryId: '2', search: 'Naranja' }), [15]);
    assert.deepEqual(products, before);
});

test('line options belong to category; incompatible line clears while a compatible line remains', () => {
    assert.deepEqual(supplySelectionLines(lines, ''), []);
    assert.deepEqual(supplySelectionLines(lines, '3'), []);
    assert.deepEqual(supplySelectionLines(lines, '2'), lines);
    assert.equal(compatibleSupplyLine(lines, '1', '7'), '');
    assert.equal(compatibleSupplyLine(lines, '', '7'), '');
    assert.equal(compatibleSupplyLine(lines, '2', '7'), '7');
});
