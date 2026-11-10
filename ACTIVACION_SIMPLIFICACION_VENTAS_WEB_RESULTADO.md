# Activación operativa de captura simplificada de ventas

**Publicación completada el 10 de noviembre de 2026.** Los 12 archivos autorizados están en operación; frontend y backend son compatibles con `web-confirmed-quantity-v1`; captura web y móvil restablecida. Sin migraciones, cambios de configuración monetaria ni operaciones comerciales de prueba.

Horas de este informe: **America/Mexico_City, UTC−06:00**. Los JSON de evidencia conservan UTC.

## Fases y hora real

| Fase | Resultado |
|---|---|
| Preflight fresco final | Aprobado a las 13:31:38; revisión 195, sin transacciones comerciales activas |
| Restauración independiente | Verificada a las 13:30:25; 3285 comprobaciones relacionales sin fallos |
| Publicación de los 12 archivos | Confirmada a las **13:31:56.616**; hashes exactos |
| Backend y frontend temporal de verificación | Salud aprobada a las 13:32:18; escrituras del proxy bloqueadas y móvil detenido |
| Validación funcional y responsive | Aprobada sin guardar ventas |
| Reapertura normal | **13:33:34**, gestor y receptor móvil disponibles |
| Postflight normal | Aprobado a las **13:33:35.305**; revisión 195 y datos íntegros |

La interrupción duró aproximadamente dos minutos, entre 13:31 y 13:33. PostgreSQL no se reinició. La autorización utilizada es la solicitud expresa `3965befc-6fe9-4aea-bac4-fa06c940a8fc`, exclusivamente para esta actualización.

## Estado antes y después

| Dato | Antes | Corte pospublicación |
|---|---|---|
| Proyecto servido | `D:\ReactApps\calcQuim-admin` | Mismo árbol operativo |
| Revisión | **195** | **195** |
| Generación | `39656fe8-6025-4740-8f19-8b767f1e9a9c` | Idéntica |
| Productos | 96 | 96; registros idénticos |
| Categorías de Limpieza / Jarcería | 12 / 9 | Sin cambios |
| Ventas | **56** | **56**; contenido y metadatos históricos idénticos |
| Compras | **8** | **8**; contenido idéntico |
| Inventarios y movimientos | Corte fresco respaldado | Idénticos |
| Paquetes cerrados y unidades sueltas | Composición fresca respaldada | Idéntica |
| Precios, preparaciones y configuración comercial | Corte fresco respaldado | Idénticos |
| Migraciones | 001–013 | Mismas filas y checksums |
| Política monetaria | `web-cash-nearest-50-min-50-v2`, habilitada | Misma configuración e historial |

No se asumieron los conteos del informe anterior: se releyeron PostgreSQL y la API. La publicación no generó un evento de configuración ni un incremento de revisión. Se compararon el dataset completo, contadores, inventarios, pendientes, movimientos, compras y composición física, primero bajo cierre coordinado y después del arranque. **Cero escrituras comerciales operativas.**

Evidencias: [preflight](artifacts/web-activation-simplificacion-20261110/preflight.json), [publicación](artifacts/web-activation-simplificacion-20261110/publication.json), [validación durante mantenimiento](artifacts/web-activation-simplificacion-20261110/maintenance-verification.json), [postflight normal](artifacts/web-activation-simplificacion-20261110/postflight.json).

## Integridad del paquete y archivos publicados

Se verificaron los **410 archivos protegidos** y los hashes originales de los 12 destinos. No aparecieron cambios posteriores incompatibles. Las dependencias y el paquete autorizado coinciden; no se reconstruyó ni modificó la funcionalidad aprobada.

- ZIP preparado: SHA-256 `6deec78504ab8c1c743e1a3200e358d1789885d90a03d888fbadf4227169f96f`.
- Parche: SHA-256 `6c967c700ec5cc9e706b85e8b9022a8398fff2aa3f744137c239198f0df41dfb`.
- CRC del ZIP y `git apply --check` aprobados antes de intervenir. Se publicó mediante copia exacta, no mediante reset/checkout ni cambios al índice.
- Después de copiar, los 12 hashes coinciden con el paquete; todos los demás archivos protegidos conservaron su huella anterior.

