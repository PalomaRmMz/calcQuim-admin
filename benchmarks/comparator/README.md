# Comparador: medición sintética

No lee ni escribe localStorage. Monta directamente CatalogContext y ProcurementContext con productos, proveedores, referencias e historial inventados. Las filas tienen la misma forma que la proyección de analytics v1/v2. Un 20% de productos no tiene fuentes; los demás tienen cuatro fuentes, tres comparables y una pendiente. Cada fuente conserva dos observaciones. La construcción del fixture ocurre fuera del Profiler.

Desde la raíz:

```powershell
node benchmarks/comparator/cpu.mjs
node benchmarks/comparator/server.mjs
```

El servidor dedicado sirve `http://127.0.0.1:5173/benchmarks/comparator/?size=200`. Tamaños: 20, 200 y 1000 productos (64, 640 y 3200 alternativas). El servidor instrumenta en memoria los renders de página, agrupación, tablas y detalles; no modifica el código en disco ni el servidor normal de la aplicación.

`browser.mjs` exporta una función que recibe un Playwright Page. Ejecutarla en un navegador aislado con el servidor anterior activo. Puede importarse desde un runner de Playwright, o enviarse a la herramienta browser_run_code_unsafe quitando únicamente `export default`. Repite tres veces cada tamaño y resolución, captura React Profiler, DOM, heap aproximado y apertura/cierre/historial. `regression.mjs` se ejecuta igual: verifica contenido cerrado sin montar, cantidad sin recalcular, historial, filtros, estabilidad tras las transiciones y ausencia de desbordamiento en 320, 390, 768 y 1440 px. No necesita el perfil de usuario ni dependencias adicionales de producción.

`?view=control` monta solamente el DataTable compartido con los productos sintéticos. `?view=legacy` carga de forma virtual y de solo lectura `git show HEAD:src/pages/ProcurementComparator.jsx`; no crea un archivo ni cambia el checkout. En las mediciones documentadas HEAD era `69e1ffb8408069ee722126c98c6146926a2e71ec`, anterior al rediseño. Si HEAD cambia, esa referencia también cambia.

CPU: una pasada de calentamiento y mediana de nueve muestras. `selector` mide el pipeline real completo. `costs` llama al cálculo real de elegibilidad/conversión. `filter` aísla el predicado de estado y clasificación sin búsqueda. `best` aísla el mínimo de candidatos ya normalizados (el desempate completo se prueba por separado). `sort` mide el orden de grupos; `labels` mide las etiquetas del selector. Estos kernels se solapan con el pipeline: no sumar sus tiempos.

Navegador: desarrollo de React con Profiler habilitado, sin StrictMode en el harness; 390/1440 × 900 px, tres navegaciones por escenario, mediana. `mount` es actualDuration del primer commit; `total` suma los commits iniciales tras 100 ms. Las interacciones usan click en el DOM, una tarea y dos requestAnimationFrame; `wall` incluye render/layout, pero no termina de medir animaciones de MUI. Los commits de Profiler incluyen los del modal y efectos internos de las tablas, no equivalen a renders de la página. La regresión espera las transiciones antes de comprobar estabilidad.

Para capturar memoria de forma comparable, usar CDP HeapProfiler.collectGarbage y Runtime.getHeapUsage en ambos estados. performance.memory sin GC es orientativo: acumula objetos de navegaciones anteriores. No atribuir ese heap completo al comparador ni calcular porcentajes si no se capturó una base equivalente.

Resultados y limitaciones en [COMPARATOR_PERFORMANCE.md](../../COMPARATOR_PERFORMANCE.md). Volver a medir antes de editar si se necesita una nueva comparación antes/después. No aplicar límites de milisegundos estrictos en CI; las pruebas usan invariantes de render y un guardián amplio contra bloqueos.
