import { categoryStyle } from '../utils/categoryColors.js';
import ConfirmDialog from "../components/ConfirmDialog";
import { useState } from "react";
import { faBan, faCircleCheck, faLayerGroup, faPlus, faTags } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import SummaryCard from "../components/SummaryCard";
import ContentPanel from "../components/ContentPanel";
import DataTable from "../components/DataTable";
import StatusBadge from "../components/StatusBadge";
import TableActions from "../components/TableActions";
import CategoryFormModal from "../components/CategoryFormModal";
import ProductLineFormModal from "../components/ProductLineFormModal";
import { useCatalog } from "../context/CatalogHooks.js";

function CategoriesPage({ section = "categories" } = {}) {
    const {
        categories,
        productLines,
        products,
        addCategory,
        updateCategory,
        deleteCategory,
        addProductLine,
        updateProductLine,
        deleteProductLine,
    } = useCatalog();

    const [confirmation, setConfirmation] = useState(null);
    const [categoryModalOpen, setCategoryModalOpen] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [lineModalOpen, setLineModalOpen] = useState(false);
    const [selectedLine, setSelectedLine] = useState(null);

    const activeCategories = categories.filter((category) => category.active).length;
    const inactiveCategories = categories.filter((category) => !category.active).length;
    const activeLines = productLines.filter((line) => line.active).length;
    const inactiveLines = productLines.filter((line) => !line.active).length;

    const sortedCategories = [...categories].sort((a, b) => a.name.localeCompare(b.name, "es"));
    const sortedProductLines = [...productLines].sort((a, b) => a.name.localeCompare(b.name, "es"));

    const selectedLineHasProducts = selectedLine
        ? products.some((product) => product.lineId === selectedLine.id)
        : false;

    function getCategoryName(categoryId) {
        const category = categories.find((category) => category.id === categoryId);
        return category ? category.name : "Sin categoría";
    }

    function handleNewCategory() {
        setSelectedCategory(null);
        setCategoryModalOpen(true);
    }

    function handleEditCategory(category) {
        setSelectedCategory(category);
        setCategoryModalOpen(true);
    }

    function handleSaveCategory(categoryData) {
        if (selectedCategory) return updateCategory(selectedCategory.id, categoryData);
        return addCategory(categoryData);
    }

    function handleDeleteCategory(category) {
        setConfirmation({ name: category.name, action: () => deleteCategory(category.id) });
    }

    function handleNewLine() {
        setSelectedLine(null);
        setLineModalOpen(true);
    }

    function handleEditLine(line) {
        setSelectedLine(line);
        setLineModalOpen(true);
    }

    function handleSaveLine(lineData) {
        if (selectedLine) return updateProductLine(selectedLine.id, lineData);
        return addProductLine(lineData);
    }

    function handleDeleteLine(line) {
        setConfirmation({ name: line.name, action: () => deleteProductLine(line.id) });
    }

    const categoryColumns = [
            {
                accessorKey: "name",
                header: "Categoría",
                size: 280,
                Cell: ({ cell, row }) => <span className="classification-label category-accent" style={categoryStyle(row.original)}>{cell.getValue()}</span>,
            },
            {
                id: "productPrefix",
                header: "Prefijo en productos",
                size: 180,
                accessorFn: (row) => Boolean(row.useAsProductPrefix),
                Cell: ({ cell }) => (
                    <span className="table-text-muted">
                        {cell.getValue() ? "Sí" : "No"}
                    </span>
                ),
            },
            {
                accessorKey: "active",
                header: "Estado",
                size: 140,
                Cell: ({ cell }) => (
                    <StatusBadge
                        active={cell.getValue()}
                        activeText="Activa"
                        inactiveText="Inactiva"
                    />
                ),
            },
            {
                id: "actions",
                header: "Acciones",
                size: 120,
                enableSorting: false,
                Cell: ({ row }) => (
                    <TableActions
                        label={row.original.name}
                        onEdit={() => handleEditCategory(row.original)}
                        onDelete={() => handleDeleteCategory(row.original)}
                    />
                ),
            },
        ];

    const lineColumns = [
            {
                accessorKey: "name",
                header: "Línea",
                size: 250,
                Cell: ({ cell }) => <span className="table-text-primary">{cell.getValue()}</span>,
            },
            {
                id: "category",
                header: "Categoría",
                size: 220,
                accessorFn: (row) => getCategoryName(row.categoryId),
                Cell: ({ cell }) => <span className="table-text-muted">{cell.getValue()}</span>,
            },
            {
                accessorKey: "active",
                header: "Estado",
                size: 140,
                Cell: ({ cell }) => (
                    <StatusBadge
                        active={cell.getValue()}
                        activeText="Activa"
                        inactiveText="Inactiva"
                    />
                ),
            },
            {
                id: "actions",
                header: "Acciones",
                size: 120,
                enableSorting: false,
                Cell: ({ row }) => (
                    <TableActions
                        label={row.original.name}
                        onEdit={() => handleEditLine(row.original)}
                        onDelete={() => handleDeleteLine(row.original)}
                    />
                ),
            },
        ];

    const isCategoriesTab = section === "categories";

    return (
        <div className="container-fluid px-0">
            {confirmation && <ConfirmDialog onClose={() => setConfirmation(null)} onConfirm={confirmation.action}>¿Eliminar "{confirmation.name}"? Solo se permite si no tiene registros asociados.</ConfirmDialog>}


            <div className="row g-3 mb-4">
                <SummaryCard
                    value={isCategoriesTab ? categories.length : productLines.length}
                    title={isCategoriesTab ? "Categorías totales" : "Líneas totales"}
                    icon={isCategoriesTab ? faTags : faLayerGroup}
                    variant="blue"
                    columnClass="col-12 col-md-4"
                />

                <SummaryCard
                    value={isCategoriesTab ? activeCategories : activeLines}
                    title={isCategoriesTab ? "Categorías activas" : "Líneas activas"}
                    icon={faCircleCheck}
                    variant="green"
                    columnClass="col-12 col-md-4"
                />

                <SummaryCard
                    value={isCategoriesTab ? inactiveCategories : inactiveLines}
                    title={isCategoriesTab ? "Categorías inactivas" : "Líneas inactivas"}
                    icon={faBan}
                    variant="purple"
                    columnClass="col-12 col-md-4"
                />
            </div>

            {isCategoriesTab ? (
                <ContentPanel
                    title="Lista de categorías"
                    subtitle="Administra las categorías disponibles para tus productos."
                    action={
                        <button type="button" className="btn btn-primary" onClick={handleNewCategory}>
                            <FontAwesomeIcon icon={faPlus} className="me-2" />
                            Nueva categoría
                        </button>
                    }
                >
                    <DataTable
                        emptyMessage="No hay categorías que coincidan. Usa Nueva categoría para organizar tus productos."
                        columns={categoryColumns}
                        data={sortedCategories}
                        searchPlaceholder="Buscar categoría..."
                    />
                </ContentPanel>
            ) : (
                <ContentPanel
                    title="Líneas de producto"
                    subtitle="Administra las líneas o familias asociadas a tus categorías."
                    action={
                        <button type="button" className="btn btn-primary" onClick={handleNewLine}>
                            <FontAwesomeIcon icon={faPlus} className="me-2" />
                            Nueva línea
                        </button>
                    }
                >
                    <DataTable
                        emptyMessage="No hay líneas que coincidan. Usa Nueva línea para clasificar productos dentro de una categoría."
                        columns={lineColumns}
                        data={sortedProductLines}
                        searchPlaceholder="Buscar línea..."
                    />
                </ContentPanel>
            )}

            {categoryModalOpen && <CategoryFormModal
                show={categoryModalOpen}
                category={selectedCategory}
                onClose={() => setCategoryModalOpen(false)}
                onSave={handleSaveCategory}
            />}

            {lineModalOpen && <ProductLineFormModal
                show={lineModalOpen}
                line={selectedLine}
                categories={categories}
                hasProducts={selectedLineHasProducts}
                onClose={() => setLineModalOpen(false)}
                onSave={handleSaveLine}
            />}
        </div>
    );
}

export default CategoriesPage;
