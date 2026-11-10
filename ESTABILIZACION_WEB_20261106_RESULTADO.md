# CalcQuim — desarrollo web aislado del 6 de noviembre de 2026

## 1. Resumen y alcance real

**Entrega parcial preparada en QA, sin activación operativa. No representa la terminación de la actualización integral solicitada.** Se completaron mejoras de catálogo de jarcería, captura de compras, mayoreo configurable, clasificación de existencias, separación inicial de reportes, menú y carga de tickets. La automatización integral Compras → Inventarios y preparaciones sigue pendiente de implementación.

Los cambios están en `artifacts/web-estabilizacion-20261106/source/`, no en el árbol que sirve Vite operativo. Editar directamente ese árbol habría provocado recarga automática durante la operación. El parche revisable es [changes.patch](artifacts/web-estabilizacion-20261106/changes.patch); el paquete con los archivos preparados es [prepared-changes.zip](artifacts/web-estabilizacion-20261106/prepared-changes.zip). [manifest.json](artifacts/web-estabilizacion-20261106/manifest.json) contiene SHA-256 originales y preparados. `git apply --check` aprobó el parche sin aplicarlo.

QA de revisión: **http://127.0.0.1:5174**. Usa la base separada `calcquim_activation_test`, un esquema sintético exclusivo y Express en un puerto local asignado al proceso QA. Conserva el puerto Vite de ensayo ya definido en el proyecto; no cambia puertos operativos. El lanzador es `artifacts/web-estabilizacion-20261106/qa-preview.mjs`. No contiene credenciales: las lee localmente sin imprimirlas y fuerza la base de pruebas.

## 2. Diagnóstico, protección y dependencias

- Se inspeccionaron estructura, Git, scripts, migraciones, persistencia transaccional, modelos de compras, conversiones, ventas e inventario; no se encontraron instrucciones AGENTS en el proyecto ni sus directorios padre consultados.
- Se leyó `AJUSTE_CAPTURA_LAVANDERIA_WEB_RESULTADO.md`. Sus cambios previos sin commit se preservaron, incluidos los archivos compartidos de servidor y tickets. Ningún cambio de esta entrega modifica esos módulos compartidos de móvil.
- Línea base: **280 pruebas web y 44 del servidor aprobadas**. Logs: `artifacts/baseline-web-20261106.log` y `artifacts/baseline-server-20261106.log`.
- Servicios operativos observados antes y después: Express 3003/PID 2484, Vite 5173/PID 14724 y PostgreSQL 5432/PID 6580. Permanecieron activos; no se reiniciaron.
- `Get-NetTCPConnection` no estaba autorizado por Windows. Se utilizó `netstat` como consulta de solo lectura, sin cambiar permisos ni configuración.
- No hubo escrituras de pruebas ni migraciones en la base operativa. La operación comercial siguió disponible y no se intentó congelar ni reemplazar su información.
- Antes de escribir fixtures se verificó la identidad de la base QA y se creó un esquema nuevo. Se guardaron y releyeron snapshots lógicos vacíos de QA. **No se generó un respaldo operativo nuevo ni se afirma haber probado su restauración**: eso deberá hacerse antes de cualquier activación que escriba datos reales. Los snapshots QA no sustituyen un `pg_dump` operativo verificable.

Dependencias pendientes: la reposición automática exige conciliar los anclajes de inventario y las compras anteriores; las preparaciones deben basarse en snapshots históricos de conversiones y cantidades realmente elaboradas; la lavandería requiere backend y configuración oficial activados juntos. Estas tareas no se resuelven habilitando únicamente controles visuales.

## 3. Catálogo de jarcería

Implementado en la copia QA y validado mediante dominio, HTTP, PostgreSQL y navegador:

