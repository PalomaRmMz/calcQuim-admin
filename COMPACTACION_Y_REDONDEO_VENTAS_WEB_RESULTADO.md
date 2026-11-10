# Compactación y redondeo de ventas web — resultado

Fecha: 9 de noviembre de 2026. **Implementado y probado en QA; no publicado ni activado en operación.** La base independiente `calcquim_recovery_20261109_rounding`, confirmada por el propietario, ya se utilizó para verificar la restauración.

## 1. Interfaz de Limpieza

Tarifa, radios de modo y cantidad/importe comparten fila en escritorio. La cantidad física confirmada ocupa la misma fila cuando hay espacio y una segunda fila alineada en resolución intermedia. En móvil se apilan. Se conservaron radios, conversiones, validaciones y botón inferior.

## 2. Interfaz de Jarcería

Tarifa y cantidad comparten fila; en móvil se apilan. Se verificaron presentación individual y paquete. No se cambió el formulario de lavandería ni las reglas de paquetes/unidades sueltas.

## 3. Política monetaria

`web-cash-nearest-50-v1`: únicamente nuevas ventas WEB en Efectivo, si se habilita la configuración. Se suma el importe comercial de los conceptos y se redondea una sola vez al múltiplo de $0.50 más cercano, con empate hacia arriba. Aritmética en centavos enteros, comprobaciones de precisión y límites; el backend determina el importe definitivo después del cálculo comercial existente. Transferencia y Tarjeta conservan el importe exacto. No se introdujeron pagos mixtos.

Se conserva por venta política, moneda, método, subtotal comercial, ajuste firmado y total. El ajuste nunca modifica precio, descuento, concepto ni cantidad física. Una pestaña web antigua sin reconocimiento de la política recibe rechazo antes de guardar cuando la política está habilitada.

Tickets HTML/PDF y PNG, detalle, historial, exportación y reporte general distinguen importes comerciales y ajuste. El reporte de cobros separa total documentado, último cobro confirmado y cobro final; no distribuye arbitrariamente redondeos de tickets mixtos entre actividades o productos. Márgenes y tendencias comerciales conservan los importes por concepto.

## 4. Archivos preparados

Los **22 archivos** están exclusivamente en [source](artifacts/web-compactacion-redondeo-20261109/source). La relación completa, hashes originales y preparados está en [manifest.json](artifacts/web-compactacion-redondeo-20261109/manifest.json).

Incluyen formulario/CSS; dominio monetario; detalle, corrección y tickets; reporte y exportación; servicios de comandos/dataset/política; respaldo/restauración; migración 013 up/down; pruebas unitarias y PostgreSQL. No se añadieron dependencias. El componente administrativo `MobileSaleCorrection` y el renderer local de tickets no son modificaciones de la aplicación móvil.

Paquete revisable: [prepared-changes.zip](artifacts/web-compactacion-redondeo-20261109/prepared-changes.zip). Originales: [original-target-files.zip](artifacts/web-compactacion-redondeo-20261109/original-target-files.zip). Huellas: [package-integrity.json](artifacts/web-compactacion-redondeo-20261109/package-integrity.json). Los respaldos y lecturas privadas contienen información comercial: conservarlos localmente, sin publicación externa.

## 5. Backend y migración pendiente

La migración **013**, solo aplicada en entornos aislados, agrega configuración deshabilitada por defecto y amplía la integridad SQL del total. Conserva la comprobación anterior para compras y ventas históricas; valida metadatos, regla, origen, método y centavos contra los conceptos. Conserva el `search_path` seguro de la función. No recalcula registros históricos.

Configuración, revisión, idempotencia, venta e inventario utilizan el mecanismo transaccional existente. El comando `configureWebPaymentPolicy` exige aprobación, versión y motivo. La reversión SQL solo permite una instalación nunca utilizada; bloquea el descenso cuando existe historial de activación o ventas monetarias.

## 6. Pruebas

**469 pruebas aprobadas: web 308, backend 45 e integración PostgreSQL 116; cero fallos y cero omitidas.** Compilación Vite aprobada. Comandos y resultados resumidos en [test-summary.json](artifacts/web-compactacion-redondeo-20261109/test-summary.json); logs en el mismo directorio. La integración completa se ejecutó secuencialmente para aislar esquemas.

