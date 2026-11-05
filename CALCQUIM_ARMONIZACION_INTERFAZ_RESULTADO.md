# CalcQuim — Armonización de interfaz y continuación segura

Fecha: 5 de noviembre de 2026. Resultado implementado y revisado en QA aislado. **No se activó en producción.**

La entrega está en [artifacts/armonizacion-20261105/calcQuim-admin](artifacts/armonizacion-20261105/calcQuim-admin). Conserva las copias anteriores. El entorno de revisión utiliza **http://127.0.0.1:5357**, API 3357 y PostgreSQL QA 55439, con datos sintéticos. El aviso de entrada identifica expresamente el entorno de ensayo.

## 1. Estado recuperado de la ejecución interrumpida

Se inspeccionaron los repositorios Admin y móvil, las copias de ampliación y reorganización, y los informes `AUDITORIA_CALCQUIM_JARCERIA_LAVANDERIA.md` y `AMPLIACION_JARCERIA_LAVANDERIA_RESULTADO.md`. No existía el informe final `REORGANIZACION_ADMIN_FULL_CLEAN_RESULTADO.md`.

Los originales permanecían en Admin `serviciofull`, HEAD `6f43426`, y móvil `dev`, HEAD `c44bcd3`. La ampliación estaba en `artifacts/ampliacion-20261105`; la reorganización recuperada, en `artifacts/reorganizacion-20261105`. Se creó una copia sucesora para conservar íntegro ese punto de recuperación.

| Estado encontrado | Decisión y resultado |
|---|---|
| Clasificación de proveedores, separación de catálogos, rutas y filtros por actividad implementados | Conservados; no se reconstruyeron |
| Compras con snapshots de presentación, recepción explícita y stock común | Conservados y utilizados desde el historial habitual |
| Comparador físico, ventas mixtas, servicios sin inventario, contratos móviles e idempotencia funcionando | Conservados |
| Jarcería dividida en Artículos / Presentaciones / Importación | Sustituida por lista de productos y edición integrada |
| Tabla adicional de recepción junto al historial de Compras | Retirada; la recepción está en el detalle de cada compra |
| Lavandería con formulario permanente y tarifas poco visibles | Convertida en catálogo de servicios con edición en ventana |
| Comparador de jarcería con tabla y textos propios | Adaptado a los componentes y patrones del comparador existente |
| Informe de reorganización pendiente de entrega | Su estado recuperado y su continuación quedan documentados aquí |

La reorganización recuperada aprobó 385 pruebas antes de esta continuación. La entrega actual aprueba **391**, con las subpruebas incluidas en el conteo de Node.

## 2. Módulos corregidos

Se reutilizan `ContentPanel`, `DataTable`, `PrimaryAction`, `TableActions`, `ModalHeader`, `ValidatedForm`, los campos de abastecimiento y los estilos de ventanas de venta existentes. Se mantienen búsqueda, ordenación, paginación, acciones por fila y mensajes habituales.

| Apartado | Resultado |
|---|---|
| Productos de jarcería | Lista principal, búsqueda, filtro de estado y Agregar / Editar producto |
| Compras | Historial original unificado; selección de actividad al capturar; equivalencias y recepción en el detalle |
| Inventario de jarcería | Misma lista y ficha operativa que limpieza; presentaciones dentro de la tabla |
| Comparador de jarcería | Panel, filtros, tabla ordenable, mejor costo e historial en ventana |
| Lavandería | Lista de servicios y tarifas; edición de adicionales y precios personalizados |
| Ventas | Buscador con autocompletado y ventana visualmente coherente con la captura original |

La navegación recuperada se conserva: Proveedores; Productos de limpieza y sus clasificaciones; Productos de jarcería; Compras; Comparadores de limpieza y jarcería; Inventarios de limpieza y jarcería; Lavandería; Ventas; Reportes; Administración. **Esta continuación no cambia rutas ni navegación de Reportes.**

## 3. Funciones originales conservadas

Productos de limpieza conserva categorías, líneas, grupos de precios, tarifas normales, mayoreo, formularios y operaciones. No se adaptó su estructura para acomodar jarcería.

Proveedores conserva un único catálogo, contacto, estado, relaciones e historial. El giro explícito permite Productos de limpieza o Jarcería. Los proveedores históricos sin giro permanecen pendientes de clasificación: no se deduce su actividad ni se duplican. Las nuevas compras filtran y validan el giro; el historial mantiene sus identidades y snapshots anteriores.

