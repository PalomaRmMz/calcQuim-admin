# Redondeo final y preparación de activación web

Fecha: 9 de noviembre de 2026, America/Mexico_City. Continuación de `COMPACTACION_Y_REDONDEO_VENTAS_WEB_RESULTADO.md`.

**Resultado: QA aprobado, 522 pruebas aprobadas y cero fallidas. No se publicaron archivos, no se aplicaron migraciones ni se habilitó la política en operación.** La política comercial definitiva ya está aprobada; falta autorización específica de ejecución y ventana operativa.

## Política definitiva

Nueva identificación: **`web-cash-nearest-50-min-50-v2`**. Se diferencia de `web-cash-nearest-50-v1`, que conserva su significado anterior y sigue siendo legible y corregible con su propia regla.

Para nuevas ventas WEB en Efectivo: sumar los importes comerciales de los conceptos; redondear una sola vez al múltiplo de $0.50 más cercano, con empate hacia arriba. Si el total es positivo y menor de $0.25, cobrar $0.50. Cero exacto permanece cero. Transferencia y Tarjeta conservan el importe exacto. No se agregó pago mixto ni mínimo por concepto.

Se usan centavos enteros con `BigInt` y límites de precisión. El backend recalcula con el catálogo autorizado; ignora totales arbitrarios del cliente. Conserva por venta versión de política, moneda, método, total comercial, ajuste con signo y total cobrado/documentado. No altera los importes de renglón ni cantidades físicas.

| Total comercial | Efectivo | Ajuste |
|---:|---:|---:|
| $0.00 | $0.00 | $0.00 |
| $0.01 | $0.50 | +$0.49 |
| $0.10 | $0.50 | +$0.40 |
| $0.24 | $0.50 | +$0.26 |
| $0.25 | $0.50 | +$0.25 |
| $0.49 | $0.50 | +$0.01 |
| $0.50 | $0.50 | $0.00 |
| $0.74 | $0.50 | −$0.24 |
| $0.75 | $1.00 | +$0.25 |
| $11.01 | $11.00 | −$0.01 |
| $11.25 | $11.50 | +$0.25 |
| $11.49 | $11.50 | +$0.01 |
| $11.99 | $12.00 | +$0.01 |

Todos estos ejemplos están verificados. También cada importe de 1 a 24 centavos tiene prueba individual de dominio y PostgreSQL. Tres conceptos de $0.24 suman $0.72 y cobran $0.50; no cobran tres mínimos.

## Archivos y conservación de avances

La entrega anterior permanece en su directorio. El nuevo trabajo está aislado en [artifacts/web-redondeo-final-20261109/source](artifacts/web-redondeo-final-20261109/source).

**22 archivos preparados acumulados; siete actualizados en esta continuación:**

| Archivo relativo a `source` | Ajuste de esta continuación |
|---|---|
| `src/domain/webPayment.mjs` | Identificador v2, mínimo, interpretación v1 preservada y cálculo entero. |
| `server/src/services/webPayment.mjs` | Rechazo de configuración/esquema de versión distinta y conservación del contexto original. |
| `server/src/services/dataset.mjs` | Pasa la versión real de configuración al cálculo autorizado del servidor. |
| `server/migrations/013_web_payment_policy.up.sql` | Configuración v2 inicialmente deshabilitada y validación SQL del mínimo; admite documentos v1 bajo su regla anterior. |
| `tests/web-payment.test.js` | Cero, 24 mínimos individuales, ejemplos, suma única, exactitud no efectiva y distinción de versiones. |
| `server/integration/web-payment.test.mjs` | Backend/SQL, límites, v1, HTTP móvil, control de canal y regresiones completas. |
| `src/services/dataExport.js` | Corrección de la etiqueta «Liquidación monetaria»; se conserva el desglose de importes preparado. |

Los otros 15 archivos de la entrega anterior se conservaron byte por byte: formulario y CSS, detalle/corrección, tickets HTML/PNG, reportes, comandos, respaldo/verificación, migración down y componentes monetarios. Relación de los 22, hashes originales, anteriores y finales: [manifest.json](artifacts/web-redondeo-final-20261109/manifest.json).

No hubo modificaciones posteriores en los 372 archivos de código protegidos por la entrega anterior. Se amplió el control fresco a **403 archivos operativos**, todos preservados durante esta tarea. No se añadieron dependencias. No se hicieron commits ni pushes.

## Interfaz conservada y comprobada

