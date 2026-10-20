import { MaterialReactTable, useMaterialReactTable } from "material-react-table";
import { MRT_Localization_ES } from "material-react-table/locales/es";
import { useMediaQuery } from '@mui/material';
import MobileDataTable from './MobileDataTable';
import "../styles/components/DataTable.css";

function DataTable({
    columns,
    data,
    searchPlaceholder = "Buscar...",
    columnVisibility = {},
    initialSorting = [],
    columnOrder,
    mobileCards = false,
    mobilePrimaryColumns,
    mobileSecondaryColumns,
    mobileDetailsLabel,
    pinActions = false,
    emptyMessage = "No hay registros para mostrar. Revisa la búsqueda y los filtros.",
}) {
    const smallScreen = useMediaQuery('(max-width: 767.98px)');
    const table = useMaterialReactTable({
        columns,
        data,
        localization: MRT_Localization_ES,
        enableSorting: true,
        enableGlobalFilter: true,
        enableColumnFilters: false,
        enableDensityToggle: false,
        enableFullScreenToggle: false,
        enableColumnActions: false,
        enableHiding: true,
        enableColumnPinning: pinActions,
        renderEmptyRowsFallback: () => <p className="text-muted p-4 mb-0" role="status">{emptyMessage}</p>,
        paginationDisplayMode: "pages",
        muiPaginationProps: {
            getItemAriaLabel: (type, page) => type === 'page' ? `Página ${page}` : ({ previous: 'Página anterior', next: 'Página siguiente', first: 'Primera página', last: 'Última página' }[type] || 'Paginación'),
        },

        initialState: {
            density: "compact",
            pagination: {
                pageIndex: 0,
                pageSize: 10,
            },
            showGlobalFilter: true,
            columnVisibility,
            sorting: initialSorting,
            ...(columnOrder ? { columnOrder } : {}),
            ...(pinActions ? { columnPinning: { right: ['actions'] } } : {}),
        },

        muiSearchTextFieldProps: {
            placeholder: searchPlaceholder,
            size: "small",
            variant: "outlined",
        },

        muiTablePaperProps: {
            elevation: 0,
            className: "data-table-paper",
        },

        muiTableHeadCellProps: {
            className: "data-table-header-cell",
        },

        muiTableBodyCellProps: {
            className: "data-table-body-cell",
        },

        muiTableBodyRowProps: {
            className: "data-table-row",
        },
    });

    if (mobileCards && smallScreen) return <MobileDataTable table={table} searchPlaceholder={searchPlaceholder} emptyMessage={emptyMessage} primaryColumns={mobilePrimaryColumns} secondaryColumns={mobileSecondaryColumns} detailsLabel={mobileDetailsLabel} />;

    return (
        <div className="data-table-wrapper">
            <MaterialReactTable table={table} />
        </div>
    );
}

export default DataTable;