- Indicadores de productos totales, disponibles, no disponibles y categorías.
- Búsqueda, ordenamiento, filtro por categoría y estado, presentación, unidad, precios y edición.
- Categorías específicas de jarcería: crear, editar, desactivar, consultar y asignar. Se detectan duplicados por espacios, mayúsculas y acentos. El backend impide eliminar categorías relacionadas; la interfaz ofrece desactivación para conservar asignaciones.
- Las categorías nuevas viven en `procurement.hardwareCategories`; cada producto usa `hardwareCategoryId`. Se conservan los `categoryId` históricos existentes, sin convertir automáticamente categorías de limpieza. Los productos sin una asignación nueva se muestran como sin categoría de jarcería y requieren clasificación explícita.
- Alta por lote de hasta 100 productos con presentación, unidad de inventario, unidad de venta, contenido, precio y estado. Todo el lote se valida sobre una copia y se publica en una sola transacción. Un fallo identifica sus renglones y evita el guardado parcial.
- Duplicados nuevos de productos y presentaciones se rechazan. No se reconstruye el catálogo; variantes adicionales se editan dentro del producto existente. Se permite conservar nombres históricos sin renombrarlos automáticamente.
- Exportación del catálogo filtrado a Excel y tarjetas adaptables mediante el componente existente. A 390 px se comprobó ancho de documento igual al viewport, sin desbordamiento horizontal.
- No se agregan líneas ni grupos de precios a formularios, filtros o lotes de jarcería.

## 4. Compras y mayoreo

- La captura de jarcería pide el **importe total del renglón**. Se deriva el costo por presentación y por unidad base.
- El backend conserva como autoridad los centavos realmente pagados: 3 piezas por $100 producen total $100 y costo unitario periódico, sin reconstruir $99.99 a partir de $33.33.
- Compras con varios renglones conservan importes individuales y total general. Se guarda `commercialPurchase.paidTotal` junto con cantidad, factor, unidad y costo derivado.
- Se conserva la entrada anterior por costo unitario para compatibilidad; no se reescriben compras históricas.
- Se retiró **Ticket / factura** únicamente de la captura nueva de jarcería. La foto opcional, sus archivos, referencias anteriores y consultas históricas se conservan.
- Niveles de mayoreo administrables desde el proveedor seleccionado en Nueva compra: cantidad mínima, presentación opcional y precio opcional. Un precio requiere fecha válida y referencia verificable. Sin precio se muestra expresamente “Sin precio verificado”. Se conserva historial de cambios de condiciones.
- No se usan nombres de proveedores, mínimos o precios rígidos para determinar costos. Los mínimos comunicados —Zorro 3, San Martín 3/6, La Libertad 6— son parámetros que deben verificarse y capturarse en la configuración real durante la activación autorizada; no se escribieron en ella.
- El mayoreo es informativo y nunca reemplaza el importe pagado. **La recepción continúa siendo explícita**, como en la implementación anterior; no se presenta como reposición automática.

## 5. Inventarios: correcciones entregadas y trabajo pendiente

La consulta operativa de solo lectura encontró **92 productos: 71 con existencia positiva, 21 con existencia desconocida y los 92 sin punto de reposición**. Esto explica por qué los indicadores “Suficiente” y “Por reponer” eran cero; no demuestra ausencia de inventario.

El cálculo preparado define agotado como exactamente cero, separa los saldos negativos y permite que “Sin punto de reposición” se superponga con existencia desconocida, agotada o negativa. Los productos positivos sin umbral no se etiquetan artificialmente como suficientes. Las acciones del reporte distinguen reponer, configurar, determinar existencia y conciliar. Se mantienen filtros, impresión y exportaciones.

**Pendiente, no implementado por esta entrega:** entradas automáticas de compras terminadas, cola de insumos pendientes de preparación, confirmación trazable de elaboración, conciliación de compras antiguas, integración automática de presentaciones con inventario inicial y reversiones de compras integradas. La lógica actual de `syncInventory` sigue revisando cambios de compras con movimientos y mantiene recepción explícita. No se cambió su política ni se aplicaron compras antiguas.

La implementación posterior debe reutilizar el bloqueo de revisión/generación, las transacciones y las claves únicas `origin_key` existentes. Cada renglón necesita una resolución explícita: terminado inequívoco, insumo pendiente, vínculo ambiguo o previamente incluido. Una compra anulada con recepción debe exigir tratamiento físico auditable antes de compensar. El conteo inicial posterior debe distinguir movimientos ya incluidos en su ancla. Esta descripción es diseño pendiente, no una funcionalidad terminada.

## 6. Lavandería

Se reutilizó la implementación previa. Las pruebas de precios web existentes se mantuvieron y una integración nueva verificó que Express calcula **4.5 cargas completas = $450**, aunque el cliente envíe subtotal $1. La configuración oficial preparada se utilizó únicamente en QA. El navegador también consultó el detalle de una venta sintética de $450 y sus controles de ticket.