Se comprobaron precisión/límites, signos positivo/negativo/cero, suma única de varios conceptos, métodos exactos, mezcla Limpieza/Jarcería/Lavandería, cliente antiguo, móvil sin cambios, falsificación rechazada por SQL, correcciones, anulaciones, reintentos concurrentes, rollback y restauración real de esquema sintético. Las pruebas de inventario verifican litros, movimientos, apertura de paquete y conservación de unidades físicas.

QA visual: 1366, 768 y 390 px, ambos modos de Limpieza y ambas presentaciones de Jarcería; sin desbordamiento horizontal. Métricas: [browser-layout.json](artifacts/web-compactacion-redondeo-20261109/browser-layout.json). Se observó advertencia de foco/`aria-hidden` del modal compartido al abrir detalles; no impidió la prueba ni produjo excepción JavaScript. La compilación advierte de chunks mayores de 500 kB; no se amplió esta tarea con una reorganización global.

## 7. Evidencia visual

| Resolución | Antes: Limpieza cantidad / monto | Después: Limpieza cantidad / monto | Jarcería después: unidad / paquete |
|---|---|---|---|
| 1366 | [Cantidad](artifacts/web-compactacion-redondeo-20261109/antes-1366-cleaning.png) · [Monto](artifacts/web-compactacion-redondeo-20261109/antes-1366-amount.png) | [Cantidad](artifacts/web-compactacion-redondeo-20261109/qa-1366-cleaning-quantity.png) · [Monto](artifacts/web-compactacion-redondeo-20261109/qa-1366-cleaning-amount.png) | [Unidad](artifacts/web-compactacion-redondeo-20261109/qa-1366-roll-quantity.png) · [Paquete](artifacts/web-compactacion-redondeo-20261109/qa-1366-package-quantity.png) |
| 768 | [Cantidad](artifacts/web-compactacion-redondeo-20261109/antes-768-cleaning.png) · [Monto](artifacts/web-compactacion-redondeo-20261109/antes-768-amount.png) | [Cantidad](artifacts/web-compactacion-redondeo-20261109/qa-768-cleaning-quantity.png) · [Monto](artifacts/web-compactacion-redondeo-20261109/qa-768-cleaning-amount.png) | [Unidad](artifacts/web-compactacion-redondeo-20261109/qa-768-roll-quantity.png) · [Paquete](artifacts/web-compactacion-redondeo-20261109/qa-768-package-quantity.png) |
| 390 | [Cantidad](artifacts/web-compactacion-redondeo-20261109/antes-390-cleaning.png) · [Monto](artifacts/web-compactacion-redondeo-20261109/antes-390-amount.png) | [Cantidad](artifacts/web-compactacion-redondeo-20261109/qa-390-cleaning-quantity.png) · [Monto](artifacts/web-compactacion-redondeo-20261109/qa-390-cleaning-amount.png) | [Unidad](artifacts/web-compactacion-redondeo-20261109/qa-390-roll-quantity.png) · [Paquete](artifacts/web-compactacion-redondeo-20261109/qa-390-package-quantity.png) |

Las capturas anteriores de Jarcería se conservan como `antes-{resolución}-roll.png` y `antes-{resolución}-package.png` en el mismo directorio. Evidencia monetaria: [Efectivo](artifacts/web-compactacion-redondeo-20261109/qa-redondeo-efectivo.png), [Transferencia](artifacts/web-compactacion-redondeo-20261109/qa-transferencia-exacta.png), [Ticket PNG](artifacts/web-compactacion-redondeo-20261109/qa-ticket-redondeo.png), [Corrección](artifacts/web-compactacion-redondeo-20261109/qa-correccion-redondeo-negativo.png), [Reporte](artifacts/web-compactacion-redondeo-20261109/qa-reporte-cobros-redondeo.png). Los productos y ventas sintéticos existen exclusivamente en QA.

## 8. Ejemplos verificados

| Comercial | Efectivo | Ajuste |
|---:|---:|---:|
| $11.01 | $11.00 | −$0.01 |
| $11.24 | $11.00 | −$0.24 |
| $11.25 | $11.50 | +$0.25 |
| $11.49 | $11.50 | +$0.01 |
| $11.50 | $11.50 | $0.00 |
| $11.74 | $11.50 | −$0.24 |
| $11.75 | $12.00 | +$0.25 |
| $11.99 | $12.00 | +$0.01 |

La regla solicitada también produce $0.00 para importes positivos de $0.01–$0.24. Debe reconocerse expresamente antes de activar; no se inventó un mínimo alternativo.

## 9. Compatibilidad histórica y móvil

