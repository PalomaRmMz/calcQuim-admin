# Simplificación de captura de ventas web

9 de noviembre de 2026, America/Mexico_City. **Implementado y verificado en QA; no publicado en operación.** Se parte de la activación v2 ya finalizada, sin alterar su paquete ni interrumpir servicios.

Resultado: selector Tarifa eliminado en la versión preparada; precio vigente informativo; cantidad física sugerida, editable y recuperable; **540 pruebas aprobadas y cero fallidas**. Paquete de **12 archivos**, sin migraciones ni dependencias nuevas.

## Dependencias reales del selector

El selector mantenía una clave interna que el backend utiliza para validar precio, unidad y origen comercial. Esa clave y su validación se conservan. Un producto individual, una presentación de Jarcería o un servicio tienen una única alternativa en el catálogo revisado: no necesitan otro selector.

Se encontró una función adicional real: seis categorías comerciales de Limpieza ofrecen varios precios/orígenes. Son Cuidado Automotríz (4), Higiene Personal (2), Lavandería como categoría de productos de limpieza (2), Limpiadores Multiusos (3), Limpieza General (10) y Mascotas (3). No se eliminaron esas capturas agrupadas ni se tomó arbitrariamente el primer precio.

La elección se trasladó al resultado del buscador: cada alternativa conserva referencia de grupo, clave, unidad, productos elegibles y origen exacto. Se muestra precio y productos incluidos. Por ejemplo, Hipoclorito y Cloro Gel cuestan ambos $15/litro, pero mantienen resultados y orígenes distintos; no se fusionaron por coincidencia numérica. No se agregó otro selector de presentación. [Auditoría del catálogo](artifacts/web-simplificacion-captura-20261109/catalog-dependencies.json).

El mayoreo de ventas procede de `wholesalePricing.mjs` y sus fuentes oficiales; los escalones de proveedor pertenecen a Compras. Ambos permanecieron sin cambios. El precio cambia automáticamente cuando corresponde: Fabuloso Ferrari muestra $10/litro y, al capturar diez litros, $7/litro con indicación de mayoreo automático. Los casos mixtos ambiguos conservan el rechazo del motor hasta recibir una confirmación comercial válida; no se inventa un precio para resolverlos.

## Controles y diseño

- Se retiró el desplegable Tarifa de Limpieza y Jarcería. Su clave sigue siendo un dato interno, validado por el servidor.
- Se muestra «Precio de venta: $… / unidad», sin edición arbitraria. La presentación se elige una vez desde el buscador.
- Limpieza conserva radios, cantidad/importe y confirmación física en una misma fila de escritorio.
- Jarcería muestra el precio y un solo campo principal de cantidad. Para la presentación con clave `rollo`, factor 1 y unidad base `pieza`, la etiqueta visible dice «rollo»; no se modifica la unidad ni la conversión almacenadas.
- Se conserva apilamiento en pantallas pequeñas, botón inferior y formulario de lavandería.

## Autocálculo y edición manual

La sugerencia usa la conversión del motor comercial vigente, incluyendo el precio efectivo de mayoreo cuando corresponde. Se calcula con la razón monetaria y precisión de hasta seis decimales, mostrando al menos tres. Así, $10 a $10/litro sugiere **1.000 litro**. Una fracción periódica se propone a seis decimales; cantidades fuera de rango o menores que la precisión admitida no generan una confirmación cero inventada.

Mientras no se edite la cantidad física, cambiar $10→$20 actualiza 1.000→2.000. Después de escribir 0.950 manualmente, cambiar el monto conserva 0.950. «Usar cantidad calculada» recupera la propuesta actual. Cambiar concepto o modo limpia monto, cantidad y estado manual; Jarcería no hereda datos de Limpieza. [Prueba de edición](artifacts/web-simplificacion-captura-20261109/browser-editing.json) · [Cambio de concepto y mayoreo](artifacts/web-simplificacion-captura-20261109/browser-switching.json).

**Importe comercial y cantidad realmente entregada se registran por separado.** La cantidad refinada no recalcula el dinero ni determina por sí sola el descuento de mayoreo. Si una captura mixta admite dos precios, la confirmación exacta que exige el motor existente se mantiene diferenciada y validada. En QA, nueve litros más $7 solicitaron confirmación; al confirmar 1.000 litro se conservó el precio autorizado de $7 y total $70.

## Adaptación necesaria de backend

La revisión mostró que el campo anterior participaba en la validación comercial del mayoreo y no sustituía directamente la salida de inventario; las ventas WEB por monto seguían la conversión/redondeo físico existente. Cambiar solo el texto o autollenar ese campo no habría cumplido el ejemplo de 0.950 litros.

Se añadió el contexto **`web-confirmed-quantity-v1`**, exclusivo de nuevas capturas web que lo incluyen. Conserva cantidad, unidad, versión y origen sugerido/manual en el renglón, recibo y referencia del movimiento. El servidor lo valida y el mecanismo transaccional existente utiliza esa cantidad física. No se sustituyó el mecanismo de descuento, apertura de paquetes, anclajes, reversión, idempotencia o asignación de grupos.

