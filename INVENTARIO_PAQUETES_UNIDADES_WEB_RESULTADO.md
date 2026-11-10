# Inventario de paquetes cerrados y unidades sueltas — resultado QA

**Preparado para revisión, sin activación operativa.** Entrega acumulada de **74 archivos**, 20 modificados o incorporados en esta continuación. Se preservaron íntegros los 67 archivos de la entrega anterior en su carpeta original. El código nuevo está en `artifacts/web-paquetes-20261107/source/`.

## Modelo e integración

Se conserva el inventario equivalente base y se añade una cuenta física por producto: presentación cerrada elegida, factor entero, paquetes cerrados, unidades sueltas, composición conocida/desconocida y versión. El total comprobable es `cerrados × factor + sueltos`. Cero confirmado y desconocido permanecen distintos.

La migración 012 incorpora cuentas y eventos físicos vinculados a movimientos base, sin recalcular saldos ni interpretar históricos. Claves únicas, bloqueos por producto, transacciones y versiones evitan duplicaciones y conflictos. Las aperturas se auditan sin añadir un segundo movimiento base. Las cantidades físicas se calculan con enteros exactos.

La elegibilidad comprende jarcería en piezas con paquete activo de factor entero mayor que uno e individual activo de factor uno. Se reutilizan Mr. Big 600/800 y Vogue; no se crean duplicados comerciales. Se elige una referencia cerrada por producto. Varias referencias cerradas ambiguas exigen selección y conciliación; no se agregan factores diferentes ni se inventan sellos.

## Ventas, compras e inventarios

- Venta individual: consumir sueltos primero. Si faltan, abrir solamente `ceil((demanda − sueltos)/factor)` paquetes. Ejemplo verificado: 4 cerrados y 0 sueltos → vender 1 rollo → 3 cerrados, 3 sueltos, total 15. Con 4 cerrados y 2 sueltos el total es 18, únicamente cuando esa composición se captura expresamente.
- Venta por paquete: descontar paquetes físicamente cerrados. Tener suficientes piezas equivalentes no autoriza reconstruir un paquete cerrado. Se conserva el precio de la presentación vendida.
- Compra: usar la presentación real registrada para clasificar paquetes o sueltos. Una compra histórica declarada incorporada manualmente no añade existencias ni composición. Se corrigió además el doble cómputo de lotes retenidos con recepción existente en devolución/anulación.
- Inicial y conteo: capturar composición opcional y validar el equivalente en la misma transacción. Registrar solo una cantidad, incluso convertida desde paquetes, no demuestra que están cerrados. Sigue disponible el inicial posterior y se rechaza un segundo inicial.
- Corrección: guardar conjuntamente el cambio numérico y físico con versión revisada. Si existen movimientos posteriores, exigir también composición física actual. Una corrección solamente numérica invalida la composición en lugar de inventarla.
- Devolución/anulación: registrar movimientos y eventos auditables. El retorno individual aumenta sueltos; el paquete solo vuelve cerrado con evidencia explícita. Si su condición es incierta, se conserva el equivalente y la composición queda desconocida. Anular una venta que abrió paquetes no vuelve a sellarlos.

Se rechaza sobregiro cuando el saldo es conocido. Con composición desconocida se admite el flujo individual conforme a la política base y su límite conocido, pero se bloquea la venta cerrada hasta conciliar. Los saldos desconocidos no se convierten en existencias ficticias. Los factores de una composición conocida no pueden alterarse silenciosamente.

## Datos reales y preservación

La lectura operativa final fue exclusivamente de consulta: **revisión 176, 7 de noviembre de 2026, 16:35:25 UTC**; 95 productos, 24 de jarcería, 15 iniciales de jarcería y 8 compras/70 renglones. Durante el trabajo apareció el inicial de Atomizador ½ L variante B, ID 84; se conserva y no se sustituye por la copia QA anterior.