No se volvieron a modificar `CommercialSaleForm.jsx`, `CleaningSaleFields.jsx`, `LaundrySaleFields.jsx` ni el CSS de captura. Limpieza conserva Tarifa + Modo + Cantidad/Importe en escritorio; la cantidad física confirmada usa el espacio disponible o la siguiente fila alineada. Jarcería conserva Tarifa + Cantidad. En móvil se apilan.

Se revisaron **12 combinaciones**: 1366, 768 y 390 px; Limpieza por cantidad y por monto; Jarcería por unidad y paquete. Sin desbordamiento horizontal. Los borradores de Jarcería se cerraron sin guardar; nombres, presentaciones y precios reales no se modificaron. Métricas: [browser-layout.json](artifacts/web-redondeo-final-20261109/browser-layout.json).

| Resolución | Limpieza cantidad / monto | Jarcería unidad / paquete |
|---|---|---|
| 1366 | [Cantidad](artifacts/web-redondeo-final-20261109/qa-1366-cleaning-quantity.png) · [Monto](artifacts/web-redondeo-final-20261109/qa-1366-cleaning-amount.png) | [Unidad](artifacts/web-redondeo-final-20261109/qa-1366-roll-quantity.png) · [Paquete](artifacts/web-redondeo-final-20261109/qa-1366-package-quantity.png) |
| 768 | [Cantidad](artifacts/web-redondeo-final-20261109/qa-768-cleaning-quantity.png) · [Monto](artifacts/web-redondeo-final-20261109/qa-768-cleaning-amount.png) | [Unidad](artifacts/web-redondeo-final-20261109/qa-768-roll-quantity.png) · [Paquete](artifacts/web-redondeo-final-20261109/qa-768-package-quantity.png) |
| 390 | [Cantidad](artifacts/web-redondeo-final-20261109/qa-390-cleaning-quantity.png) · [Monto](artifacts/web-redondeo-final-20261109/qa-390-cleaning-amount.png) | [Unidad](artifacts/web-redondeo-final-20261109/qa-390-roll-quantity.png) · [Paquete](artifacts/web-redondeo-final-20261109/qa-390-package-quantity.png) |

Las capturas anteriores a la compactación continúan en el informe precedente; no se sustituyeron por capturas de QA actual. Evidencia nueva del mínimo: [Efectivo $0.01→$0.50](artifacts/web-redondeo-final-20261109/qa-minimum-cash.png) y [Transferencia exacta $0.01](artifacts/web-redondeo-final-20261109/qa-minimum-transfer.png). Tarjeta también mostró $0.01. Capturas y PNG fueron inspeccionados visualmente.

## Backend, SQL y migración 013

Operación mantiene únicamente **001–012**, con checksums coincidentes tanto con el árbol actual como con la copia preparada. **013 sigue pendiente**. No se editó ninguna migración aplicada en operación.

Se ajustó la 013 aún no publicada para que su configuración nueva sea v2/deshabilitada. La función SQL valida moneda, origen WEB, método, versión, centavos, suma de conceptos, ajuste, total relacional y total del documento. Aplica el mínimo solo a v2/Efectivo/1–24 centavos. Para v1 conserva la regla sin mínimo; compras y documentos históricos sin política conservan su comprobación previa. Mantiene el `search_path` seguro de la función.

Se crearon **esquemas QA nuevos**, sin reemplazar el esquema anterior ni editar su checksum de 013. La restauración también usó una base nueva. El migrador rechaza migraciones registradas cuyo checksum fue alterado; el backend rechaza una configuración activa incompatible en lugar de reinterpretarla como v2. El down sigue bloqueado tras utilizar la política o registrar contexto monetario.

## Pruebas ejecutadas

| Suite | Aprobadas | Fallidas | Omitidas |
|---|---:|---:|---:|
| Web | 334 | 0 | 0 |
| Backend | 45 | 0 | 0 |
| Integración PostgreSQL | 143 | 0 | 0 |
| **Total** | **522** | **0** | **0** |

Resultado real: **53 pruebas más que las 469 anteriores**. Las suites completas se ejecutaron sobre el código final. Vite compiló correctamente en 2.28 s en este equipo; el tiempo no sustituye un ensayo de carga. Permanecen advertencias de chunks de más de 500 kB. En el modal compartido se observó advertencia de foco/`aria-hidden`, sin excepción JavaScript ni bloqueo del flujo; no se amplió la tarea con una reforma global del modal.

Comandos desde `source`:

```text
node --test tests/*.test.js
node --test server/tests/*.test.mjs
node --import ../integration-loader.mjs --test --test-concurrency=1 server/integration/*.test.mjs
npm.cmd run build
```