Las ventas anteriores y clientes sin este contexto conservan su comportamiento. El canal móvil no lo incorpora. Los grupos siguen pendientes de desglose: confirmar litros no asigna arbitrariamente un producto; el desglose debe sumar la cantidad física confirmada y respetar los productos elegibles.

Las correcciones de documentos nuevos mantienen original, versiones y auditoría. Se probó una corrección exclusivamente física de 0.950→0.900 sin cambiar $10 y una corrección posterior del importe, además de anulación/reintento. No se afirmó cobro o devolución monetaria adicional. Tickets HTML/PNG y detalle distinguen la entrega física del valor comercial; los tickets antiguos no cambian.

No se requiere migración: se utiliza el almacenamiento JSON y las transacciones existentes. No se editó ninguna migración aplicada ni se alteró la política monetaria v2.

## Pruebas y resultados

| Suite | Aprobadas | Fallidas | Omitidas |
|---|---:|---:|---:|
| Web | 339 | 0 | 0 |
| Backend | 45 | 0 | 0 |
| Integración PostgreSQL | 156 | 0 | 0 |
| **Total** | **540** | **0** | **0** |

Son 18 pruebas adicionales a la referencia de 522. Suites completas sobre el código final y compilación Vite aprobada. [Resumen](artifacts/web-simplificacion-captura-20261109/test-summary.json); logs `web-tests.log`, `server-tests.log`, `integration-tests.log` y `build.log` en el mismo directorio. La compilación conserva advertencias de tamaño de chunks; no se amplió el alcance con una reorganización global.

Se validaron: cantidad; monto; sugerencia y precisión; edición/restauración; cambio de modo/concepto; pieza, rollo y paquete; precio según presentación; mayoreo individual, agregado y mixto ambiguo; fuentes distintas con igual precio; grupo pendiente y asignación exacta; cantidades inválidas con rollback; inventario físico; corrección/anulación; idempotencia; redondeo v2 y mínimo; móvil exacto e histórico.

La integración PostgreSQL creó producto sintético con saldo conocido en esquema aislado. $10 y 0.950 litros conservaron dinero y descontaron exactamente 0.950; corrección física, devolución y reintentos utilizaron los movimientos existentes. Otra prueba conservó el mínimo v2 de $0.50 para $0.01 sin modificar la salida física confirmada de 0.001 litro.

Además, la UI de QA guardó una venta de Fabuloso Ferrari: comercial $10, cantidad económica 1 litro y entrega 0.950 litro; el movimiento fue **−0.95 litro**, con referencia versionada y fuente manual. La corrección por UI a 0.900 mantuvo $10. [Evidencia del guardado en QA](artifacts/web-simplificacion-captura-20261109/browser-saved-qa.json). Los folios de QA pueden coincidir con los operativos porque son bases distintas; se verificaron identificadores diferentes.

## Capturas

Se comprobaron **15 casos** a 1366, 768 y 390 px: Limpieza por cantidad/monto y Jarcería por pieza/rollo/paquete. Cero selectores de precio en esas capturas, cero desbordamientos y cero excepciones JavaScript durante la prueba. [Métricas](artifacts/web-simplificacion-captura-20261109/browser-layout.json).

| Escenario | Evidencia |
|---|---|
| Antes, operación sin modificar | [Tarifa y cantidad física vacía](artifacts/web-simplificacion-captura-20261109/operative-before-cleaning.png) |
| Limpieza, escritorio | [Cantidad](artifacts/web-simplificacion-captura-20261109/qa-1366-cleaning-quantity.png) · [Monto y sugerencia](artifacts/web-simplificacion-captura-20261109/qa-1366-cleaning-amount.png) |
| Limpieza, intermedia y pequeña | [768 px](artifacts/web-simplificacion-captura-20261109/qa-768-cleaning-amount.png) · [390 px](artifacts/web-simplificacion-captura-20261109/qa-390-cleaning-amount.png) |
| Jarcería, presentación | [Pieza](artifacts/web-simplificacion-captura-20261109/qa-1366-piece-quantity.png) · [Rollo](artifacts/web-simplificacion-captura-20261109/qa-1366-roll-quantity.png) · [Paquete](artifacts/web-simplificacion-captura-20261109/qa-1366-package-quantity.png) |
| Jarcería, pantalla pequeña | [Paquete a 390 px](artifacts/web-simplificacion-captura-20261109/qa-390-package-quantity.png) |
| Edición manual y agrupaciones | [0.950 manual](artifacts/web-simplificacion-captura-20261109/qa-manual-physical.png) · [Origen de precio](artifacts/web-simplificacion-captura-20261109/qa-group-price-source.png) · [Mayoreo mixto](artifacts/web-simplificacion-captura-20261109/qa-mixed-wholesale.png) |
| Registro e historial | [Ticket PNG con entrega 0.950](artifacts/web-simplificacion-captura-20261109/qa-ticket-physical.png) · [Corrección física](artifacts/web-simplificacion-captura-20261109/qa-physical-correction.png) |