QA se creó desde la revisión 173, que tenía 14 iniciales de jarcería. Su prueba de preservación confirmó 95 productos, 95 saldos, 40 ventas históricas, 8 compras y 28 presentaciones sin alteración. Las dos ventas nuevas y el producto de prueba existen exclusivamente en PostgreSQL aislado `calcquim_activation_test`. No representan operaciones comerciales reales.

Se verificaron 352 hashes de referencia del árbol operativo y los 67 de la preparación anterior. No se copiaron cambios al Vite operativo, no se ejecutaron migraciones operativas, no se escribieron datos operativos, no se reiniciaron sus servicios y no hubo commits ni pushes. Los listeners observados están registrados como evidencia fechada; no se presupone que sus PID sean permanentes.

## Mr. Big: pendiente de autorización

El propietario confirmó **Mr. Big 600 hojas, ID 73**, paquete de 4 rollos. La corrección preparada cambia su inicial existente de 4 piezas a **4 paquetes cerrados + 0 sueltos = 16 piezas**; conserva original y trazabilidad, sin segundo inicial ni compra adicional. ID 72 (800 hojas) permanece sin modificación.

[Plan específico](artifacts/web-paquetes-20261107/MR_BIG_COMPOSICION_PREPARADA.md) y [borrador privado](artifacts/web-paquetes-20261107/mr-big-composition.private.json). Sustituyen el borrador anterior exclusivamente numérico. **No ejecutados.** Requieren autorización específica, backend nuevo, esquema 012, bandera habilitada y relectura de condiciones/versiones. No enviar al backend anterior, que podría ignorar los campos nuevos.

## Pruebas y compatibilidad

| Suite | Aprobadas | Fallos | Omitidas |
|---|---:|---:|---:|
| Web | 302 | 0 | 0 |
| Backend | 45 | 0 | 0 |
| Integración PostgreSQL QA | 101 | 0 | 0 |
| Total | **448** | **0** | **0** |

Incluyen inicial mixto/cero/desconocido, conversiones, transacción fallida, duplicados, apertura con cero/algunos sueltos y múltiples paquetes, ventas combinadas, compras reales por presentación, devoluciones, anulaciones, idempotencia concurrente, competencia por saldo, conciliación obsoleta, correcciones con movimientos posteriores, histórico y restauración aislada de cuentas/eventos/datos/hashes. La suite focalizada de paquetes aprobó 20 pruebas incluidas en el total; no se suma otra vez.

Diez comprobaciones adicionales de compatibilidad de clientes/servicios aprobadas, separadas de las 448. No se modificó, compiló ni instaló móvil; se verificaron siete módulos de cliente por hash. El comportamiento compartido añade restricciones físicas del servidor: una venta cerrada con composición desconocida puede rechazarse y debe conciliarse desde Inventarios, también para clientes anteriores. No requiere cambiar contratos de solicitud para vender normalmente.

Registrar venta conserva idénticos los cuatro archivos protegidos respecto de la entrega anterior: formulario comercial, campos Limpieza, campos Lavandería y CSS del modal. No se añadió botón de apertura ni controles nuevos de composición a ventas. Las radios exclusivas, alineación de campos y ancho de 390 px de Limpieza se comprobaron en navegador; cero errores de consola durante la revisión. El alta por lote conserva su alcance anterior, sin imponer el nuevo formulario mixto a ese flujo.

Build web aprobado: 1469 módulos; JavaScript principal 1569,73 kB / 445,06 kB gzip frente a 1559,10 / 442,44 previos. Incremento de 10,63 kB / 2,62 kB gzip; persiste la advertencia previa de chunk mayor de 500 kB. CSS 275,07 / 39,65 kB gzip. Seis lecturas QA: inventario 18,58–108,14 ms; reporte Jarcería 16,63–29,03 ms. Son muestras locales, no garantía de rendimiento operativo.

## Evidencias visuales