El loader de integración resuelve exclusivamente configuración local de QA y módulos de prueba; no expone credenciales ni apunta las escrituras a la base operativa. Resultados y logs: [test-summary.json](artifacts/web-redondeo-final-20261109/test-summary.json), `web-tests.log`, `server-tests.log`, `integration-tests.log` y `build.log` en el mismo directorio.

Cobertura: cero exacto, todos los mínimos, $0.25, empates, ajustes negativos/positivos/cero, suma única, mezcla de las tres actividades, métodos exactos, histórico, v1, correcciones, anulaciones, idempotencia, reintentos concurrentes, SQL que rechaza falsificaciones, rollback, salidas físicas, apertura de paquete, respaldo/restauración de esquema con política y auditoría. Cero también se valida en SQL mediante transacción sintética revertida; no se cambiaron las restricciones existentes de alta de conceptos para forzar una venta gratuita.

## Tickets, historial, exportación y reportes

La venta sintética por UI guardó 0.000222 litro a $45/litro: importe comercial $0.01, ajuste +$0.49, cobro $0.50. La cantidad física fue la capturada. [Ticket PNG descargado](artifacts/web-redondeo-final-20261109/qa-ticket-minimum.png), [HTML original](artifacts/web-redondeo-final-20261109/qa-original-ticket.html) y [detalle](artifacts/web-redondeo-final-20261109/qa-sale-minimum-detail.png).

Una revisión sintética a 0.25 litro produce documento de $11.25 + $0.25 = $11.50. Conserva original de $0.50, último cobro confirmado $0.50 y diferencia de $11.00 **sin liquidación registrada**. No se afirma un cobro adicional. [Detalle de corrección](artifacts/web-redondeo-final-20261109/qa-sale-correction.png), [HTML revisado](artifacts/web-redondeo-final-20261109/qa-revised-ticket.html), [evidencia estructurada](artifacts/web-redondeo-final-20261109/qa-money-evidence.json).

El reporte general muestra comercial $11.25, ajuste +$0.25, documento $11.50, cobro confirmado $0.50 y cobro final sin determinar. [Captura](artifacts/web-redondeo-final-20261109/qa-payments-report.png). No se distribuye arbitrariamente el redondeo de tickets mixtos entre productos/actividades; márgenes y tendencias conservan conceptos comerciales. La exportación conserva columnas separadas de comercial, ajuste, documento, política, cobro confirmado y estado de liquidación.

La anulación conserva contexto y auditoría; no registra devolución de efectivo ficticia. Las revisiones conservan método y política de la venta, aun deshabilitando altas posteriores. No se agregó un procedimiento de caja para liquidar diferencias, reembolsos o pagos mixtos. Esos estados pendientes permanecen explícitos.

## Compatibilidad histórica y móvil

Sin backfill ni recálculo de ventas reales. Los 20 tickets originales/actualizados históricos disponibles producen HTML byte por byte idéntico al renderer operativo. [Comparación](artifacts/web-redondeo-final-20261109/final-comparison.json). Además, una venta sintética v1 de un centavo conserva total cero al corregirse a dos centavos: no recibe silenciosamente el mínimo v2.

**No se modificó, compiló ni instaló la aplicación móvil.** Sus siete módulos protegidos conservan hashes; los archivos `server/src/mobile` también coinciden con la operación y la entrega anterior. Las ventas móviles mantienen importes exactos.

La prueba HTTP levantó únicamente un servidor efímero de QA con el backend preparado: catálogo autorizado y estado por idempotencia responden; venta móvil de $0.01 cobra $0.01; reintento devuelve la misma venta; credencial ausente devuelve 401 y deshabilitación operativa devuelve 403. El router selecciona `MOVIL` en el servidor tras autenticación; ignora etiquetas arbitrarias `origin`/`channel` y no propaga la política web enviada por el cliente. Invocar `createMobileSale` desde comandos web devuelve 403. Jarcería/Lavandería móviles siguen bloqueadas en modo operativo. No se usaron ventas de prueba en el receptor operativo.

## Estado operativo fresco

Preflight de solo lectura mediante transacción `REPEATABLE READ READ ONLY`, repetido al cierre:

| Dato | Estado verificado |
|---|---|
| Revisión | 190 |
| Generación | `39656fe8-6025-4740-8f19-8b767f1e9a9c` |
| Productos | 96; Jarcería 25 |
| Categorías de Jarcería | 9 |
| Ventas / compras | 53 / 8 |
| Migraciones aplicadas | 001–012 |
| Tabla monetaria / ventas con metadato monetario nuevo | Inexistente / 0 |
| Código operativo protegido | 403 hashes sin cambios |
| Salud API live / ready | 200 / 200 |

