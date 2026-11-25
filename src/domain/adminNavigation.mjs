export const adminNavigation=[
 {id:'operaciones',label:'Operaciones',icon:'cart',items:[
  {label:'Ventas',path:'/ventas'},
  {label:'Compras',path:'/compras',links:[['Historial y captura','/compras'],['Planificación de compras','/compras/planificacion'],['Abastecimiento de limpieza','/compras/abastecimiento']]},
  {label:'Lavandería',path:'/lavanderia'},
 ]},
 {id:'catalogo',label:'Catálogo e inventarios',icon:'box',items:[
  {label:'Productos',links:[['Productos de limpieza','/productos'],['Productos de jarcería','/productos-jarceria']]},
  {label:'Inventarios',links:[['Existencias de limpieza','/inventarios/limpieza'],['Existencias de jarcería','/inventarios/jarceria']]},
  {label:'Proveedores',path:'/proveedores'},
 ]},
 {id:'analisis',label:'Análisis',icon:'chart',items:[
  {label:'Reportes',path:'/reportes',...(import.meta.env?.CALCQUIM_OPERATIONAL?{}:{links:[['Reportes','/reportes'],['Reportes comerciales','/reportes/comerciales']]})},
  {label:'Comparadores',links:[['Comparador de limpieza','/comparadores/limpieza'],['Comparador de jarcería','/comparadores/jarceria']]},
 ]},
];

export const navigationPathMatches=(pathname,path)=>pathname===path||pathname.startsWith(path+'/');
export const activeNavigationSection=pathname=>adminNavigation.find(section=>section.items.some(item=>
 item.links?item.links.some(([,path])=>navigationPathMatches(pathname,path)):navigationPathMatches(pathname,item.path)
))?.id;