| Archivo publicado | Función |
|---|---|
| `src/components/CommercialSaleForm.jsx` | Precio informativo y captura simplificada |
| `src/components/CleaningSaleFields.jsx` | Cantidad sugerida, edición y recuperación |
| `src/domain/webSaleCapture.mjs` | Conversión, contexto físico y alternativas comerciales |
| `src/styles/components/SaleFormModal.css` | Distribución compacta responsive |
| `src/components/MobileSaleCorrection.jsx` | Correcciones administrativas de la web; no es Android |
| `src/pages/SalesPage.jsx` | Entrega física visible en el detalle |
| `src/domain/mobileReceipt/ticket.mjs` | Presentación de entrega física en tickets nuevos |
| `server/src/services/webPhysicalCapture.mjs` | Validación y registro del contexto exclusivo web |
| `server/src/services/commands.mjs` | Integración con comandos transaccionales existentes |
| `server/src/services/inventory.mjs` | Uso de cantidad confirmada en documentos nuevos |
| `tests/web-sale-capture.test.js` | Pruebas autorizadas, sin ejecución en el servicio operativo |
| `server/integration/web-sale-capture.test.mjs` | Integración aislada, sin fixtures operativos |

[Hashes completos de cada archivo desplegado](artifacts/web-activation-simplificacion-20261110/publication.json) · [Manifiesto autorizado con originales y preparados](artifacts/web-simplificacion-captura-20261109/manifest.json).

Los scripts de la ventana y las evidencias se mantienen en `artifacts/web-activation-simplificacion-20261110`; no se incorporaron al código servido. No se publicaron credenciales, snapshots privados, fixtures ni datos sintéticos. No se hicieron commits ni pushes.

## Respaldo fresco y restauración

Respaldo previo, **10 de noviembre a las 13:28:02**, revisión 195, generación conservada y migraciones 001–013:

- Archivo: `postgres-2026-11-10T19-28-02-751Z-cf695cd2-4d95-48c2-8333-5c94f6aea65a.dump`.
- Tamaño: **1,595,437 bytes**.
- SHA-256: **`950302d14714aa1fd17c827f995e23f36b0c3dfc0826ae0e4f3e6926f123b219`**.
- Ubicación local: `D:\ReactApps\calcQuim-admin\server\artifacts\operational\backups`.
- Copia adicional y manifiesto: `D:\CalcQuim-Backups\activation-simple-web-20261110`, con hash verificado.
- Respaldo fresco de los archivos existentes a reemplazar: [operational-originals.zip](artifacts/web-activation-simplificacion-20261110/operational-originals.zip), CRC comprobado y copia adicional verificada. Los archivos nuevos se identifican en el manifiesto con original inexistente.

La cuenta de aplicación no puede crear bases. El propietario creó y confirmó la base vacía **`calcquim_recovery_20261110_simple`**, con su propietario correspondiente. Se comprobó vacía antes de restaurar; no se sobrescribió la operación ni una recuperación anterior.

Restauración completa aprobada: **3285 comprobaciones relacionales, cero fallos y cero FK sin validar**. Se compararon dataset, categorías, productos, compras, ventas, inventarios, movimientos, paquetes, metadatos históricos, configuración monetaria v2 e historial, además de migraciones/checksums. Todo coincide con el corte fresco. **No se ejecutó ninguna migración en este despliegue ni en la restauración.** [Evidencia](artifacts/web-activation-simplificacion-20261110/restore-verified.json).

La copia adicional está en el mismo disco D:; **no equivale a respaldo fuera del dispositivo**. Se conservaron todos los respaldos anteriores y no se copiaron credenciales.

## Coordinación y servicios

Se informó la interrupción y se confirmó el gestor como propietario de API/móvil y frontend. Se usó el cierre ordenado existente, dejando concluir solicitudes activas. Se comprobaron puertos de aplicación cerrados y ausencia de transacciones comerciales pendientes. Antes de copiar se bloqueó y verificó el dataset contra el respaldo; una diferencia habría detenido la publicación.

Frontend y backend se copiaron como una unidad mientras estaban detenidos. Para validar antes de reabrir, se inició temporalmente la API nueva y un frontend cuyo proxy devolvía 503 a escrituras; ese bloqueo se comprobó con una solicitud de diagnóstico sin efecto comercial. El receptor móvil permaneció detenido durante esta fase. No se modificaron permisos ni datos para establecer mantenimiento.