## Archivos preparados

Todos exclusivamente bajo `artifacts/web-simplificacion-captura-20261109/source`:

| Archivo | Cambio |
|---|---|
| `src/components/CommercialSaleForm.jsx` | Precio informativo, selección única, estado de sugerencia/manual y envío de contexto web. |
| `src/components/CleaningSaleFields.jsx` | Sugerencia y recuperación de cantidad calculada. |
| `src/domain/webSaleCapture.mjs` | Opciones de buscador, precisión, sugerencia y validación del contexto físico. |
| `src/styles/components/SaleFormModal.css` | Grid sin selector, compacto y responsive. |
| `src/components/MobileSaleCorrection.jsx` | Componente administrativo web: corrección de la cantidad física nueva. No es código Android. |
| `src/pages/SalesPage.jsx` | Entrega confirmada visible en detalle. |
| `src/domain/mobileReceipt/ticket.mjs` | Entrega física en tickets nuevos; salida histórica idéntica. |
| `server/src/services/webPhysicalCapture.mjs` | Adaptador exclusivo web para altas/correcciones, con validaciones y auditoría. |
| `server/src/services/commands.mjs` | Integración del adaptador con los comandos existentes. |
| `server/src/services/inventory.mjs` | Consumo del contexto físico nuevo y conservación del resto de flujos. |
| `tests/web-sale-capture.test.js` | Casos de dominio y compatibilidad. |
| `server/integration/web-sale-capture.test.mjs` | Persistencia, movimientos, mayoreo, correcciones, anulación y móvil en PostgreSQL aislado. |

[Manifiesto con hashes](artifacts/web-simplificacion-captura-20261109/manifest.json) · [ZIP preparado](artifacts/web-simplificacion-captura-20261109/prepared-changes.zip) · [Originales](artifacts/web-simplificacion-captura-20261109/original-target-files.zip) · [Parche](artifacts/web-simplificacion-captura-20261109/prepared.patch) · [Integridad](artifacts/web-simplificacion-captura-20261109/package-integrity.json). Ambos ZIP pasan CRC; el parche pasa `git apply --check`, sin aplicarse.

## Compatibilidad y estado real de operación

Al iniciar se verificó que la activación anterior estaba terminada y el gestor normal saludable. QA usa puerto **5193**, base `calcquim_activation_test` y esquema `calcquim_test_simpleui_619019efda7345`; se reanudó únicamente ese proceso QA cuando fue necesario. No se detuvieron ni reiniciaron servicios operativos.

La lectura inicial de solo consulta encontró revisión **194**, generación `39656fe8-6025-4740-8f19-8b767f1e9a9c`, 96 productos, 55 ventas y 8 compras. Al cierre, la operación estaba en revisión **195**, con 56 ventas: apareció una venta operativa nueva y su movimiento vinculado, distintos de los de QA. Las 55 ventas previas y los movimientos previos quedaron idénticos; la variación del inventario corresponde a esa actividad normal, no a una escritura de esta tarea. Compras y composición de paquetes permanecieron iguales. [Comparación de actividad](artifacts/web-simplificacion-captura-20261109/concurrent-operational-activity.json).

Se conservaron **410 hashes de código operativo**, migraciones 001–013 y checksums, v2 habilitada con el mismo único evento, siete módulos protegidos del cliente Android y todos los módulos móviles del servidor. Los archivos de cálculo de mayoreo, redondeo, presentaciones y campos de lavandería permanecen byte por byte iguales en QA y operación. Los **22 tickets históricos** disponibles al corte inicial producen HTML idéntico entre renderers. [Preflight final de solo lectura](artifacts/web-simplificacion-captura-20261109/operational-safety.json).

API live/ready y web respondieron 200; el gestor operativo continúa con PID 15476, listo y sin advertencia móvil. No se modificaron precios, compras, inventarios iniciales, preparaciones, paquetes, Android ni la corrección pendiente de Mr. Big. Cero ventas ficticias operativas, commits o pushes.

## Publicación y condiciones pendientes

**No publicado.** El entorno operativo conserva su selector Tarifa y comportamiento anteriores. La autorización de activación v2 no se reutilizó para esta entrega.

Para publicar se requiere autorización específica de estos 12 archivos, preflight y respaldo frescos con restauración independiente, conservación de cambios posteriores y ventana coordinada. Aunque no hay migración, debe desplegarse backend y frontend conjuntamente: un backend anterior no interpreta el contexto físico nuevo. No publicar esta mejora como si fuera solo CSS.

Una vez creadas ventas con `web-confirmed-quantity-v1`, las correcciones deben mantener lectores y cálculo físico compatibles. No regresar sin revisión al backend anterior, que podría derivar otra cantidad al corregir una venta por monto. Conservar originales e historial y priorizar una recuperación compatible con los documentos ya creados.

La implementación solicitada queda terminada y verificada en QA; **la activación queda pendiente de autorización posterior**. No hay fallos críticos conocidos pendientes en las pruebas realizadas.
