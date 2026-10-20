import { useId } from 'react';

// The same table instance owns filtering, sorting and pagination on both views.
export default function MobileDataTable({ table, searchPlaceholder, emptyMessage, primaryColumns, secondaryColumns, detailsLabel = 'Ver más información' }) {
    const inputId = useId();
    const sorting = table.getState().sorting[0];
    const columns = table.getVisibleLeafColumns().filter(column => !column.id.startsWith('mrt-'));
    const sortable = columns.filter(column => column.getCanSort());
    const { pageIndex, pageSize } = table.getState().pagination;
    const total = table.getPrePaginationRowModel().rows.length;
    const rows = table.getRowModel().rows;
    function value(cell) {
        const Cell = cell.column.columnDef.Cell;
        return Cell ? <Cell cell={cell} column={cell.column} row={cell.row} table={table} renderedCellValue={cell.getValue()} /> : String(cell.getValue() ?? 'Sin dato');
    }
    function fields(cells) {
        return <dl className="mobile-data-fields">{cells.map(cell => <div key={cell.id}><dt>{cell.column.columnDef.header}</dt><dd>{value(cell)}</dd></div>)}</dl>;
    }
    return <section className="mobile-data-table" aria-label="Lista de registros">
        <div className="mobile-data-toolbar">
            {table.options.enableGlobalFilter && <><label htmlFor={`${inputId}-search`}>Buscar en la lista</label>
            <input id={`${inputId}-search`} type="search" className="form-control" placeholder={searchPlaceholder} value={table.getState().globalFilter ?? ''} onChange={e => { table.setGlobalFilter(e.target.value); table.setPageIndex(0); }} /></>}
            <label htmlFor={`${inputId}-sort`}>Ordenar por</label>
            <select id={`${inputId}-sort`} className="form-select" value={sorting ? JSON.stringify([sorting.id, sorting.desc]) : ''} onChange={e => { const selected = e.target.value ? JSON.parse(e.target.value) : null; table.setSorting(selected ? [{ id: selected[0], desc: selected[1] }] : []); table.setPageIndex(0); }}>
                <option value="">Orden original</option>{sortable.flatMap(column => [false, true].map(desc => <option key={`${column.id}-${desc}`} value={JSON.stringify([column.id, desc])}>{column.columnDef.header} · {desc ? 'descendente' : 'ascendente'}</option>))}
            </select>
        </div>
        {!rows.length && <p role="status" className="p-3">{emptyMessage}</p>}
        <div className="mobile-data-records">{rows.map(row => {
            const cells = ((primaryColumns || secondaryColumns) ? row.getAllCells() : row.getVisibleCells()).filter(cell => !cell.column.id.startsWith('mrt-'));
            const primary = primaryColumns ? primaryColumns.map(id => cells.find(cell => cell.column.id === id)).filter(Boolean) : cells;
            const secondary = secondaryColumns ? secondaryColumns.map(id => cells.find(cell => cell.column.id === id)).filter(Boolean) : primaryColumns ? cells.filter(cell => !primaryColumns.includes(cell.column.id)) : [];
            const title = primary[0];
            return <article key={row.id} className="mobile-data-record">
                {title && <h3>{value(title)}</h3>}
                {fields(primary.slice(1))}
                {!!secondary.length && <details><summary>{detailsLabel}</summary>{fields(secondary)}</details>}
            </article>;
        })}</div>
        <div className="mobile-data-pagination">
            <label htmlFor={`${inputId}-size`}>Registros por página</label>
            <select id={`${inputId}-size`} className="form-select" value={pageSize} onChange={e => { table.setPageSize(Number(e.target.value)); table.setPageIndex(0); }}>{[10, 20, 50].map(size => <option key={size}>{size}</option>)}</select>
            <p role="status">{total ? `${pageIndex * pageSize + 1}–${Math.min((pageIndex + 1) * pageSize, total)} de ${total}` : '0 registros'}</p>
            <div><button type="button" className="btn btn-outline-secondary" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>Anterior</button><button type="button" className="btn btn-outline-secondary" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>Siguiente</button></div>
        </div>
    </section>;
}
