import HardwareCategoriesPage from './pages/HardwareCategoriesPage.jsx';
import HardwareProductsPage from './pages/HardwareProductsPage.jsx';
import HardwareComparatorPage from './pages/HardwareComparatorPage.jsx';
import LaundryPage from './pages/LaundryPage.jsx';
import PurchasePlanningPage from './pages/PurchasePlanningPage.jsx';
import SuppliersPanel from './pages/SuppliersPanel.jsx';
import ProcurementComparator from './pages/ProcurementComparator.jsx';
import CleaningScope from './components/CleaningScope.jsx';
import CommercePage from './pages/CommercePage.jsx';
import { useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router";
import Sidebar,{MenuToggle} from "./layout/Sidebar";
import HomePage from './pages/HomePage';
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
import SupplyInventoryPage from './pages/SupplyInventoryPage';

const cleaningTabs = [['Productos','/productos'],['Categorías','/productos/categorias'],['Líneas','/productos/lineas'],['Grupos de precio','/productos/grupos']];
const hardwareTabs = [['Productos','/productos-jarceria'],['Categorías','/productos-jarceria/categorias']];

function CatalogTabs({label,links}) {
  return <nav className="page-tabs mb-3" aria-label={label}>
    {links.map(([name,path])=><NavLink key={path} end to={path} className="page-tab">{name}</NavLink>)}
  </nav>;
}

function App({connection}) {
  const { pathname } = useLocation();
  const sectionTitles = { '/compras/abastecimiento': 'Abastecimiento', '/compras/comparador': 'Comparador', '/compras/proveedores': 'Proveedores', '/productos/categorias': 'Categorías', '/productos/lineas': 'Líneas', '/productos/grupos': 'Grupos de precio' };
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { storageError } = useCatalog();

  if (storageError) return <main className="container py-4"><h1>Nexo · Administración</h1><Feedback message={storageError} /><Link to="/administracion/datos">Administración de datos: exportar o restablecer</Link></main>;

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
        <div className="nexo-utility"><MenuToggle onClick={()=>setMobileMenuOpen(true)} expanded={mobileMenuOpen}/>{connection}</div>
        <Routes>
          {!import.meta.env.CALCQUIM_OPERATIONAL&&<Route path="/comercial" element={<Navigate to="/reportes/comerciales" replace/>}/>}
          {!import.meta.env.CALCQUIM_OPERATIONAL&&<Route path="/reportes/comerciales" element={<CommercePage reportOnly/>}/>}
          <Route path="/proveedores" element={<SuppliersPanel/>}/>
          <Route path="/productos-jarceria" element={<><Header title="Productos de jarcería" subtitle="Administra tu catálogo de Nexo" /><CatalogTabs label="Catálogo de jarcería" links={hardwareTabs}/><HardwareProductsPage/></>}/>
          <Route path="/productos-jarceria/categorias" element={<><Header title="Categorías de jarcería" subtitle="Organiza el catálogo de jarcería" /><CatalogTabs label="Catálogo de jarcería" links={hardwareTabs}/><HardwareCategoriesPage/></>}/>
          <Route path="/lavanderia" element={<LaundryPage/>}/>
          <Route path="/comparadores/limpieza" element={<CleaningScope><ProcurementComparator/></CleaningScope>}/>
          <Route path="/comparadores/jarceria" element={<HardwareComparatorPage/>}/>
          <Route path="/inventarios/limpieza" element={<InventoryPage key="cleaning" activity="LIMPIEZA"/>}/>
          <Route path="/inventarios/jarceria" element={<InventoryPage key="hardware" activity="JARCERIA"/>}/>
          <Route path="/inventarios/insumos" element={<SupplyInventoryPage/>}/>
          <Route path="/compras/proveedores" element={<Navigate to="/proveedores" replace/>}/>
          <Route path="/compras/comparador" element={<Navigate to="/comparadores/limpieza" replace/>}/>
          <Route path="/compras/planificacion" element={<PurchasePlanningPage/>}/>
          <Route path="/inventario" element={<><Header title="Inventario aproximado" subtitle="Existencias, movimientos y reposición" /><InventoryPage key="legacy-cleaning" activity="LIMPIEZA"/></>} />
          <Route path="/" element={<HomePage />} />
          <Route path="/administracion/datos" element={<Navigate to="/" replace/>}/>
          <Route path="/datos" element={<Navigate to="/" replace/>}/>
          <Route path="/compras/:section?" element={<><Header title={sectionTitles[pathname] || 'Compras'} subtitle="Compras · Historial, abastecimiento y proveedores" /><PurchasesModule /></>} />
          <Route path="/compras/historial" element={<Navigate to="/compras" replace />} />
          <Route path="/administracion/proveedores" element={<Navigate to="/compras/proveedores" replace />} />
          <Route path="/reportes" element={<><Header title="Reportes" subtitle="Abastecimiento, rendimientos, compras y catálogo" /><ReportsPage /></>} />
          <Route path="*" element={<Navigate to="/" replace />} />
          <Route path="/ventas" element={<><Header title="Ventas" subtitle="Registra y consulta las ventas de Nexo" /><SalesPage /></>} />

          <Route
            path="/productos/:section?"
            element={
              <>
                <Header
                  title={sectionTitles[pathname] || 'Productos de limpieza'}
                  subtitle="Administra tu catálogo de Nexo"
                />
                <CatalogTabs label="Catálogo de limpieza" links={cleaningTabs}/>
                <CleaningScope><ProductsModule /></CleaningScope>
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
