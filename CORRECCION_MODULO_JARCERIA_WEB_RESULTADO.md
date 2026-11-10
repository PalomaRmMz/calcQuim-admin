# Corrección visible de Productos de jarcería

**Aplicada en la web operativa el 7 de noviembre de 2026.** Productos de jarcería ahora es una sección desplegable con **Productos** y **Categorías**. No contiene Líneas ni Grupos de precio.

## Menú y rutas

| Acceso | Ruta | Resultado |
|---|---|---|
| Productos de jarcería → Productos | `/productos-jarceria` | Listado, precios, categorías, presentaciones, estado, búsqueda, filtros y alta/edición |
| Productos de jarcería → Categorías | `/productos-jarceria/categorias` | Pantalla propia con listado, búsqueda, número de productos asignados, estado, alta y edición |

La ruta anterior de productos sigue funcionando. El grupo del menú se abre y marca la opción correspondiente al navegar, utilizando el mismo componente que Limpieza. También existe un enlace a Categorías dentro de Productos.

## Productos y precios

Se separó **Precio** de **Presentaciones** y se colocó junto al nombre del producto, para que el precio sea visible sin tener que interpretar una columna combinada. Cada importe corresponde a su presentación y unidad de venta; no se inventa un precio único cuando existen varias presentaciones. Los importes ausentes se indican como «Sin precio».

El listado conserva categoría, presentación/contenido, unidad de inventario, estado y acciones de edición. La búsqueda incluye los datos de las presentaciones; siguen disponibles los filtros por categoría y estado. En la vista estrecha, Precio y Categoría forman parte de la información principal de la tarjeta.

Se conservan el editor existente, el inicial opcional y el alta por lote. No se cambiaron factores, precios, existencias ni reglas comerciales para mostrar la información.

## Categorías

Se reutilizaron `hardwareCategories`, `hardwareCategoryId` y el comando existente `saveHardwareCategory`. No hay migración ni nuevas relaciones de base de datos. Las categorías siguen siendo independientes de Limpieza.

La pantalla permite crear y editar categorías, activarlas/desactivarlas y ver cuántos productos de jarcería tienen cada asignación. El editor de productos utiliza esas mismas categorías y conserva las asignaciones existentes, incluidas las categorías inactivas ya asignadas. No se incorpora eliminación de categorías ni se reclasifican productos automáticamente.

En la lectura operativa había **cero categorías de jarcería registradas**. Por ello su pantalla aparece vacía con la acción «Nueva categoría». No se crearon categorías ficticias para llenar el listado. Crear, editar y asignar una categoría se verificó guardando únicamente en PostgreSQL QA.

## Archivos modificados

- [src/domain/adminNavigation.mjs](src/domain/adminNavigation.mjs): submenú de jarcería con las dos opciones requeridas.
- [src/App.jsx](src/App.jsx): ruta y encabezado de Categorías de jarcería.
- [src/pages/HardwareProductsPage.jsx](src/pages/HardwareProductsPage.jsx): columna Precio, presentaciones separadas, prioridad de campos en tarjetas y enlace a categorías.
- [src/pages/HardwareCategoriesPage.jsx](src/pages/HardwareCategoriesPage.jsx): nueva pantalla de categorías.
- [src/components/HardwareCatalogTools.jsx](src/components/HardwareCatalogTools.jsx): reutilización del editor de categorías con selección inicial y listado opcional.

[Manifiesto de los cinco archivos y hashes](artifacts/web-jarceria-visible-20261107/publish-list.json). Los cuatro originales existentes se conservaron en `artifacts/web-jarceria-visible-20261107/frontend-original.zip` antes de publicar.

## Validación

- **302 pruebas web aprobadas, cero fallos**, sobre la copia QA con la corrección. [Log](artifacts/web-jarceria-visible-20261107/tests.log).
- Build QA y build operativo aprobados; se comprobó explícitamente código de salida 0 del build operativo. Persiste el aviso de tamaño de chunks. [Build operativo](artifacts/web-jarceria-visible-20261107/operational-build.log).
- Navegador QA: creación y edición de categoría, asignación al producto de ensayo, filtro por categoría, búsqueda y precio visible en escritorio y a 390 px. Los guardados fueron al backend aislado de `calcquim_activation_test`, nunca a operación.
- Navegador operativo: menú con exactamente Productos y Categorías, rutas directas, columna Precio con importes reales y formulario de categoría abierto y cerrado **sin guardar**.
- Después de publicar: health/live **200**, health/ready **200** y gestor listo, sin advertencia móvil.

La publicación se realizó con cierre breve del gestor administrado, comprobando que Vite no estuviera usando el árbol al copiar los cinco archivos, y posterior arranque del mismo mecanismo. PostgreSQL no se reinició.

## Conservación de operación

La consulta anterior a publicar ya estaba en **revisión 181**, generación `39656fe8-6025-4740-8f19-8b767f1e9a9c`, con **96 productos, 25 de jarcería**. Estos cambios recientes del propietario se conservaron; no se restauró la revisión 177 de la activación anterior.

La comparación posterior confirmó **dataset completo e inventario idénticos**, manteniendo revisión 181 y generación. No hubo escrituras de datos operativos, migraciones ni modificaciones de configuración comercial por esta corrección.

Se verificaron sin cambios los archivos publicados del backend y de ventas/inventarios, y los hashes de siete módulos de la aplicación móvil. No se compiló ni instaló móvil. No se realizaron commits ni pushes.

[Verificación operativa](artifacts/web-jarceria-visible-20261107/operational-verification.json).

## Evidencia visual

- [Menú desplegado, Productos y precios reales](artifacts/web-jarceria-visible-20261107/menu-productos-precios-operativos.png).
- [Menú y pantalla de Categorías](artifacts/web-jarceria-visible-20261107/menu-categorias-operativo.png).
- [Formulario operativo de categoría, sin guardar](artifacts/web-jarceria-visible-20261107/captura-categoria-operativa-sin-guardar.png).
- [QA: categoría asignada y precio](artifacts/web-jarceria-visible-20261107/qa-producto-categoria-precio.png).
- [QA: precio en vista estrecha](artifacts/web-jarceria-visible-20261107/qa-precio-movil.png).

**Confirmación:** ya son visibles y accesibles **Productos**, **Categorías** y **precios** en jarcería. Las categorías reales y sus asignaciones quedan a cargo del propietario; esta corrección no crea clasificaciones comerciales por su cuenta.
