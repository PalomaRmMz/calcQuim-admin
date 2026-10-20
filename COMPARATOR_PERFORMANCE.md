# Rendimiento del comparador — 2026-10-20

## Alcance y evidencia previa

Se revisaron los cambios locales del rediseño, la ruta PurchasesModule, CatalogContext, ProcurementProvider, DataTable, MobileDataTable, ComparatorAlternatives, comparatorGroups, unidades y etiquetas del catálogo. Rama dev, mismo repositorio local y remoto. Sin commits ni pushes. No se tocaron esquemas, almacenamiento, datos, proveedores ni compras.

Las métricas de la columna «antes» se tomaron antes de optimizar el código de la aplicación, con fixtures sintéticos y React Profiler. El rediseño todavía era un cambio local sin commit; HEAD ofrece una referencia anterior al rediseño, no una versión guardada del rediseño lento. Las comparaciones principales son las mediciones del árbol de trabajo antes/después; la comparación con HEAD es auxiliar.

Causas observadas:

1. ProcurementComparator recalculaba grupos, aplanaba filas y construía Maps y columnas en cada cambio de estado. Abrir historial volvía a agrupar las 3200 alternativas.
2. Su Cell de detalles móvil incluía ComparatorAlternatives dentro de details aun cerrado. Diez tarjetas montaban sus tablas ocultas: 20 ejecuciones de detalles y 62 renders de DataTable durante el montaje mediano/grande. Las definiciones nuevas de Cell también remontaban contenido al actualizar la página.
3. El selector llamaba getProductChoiceLabel para cada producto, y cada llamada recorría todos los productos normalizando nombres. Ese costo cuadrático ya existía antes del rediseño: 564.557 ms por pasada con 1000 productos en Node.
4. comparatorGroups recorría todas las filas por cada producto sin grupo. El orden repetía búsqueda de clasificación y localeCompare con opciones dentro de cada comparación.

No hay efectos nuevos en el comparador original. ProcurementProvider ya memoiza productos y analytics; su intervalo de fecha se limpia al desmontar. La ruta monta solamente el componente activo. No se observó propagación de estados locales hacia los proveedores ni un ciclo infinito. DataTable/MobileDataTable no se modificaron adicionalmente en esta optimización. La tabla de control grande montó en 8.1 ms móvil y 25.6 ms escritorio en la ronda previa; no reprodujo el costo de cientos de milisegundos del comparador. Esto no demuestra que todas las páginas ni la carga real de proveedores estén libres de otros cuellos de botella.

## Cambios aplicados

- ProcurementComparator: useMemo para grupos, índices de candidatos, IDs ganadores, conteo y opciones del catálogo; búsqueda de historial por Map; columnas y callback estables; memo únicamente para la tabla de esta página. Cambiar cantidad, referencia o historial no invalida agrupación. Los filtros y cambios de datos sí la invalidan.
- ComparatorAlternatives: detalles móviles montados solo al abrir y desmontados al cerrar. Panel de escritorio devuelve un elemento ligero para que MRT conserve su botón, sin montar tablas mientras está cerrado. Filas derivadas memoizadas y memo del contenido con props estables. No se usa un comparador personalizado que pueda ignorar cambios de datos.
- catalogUtils: getProductChoiceLabels cuenta homónimos en una pasada; conserva las etiquetas y desambiguación anteriores. Otros consumidores de getProductChoiceLabel no cambian.
- comparatorGroups: Set de IDs presentes, claves de clasificación precalculadas y un Intl.Collator reutilizable con el mismo idioma y opciones. Candidatos, conversiones, vigencia y desempates económicos no cambian.
- Se corrigió además el contador visual del grupo: tenía una consulta booleana a un Map seguida de `.length`; vuelve a mostrar el número de alternativas comparables.

No se incorporó virtualización: la tabla principal ya pagina diez grupos. Las mediciones identificaron contenido oculto y trabajo repetido, no miles de filas principales visibles. No se alteró la lógica compartida de abastecimiento para resolver un problema local.

## CPU: medianas en milisegundos

Un calentamiento y nueve muestras; kernels parcialmente solapados, no sumables. El selector completo incluye filtros, agrupación por ID, elegibilidad, normalización, mejor alternativa y orden. Metodología reproducible en benchmarks/comparator/README.md.

| Operación | Productos | Antes | Después | Reducción |
|---|---:|---:|---:|---:|
| Selector completo | 20 | 0.422 | 0.097 | 77.0% |
| Selector completo | 200 | 9.907 | 1.052 | 89.4% |
| Selector completo | 1000 | 56.226 | 2.590 | 95.4% |
| Orden de grupos | 20 | 0.164 | 0.011 | 93.3% |
| Orden de grupos | 200 | 2.469 | 0.083 | 96.6% |
| Orden de grupos | 1000 | 13.371 | 0.280 | 97.9% |
| Etiquetas | 20 | 0.386 | 0.023 | 94.0% |
| Etiquetas | 200 | 19.496 | 0.171 | 99.1% |
| Etiquetas | 1000 | 564.557 | 0.754 | 99.9% |

Kernels sin cambios de implementación, 1000 productos: elegibilidad/conversión 0.635 → 0.638 ms; filtro 0.048 → 0.047 ms; mínimo de candidatos ya normalizados 0.148 → 0.236 ms. Son tiempos submilisegundo con variación de JIT; no se reclama una mejora en ellos ni se cambiaron sus reglas para obtenerla. El desempate completo mantiene costo, fecha e ID y está cubierto por regresión.

## React Profiler: primer commit, medianas de tres muestras

Desarrollo, navegador aislado, datos sintéticos en memoria, sin StrictMode del harness. No son cifras de producción ni una garantía para otro equipo.

