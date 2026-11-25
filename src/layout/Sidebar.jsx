import {activeNavigationSection,adminNavigation,navigationPathMatches} from '../domain/adminNavigation.mjs';
import {useState} from 'react';
import {NavLink,useLocation} from 'react-router';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faBars,faHouse,faBox,faCartShopping,faChartColumn,faChevronLeft,faChevronRight,faChevronDown} from '@fortawesome/free-solid-svg-icons';
import '../styles/layout/Sidebar.css';

const icons={box:faBox,cart:faCartShopping,chart:faChartColumn};

export function MenuToggle({onClick,expanded}){
 return <button type="button" className="mobile-menu-button" aria-label="Abrir menú" aria-controls="nexo-sidebar" aria-expanded={expanded} onClick={onClick}>
  <FontAwesomeIcon icon={faBars}/>
 </button>;
}

export default function Sidebar({collapsed,setCollapsed,mobileMenuOpen,setMobileMenuOpen}){
 const {pathname,key}=useLocation();
 const active=activeNavigationSection(pathname);
 const [sectionChoice,setSectionChoice]=useState(null);
 const openSection=sectionChoice?.key===key?sectionChoice.id:active;
 const compact=collapsed&&!mobileMenuOpen;
 const closeMenu=()=>setMobileMenuOpen?.(false);
 return <aside id="nexo-sidebar" className={`sidebar ${compact?'sidebar-collapsed':''} ${mobileMenuOpen?'mobile-open':''}`}>
  <div className="sidebar-header"><div className="brand-icon">N</div>{!compact&&<div className="brand-text"><h1>Nexo</h1><span>Panel de Administración</span></div>}</div>
  <nav className="sidebar-menu" aria-label="Navegación principal">
   <NavLink end to="/" onClick={closeMenu} className={({isActive})=>`sidebar-item ${isActive?'active':''}`} aria-label="Inicio"><FontAwesomeIcon icon={faHouse} className="sidebar-item-icon"/>{!compact&&'Inicio'}</NavLink>
   {adminNavigation.map(section=>{
    const expanded=!compact&&openSection===section.id;
    const controls=`navigation-${section.id}`;
    const current=active===section.id&&!compact&&!expanded&&section.items
      .flatMap(item=>item.links??[[item.label,item.path]])
      .filter(([,path])=>navigationPathMatches(pathname,path))
      .sort((a,b)=>b[1].length-a[1].length)[0];
    return <div key={section.id} className={`sidebar-group ${section.id===active?'parent-active':''}`}>
     <button type="button" className="sidebar-item sidebar-parent" title={section.label} aria-label={section.label} aria-expanded={expanded} aria-controls={controls}
      onClick={()=>{if(compact)setCollapsed(false);setSectionChoice({key,id:expanded?null:section.id});}}>
      <FontAwesomeIcon icon={icons[section.icon]} className="sidebar-item-icon"/>
      {!compact&&<><span>{section.label}</span><FontAwesomeIcon icon={expanded?faChevronDown:faChevronRight} className="sidebar-chevron"/></>}
     </button>
     <div id={controls} className="sidebar-submenu" hidden={!expanded}>
      {section.items.map(item=>item.links?<div key={item.label}>
       <div className="sidebar-subheading">{item.label}</div>
       {item.links.map(([label,path])=><NavLink key={path} end={item.path===path} to={path} onClick={closeMenu} className={({isActive})=>`sidebar-child ${isActive?'active':''}`}>{label}</NavLink>)}
      </div>:<NavLink key={item.path} to={item.path} onClick={closeMenu} className={({isActive})=>`sidebar-child ${isActive?'active':''}`}>{item.label}</NavLink>)}
     </div>
     {current&&<NavLink to={current[1]} className={({isActive})=>`sidebar-child sidebar-current ${isActive?'active':''}`} onClick={closeMenu}>{current[0]}</NavLink>}
    </div>;
   })}
  </nav>
  <div className="sidebar-footer">{!compact&&<span>Nexo · Administración</span>}
   <button type="button" className="sidebar-collapse-button" onClick={()=>setCollapsed(!collapsed)} aria-label={collapsed?'Expandir menú':'Contraer menú'}>
    <FontAwesomeIcon icon={collapsed?faChevronRight:faChevronLeft}/>
   </button>
  </div>
 </aside>;
}
