import { Navigate, useParams } from "react-router";
import ProductsPage from "./ProductsPage";
import CategoriesPage from "./CategoriesPage";

export default function ProductsModule() {
    const { section = "productos" } = useParams();
    if (!["productos", "categorias", "lineas", "grupos"].includes(section)) return <Navigate to="/productos" replace />;
    return <>
        {["categorias", "lineas"].includes(section)
            ? <CategoriesPage key={section} section={section === "lineas" ? "lines" : "categories"} />
            : <ProductsPage key={section} section={section === "grupos" ? "priceGroups" : "products"} />}
    </>;
}
