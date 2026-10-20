import { useState } from "react";
import { NavLink, useLocation } from "react-router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBox, faCartShopping, faChartColumn, faGear, faChevronLeft, faChevronRight, faChevronDown } from "@fortawesome/free-solid-svg-icons";
import "../styles/layout/Sidebar.css";

const menuItems = [
    { label: "Productos", icon: faBox, path: "/productos", children: [["Productos", "/productos"], ["Categorías", "/productos/categorias"], ["Líneas", "/productos/lineas"], ["Grupos de precio", "/productos/grupos"]] },
    { label: "Ventas", icon: faCartShopping, path: "/ventas" },
    { label: "Compras", icon: faCartShopping, path: "/compras", children: [["Historial", "/compras"], ["Abastecimiento", "/compras/abastecimiento"], ["Comparador", "/compras/comparador"], ["Proveedores", "/compras/proveedores"]] },
    { label: "Administración", icon: faGear, path: "/administracion", children: [["Datos y respaldos", "/administracion/datos"]] },
    { label: "Reportes", icon: faChartColumn, path: "/reportes" },
];

export default function Sidebar({ collapsed, setCollapsed, mobileMenuOpen, setMobileMenuOpen, activeModule }) {
    const { pathname, key } = useLocation();
    const activeGroup = activeModule || menuItems.find(item => item.children && (pathname === item.path || pathname.startsWith(`${item.path}/`)))?.path || null;
    const route = `${key}:${pathname}:${activeGroup}`;
    const [accordion, setAccordion] = useState({ route, openGroup: activeGroup });
    // Reset on every navigation, including Back/Forward to an earlier location key.
    // Render-time adjustment prevents displaying a stale group for one frame.
    const openGroup = accordion.route === route ? accordion.openGroup : activeGroup;
    if (accordion.route !== route) setAccordion({ route, openGroup: activeGroup });
    const compact = collapsed && !mobileMenuOpen;
    const closeMenu = () => setMobileMenuOpen?.(false);
    return <aside className={`sidebar ${compact ? "sidebar-collapsed" : ""} ${mobileMenuOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-header"><div className="brand-icon">C</div>{!compact && <div className="brand-text"><h1>CalcQuim</h1><span>Panel de Administración</span></div>}</div>
        <nav className="sidebar-menu" aria-label="Navegación principal">
            {menuItems.map(item => {
                if (!item.children) return <NavLink key={item.path} to={item.path} title={item.label} aria-label={item.label} className={({ isActive }) => `sidebar-item ${isActive ? "active" : ""}`} onClick={closeMenu}><FontAwesomeIcon icon={item.icon} className="sidebar-item-icon" />{!compact && <span>{item.label}</span>}</NavLink>;
                const active = activeModule ? activeModule === item.path : pathname === item.path || pathname.startsWith(`${item.path}/`);
                const expanded = !compact && openGroup === item.path;
                const controls = `navigation-${item.path.slice(1)}`;
                return <div key={item.path} className={`sidebar-group ${active ? "parent-active" : ""} ${expanded ? "group-open" : ""}`}>
                    <button type="button" className="sidebar-item sidebar-parent" title={item.label} aria-label={item.label} aria-expanded={expanded} aria-controls={controls} onClick={() => {
                        if (compact) setCollapsed?.(false);
                        setAccordion({ route, openGroup: compact || active || openGroup !== item.path ? item.path : null });
                    }}><FontAwesomeIcon icon={item.icon} className="sidebar-item-icon" />{!compact && <><span>{item.label}</span><FontAwesomeIcon icon={expanded ? faChevronDown : faChevronRight} className="sidebar-chevron" /></>}</button>
                    <div id={controls} className="sidebar-submenu" hidden={!expanded}>
                        {item.children.map(([label, path]) => <NavLink key={path} end to={path} className={({ isActive }) => `sidebar-child ${isActive || (activeModule === item.path && path === "/administracion/datos") ? "active" : ""}`} onClick={closeMenu}>{label}</NavLink>)}
                    </div>
                </div>;
            })}
        </nav>
        <div className="sidebar-footer">{!compact && <div><div>CalcQuim Admin</div><small>Uso personal</small></div>}<button type="button" className="sidebar-collapse-button" onClick={() => setCollapsed?.(!collapsed)} aria-label={collapsed ? "Expandir menú" : "Contraer menú"}><FontAwesomeIcon icon={collapsed ? faChevronRight : faChevronLeft} /></button></div>
    </aside>;
}
