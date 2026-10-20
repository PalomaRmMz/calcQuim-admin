import ActionMenu from '../components/ActionMenu';
import { categoryStyle } from '../utils/categoryColors.js';
import { unitLabel } from "../utils/units.js";
import { getProductDisplayName } from "../utils/catalogUtils.js";
import { getBadgeStyle } from "../utils/classificationUtils.js";
import { useProcurement } from "../context/ProcurementContext.js";
import { grossMargin, SOURCING_TYPES } from "../utils/procurementUtils.js";
import { unitCostText } from "../utils/purchaseUtils.js";
import Feedback from "../components/Feedback";
import ConfirmDialog from "../components/ConfirmDialog";
import { useState } from "react";
import { faBan, faBox, faCircleCheck, faDollarSign, faLayerGroup, faPlus, faTags } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import SummaryCard from "../components/SummaryCard";
import ContentPanel from "../components/ContentPanel";
import ExportExcelButton from "../components/ExportExcelButton";
import DataTable from "../components/DataTable";
import TableBadge from "../components/TableBadge";
import StatusBadge from "../components/StatusBadge";
import TableActions from "../components/TableActions";
import ProductFormModal from "../components/ProductFormModal";
import PriceGroupFormModal from "../components/PriceGroupFormModal";
import BatchEditProductsModal from "../components/BatchEditProductsModal";
import BatchAddProductsModal from "../components/BatchAddProductsModal";
import { useCatalog } from "../context/CatalogHooks.js";