- [Inicial con composición](artifacts/web-paquetes-20261107/inicial-composicion.png).
- [Venta sin controles nuevos](artifacts/web-paquetes-20261107/venta-jarceria-sin-controles-nuevos.png).
- [Inventario después de ambas ventas](artifacts/web-paquetes-20261107/inventario-despues-ventas.png): 2 cerrados, 3 sueltos, 11 piezas.
- [Mr. Big: borrador sin guardar](artifacts/web-paquetes-20261107/mr-big-borrador-con-cuatro-cerrados.png).
- [Limpieza: radios y campos](artifacts/web-paquetes-20261107/limpieza-radios-grid-conservados.png) y [ancho 390 px](artifacts/web-paquetes-20261107/limpieza-responsive390-conservado.png).

## Archivos y paquete revisable

[Manifiesto acumulado de 74 archivos](artifacts/web-paquetes-20261107/manifest.json), [integridad](artifacts/web-paquetes-20261107/source-integrity.json), [resumen de pruebas](artifacts/web-paquetes-20261107/test-summary.json), [verificación QA](artifacts/web-paquetes-20261107/browser-qa-verification.json), [compatibilidad](artifacts/web-paquetes-20261107/compatibility.json), [parche](artifacts/web-paquetes-20261107/changes.patch) y [ZIP de código preparado](artifacts/web-paquetes-20261107/prepared-changes.zip). Se verificaron aplicación simulada del parche, CRC y hashes del ZIP. Los informes y evidencias son externos al ZIP de código.

Archivos modificados o incorporados en esta entrega:

- `server/integration/inventory.test.mjs`
- `server/integration/pack-inventory.test.mjs`
- `server/migrations/012_pack_inventory.down.sql`
- `server/migrations/012_pack_inventory.up.sql`
- `server/scripts/backup-operational.mjs`
- `server/scripts/verify-operational-restore.mjs`
- `server/src/repositories/inventory.mjs`
- `server/src/repositories/packInventory.mjs`
- `server/src/services/inventory.mjs`
- `server/src/services/productInitialInventory.mjs`
- `server/src/services/purchaseInventory.mjs`
- `server/src/services/webActivationPlan.mjs`
- `src/components/InitialInventoryFields.jsx`
- `src/components/InventoryProductModal.jsx`
- `src/components/PhysicalCompositionFields.jsx`
- `src/components/PurchaseInventoryPanel.jsx`
- `src/domain/packInventory.mjs`
- `src/domain/productInitialInventory.mjs`
- `src/pages/InventoryPage.jsx`
- `tests/pack-inventory.test.js`

## Activación, recuperación y pendientes

[Procedimiento coordinado y recuperación](artifacts/web-paquetes-20261107/ACTIVACION_Y_RECUPERACION.md). La operación conserva migraciones 001–010; **011 y 012 siguen pendientes**. No activar parcialmente backend, web o servicios. El plan debe regenerarse sobre la revisión vigente y vincula catálogo físico, presentaciones y factores.

Antes de activar faltan autorización de ventana/configuración, respaldo operativo con copia independiente y restauración verificada, revisión final de diferencias/dependencias y ejecución coordinada de migraciones y comprobaciones posteriores. Los respaldos preparados incluyen el historial físico; después de 012 no basta el verificador anterior. La prueba de restauración superada fue exclusivamente QA.

Faltan también las decisiones/conteos físicos donde la composición sigue desconocida y autorización específica para Mr. Big. No se fuerza el conteo de toda la jarcería ni se deducen paquetes de compras históricas. Las decisiones comerciales previas y puntos de reposición conservan su estado documentado; esta entrega no los aprueba automáticamente.

Riesgos principales: composición histórica no demostrada, solicitudes concurrentes obsoletas, factores editados, devoluciones sin evidencia de sellado y restauraciones que perderían hechos posteriores. Se controlan con estado desconocido explícito, versiones/transacciones, bloqueo de cambios incompatibles y auditoría. Si ya hubo nuevas operaciones reales, no revertir ciegamente código/esquema/datos: respaldar el incidente y reconciliar primero. No se declara completada ni activada la actualización integral web.