Tras validar, se cerró esa instancia temporal y se inició el gestor normal. Estado final:

| Servicio | Resultado |
|---|---|
| Gestor, API y receptor móvil | PID **18388**, ready, sin advertencia móvil |
| API | `127.0.0.1:3003`, live y ready 200 |
| Frontend normal | PID **9260**, `127.0.0.1:5173`, HTTP 200 |
| Móvil | `127.0.0.1:3016` y `192.168.1.64:3016` disponibles |
| PostgreSQL | PID **7156**, sin reinicio, acceso local preservado |

La captura ya no utiliza el bloqueo temporal. El arranque normal registrado tomó aproximadamente 1.23 s en este equipo; no constituye una prueba de carga.

## Verificación funcional publicada

**Limpieza:** no hay selector Tarifa. Se muestra «Precio de venta: $10.00 / litro» para Fabuloso Ferrari. Por monto, $10 sugiere **1.000 litro**; $20 actualiza **2.000** mientras no haya edición. Escribir **0.950** y cambiar el monto conserva la cantidad manual. «Usar cantidad calculada» restaura **1.000**. Cambiar de modo o concepto elimina valores residuales. Por cantidad, diez litros muestran automáticamente $7/litro de mayoreo, sin selector de precio.

**Jarcería:** se comprobó pieza, rollo y paquete seleccionados desde el buscador, con un solo campo principal. Precios informativos verificados: Atomizador 1 L $25/pieza, Mr. Big 600 $10/rollo y $31/paquete. No se cambiaron precios, presentaciones, factores ni reglas de apertura de paquetes.

**Responsive:** 15 casos a 1366, 768 y 390 px, con Limpieza por cantidad/monto y Jarcería por pieza/rollo/paquete. Sin desbordamientos, sin selectores de precio adicionales y sin excepciones JavaScript durante la prueba. Se inspeccionaron capturas de escritorio y móvil. [Métricas](artifacts/web-activation-simplificacion-20261110/browser-layout.json) · [Edición y recuperación](artifacts/web-activation-simplificacion-20261110/browser-editing.json).

Las alternativas agrupadas conservan referencias, productos elegibles y orígenes distintos aunque tengan igual precio. El motor de mayoreo no se modificó; la ambigüedad comercial sigue requiriendo confirmación válida. Los precios de proveedor en Compras permanecen separados de esta captura.

Se reconoció el contexto desde el código backend publicado mediante cálculo **en memoria**: el renglón web de $10 con confirmación 0.950 produce cantidad física **0.95**, mientras el mismo cálculo por canal móvil mantiene su interpretación anterior. La persistencia transaccional, correcciones, reintentos, anulación y movimientos se validaron en los esquemas aislados de la suite, **sin probar escrituras sobre inventario operativo**.

Los **23 tickets históricos** disponibles producen HTML idéntico byte por byte antes y después. La política v2 y su historial completo siguen iguales; cálculos del dominio publicado confirmaron mínimo de $0.50 para $0.01 en efectivo y exactitud de tarjeta. No se habilitó ni deshabilitó ninguna regla monetaria.

## Pruebas repetidas para esta activación

| Suite aislada | Aprobadas | Fallidas | Omitidas |
|---|---:|---:|---:|
| Web | 339 | 0 | 0 |
| Backend | 45 | 0 | 0 |
| Integración PostgreSQL | 156 | 0 | 0 |
| **Total** | **540** | **0** | **0** |

También pasó la compilación del paquete con las dependencias actuales. No se editó el paquete para lograrlo. Se conservaron las advertencias de tamaño de chunks conocidas; no hubo fallo crítico de compilación o arranque.

Las pruebas PostgreSQL verificaron prioridad de cantidad confirmada, dinero separado, descuento físico transaccional, rollback de cantidades inválidas, grupos y mayoreo mixto, correcciones físicas y comerciales, original conservado, idempotencia, anulación auditada, apertura de paquetes, v2 y compatibilidad móvil. Se ejecutaron en `calcquim_activation_test` con esquemas sintéticos, no en la base operativa.

[Resultados](artifacts/web-activation-simplificacion-20261110/activation-tests.json); logs `activation-web-tests.log`, `activation-server-tests.log`, `activation-integration-tests.log` y `activation-build.log` en el mismo directorio.

## Evidencia visual