| Productos / alternativas | Ancho | Antes ms | Después ms | Reducción |
|---|---:|---:|---:|---:|
| 20 / 64 | 390 | 53.9 | 10.8 | 80.0% |
| 20 / 64 | 1440 | 51.3 | 71.6 | -39.6% |
| 200 / 640 | 390 | 87.9 | 16.9 | 80.8% |
| 200 / 640 | 1440 | 77.8 | 68.9 | 11.4% |
| 1000 / 3200 | 390 | 504.6 | 43.9 | 91.3% |
| 1000 / 3200 | 1440 | 491.4 | 97.6 | 80.1% |

La suma de commits iniciales grande fue 572.8 → 49.8 ms móvil (91.3%) y 557.8 → 205.6 ms escritorio (63.1%). Móvil pasó de tres a dos commits iniciales y de 62 a dos renders de tabla. Detalles cerrados: 20 → 0 ejecuciones. DOM móvil grande: 3578 → 1347 elementos (62.4% menos).

El caso pequeño de escritorio no mejoró. Hubo deriva en la ronda de escritorio: una nueva tabla de control pequeña dio 38.3 ms frente a los 25.6 ms de la tabla de control grande previa. No se descarta una diferencia de carga del entorno o calentamiento, y no se usa esa variación para corregir artificialmente las cifras. El costo fijo de MRT/MUI domina el caso pequeño; hace falta una comparación intercalada en condiciones más estables para atribuir esa diferencia.

Referencia HEAD anterior al rediseño, 1000 productos: primer commit 545.2 ms móvil y 545.4 ms escritorio. No tenía tarjetas móviles agrupadas: es una referencia de costos, no igualdad de funcionalidad. Confirma que las etiquetas cuadráticas eran preexistentes.

## Interacciones: 1000 productos, medianas de tres muestras

Tiempo click → tarea y dos frames; incluye layout, no toda la animación de Collapse/Dialog. La duración React es adicionalmente registrada por el harness.

| Interacción | Ancho | Antes ms | Después ms | Reducción |
|---|---:|---:|---:|---:|
| Primera apertura | 390 | 14.7 | 34.0 | -131.3% |
| Cierre | 390 | 31.7 | 20.3 | 36.0% |
| Abrir historial | 390 | 672.8 | 132.7 | 80.3% |
| Primera apertura | 1440 | 164.4 | 198.5 | -20.7% |
| Cierre | 1440 | 136.1 | 40.6 | 70.2% |
| Abrir historial | 1440 | 626.7 | 76.2 | 87.8% |

La primera apertura móvil ahora paga el montaje bajo demanda (~21–29 ms React) que antes se pagaba de antemano en todas las tarjetas cerradas. No se oculta ese intercambio. La apertura de escritorio conserva cinco renders internos de tabla y no mostró mejora; no se atribuye una mejora inexistente. Cerrar ya no vuelve a ejecutar el contenido pesado durante la salida de Collapse.

Abrir historial: agrupaciones 1 → 0; renders de detalle móvil 20 → 0; renders de tablas móvil 64 → 2 (solamente modal). React del historial móvil 578.5 → 73.3 ms; escritorio 529.6 → 40.7 ms. Cambiar cantidad produjo un render de página y cero agrupaciones/renders de tabla en las cuatro resoluciones de regresión.

## Memoria, alcance y límites

Se capturó performance.memory durante las rondas, pero sus muestras sin GC acumulan objetos de navegaciones anteriores: no son comparables y no se publica un porcentaje de ahorro de heap. Después, CDP con GC forzado dio heap JS usado de 22,462,080; 22,477,568 y 27,712,668 bytes para 20/200/1000 productos móviles. Incluye React, dependencias y fixture. No se capturó una base equivalente con GC antes de editar; solo el descenso de nodos y contenido cerrado montado es una comparación fiable de esta sesión.

No se midió el arranque con datos reales ni se leyó el perfil habitual. Una lentitud general fuera del comparador requeriría un perfil reproducible de esas rutas y volúmenes de productos/artículos/compras/conversiones, sin exponer valores privados. Las métricas presentes justifican los cambios locales, no cambios amplios de providers ni almacenamiento.

## Regresión y archivos

Pruebas nuevas en tests/comparator-performance.test.js: equivalencia exacta de etiquetas, paridad del orden previo, escenarios 20/200/1000, resultados y filtros, inmutabilidad y detalles cerrados sin tablas. Se reutiliza la suite previa de comparabilidad, normalización, empate, historial y ambos modelos.

benchmarks/comparator/regression.mjs verificó 320/390/768/1440 px: cero detalles montados al inicio, cantidad sin recalcular, cuatro acciones de historial, observaciones históricas, conservación de apertura al cerrar modal, recomendación filtrada de $12, ningún desbordamiento y commits estables tras finalizar transiciones. Los commits de MUI durante animación no se consideran ciclos infinitos.

Archivos de aplicación de esta optimización: src/pages/ProcurementComparator.jsx, src/components/ComparatorAlternatives.jsx, src/utils/comparatorGroups.js y src/utils/catalogUtils.js. Se agregaron la prueba de rendimiento, harness/fixture/servidor y runners reproducibles bajo benchmarks/comparator, y este informe. Los cambios locales previos del rediseño se conservaron.

Validación final: lint correcto, 233 pruebas aprobadas (cero fallas) y build correcto. No se eliminaron funcionalidades, ni se modificaron datos o reglas económicas para mejorar métricas. El build conserva el aviso de chunk principal grande; no se abordó porque estas mediciones no justifican cambiar la estrategia de carga de toda la aplicación.