**No se habilitaron medias cargas ni modalidades nuevas en operación.** La comprobación completa de su configuración vigente y la activación conjunta de catálogo/backend siguen pendientes. No se afirma haber repetido toda la integración PostgreSQL de lavandería documentada el 5 de noviembre; esa suite apuntaba al puerto QA anterior, actualmente inactivo. Sus pruebas unitarias existentes sí forman parte de la suite web ejecutada.

## 7. Reportes

- Selector entre limpieza, jarcería y resumen general, reutilizando el reporte comercial existente para el consolidado.
- Limpieza utiliza la proyección de actividad existente y conserva sus diagnósticos, tablas y detalles.
- Jarcería muestra gasto por proveedor, ventas desglosadas por producto/unidad, inventario y calidad de categorías/presentaciones. Los filtros de fechas rechazan períodos invertidos.
- Los faltantes de inventario se muestran sin determinar. Márgenes y rotación no se inventan: permanecen explícitamente pendientes de costos trazables e información suficiente.
- Calidad de configuración explica cada indicador, su consecuencia práctica y una acción sugerida; conserva las consultas de detalle y su carácter de solo lectura. Jarcería tiene diagnósticos propios y no exige líneas ni grupos.
- El resumen consolida importes; conserva cantidades separadas por unidad y ventas sin clasificación histórica explícita.

**Pendientes:** reportes comerciales completos de márgenes confiables, tendencias, rotación alta/baja, rendimiento real de preparaciones y compras pendientes de reflejarse. No se sustituyeron esos faltantes por ceros.

## 8. Menú y rendimiento

- Se conserva identidad visual, rutas y permisos. Se reducen separaciones, mejora el desplazamiento del menú y se mantiene el pie visible. El grupo activo ahora también puede plegarse. Se verificaron abrir/cerrar y acceso a Administración a 1280×720.
- La cabecera de jarcería incorpora acceso al menú en resoluciones pequeñas. Se reutilizan tarjetas móviles existentes para catálogo y reportes.
- El lanzador preparado registra fases PostgreSQL, Express, verificación API y disponibilidad frontend en `server/artifacts/launcher/last-startup-timing.json`, además de indicar procesos reutilizados. La utilidad de medición tiene prueba de éxito y fallo. **No se ejecutó el lanzador preparado contra operación.**
- El módulo de revisión/tickets se carga al abrir un detalle de venta web, mediante `lazy` y `Suspense`; no se modificó su implementación ni el logotipo. Navegador QA: cero solicitudes del módulo antes del detalle y una al abrirlo, con controles de ticket y total $450 conservados.

### Mediciones

Medidas de operación activa, tres lecturas por endpoint, sin reinicios ni escrituras. Evidencia: [baseline-http.json](artifacts/web-estabilizacion-20261106/baseline-http.json).

| Consulta | Rango observado |
|---|---:|
| Health live | 1.30–27.36 ms |
| Readiness, incluida consulta de salud | 1.23–29.47 ms |
| Documento HTML Vite | 2.83–3.98 ms |
| Dataset completo | 30.68–60.15 ms; 1,529,545 bytes |
| Inventario | 15.47–24.54 ms; 147,388 bytes |

Una lectura posterior encontró 1,077,853 bytes de comprobantes dentro de las ocho compras: alrededor del 70% del tamaño del dataset observado. Es una oportunidad de carga diferida futura; no se cambiaron contratos ni se retiraron archivos. No se atribuye la demora a PostgreSQL sin un perfil SQL.

Comparación controlada de compilación en la copia preparada, antes/después de diferir el módulo de tickets:

| JavaScript inicial | Antes | Después |
|---|---:|---:|
| Sin comprimir | 2,745.16 KB | 1,588.81 KB |
| Gzip | 1,289.93 KB | 450.07 KB |

Reducción aproximada de 42% sin comprimir y 65% en gzip. El módulo diferido ocupa 1,156.68 KB y se descarga al consultar el detalle. Vite sigue avisando de chunks mayores a 500 KB; no se ocultó esa advertencia. Una navegación de QA registró DOMContentLoaded de aproximadamente 1,014 ms; es una observación, no una comparación controlada con operación.

**Sin comparación de arranque en frío de Windows:** no se reinició Windows, Vite, Express ni PostgreSQL operativos. No se instalaron servicios ni se modificó inicio automático. Tampoco se completó perfil SQL ni medición aislada de cada render/consulta de la aplicación real.