Compras conserva los filtros por fechas, proveedor y estado, las tarjetas de resumen, búsqueda, detalle, comprobantes, exportación, versiones y anulación. También se corrigió la comparación del filtro de proveedor para admitir tanto identificadores numéricos históricos como cadenas.

No se modificaron el motor de mayoreo, el comparador químico, el motor comercial de ventas, los contratos móviles, la recuperación de envíos, los folios ni la generación de tickets. El manifiesto [SOURCE_CHANGES.json](artifacts/armonizacion-20261105/SOURCE_CHANGES.json) registra los archivos modificados y 18 verificaciones de archivos protegidos idénticos a la copia recuperada. Las migraciones existentes permanecen idénticas.

## 4. Mejoras de claridad en Compras

El punto de entrada sigue siendo **Compras → Historial y captura → Nueva compra**. Se elige la actividad y se utiliza el mismo historial. Se eliminó la tabla adicional «Compra por presentación y recepción».

La captura de jarcería permite proveedor, fecha, producto/presentación, cantidad, costo por presentación, referencia, notas y foto del comprobante. Permite agregar varias presentaciones a **un solo documento**, con un único proveedor, referencia y total; no crea una compra por renglón. Conserva compatibilidad con el comando anterior de un solo concepto.

El ejemplo solicitado se muestra como 5 paquetes × $40 = $200, contenido de 4 unidades por paquete y equivalente de 20 unidades. El costo equivalente es $10 por unidad. Antes de confirmar la llegada, el estado dice **Pendiente de recepción**. No se etiqueta esa equivalencia como mercancía ya recibida.

La recepción se confirma desde el detalle, por renglón. El historial identifica Pendiente de recepción o Recibida; una compra parcialmente recibida sigue pendiente hasta completar sus renglones. Registrar la compra no suma existencias. La comprobación de recepción consulta el libro de inventario; una repetición no produce otra entrada. Si falta el inventario inicial, el servidor exige capturarlo expresamente antes de recibir.

La edición histórica de limpieza continúa disponible. Las compras con snapshots de jarcería conservan la corrección segura de la ampliación: anular y registrar el documento correcto, con revisión física de cualquier recepción previa. No se habilitó una edición en sitio que reescriba contenido histórico o deshaga mercancía automáticamente.

Se comprobó también una compra con dos presentaciones: 2 paquetes a $40 y 1 rollo a $12, total $92. Se guardó un documento con dos renglones; recibir uno dejó el otro pendiente.

## 5. Nuevo diseño de productos de jarcería

La operación principal es **Productos de jarcería → Agregar producto / Editar producto**. Una misma ventana contiene nombre comercial, características, unidad de inventario, estado y todas las presentaciones con contenido, precio y disponibilidad.

El propietario puede administrar rollo individual de $12 y paquete de cuatro de $45 desde el mismo producto. Se pueden agregar presentaciones y desactivar las anteriores. Las presentaciones históricas no se eliminan ni cambian de producto. La unidad de inventario de un producto existente permanece fija para conservar su historial físico.

El guardado de producto y presentaciones es **atómico**: una presentación inválida no deja un producto creado a medias. Se conserva el historial de precio y contenido. No se crea inventario por dar de alta un producto.

La importación se conserva bajo **Herramientas de carga inicial**, plegada y fuera de la operación cotidiana. Mantiene vista previa, confirmación e idempotencia, incluida la detección de la importación completa anterior. No se ejecuta automáticamente al abrir el módulo.

## 6. Inventario de jarcería armonizado

Se utiliza la lista y la ficha de inventario de limpieza: búsqueda, filtros, estado, existencia aproximada, mínimos y lote de reposición, entradas mediante ajuste positivo, salidas justificadas, mermas, conteos, correcciones del inicial, compensaciones e historial con motivos.

Se retiró la tabla adicional de equivalencias. Las presentaciones se consultan dentro de la tabla principal; no se exige operar con un factor interno. Se eliminan las columnas de categoría/línea que no corresponden a jarcería y se ordena por producto. La revisión final de una carga nueva del inventario no produjo errores de consola.

El libro físico sigue siendo compartido entre presentaciones del mismo producto, y las vistas quedan separadas por actividad. Una venta de un paquete de cuatro descuenta cuatro unidades; no crea ni descuenta un segundo inventario de paquetes. Las equivalencias no garantizan empaques sellados. Las recepciones documentadas continúan en Compras para conservar su vínculo comercial y evitar entradas duplicadas.

## 7. Comparador de jarcería armonizado

Se reutilizan panel, barra de filtros, tabla, búsqueda, ordenación y acciones de historial. Se selecciona producto y opcionalmente proveedor. Se muestran presentación, costo registrado, equivalente, costo por unidad, fecha y origen. El historial del proveedor se abre en una ventana.

