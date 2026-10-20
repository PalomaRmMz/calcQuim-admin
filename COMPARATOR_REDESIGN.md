# Rediseño del comparador de abastecimiento

## Inspección y problema original

Repositorio revisado: D:\ReactApps\calcQuim-admin, rama dev, remoto origin de calcQuim-admin. No se hicieron commits ni pushes. El archivo existente es src/pages/ProcurementComparator.jsx; ProcurementComparatorPage.jsx no existe.

La página mostraba una fila por alternativa proveedor/artículo/conversión, aunque varias correspondieran al mismo ID de producto. Su indicador de mejor costo provenía del resumen global, por lo que podía diferir del subconjunto filtrado. El ahorro predeterminado también tomaba una compra global del producto.

Se revisaron ProcurementComparator, DataTable, MobileDataTable, CostHistoryModal, ProcurementProvider, purchaseAnalytics, supplyModelAnalytics, procurementUtils, units, supplyModel, los servicios de abastecimiento y las pruebas de consistencia, modelos y renderizado.

## Equivalencia y costos

- Modelo anterior: outputProductId identifica el producto final. La referencia económica exige relación vigente, identidad de artículo compatible con el snapshot, proveedor/producto/fuente activos y configuración válida. READY_TO_USE exige equivalencia directa; BASE, HYDRONEO, CONCENTRATE y OTHER necesitan rendimiento explícito válido.
- Modelo v2: supplyConversions relaciona purchasedItemId con outputProductId. effectiveSourceYield aplica las reglas y excepciones existentes por proveedor/presentación. Las compras usan las conversiones capturadas en sus snapshots; los costos informados se proyectan con la configuración vigente, como antes.
- No se acredita equivalencia por nombres. La relación configurada y su rendimiento son la evidencia que ofrece el modelo; la interfaz no verifica físicamente la composición del material.
- Se conserva calculateEffectiveCost y convertQuantity. La vista exige además comparable === true, referencia activa, no vencida, costo finito no negativo y unidad final compatible. Convierte el costo a la unidad del producto para ordenar y mostrar.
- Se conserva la referencia elegida por analytics: compra o último costo informado vigente, la fecha más reciente; en empate de fecha gana la compra. No se recuperan costos informados anteriores cuando el último venció.
- Mejor alternativa del grupo: menor costo normalizado, después fecha más reciente y finalmente ID de alternativa. Cero es un costo válido; no se trata como ausencia.
- El ahorro conserva importes por unidad y total, sin agregar porcentaje. Requiere referencia comparable positiva entre las alternativas filtradas, e identifica proveedor, fecha y costo. Si queda excluida, no muestra un ahorro obsoleto.

## Estrategia y comportamiento

comparatorGroups deriva los grupos en memoria, separando alternativas, candidatas comparables y registros relacionados con motivo de exclusión. Agrupa por ID exacto, sin fusionar productos homónimos. No persiste ni modifica filas, snapshots o historiales.

Producto, proveedor, categoría, línea, modalidad, antigüedad, estado y búsqueda se aplican a las alternativas antes de agrupar y seleccionar el mejor costo. Un producto aparece cuando queda una alternativa visible. Los productos sin fuentes también aparecen, salvo filtros específicos de fuente o estado inactivo. Un producto cuyas fuentes fueron excluidas no reaparece como producto vacío. Los contadores indican productos y alternativas visibles; la paginación cuenta grupos. El orden inicial conserva categoría, línea, nombre e ID; las columnas permiten reordenar los grupos y los detalles mantienen sus propios controles de tabla.

La búsqueda principal examina producto, proveedor y artículo, sin distinguir acentos. Las búsquedas internas de los desplegables sirven para explorar sus detalles; no redefinen la recomendación principal.

Escritorio usa un panel expandible a todo el ancho. Móvil usa tarjetas con detalles nativos desplegables. Los detalles conservan columnas de modalidad, presentación, precios, rendimiento, fechas, vigencia, últimas referencias y conteos; las columnas secundarias siguen disponibles mediante el selector de columnas. Las acciones de historial conservan el modal y sus observaciones originales. No se eliminaron registros históricos por los filtros de la vista.

## Limitaciones

No se deducen relaciones ausentes. En v2, un artículo sin supplyConversion no puede atribuirse a ningún producto por su nombre: permanece disponible en Abastecimiento por artículo comprado y no participa en recomendaciones. Para compararlo hace falta configurar explícitamente producto final y rendimiento/equivalencia directa. No se modificó la carga ni la migración existente del proveedor de contexto.

No se alteraron proveedores, compras, identificadores, relaciones, respaldos ni almacenamiento. La validación visual montó los contextos directamente con datos sintéticos en memoria, sin cargar los proveedores de almacenamiento ni el perfil habitual del navegador.

## Archivos y validación

- src/pages/ProcurementComparator.jsx: integración, filtros, búsqueda, resumen y ahorro.
- src/utils/comparatorGroups.js: agrupación, elegibilidad, normalización y desempate puros.
- src/components/ComparatorAlternatives.jsx: detalles comparables y relacionados.
- src/components/DataTable.jsx: panel de detalle, identidad de fila y búsqueda opcionales.
- src/components/MobileDataTable.jsx: columnas móviles, parámetros completos de celdas y exclusión de controles internos de escritorio.
- src/styles/components/ProcurementComparator.css: presentación adaptable.
- tests/comparator-groups.test.js: agrupación, homónimos, insumo no confirmado, conversión confirmada, costos, unidades, filtros, orden, empate, inmutabilidad y modelos v1/v2.
- tests/comparator-render.test.js: detalles completos, motivos, acceso al historial y tarjetas móviles.
- tests/render.test.js: expectativas actualizadas para la vista compacta.

Validación: lint correcto; suite completa con 229 pruebas aprobadas; build correcto. Vite avisa del tamaño del chunk principal, sin impedir el build.

Validación con Playwright en 320, 390, 768 y 1440 px: expandir, encontrar las tres referencias y acciones de historial, abrir/cerrar el historial, buscar una alternativa y comprobar que cambia la recomendación, sin desbordamiento de la página. Inspección visual de escritorio y móvil. Los archivos temporales de revisión fueron retirados.
