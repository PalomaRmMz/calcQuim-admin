import test from 'node:test';
import assert from 'node:assert/strict';
import {inventoryReportRows,filterInventoryReport,inventoryReportSummary,inventoryReportCsv,inventoryReportWorkbook} from '../src/services/inventoryReport.js';
import {workbookSheets,exportFileName} from '../src/services/excelExport.js';
const row=(id,quantity,minimum=null,usualBatch=null)=>({productId:id,name:`Producto sintético ${id}`,quantity,minimum,usualBatch,unit:'litro',categoryId:1,lineId:1});
test('estados exactos: desconocido, cero, negativo, mínimo y configuración ausente',()=>{
    const rows=inventoryReportRows([row(1,'0','5'),row(2,'2','5'),row(3,'5','5'),row(4,'6','5'),row(5,null,'5'),row(6,'7'),row(7,'-1'),row(8,'0.000001','0.000002')]);
    assert.deepEqual(rows.map(r=>r.status),['out','low','low','sufficient','unknown','unconfigured','out','low']);
    assert.equal(rows[6].negative,true);assert.ok(rows[6].stateLabel.includes('CONCILIAR'));assert.equal(rows[4].suggestedQuantity,null);
    assert.deepEqual(inventoryReportSummary(rows),{out:2,low:3,sufficient:1,unknown:1,unconfigured:2,negative:1});
    assert.equal(filterInventoryReport(rows,{state:'need'}).length,5);assert.equal(filterInventoryReport(rows,{state:'unconfigured'}).some(r=>r.status==='sufficient'),false);
});
test('filtros y lote orientativo: nunca inventa un máximo ni un déficit',()=>{
    const rows=inventoryReportRows([row(1,'2','5','65'),row(2,null,null,'20')],[{id:1,name:'Grupo sintético'}]);
    assert.equal(rows[0].suggestedQuantity,'65');assert.equal(rows[0].action,'Reponer');assert.ok(rows[0].suggestionType.includes('no es una necesidad exacta'));
    assert.equal(filterInventoryReport(rows,{search:'SINTÉTICO 1',category:'1',line:'1',state:'need'}).length,1);assert.equal(rows[1].quantity,null);
});
test('CSV y Excel conservan cantidades, unidades, estados, desconocidos y caracteres seguros',()=>{
    const rows=inventoryReportRows([{...row(1,'-0.000001','5','20'),name:'=SUM(1,2)'},row(2,null)]),csv=inventoryReportCsv(rows);
    assert.ok(csv.includes('"-0.000001"'));assert.ok(csv.includes('"\'=SUM(1,2)"'));assert.ok(csv.includes('SIN EXISTENCIA DETERMINADA'));assert.ok(csv.includes('CONCILIAR'));assert.ok(csv.includes('litro'));
    const book=inventoryReportWorkbook(rows,new Date('2026-10-29T12:00:00Z'));assert.ok(exportFileName(book).startsWith('CalcQuim_Existencias_y_reposicion'));
    const sheets=workbookSheets(book);assert.equal(sheets[0].data.length,3);assert.equal(book.sheets[0].rows.find(r=>r.quantity==='-0.000001').unit,'litro');
});