La lectura nueva coincide con la anterior; no se asumió de antemano que permanecía en revisión 190. Dataset, compras, inventarios, movimientos y composición física coinciden entre inicio y cierre. No se ejecutó la corrección pendiente de Mr. Big ni se alteraron nombres, precios, productos, preparaciones o configuración operativa. [Evidencia](artifacts/web-redondeo-final-20261109/operational-safety.json).

## Respaldo nuevo y restauración independiente

- Archivo: `postgres-2026-11-09T20-44-47-173Z-dff16c42-8767-4143-87b9-f80ae6b553b3.dump`.
- Tamaño: 1,588,837 bytes.
- SHA-256: `3c3c63f7739ce55ddf19cfe45b3bf56d81a1d0853416cfa46a94190a9554bdee`.
- Copia independiente y manifiesto verificados en `D:\CalcQuim-Backups\web-final-rounding-20261109`. No se copiaron credenciales.
- Base nueva creada por el propietario: `calcquim_recovery_20261109_finalrounding`. Se verificó vacía antes de restaurar; no se sobrescribió la recuperación anterior.
- Restauración: **3250 comprobaciones relacionales, cero fallos y cero FK sin validar**; huellas de dataset, inventarios, compras y paquetes coincidentes.
- Ensayo: migración 013 nueva y configuración v2 únicamente en esa base. Revisión de recuperación 190→191, un evento de configuración. Lectura posterior confirma catálogo, ventas, compras, inventarios, movimientos y composición física idénticos al respaldo; solo se agregó la configuración monetaria de ensayo.

Evidencia: [backup-recovery-evidence.json](artifacts/web-redondeo-final-20261109/backup-recovery-evidence.json) y [recovery-rehearsal.json](artifacts/web-redondeo-final-20261109/recovery-rehearsal.json). El manifiesto original del respaldo conserva sus indicadores iniciales; la verificación posterior está en estos archivos, sin reescribir silenciosamente el manifiesto. La copia separada en D: está en el mismo dispositivo y no sustituye respaldo fuera del equipo.

## Paquete final

[ZIP preparado](artifacts/web-redondeo-final-20261109/prepared-changes.zip) · [Originales operativos](artifacts/web-redondeo-final-20261109/original-target-files.zip) · [Parche](artifacts/web-redondeo-final-20261109/prepared.patch) · [Manifiesto](artifacts/web-redondeo-final-20261109/manifest.json) · [Huellas y verificación](artifacts/web-redondeo-final-20261109/package-integrity.json).

Ambos ZIP pasan CRC y el parche pasa `git apply --check`; **no se aplicó**. El paquete preserva los 22 archivos acumulados e identifica los siete cambios de esta continuación. Las lecturas y respaldos privados contienen datos comerciales; conservarlos localmente.

## Despliegue, recuperación y pendientes

Procedimiento preciso: [ACTIVACION_DEFINITIVA_PROPUESTA_NO_EJECUTADA.md](artifacts/web-redondeo-final-20261109/ACTIVACION_DEFINITIVA_PROPUESTA_NO_EJECUTADA.md). Incluye verificación fresca de hashes/revisión/checksums, respaldo y restauración, cierre coordinado de capturas, publicación coherente, uso del migrador con configuración operativa explícita, comando HTTP de habilitación con precondiciones e idempotencia, comprobaciones posteriores y recuperación según haya uso o no.

Condiciones pendientes: autorización específica de publicación y migración 013, habilitación de v2 y ventana para servicios. La aprobación comercial del mínimo ya está registrada; no se solicita aprobarla nuevamente. Debe mantenerse el alcance web y reconocer que no existe liquidación monetaria automática de diferencias. Ante cambios operativos posteriores se requiere conciliación y respaldo fresco antes de ejecutar.

Después de usar la política, no volver al código antiguo ni restaurar un respaldo anterior sobre operaciones posteriores: no entiende los totales monetarios nuevos. Deshabilitar la política solo afecta altas futuras; las ventas v1/v2 deben conservar lectores/correcciones compatibles. Down bloqueado tras uso; priorizar reparación hacia adelante. Un fallo crítico, un checksum inesperado, una restauración fallida o una incompatibilidad detienen la activación.

**Confirmación final: cero escrituras comerciales operativas, cero migraciones operativas, cero publicación y cero reinicios operativos.** PostgreSQL permanece local. La web activa conserva su versión anterior; QA nuevo está aislado en puerto 5191. Esta entrega está preparada para revisión y autorización posterior, no activada.