## 9. Base de datos y compatibilidad

No se requieren nuevas migraciones para los cambios entregados: categorías, condiciones e historial de mayoreo usan metadatos JSON existentes; los productos conservan IDs y las compras sus snapshots. Se aplicaron las migraciones existentes únicamente a esquemas sintéticos nuevos en la base de pruebas.

La API conserva la forma anterior de compra por costo unitario. Los lotes nuevos usan el mecanismo existente de transacción, revisión/generación e idempotencia. La prueba HTTP verifica que repetir una clave de lote no duplica productos. No se cambian cálculos de ventas anteriores para ajustarlos a las tarifas nuevas.

## 10. Pruebas y evidencias

Resultado final: **287 pruebas web, 44 del servidor y 7 de integración PostgreSQL**, incluyendo subpruebas; cero fallidas u omitidas en esas ejecuciones finales. Total: **338**. No se ejecutó toda la suite histórica de integración del proyecto.

- [Web](artifacts/web-estabilizacion-20261106/web-tests.log).
- [Servidor](artifacts/web-estabilizacion-20261106/server-tests.log).
- [Integración nueva: 6 pruebas](artifacts/web-estabilizacion-20261106/integration.log).
- [Regresión PostgreSQL de inventario: 1 prueba](artifacts/web-estabilizacion-20261106/inventory-regression.log).
- [Lint web](artifacts/web-estabilizacion-20261106/lint.log), [lint servidor](artifacts/web-estabilizacion-20261106/server-lint.log) y [compilación](artifacts/web-estabilizacion-20261106/build.log).

Se verificaron creación/edición y protección de categorías; normalización de duplicados; lote inválido sin efectos; idempotencia; compra de $100/3 y compra multirrenglón $300.01; forma anterior de costo; niveles sin precios; rechazo de fechas/evidencias inválidas; inventario desconocido; umbrales; salida por venta y anulación con retorno; cálculo oficial de lavandería y persistencia al crear otra instancia del servicio.

En navegador QA se guardaron una categoría, un lote y una compra de $100; se revisaron los reportes, resolución pequeña y detalle de venta/ticket. No se hicieron operaciones de ensayo en la web operativa.

Durante el desarrollo se detectaron y corrigieron errores de transformación JSX, texto mal codificado en las ediciones y una prueba copiada sin su fixture de benchmark. Las ejecuciones finales reemplazan los logs de esos intentos. La revisión visual detectó y corrigió el desbordamiento a 390 px.

Capturas revisadas:

- [Catálogo](artifacts/web-estabilizacion-20261106/catalogo.png), [categorías](artifacts/web-estabilizacion-20261106/categorias.png), [alta por lote](artifacts/web-estabilizacion-20261106/alta-lote.png).
- [Compra por importe](artifacts/web-estabilizacion-20261106/compra-total.png), [reportes de jarcería](artifacts/web-estabilizacion-20261106/reportes-jarceria.png), [calidad de limpieza](artifacts/web-estabilizacion-20261106/calidad-limpieza.png).
- [Menú](artifacts/web-estabilizacion-20261106/menu.png), [web a 390 px](artifacts/web-estabilizacion-20261106/catalogo-movil-web.png), [detalle/ticket de lavandería](artifacts/web-estabilizacion-20261106/ticket-lavanderia.png).

## 11. Estado por requisito y bloque

| Requisito | Código preparado | Verificación | Activación operativa |
|---|---|---|---|
| A: auditoría, línea base y protección | Sí | Código, puertos, lecturas y pruebas | No requiere activación; respaldo operativo nuevo pendiente |
| B: interfaz, categorías y lote de jarcería | Sí | Dominio, HTTP/PostgreSQL y navegador | No |
| C: importe total, mayoreo y retirar texto de comprobante | Sí | Dominio, HTTP/PostgreSQL y navegador | No; condiciones reales por verificar/configurar |
| D: automatización integral de inventarios y preparaciones | No | Solo se verificó el comportamiento existente | No |
| E: lavandería previamente preparada | Reutilizada | Unitarias existentes y una integración nueva de tarifa | No; activación coordinada pendiente |
| F: separación, calidad y clasificación de reposición | Parcial | Unitarias, integración y navegador | No |
| F: márgenes, rotación, tendencias y preparaciones | Pendiente | No | No |
| G: menú, adaptación visual y tickets diferidos | Sí | Navegador, build y pruebas | No |
| G: métricas de inicio | Sí, instrumentación | Utilidad unitaria; arranque real no ejecutado | No |
| H: regresión integral de todos los requisitos | Parcial | 338 pruebas del alcance indicado | No; faltan D y cobertura completa de E/F |