function ProductsPage({ section = "products" } = {}) {
    const { analytics, error: procurementError } = useProcurement();
    const {
        categories,
        productLines,
        products,
        priceGroups,
        addProduct,
        updateProduct,
        deleteProduct,
        addPriceGroup,
        updatePriceGroup,
        deletePriceGroup,
        getProductPrice,
        isProductAvailable,
        updateProductsBatch,
        addProductsBatch,
    } = useCatalog();

    const [confirmation, setConfirmation] = useState(null);
    const [productModalOpen, setProductModalOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [priceGroupModalOpen, setPriceGroupModalOpen] = useState(false);
    const [selectedPriceGroup, setSelectedPriceGroup] = useState(null);
    const [batchModalOpen, setBatchModalOpen] = useState(false);
    const [batchAddModalOpen, setBatchAddModalOpen] = useState(false);

    const availableProducts = products.filter((product) => isProductAvailable(product)).length;
    const unavailableProducts = products.length - availableProducts;
    const activePriceGroups = priceGroups.filter((group) => group.active).length;
    const inactivePriceGroups = priceGroups.filter((group) => !group.active).length;
    const sortedProducts = [...products].sort((a, b) => getProductDisplayName(a, categories, productLines).localeCompare(getProductDisplayName(b, categories, productLines), "es"));
    const sortedPriceGroups = [...priceGroups].sort((a, b) => a.name.localeCompare(b.name, "es"));

    function getCategoryName(categoryId) {
        const category = categories.find((category) => category.id === categoryId);
        return category ? category.name : "Sin categoría";
    }

    function getLineName(lineId) {
        if (!lineId) return null;

        const line = productLines.find((line) => line.id === lineId);
        return line ? line.name : null;
    }

    function getPriceTypeName(product) {
        if (product.priceGroupId !== null && product.priceGroupId !== undefined) {
            const group = priceGroups.find((group) => group.id === product.priceGroupId);
            return group ? group.name : "Sin precio";
        }

        if (product.price !== null && product.price !== undefined) return "Individual";

        return "Sin precio";
    }

    function handleNewProduct() {
        setSelectedProduct(null);
        setProductModalOpen(true);
    }

    function handleEditProduct(product) {
        setSelectedProduct(product);
        setProductModalOpen(true);
    }

    function handleSaveProduct(productData) {
        if (selectedProduct) return updateProduct(selectedProduct.id, productData);
        return addProduct(productData);
    }

    function handleDeleteProduct(product) {
        setConfirmation({ name: getProductDisplayName(product, categories, productLines), action: () => deleteProduct(product.id) });
    }

    function handleNewPriceGroup() {
        setSelectedPriceGroup(null);
        setPriceGroupModalOpen(true);
    }

    function handleEditPriceGroup(group) {
        setSelectedPriceGroup(group);
        setPriceGroupModalOpen(true);
    }

    function handleSavePriceGroup(groupData) {
        if (selectedPriceGroup) return updatePriceGroup(selectedPriceGroup.id, groupData);
        return addPriceGroup(groupData);
    }

    function handleDeletePriceGroup(group) {
        setConfirmation({ name: group.name, action: () => deletePriceGroup(group.id) });
    }

    const productColumns = [
            {
                id: "name",
                header: "Producto",
                size: 200,
                accessorFn: (row) => getProductDisplayName(row, categories, productLines),
                Cell: ({ cell, row }) => <span className="table-text-primary category-accent" style={categoryStyle(categories.find(c => c.id === row.original.categoryId))}>{cell.getValue()}</span>,
            },
            {
                id: "category",
                header: "Categoría",
                size: 180,
                accessorFn: (row) => getCategoryName(row.categoryId),
                Cell: ({ cell, row }) => <span className="classification-label category-accent" style={categoryStyle(categories.find(c => c.id === row.original.categoryId))}>{cell.getValue()}</span>,
            },
            {
                id: "line",
                header: "Línea",
                size: 150,
                accessorFn: (row) => getLineName(row.lineId) || "---",
                Cell: ({ cell }) => <span className="table-text-muted">{cell.getValue()}</span>,
            },
            {
                id: "price",
                header: "Precio",
                size: 110,
                accessorFn: (row) => getProductPrice(row),
                Cell: ({ cell }) => {
                    const price = cell.getValue();

                    if (price === null || price === undefined) {
                        return <span className="table-text-muted">---</span>;
                    }

                    return <span className="table-money">${Number(price).toFixed(2)}</span>;
                },
            },
            {
                id: "priceType",
                header: "Tipo de precio",
                size: 170,
                accessorFn: (row) => getPriceTypeName(row),
                Cell: ({ cell, row }) => {
                    const product = row.original;
                    const value = cell.getValue();

                    if (product.priceGroupId !== null && product.priceGroupId !== undefined) {
                        return (
                            <TableBadge
                                variant="green"
                                style={getBadgeStyle(product.priceGroupId)}
                            >
                                {value}
                            </TableBadge>
                        );
                    }

                    if (product.price !== null && product.price !== undefined) {
                        return <TableBadge variant="blue">Individual</TableBadge>;
                    }
                    return <TableBadge variant="gray">Sin precio</TableBadge>;
                },
            },
            {
                accessorKey: "unit",
                header: "Unidad",
                size: 100,
            },
            {
                accessorKey: "active",
                header: "Estado",
                size: 120,
                Cell: ({ cell }) => <StatusBadge active={cell.getValue()} />,
            },
            {
                id: "availability",
                header: "Disponibilidad",
                size: 150,
                accessorFn: (row) => isProductAvailable(row),
                Cell: ({ cell }) => (
                    <StatusBadge
                        active={cell.getValue()}
                        activeText="Disponible"
                        inactiveText="No disponible"
                    />
                ),
            },
            { id: "lastCost", header: "Último costo efectivo pagado", accessorFn: (p) => analytics?.byProduct.get(p.id)?.lastPurchase?.cost ?? null, Cell: ({ cell, row }) => cell.getValue() === null ? "Pendiente" : `${unitCostText(cell.getValue())} / ${unitLabel(row.original.unit)}` },
            { id: "bestCost", header: "Mejor costo efectivo conocido", accessorFn: (p) => analytics?.byProduct.get(p.id)?.best?.cost ?? null, Cell: ({ cell, row }) => cell.getValue() === null ? "Sin costo comparable" : `${unitCostText(cell.getValue())} / ${unitLabel(row.original.unit)}` },
            { id: "bestAlternative", header: "Mejor alternativa", accessorFn: (p) => { const best = analytics?.byProduct.get(p.id)?.best; return best ? `${best.supplierName} · ${SOURCING_TYPES[best.snapshot.sourcingType]} · ${best.source} · ${best.date} · ${best.age.label}` : "Pendiente"; } },
            { id: "margin", header: "Margen bruto estimado", accessorFn: (p) => grossMargin(getProductPrice(p), analytics?.byProduct.get(p.id)?.best?.cost)?.percent ?? null, Cell: ({ cell }) => cell.getValue() === null ? "Pendiente" : `${cell.getValue().toFixed(1)}%` },
            {
                id: "actions",
                header: "Acciones",
                size: 110,
                enableSorting: false,
                Cell: ({ row }) => (
                    <TableActions
                        label={getProductDisplayName(row.original, categories, productLines)}
                        onEdit={() => handleEditProduct(row.original)}
                        onDelete={() => handleDeleteProduct(row.original)}
                    />
                ),
            },
        ];

    const priceGroupColumns = [
            {
                accessorKey: "name",
                header: "Grupo",
                size: 250,
                Cell: ({ cell }) => <span className="table-text-primary">{cell.getValue()}</span>,
            },
            {
                accessorKey: "price",
                header: "Precio",
                size: 120,
                Cell: ({ cell }) => (
                    <span className="table-money">${Number(cell.getValue()).toFixed(2)}</span>
                ),
            },
            {
                id: "productsCount",
                header: "Productos",
                size: 120,
                accessorFn: (row) =>
                    products.filter((product) => product.priceGroupId === row.id).length,
            },
            {
                accessorKey: "active",
                header: "Estado",
                size: 120,
                Cell: ({ cell }) => <StatusBadge active={cell.getValue()} />,
            },
            {
                id: "actions",
                header: "Acciones",
                size: 110,
                enableSorting: false,
                Cell: ({ row }) => (
                    <TableActions
                        label={row.original.name}
                        onEdit={() => handleEditPriceGroup(row.original)}
                        onDelete={() => handleDeletePriceGroup(row.original)}
                    />
                ),
            },
        ];

    const isProductsTab = section === "products";

    return (
        <div className="container-fluid px-0">
            <Feedback message={procurementError} />
            {confirmation && <ConfirmDialog onClose={() => setConfirmation(null)} onConfirm={confirmation.action}>¿Eliminar "{confirmation.name}"? Solo se permite si no tiene registros asociados.</ConfirmDialog>}


            {isProductsTab ? (
                <>
                    <div className="row row-cols-1 row-cols-sm-2 row-cols-xl-5 g-3 mb-4">
                        <SummaryCard
                            value={products.length}
                            title="Productos totales"
                            icon={faBox}
                            variant="blue"
                            columnClass="col"
                        />

                        <SummaryCard
                            value={availableProducts}
                            title="Disponibles"
                            icon={faCircleCheck}
                            variant="green"
                            columnClass="col"
                        />

                        <SummaryCard
                            value={unavailableProducts}
                            title="No disponibles"
                            icon={faBan}
                            variant="purple"
                            columnClass="col"
                        />

                        <SummaryCard
                            value={categories.length}
                            title="Categorías"
                            icon={faTags}
                            variant="yellow"
                            columnClass="col"
                        />

                        <SummaryCard
                            value={productLines.length}
                            title="Líneas de producto"
                            icon={faLayerGroup}
                            variant="blue"
                            columnClass="col"
                        />
                    </div>

                    <ContentPanel
                        title="Lista de productos"
                        subtitle="Consulta y administra los productos disponibles en CalcQuim."
                        action={
                            <div className="d-flex flex-wrap gap-2">
                                <ExportExcelButton scope="products" />
                                <ActionMenu label="Acciones por lote" actions={[{ label: 'Agregar por lote', onClick: () => setBatchAddModalOpen(true) }, { label: 'Editar por lote', onClick: () => setBatchModalOpen(true) }]} />

                                <button type="button" className="btn btn-primary" onClick={handleNewProduct}>
                                    <FontAwesomeIcon icon={faPlus} className="me-2" />
                                    Nuevo producto
                                </button>
                            </div>
                        }
                    >
                        <details className="filter-details"><summary>Sobre costos y márgenes</summary><p className="form-text">Estiman el insumo por unidad final; no incluyen envase, preparación ni flete. Consulta fecha y fuente en Compras → Comparador.</p></details>
                        <DataTable
                            emptyMessage="No hay productos que coincidan. Usa Nuevo producto para registrar lo que vendes o ajusta la búsqueda."
                            columns={productColumns}
                            columnOrder={["name", "price", "unit", "active", "actions", "category", "line", "availability", "id", "priceType", "lastCost", "bestCost", "bestAlternative", "margin"]}
                            data={sortedProducts}
                            searchPlaceholder="Buscar producto..."
                            columnVisibility={{ line: false, availability: false, lastCost: false, bestAlternative: false, margin: false,
                                id: false,
                                unit: true,
                                priceType: false,
                            }}
                            initialSorting={[
                                { id: "category", desc: false },
                                { id: "line", desc: false },
                            ]}
                        />
                    </ContentPanel>
                </>
            ) : (
                <>
                    <div className="row g-3 mb-4">
                        <SummaryCard
                            value={priceGroups.length}
                            title="Grupos totales"
                            icon={faDollarSign}
                            variant="blue"
                            columnClass="col-12 col-md-4"
                        />

                        <SummaryCard
                            value={activePriceGroups}
                            title="Grupos activos"
                            icon={faCircleCheck}
                            variant="green"
                            columnClass="col-12 col-md-4"
                        />

                        <SummaryCard
                            value={inactivePriceGroups}
                            title="Grupos inactivos"
                            icon={faBan}
                            variant="purple"
                            columnClass="col-12 col-md-4"
                        />
                    </div>

                    <ContentPanel
                        title="Grupos de precio"
                        subtitle="Administra precios compartidos por varios productos."
                        action={
                            <button type="button" className="btn btn-primary" onClick={handleNewPriceGroup}>
                                <FontAwesomeIcon icon={faPlus} className="me-2" />
                                Nuevo grupo
                            </button>
                        }
                    >
                        <DataTable
                            emptyMessage="No hay grupos de precio que coincidan. Crea un grupo para compartir precios entre productos."
                            columns={priceGroupColumns}
                            data={sortedPriceGroups}
                            searchPlaceholder="Buscar grupo..."
                        />
                    </ContentPanel>
                </>
            )}

            {productModalOpen && <ProductFormModal
                show={productModalOpen}
                product={selectedProduct}
                categories={categories}
                productLines={productLines}
                priceGroups={priceGroups}
                onClose={() => setProductModalOpen(false)}
                onSave={handleSaveProduct}
            />}

            {priceGroupModalOpen && <PriceGroupFormModal
                show={priceGroupModalOpen}
                priceGroup={selectedPriceGroup}
                onClose={() => setPriceGroupModalOpen(false)}
                onSave={handleSavePriceGroup}
            />}

            {batchAddModalOpen && <BatchAddProductsModal
                show={batchAddModalOpen}
                products={products}
                categories={categories}
                productLines={productLines}
                priceGroups={priceGroups}
                onClose={() => setBatchAddModalOpen(false)}
                onSave={addProductsBatch}
            />}

            {batchModalOpen && <BatchEditProductsModal
                show={batchModalOpen}
                products={products}
                categories={categories}
                productLines={productLines}
                priceGroups={priceGroups}
                onClose={() => setBatchModalOpen(false)}
                onSave={updateProductsBatch}
            />}
        </div>
    );
}

export default ProductsPage;