El resultado destaca el **mejor costo conocido** cuando hay evidencia comparable. El cálculo conserva normalización física, fechas, vigencia, último costo por oferta y clasificación del proveedor. No compara precios de venta ni aplica concentraciones o rendimientos químicos. Datos insuficientes, unidades incompatibles y costos vencidos no generan recomendaciones inventadas.

El comparador de limpieza permanece sin cambios en esta continuación, incluidas sus conversiones, concentraciones, rendimientos y criterios anteriores.

## 8. Lavandería simplificada

El apartado abre con la lista de servicios, tarifa, adicionales disponibles, estado y acción Editar. No presenta un formulario vacío como operación principal. Agregar / Editar servicio permite administrar tarifa fija o precio personalizado al vender, unidad, adicionales opcionales e historial de tarifas.

Las combinaciones se muestran a partir de las tarifas configuradas, sin fijarlas artificialmente en la pantalla. Con la referencia definida por el propietario:

| Servicio por carga | Importe |
|---|---:|
| Lavado | $60 |
| Lavado + jabón y suavizante Full Clean | $70 |
| Lavado + secado | $90 |
| Lavado + insumos + secado | $100 |

Sólo exprimido, exprimido y secado y trabajos especiales conservan precio personalizado; no se inventan tarifas. Los cobros diarios se realizan desde Ventas. No se añadió un flujo de prendas, anticipos u órdenes, ni movimientos físicos por servicios. La carga inicial revisable se mantiene como herramienta secundaria.

## 9. Ventas armonizadas

La ventana conserva la búsqueda rápida compartida, ahora con el autocompletado utilizado por la interfaz original, encabezado común, secciones, tabla de conceptos, forma de pago y total con acciones al pie.

Limpieza, presentaciones de jarcería y servicios se agregan a la misma venta. Cantidades e importes empiezan vacíos al seleccionar un concepto. Se mantienen tarifas y adicionales del catálogo, cobros personalizados y cálculo mayorista existente.

Se registró por la interfaz una venta sintética de un rollo de $12, un lavado con insumos de $70 y 10 litros con tarifa mayorista de $150: **un solo registro por $232**. Las pruebas conservan correcciones, anulaciones, folios, tickets únicos, idempotencia y compatibilidad con clientes móviles anteriores. No se modificó el código móvil ni el teléfono.

## 10. Confirmación de que Reportes no fue modificado

**No se modificó Reportes durante esta continuación.** La comparación SHA-256 confirma identidad completa frente a la copia recuperada para `ReportsPage.jsx`, `CommercePage.jsx`, `reportAnalytics.js`, `inventoryReport.js`, `generalCatalogReport.js` y `src/domain/commerce.mjs`.

También se verificó que el bloque de reportes comerciales conserva exactamente el contenido de la ampliación anterior a la reorganización. `App.jsx` y `adminNavigation.mjs` permanecen idénticos al estado recuperado: no se agregaron pantallas, filtros, indicadores ni accesos de Reportes en esta tarea. Sus cálculos y resultados no se movieron.

## 11. Pruebas ejecutadas y resultados

| Grupo | Resultado final | Evidencia |
|---|---:|---|
| Web, navegación, formularios, catálogos y dominio | 268 aprobadas | [web-tests.log](artifacts/armonizacion-20261105/web-tests.log) |
| Servidor y contratos | 39 aprobadas | [server-tests.log](artifacts/armonizacion-20261105/server-tests.log) |
| Móvil, sin cambios de fuente | 33 aprobadas | [mobile-tests.log](artifacts/armonizacion-20261105/mobile-tests.log) |
| Integración PostgreSQL comercial, organización, inventario, mayoreo y armonización | 51 aprobadas | [integration-tests.log](artifacts/armonizacion-20261105/integration-tests.log) |
| **Total automatizado, incluidas subpruebas** | **391 aprobadas; 0 fallidas, omitidas o pendientes** | |
| ESLint | Aprobado | [lint.log](artifacts/armonizacion-20261105/lint.log) |
| Compilación web | Aprobada | [build.log](artifacts/armonizacion-20261105/build.log) |

Las nuevas pruebas comprueban guardado integrado y rollback, conservación de características, snapshots y presentaciones anteriores, referencia/notas, recepción explícita, protección del inventario inicial, rechazo de recepción repetida, compra de varias presentaciones en un documento, tarifas de lavandería y ausencia de movimientos por servicios. Se vuelven a ejecutar las pruebas anteriores de ventas mixtas, correcciones, anulaciones, mayoreo, conciliación, contratos, clasificación e integridad histórica.