| Escenario | Captura |
|---|---|
| Limpieza, escritorio | [Cantidad](artifacts/web-activation-simplificacion-20261110/live-1366-cleaning-quantity.png) · [Monto y sugerencia](artifacts/web-activation-simplificacion-20261110/live-1366-cleaning-amount.png) |
| Limpieza, intermedia/estrecha | [768 px](artifacts/web-activation-simplificacion-20261110/live-768-cleaning-amount.png) · [390 px](artifacts/web-activation-simplificacion-20261110/live-390-cleaning-amount.png) |
| Jarcería | [Pieza](artifacts/web-activation-simplificacion-20261110/live-1366-piece-quantity.png) · [Rollo](artifacts/web-activation-simplificacion-20261110/live-1366-roll-quantity.png) · [Paquete](artifacts/web-activation-simplificacion-20261110/live-1366-package-quantity.png) |
| Jarcería estrecha | [Paquete a 390 px](artifacts/web-activation-simplificacion-20261110/live-390-package-quantity.png) |
| Cantidad manual | [0.950 durante validación](artifacts/web-activation-simplificacion-20261110/live-manual-physical.png) |
| Captura normal restablecida | [Formulario publicado sin Tarifa y con 0.950 editable](artifacts/web-activation-simplificacion-20261110/final-live-physical.png) |

Todos los borradores operativos se cancelaron. No se pulsó Registrar venta ni se introdujeron operaciones ficticias.

## Compatibilidad Android

No se modificó ni compiló Android, APK, sus siete módulos protegidos, contratos, autenticación o funcionalidades bloqueadas. Sus hashes coinciden. El protocolo del servidor y el cálculo comercial compartido conservaron sus archivos originales.

Después de reabrir: catálogo autorizado 200 tanto por localhost como por LAN; sin credencial 401; consulta de estado de idempotencia 200. El catálogo coincide con el previo salvo la marca temporal de respuesta. Jarcería y Lavandería Android siguen bloqueadas, y las ventas móviles mantienen importes exactos sin heredar el contexto web.

La separación WEB/MOVIL y el tratamiento de metadatos enviados arbitrariamente por móvil se verifican en la suite del backend desplegado. No se registró una venta móvil real de prueba ni se afirma una prueba física del teléfono: la comprobación operativa utilizó sus rutas existentes.

## Respaldo posterior

Creado a las **13:33:25**, antes de reabrir captura:

- `postgres-2026-11-10T19-33-25-785Z-18ec1597-f52f-4680-9c87-5070b4f06e1e.dump`.
- **1,595,437 bytes**.
- SHA-256 `a4369cfba85365db3c2cead987fa215dd3022ae3996780e4328503a5a47f433b`.
- Archivo legible, configuración v2 incluida y copia adicional verificada en la misma ubicación separada.

La restauración completa de esta ventana corresponde al respaldo anterior. El posterior fue verificado como archivo y copia; no se declara una segunda restauración. Los manifiestos originales conservan sus indicadores iniciales y las verificaciones posteriores se documentan en evidencias separadas.

## Incidencias, recuperación y cierre

No hubo incidencias críticas de despliegue ni necesidad de reversión o restauración de datos. La base independiente requirió creación por el propietario debido al permiso limitado de la cuenta; se mantuvo la operación disponible hasta completar ese requisito. La publicación y el arranque pasaron sin cambiar archivos fuera de los 12 autorizados.

Antes de usar el contexto nuevo podría evaluarse una reversión coherente del código, verificando datos y servicios. **Después de registrar ventas con `web-confirmed-quantity-v1`, no volver automáticamente al backend anterior:** podría calcular otra cantidad al corregir ventas por monto. Ante una falla crítica, suspender nuevas escrituras, preservar las ventas nuevas y reparar manteniendo lectores/correcciones compatibles. Nunca restaurar un respaldo anterior sobre operaciones posteriores sin reconciliación y autorización específica.

Recargar las pestañas de CalcQuim para cargar el formulario nuevo. Se recomienda conservar una copia fuera del dispositivo. No se ejecutó la corrección de Mr. Big, cambios de precios/categorías, compras, preparaciones, ajustes de inventario, desarrollo móvil, commits o pushes.

**Estado final: publicación técnica completada, backend compatible, formulario simplificado activo y captura comercial restablecida. Migraciones y v2 intactas; datos preservados; sin pendientes críticos de esta activación.**