No hay backfill. Las ventas sin política conservan cálculo y corrección históricos. Los **20 tickets originales/actualizados históricos disponibles** producen HTML byte por byte idéntico al renderer operativo; [comparación final](artifacts/web-compactacion-redondeo-20261109/final-comparison.json).

La aplicación móvil externa y los módulos de protocolo móvil conservaron hashes. Sus ventas mantienen el contrato y cobro exactos actuales, incluso con política web habilitada en QA. La activación debe reconocer explícitamente esta diferencia entre canales. Si se requiere uniformidad también en móvil, se necesita otro alcance autorizado antes de activar.

## 10. Correcciones y anulaciones

Las correcciones de ventas nuevas conservan política/método originales y recalculan el documento bajo ese contexto, aunque se deshabiliten nuevas altas. Conservan ticket original, versión e historial. No se permite cambiar el método en ese flujo. Se conserva por separado el cobro confirmado anterior; la diferencia y su liquidación pendiente son explícitas. No se afirma que el total revisado ya fue cobrado.

Ejemplo QA: original $11.25 + $0.25 = $11.50; revisión de cantidad a 0.27 litro genera $12.15 − $0.15 = $12.00 documentados. Cobro previo $11.50; diferencia $0.50 sin liquidación registrada. Reporte muestra cobro final sin determinar.

La anulación conserva el contexto monetario y excluye la venta de resultados vigentes; la decisión física sigue el flujo existente. No simula reembolso. No se implementó un nuevo procedimiento de caja, devolución monetaria ni pagos mixtos.

## 11. Integridad, respaldo y recuperación

Lecturas operativas mediante transacción de solo consulta: revisión **190**, 96 productos (25 de Jarcería), 9 categorías, 53 ventas y 8 compras. Comparación final sin diferencias en dataset, inventario, compras ni composición física. **372 hashes de código operativo preservados**. Se conservaron todos los cambios anteriores; no se ejecutó la corrección pendiente de Mr. Big.

Respaldo fresco `postgres-2026-11-09T19-45-28-920Z-b9a87d58-2a83-4cff-b695-e79e4201606d.dump`, 1,588,837 bytes. SHA-256 `d3199c2ee2e8fb1424f3a25176b38075adf5d0c8873fd963fb86bb894ab24ee9`. Restauración independiente aprobada: **3250 comprobaciones relacionales, cero fallos y cero FK sin validar**. La migración y configuración se ensayaron únicamente en la recuperación independiente, preservando sus datos. Evidencia: [recovery-rehearsal.json](artifacts/web-compactacion-redondeo-20261109/recovery-rehearsal.json).

Copia adicional verificada en `D:\CalcQuim-Backups\web-rounding-20261109`; no se copiaron credenciales. Es una ubicación separada en el mismo disco, por lo que no sustituye respaldo fuera del dispositivo. Los scripts nuevos incluyen la configuración monetaria en las comprobaciones de respaldo/restauración y aceptan respaldos previos a 013.

## 12. Publicación

**No ejecutada.** Operación conserva migraciones 001–012, sin tabla de política y sin ventas con el nuevo metadato monetario. QA utiliza puerto 5190 y esquemas/bases independientes. No se copiaron cambios al árbol servido por Vite operativo, no se reiniciaron servicios operativos, no se escribieron ventas comerciales de prueba en operación y no se hicieron commits ni pushes.

## 13. Pasos y autorizaciones pendientes

Plan completo: [ACTIVACION_PROPUESTA_NO_EJECUTADA.md](artifacts/web-compactacion-redondeo-20261109/ACTIVACION_PROPUESTA_NO_EJECUTADA.md).

Se requiere autorización específica de publicación coordinada, migración 013 y política monetaria; confirmar ventana, alcance exclusivamente web, importes pequeños y tratamiento de diferencias sin liquidación automática. Antes de publicar: nueva lectura y comparación de hashes para conservar cambios posteriores, respaldo fresco y restauración independiente si hubo actividad nueva. Publicar backend/frontend/configuración juntos, con verificación posterior sin ventas ficticias.

Después de registrar ventas con política, no volver al código antiguo ni restaurar un respaldo anterior sobre operaciones nuevas: ese código supone total igual a conceptos. Deshabilitar futuras altas no elimina la necesidad de leer documentos monetarios existentes. Priorizar recuperación compatible y corrección hacia adelante. Esta entrega queda preparada para revisión; no equivale a autorización ni a activación.