En la revisión de navegador se comprobó alta integrada de producto con dos presentaciones, edición con unidad histórica protegida, compras y recepción, comparadores, inventarios, tarifas, buscador y venta mixta. Se revisaron capturas de escritorio y del formulario de jarcería a 390 px: sin desbordamiento horizontal del diálogo y con Guardar visible. Los formularios largos conservan encabezado y acciones mientras se desplaza su contenido.

Se corrigieron fallos reales encontrados: mínimo decimal incompatible con paquetes enteros, referencia nula al consultar recepción sin persistencia durante renderizado y ordenación de inventario por columnas de limpieza ausentes. Los cambios en las comprobaciones de renderizado reflejan que los formularios ahora se abren desde Agregar / Editar; no se eliminaron comprobaciones del dominio para obtener resultados aprobados.

## 12. Capturas de las pantallas finales

Todas corresponden a QA con datos sintéticos. Algunas capturas reflejan escenarios de ensayo distintos, no una única compra o sesión continua.

| Pantalla | Captura |
|---|---|
| Productos de limpieza, referencia visual conservada | [Ver](artifacts/armonizacion-20261105/capturas/limpieza-referencia.png) |
| Proveedores | [Ver](artifacts/armonizacion-20261105/capturas/proveedores.png) |
| Productos de jarcería | [Ver](artifacts/armonizacion-20261105/capturas/productos-jarceria.png) |
| Producto con presentaciones en la misma ventana | [Ver](artifacts/armonizacion-20261105/capturas/producto-jarceria-editar.png) |
| Formulario web a 390 px | [Ver](artifacts/armonizacion-20261105/capturas/producto-jarceria-movil-web.png) |
| Historial original de Compras | [Ver](artifacts/armonizacion-20261105/capturas/compras-historial.png) |
| Captura de compra y equivalencia de 5 paquetes | [Ver](artifacts/armonizacion-20261105/capturas/compra-captura.png) |
| Detalle con recepción parcial por renglón | [Ver](artifacts/armonizacion-20261105/capturas/compra-detalle-parcial.png) |
| Inventario de jarcería | [Ver](artifacts/armonizacion-20261105/capturas/inventario-jarceria.png) |
| Comparador de limpieza, referencia conservada | [Ver](artifacts/armonizacion-20261105/capturas/comparador-limpieza-referencia.png) |
| Comparador de jarcería | [Ver](artifacts/armonizacion-20261105/capturas/comparador-jarceria.png) |
| Lavandería y combinaciones de tarifas | [Ver](artifacts/armonizacion-20261105/capturas/lavanderia.png) |
| Edición de servicio y adicionales | [Ver](artifacts/armonizacion-20261105/capturas/lavanderia-editar.png) |
| Venta mixta de $232 | [Ver](artifacts/armonizacion-20261105/capturas/venta-mixta.png) |

## 13. Pendientes técnicos para futura activación

1. La entrega sigue aislada. Una futura activación requerirá su propio procedimiento de respaldo/restauración, revisión de migraciones 009–010 y verificación de contratos contra las versiones que entonces estén instaladas. No se ejecutó ni se solicita ahora.
2. Clasificar explícitamente los proveedores reales y revisar costos, existencias iniciales, características y presentaciones reales. Los ensayos no proporcionan esos datos comerciales y no los trasladan al negocio.
3. Los servicios personalizados siguen sin tarifa fija hasta que el propietario la defina. La existencia equivalente no permite prometer paquetes sellados; para ello haría falta un control físico adicional.
4. La corrección de compras de jarcería continúa mediante anulación y nuevo documento, con revisión de recepciones. La edición directa de esos snapshots no está habilitada.
5. No se compiló ni instaló otra APK. Continúa pendiente la validación nativa indicada en la ampliación anterior; esta tarea no cambia las fuentes móviles ni los datos del dispositivo.
6. Se observó una advertencia de foco/`aria-hidden` de MUI al abrir algunos diálogos. La revisión final del inventario en una carga nueva no tuvo errores de consola. Una revisión de accesibilidad completa queda fuera de las comprobaciones visuales realizadas.

No se modificó PostgreSQL operativo, no se reiniciaron servicios operativos, no se registraron operaciones reales, no se aplicaron migraciones operativas y no se hicieron commits ni pushes. Únicamente se reinició el proceso QA creado para esta entrega al actualizar su servidor; las instancias anteriores y los servicios del negocio se conservaron.