Las validaciones de concentrados/preparaciones, compras integradas corregidas/anuladas, inicialización posterior a compras y alertas de elaboración **no se consideran satisfechas**. Requieren completar D antes de declarar estable la actualización integral.

## 12. Archivos modificados en la copia preparada

El manifiesto contiene 23 archivos con diferencias respecto al árbol operativo al preparar la entrega:

- Catálogo: `src/pages/HardwareProductsPage.jsx`, `src/components/HardwareCatalogTools.jsx`, `src/domain/hardwareCatalog.mjs`.
- Compras: `src/components/HardwarePurchases.jsx`, `src/components/SupplierPurchaseTiers.jsx`, `src/domain/purchaseCost.mjs`, `src/domain/supplierPurchaseTiers.mjs`, `server/src/services/commerce.mjs`.
- Reportes: `src/pages/ReportsPage.jsx`, `src/components/HardwareReports.jsx`, `src/components/InventoryReport.jsx`, `src/services/inventoryReport.js`.
- Experiencia y carga: `src/App.jsx`, `src/layout/Sidebar.jsx`, `src/styles/layout/Sidebar.css`, `src/pages/SalesPage.jsx`.
- Arranque: `scripts/local-system.mjs`, `scripts/startup-timing.mjs`.
- Pruebas: `tests/hardware-stabilization.test.js`, `tests/inventory-report.test.js`, `tests/startup-timing.test.js`, `server/integration/inventoryReport.test.mjs`, `server/integration/web-stabilization.test.mjs`.

Fuera de la copia preparada se agregan únicamente este informe y artefactos QA: lanzador, loader de integración, snapshots sintéticos, evidencias, logs, manifiesto, parche y ZIP. No hay secretos en el paquete.

## 13. Pasos antes de habilitar operación

1. Completar D y sus pruebas de integridad, y los reportes pendientes. Conciliar compras anteriores e inventarios iniciales con evidencia; no importar el catálogo ni fixtures QA a operación.
2. Revisar QA y los 23 archivos preparados. Volver a verificar los hashes originales: si el código operativo cambió, integrar y repetir pruebas antes de copiar nada. No aplicar el ZIP o el parche mientras Vite operativo observe los archivos sin una ventana autorizada.
3. Obtener autorización para la activación y una ventana coordinada. Generar un respaldo operativo nuevo, verificar integridad y restauración en una base independiente; capturar una línea base de inventario y datos reales.
4. Confirmar configuración oficial de lavandería y condiciones de mayoreo reales. Preparar configuración y backend juntos; no activar medias cargas solo desde frontend.
5. Desplegar únicamente los cambios aprobados; no sobrescribir los archivos privados ni los trabajos previos. Reiniciar solo lo autorizado y verificar health/readiness, catálogo, compras, ventas, tickets e inventario sin ventas ficticias en operación.
6. Medir el arranque real y documentar resultados. Mantener un retorno de código/configuración y usar compensaciones auditables si hubiera operaciones nuevas; no restaurar sobre ventas posteriores sin conciliación.

No se ha solicitado autorización para activar porque el bloque integral de inventarios y sus validaciones aún no están completos. Los cambios ordinarios restantes pueden continuar en QA sin afectar la operación.

## 14. Confirmaciones

**No se modificó la aplicación móvil, no se alteraron contratos móviles, no hubo APK ni ADB.** Los archivos móviles/compartidos que ya aparecían modificados al inicio siguen siendo trabajo previo del usuario, preservado. **No se realizaron commits ni pushes.** No se trasladaron datos a la nube, no se expuso PostgreSQL ni se modificó la configuración de Windows.

## 15. Siguiente etapa móvil

Solo después de concluir y aprobar la web: evaluar soporte explícito de las modalidades de lavandería y snapshots históricos; compatibilidad de presentaciones y unidades de jarcería; visualización de inventario desconocido y operaciones pendientes; y pruebas de contratos y tickets. No se implementó ninguna de esas adaptaciones móviles.
