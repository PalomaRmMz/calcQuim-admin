import { useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router";
import Sidebar from "./layout/Sidebar";
import Header from "./layout/Header";
import ProductsModule from "./pages/ProductsModule";
import SalesPage from "./pages/SalesPage";
import PurchasesModule from "./pages/PurchasesModule";
import "./App.css";
import "./styles/components/ModalSystem.css";
import "./styles/components/SaleFormModal.css";
import "./styles/components/SaleDetailModal.css";
import "./styles/DesignSystem.css";
import { useCatalog } from "./context/CatalogHooks.js";
import Feedback from "./components/Feedback";
import ReportsPage from './pages/ReportsPage';
import InventoryPage from './pages/InventoryPage';

function App() {
  const { pathname } = useLocation();
  const sectionTitles = { '/compras/abastecimiento': 'Abastecimiento', '/compras/comparador': 'Comparador', '/compras/proveedores': 'Proveedores', '/productos/categorias': 'Categorías', '/productos/lineas': 'Líneas', '/productos/grupos': 'Grupos de precio' };
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { storageError } = useCatalog();

  if (storageError) return <main className="container py-4"><h1>CalcQuim</h1><Feedback message={storageError} /><Link to="/administracion/datos">Administración de datos: exportar o restablecer</Link></main>;

  return (
    <div className="app-layout">
      {mobileMenuOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      <main className={`main-content ${sidebarCollapsed ? "main-content-expanded" : ""}`}>
        <Routes>
          <Route path="/inventario" element={<><Header title="Inventario aproximado" subtitle="Existencias, movimientos y reposición" onOpenMenu={() => setMobileMenuOpen(true)} /><InventoryPage/></>} />
          <Route path="/" element={<Navigate to="/productos" replace />} />
          <Route path="/compras/:section?" element={<><Header title={sectionTitles[pathname] || 'Compras'} subtitle="Compras · Historial, abastecimiento y proveedores" onOpenMenu={() => setMobileMenuOpen(true)} /><PurchasesModule /></>} />
          <Route path="/compras/historial" element={<Navigate to="/compras" replace />} />
          <Route path="/administracion/proveedores" element={<Navigate to="/compras/proveedores" replace />} />
          <Route path="/reportes" element={<><Header title="Reportes" subtitle="Abastecimiento, rendimientos, compras y catálogo" onOpenMenu={() => setMobileMenuOpen(true)} /><ReportsPage /></>} />
          <Route path="*" element={<Navigate to="/productos" replace />} />
          <Route path="/ventas" element={<><Header title="Ventas" subtitle="Registra y consulta las ventas de CalcQuim" onOpenMenu={() => setMobileMenuOpen(true)} /><SalesPage /></>} />

          <Route
            path="/productos/:section?"
            element={
              <>
                <Header
                  title={sectionTitles[pathname] || 'Productos'}
                  subtitle="Administra tu catálogo de CalcQuim"
                  onOpenMenu={() => setMobileMenuOpen(true)}
                />
                <ProductsModule />
              </>
            }
          />

          <Route
            path="/categorias"
            element={<Navigate to="/productos/categorias" replace />}
          />
        </Routes>
      </main>
    </div>
  );
}

export default App;
