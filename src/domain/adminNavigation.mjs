export const adminNavigation=[
 {label:'Proveedores',icon:'box',path:'/proveedores'},
 {label:'Productos de limpieza',icon:'box',path:'/productos',children:[['Productos','/productos'],['Categorías','/productos/categorias'],['Líneas','/productos/lineas'],['Grupos de precio','/productos/grupos']]},
 {label:'Productos de jarcería',icon:'box',path:'/productos-jarceria',children:[['Productos','/productos-jarceria'],['Categorías','/productos-jarceria/categorias']]},
 {label:'Compras',icon:'cart',path:'/compras',children:[['Historial y captura','/compras'],['Abastecimiento de limpieza','/compras/abastecimiento']]},
 {label:'Comparadores',icon:'chart',path:'/comparadores',children:[['Comparador de limpieza','/comparadores/limpieza'],['Comparador de jarcería','/comparadores/jarceria']]},
 {label:'Inventarios',icon:'box',path:'/inventarios',children:[['Inventario de limpieza','/inventarios/limpieza'],['Inventario de jarcería','/inventarios/jarceria']]},
 {label:'Lavandería',icon:'box',path:'/lavanderia'},
 {label:'Ventas',icon:'cart',path:'/ventas'},
 {label:'Reportes',icon:'chart',path:'/reportes',...(import.meta.env?.CALCQUIM_OPERATIONAL?{}:{children:[['Reportes existentes','/reportes'],['Reportes comerciales','/reportes/comerciales']]})},
 {label:'Administración',icon:'gear',path:'/administracion',children:[['Datos y respaldos','/administracion/datos']]},
];
