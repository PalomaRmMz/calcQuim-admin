import writeExcelFile from "write-excel-file/universal";
import { getCellAddress, getOrderOfSiblings, insertElementMarkupAccordingToOrderOfSiblings } from "write-excel-file/utility";

const formats = { money: '"$"#,##0.00;[Red]("$"#,##0.00)', number: "#,##0.######", percent: "0.00%", text: "@" };
const fileDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function exportFileName(workbook) {
    return `CalcQuim_${{ products: "Productos", procurement: "Compras", full: "Respaldo_Completo" }[workbook.scope]}_${fileDate(workbook.capturedAt)}.xlsx`;
}

export function workbookSheets(workbook) {
    return workbook.sheets.map(sheet => {
        if (sheet.rows.length > 1048575) throw new Error(`La hoja ${sheet.name} supera el límite de filas de Excel.`);
        const data = [sheet.columns.map(column => ({ type: String, value: column.label, fontWeight: "bold", textColor: "#FFFFFF", backgroundColor: "#17365D", height: 42, wrap: true, alignVertical: "center" }))];
        for (const [index, row] of sheet.rows.entries()) {
            const lines = Math.max(1, ...sheet.columns.map(c => typeof row[c.key] === "string" ? row[c.key].split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / (c.width - 2))), 0) : 1));
            const height = Math.min(180, Math.max(28, lines * 14 + 8));
            data.push(sheet.columns.map(column => {
            const value = row[column.key];
            if (typeof value === "string" && value.length > 32767) throw new Error(`Un texto de ${sheet.name} (${column.label}) excede el límite de una celda de Excel. El respaldo no se descargó incompleto.`);
            const type = value instanceof Date ? Date : typeof value === "number" ? Number : String;
            return { type, value: value == null || (type === Number && !Number.isFinite(value)) ? null : value, format: type === Date ? "dd/mm/yyyy hh:mm" : type === Number ? formats[column.type] || formats.number : "@", backgroundColor: index % 2 ? "#EFF4FA" : "#FFFFFF", textColor: "#203047", alignVertical: "top", align: type === Number ? "right" : "left", wrap: true, height };
            }));
        }
        return { sheet: sheet.name, data, columns: sheet.columns.map(c => ({ width: Math.min(60, Math.max(14, c.width)) })), stickyRowsCount: 1, showGridLines: false, orientation: "landscape" };
    });
}

export async function generateWorkbookBlob(workbook) {
    const sheets = workbookSheets(workbook);
    // A small extension through the library's documented API supplies autofilters.
    // No second Excel/ZIP dependency or manual workbook implementation is needed.
    const autoFilters = { files: { transform: { "xl/worksheets/sheet{id}.xml": { transform: (xml, _options, { sheetIndex }) => {
        const sheet = sheets[sheetIndex];
        const end = getCellAddress(sheet.data.length - 1, sheet.columns.length - 1);
        return insertElementMarkupAccordingToOrderOfSiblings(xml, `<autoFilter ref="A1:${end}"/>`, getOrderOfSiblings("xl/worksheets/sheet{id}.xml", "worksheet"), "worksheet");
    } } } } };
    return writeExcelFile(sheets, { fontFamily: "Calibri", fontSize: 11, features: [autoFilters] }).toBlob();
}

export async function exportWorkbook(workbook) {
    const blob = await generateWorkbookBlob(workbook);
    const fileName = exportFileName(workbook);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return { fileName, issueCount: workbook.issueCount };
}
