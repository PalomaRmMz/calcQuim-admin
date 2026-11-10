# CalcQuim — continuación de estabilización web

6 de noviembre de 2026. **Bloques de esta continuación implementados y verificados en QA. Sin activación operativa.** La versión web no se declara terminada en operación: faltan la revisión de datos reales, autorización y validación posterior a la activación conjunta.

## Estado de la entrega

Se continuó sobre `artifacts/web-estabilizacion-20261106/source/`, conservando los 23 archivos de la entrega anterior. Antes de modificar se comprobaron sus hashes: cero diferencias en los originales y en los archivos preparados. Se archivó la copia QA anterior y se verificó su ZIP.

La entrega acumulada contiene **52 archivos preparados**, de los cuales **32 cambian en esta continuación**. No se copiaron al árbol que sirve Vite operativo.

- [Manifiesto y hashes](artifacts/web-continuacion-20261106/manifest.json).
- [Parche acumulado sobre el árbol actual](artifacts/web-continuacion-20261106/changes.patch): `git apply --check` aprobado, sin aplicarlo.
- [Parche respecto del QA anterior](artifacts/web-continuacion-20261106/continuation.patch).
- [Paquete de archivos preparados](artifacts/web-continuacion-20261106/prepared-changes.zip).
- QA disponible: **http://127.0.0.1:5174**. PostgreSQL local, base `calcquim_activation_test`, esquema sintético conservado de la entrega anterior. El estado del proceso está en `artifacts/web-continuacion-20261106/qa-preview-state.json`.

El paquete presupone el árbol de trabajo actual, incluidos los cambios previos de lavandería del 5 de noviembre. No debe aplicarse sobre un clon limpio omitiendo esos antecedentes, ni copiarse mientras Vite operativo observa los archivos sin una ventana autorizada. El informe anterior se conserva sin sobrescribirlo.

## 1. Compras → Inventarios

### Entradas automáticas y unidades

- Se reutilizan `syncInventory`, el bloqueo transaccional del dataset, revisión/generación e idempotencia. El nuevo seguimiento se ejecuta dentro de la misma transacción que guarda la compra; un fallo revierte compra, movimientos y seguimiento.
- Las compras nuevas de producto terminado con destino y equivalencia inequívocos generan una entrada vinculada a compra, renglón y snapshot. Se utiliza cantidad física, no una división monetaria ni el volumen teórico de un concentrado.
- Jarcería utiliza el snapshot de presentación y su factor en unidades base. Se conserva el importe realmente pagado del bloque anterior.
- Cada entrada tiene una clave única de origen por compra, renglón y versión. Repetir una solicitud idempotente no duplica entradas; el flujo anterior de recepción explícita y el movimiento manual con la misma referencia no pueden duplicar una compra gestionada por la integración.

### Bases, concentrados e hidroneos

- Se registran como insumos pendientes de preparación. No incrementan producto terminado al comprarlos.
- La pantalla distingue rendimiento orientativo y cantidad real. El operador confirma la cantidad realmente obtenida y el destino; se registra una entrada de elaboración con su compra y snapshot de origen.
- La confirmación corresponde al **renglón completo**. Una segunda elaboración del mismo renglón se rechaza. No se implementó consumo parcial de insumo por varias tandas; la interfaz lo explica para evitar confirmar prematuramente un renglón parcialmente elaborado.
- La cantidad elaborada puede corregirse mediante una reversión y una nueva entrada auditable. Un retiro posterior queda separado y limita las cantidades que pueden volver a compensarse.
- Los destinos ambiguos no se asignan automáticamente. Puede seleccionarse un destino del snapshot o documentarse un vínculo manual verificado, con motivo y actividad compatible. Un destino de otra actividad se rechaza.

### Históricos, conteos e inventario inicial

- La integración requiere un corte explícito. Su habilitación clasifica las compras anteriores para conciliación, **sin sumarlas retroactivamente**.
- Una recepción histórica ya vinculada puede reconocerse sin una entrada nueva. Los ajustes manuales parecidos no se consideran prueba automática.
- Para marcar una compra como ya incorporada se selecciona un conteo o movimiento positivo del producto y se registra el motivo. Se rechazan evidencias compensadas.
- Las compras capturadas con fecha anterior requieren revisión; no se procesan como entradas nuevas por inferencia.
- Sin inventario inicial, la entrada de una compra se conserva en el historial y **el saldo total permanece desconocido**. Un conteo inicial posterior comprende los movimientos anteriores a su ancla, evitando sumarlos otra vez. Las compras posteriores sí se agregan al saldo.
- Una corrección que cruza un conteo posterior exige indicar si la diferencia debe aplicarse ahora o ya estaba comprendida en el conteo. No se altera el significado del ancla ni de sus movimientos anteriores.

### Correcciones, anulaciones y devoluciones

- Las correcciones de compras recibidas requieren confirmación del tratamiento físico y motivo. En terminados puede aplicarse la diferencia; en insumos elaborados no se inventa una cantidad nueva a partir del rendimiento.
- La anulación exige distinguir mercancía retirada/devuelta de producto físicamente conservado. Un retorno genera movimiento compensatorio; una anulación financiera con producto retenido conserva la existencia y documenta su destino.
- Los retiros parciales están limitados por la entrada pendiente de compensar. Las combinaciones con retiros previos o cantidades históricas desconocidas que no permiten una corrección inequívoca se bloquean para conciliación específica.
- No se borran movimientos ni se transforman ajustes manuales en compras. Los eventos de clasificación, recepción, elaboración, vínculo, corrección, compensación y destino físico quedan en el historial.

### Revisión de datos reales, solo lectura

Se revisaron compras, movimientos y anclajes operativos sin escribir datos. El estado observado tenía **8 compras vigentes, 70 renglones —41 terminados y 29 insumos—, cero movimientos vinculados a compra y 74 movimientos positivos/conteos sin vínculo de compra**. Los 70 renglones tenían un producto asociado con ancla; los 21 productos de jarcería seguían sin inventario determinado.

Se preparó un plan privado por renglón con referencias y posibles evidencias. **Siete renglones tienen coincidencias posibles con ajustes manuales**, pero ninguna se declaró automáticamente ya incorporada. Una coincidencia de cantidad y fecha no demuestra identidad comercial.

- [Resumen sin datos de catálogo](artifacts/web-continuacion-20261106/reconciliation-summary.json).
- Plan local para revisión del propietario: `artifacts/web-continuacion-20261106/operational-reconciliation.private.json`.
- Auditoría agregada: `artifacts/web-continuacion-20261106/operational-readonly-audit.json`.

## 2. Reportes completados

Se conserva la separación Limpieza / Jarcería / General y se añade el análisis integrado, servido por un endpoint web de solo lectura y una transacción consistente:

| Reporte | Criterio y límites |
|---|---|
| Márgenes estimados | Costos realmente pagados, cantidad física sustentada y referencia disponible antes de la venta. Se muestra la compra de referencia. Costos futuros, compras anuladas, cantidades sin desglose o devoluciones sin conciliación no producen una cifra ficticia. |
| Mayor y menor salida | Cantidades por producto y unidad, ordenables en ambos sentidos; velocidad diaria cuando hay período observado. Un desglose o clasificación histórica pendiente impide afirmar cero ventas. No se mezclan litros y piezas. |
| Tendencias | Importes mensuales de compras y ventas vigentes. Los ingresos históricos sin actividad solo se consolidan en General y se señalan por separado. |
| Rendimiento real | Insumo, cantidad comprada, rendimiento orientativo, cantidad final confirmada y relación real/orientativa. Sin confirmación no hay producción calculada como real. |
| Compras pendientes | Renglones históricos por conciliar e insumos pendientes de elaboración, con compra y producto relacionados. |
| Próximos a agotarse | Existencia conocida y umbral configurado. La proyección de días usa salidas observadas y se etiqueta como orientativa. |
| Comparación de proveedores | Costos históricos verificables por producto y unidad, ordenables, con proveedor y compra de referencia; hasta cuatro decimales en costos unitarios. No son cotizaciones actuales garantizadas. |

Se conservaron filtros, exportaciones y clasificación de existencias del bloque anterior. “Sin existencia determinada” y “Sin punto de reposición” siguen siendo indicadores distintos y potencialmente superpuestos.

**Alcance financiero:** el margen es una estimación comercial con referencia de adquisición, no costeo FIFO de lotes vendidos ni utilidad neta. La salida por ventas se identifica como bruta antes de devoluciones y no se presenta como razón contable de rotación. No se sustituyen los cálculos faltantes por ceros.

En navegador QA, elaborar 18 litros por un costo de insumo de $70 y vender 2 litros por $40 produjo costo estimado de $7.78 y margen estimado de $32.22, con referencia a la compra. Se comprobó que los 18 litros reales representan 90% del rendimiento orientativo de 20.

## 3. Lavandería y activación conjunta

Se reutilizó la implementación del 5 de noviembre, sin modificar los archivos compartidos de dominio móvil o tickets.

La integración PostgreSQL verifica:

- Las cuatro combinaciones oficiales para 0.5, 1, 1.5, 2 y 4.5 cargas.
- Tarifas completa/media: solo lavado 60/30, con insumos 70/40, con secado 90/60 y completo 100/50.
- Solo secado a $30 y centrifugado + secado a $40, con cantidades enteras.
- Servicio a medida con descripción obligatoria e importe personalizado.
- Rechazo HTTP de medias de secado y de descripciones obligatorias omitidas, sin escrituras parciales.
- Reconstrucción del importe en backend, venta mixta, snapshots, corrección, anulación, historial y ticket.
- Una venta histórica de dos cargas a $55 mantiene su original de $110 y, al corregirse a tres cargas después de configurar las tarifas nuevas, conserva su tarifa histórica y total de $165.

Se preparó `activateWebStabilization`, una operación **atómica** que valida un plan vigente y aprobación explícita, guarda los servicios oficiales y establece el corte histórico de compras dentro de una sola transacción. Si falta la migración, cambia el plan o falla el corte, no queda activada solo una parte de la configuración. Revisión/generación e idempotencia siguen protegiendo la operación.

El plan operativo se generó mediante lectura y **no se ejecutó**: `artifacts/web-continuacion-20261106/activation-plan.private.json`. Incluye configuración actual/propuesta, hash, revisión y generación. No debe reutilizarse si cambian los datos; debe generarse nuevamente antes de una futura activación autorizada.

## 4. Esquema, respaldo y compatibilidad

Nueva migración aditiva: **011_purchase_inventory**. Crea la proyección de seguimiento por compra/renglón con claves estables, producto, naturaleza, estado, snapshot, versión y cantidades. La auditoría se apoya en `inventory_changes` y las entradas en `inventory_movements` existentes. No reconstruye el catálogo ni recontabiliza compras históricas.

La migración mantiene la automatización deshabilitada hasta el corte explícito. Su reversión rechaza eliminar la tabla cuando contiene seguimiento. **Solo se aplicó en bases y esquemas QA; no en operación.**

El control de anclajes se extrajo a `inventoryBaseline.mjs` y conserva su interfaz anterior. El endpoint existente de inventario conserva la forma de su política pública; la nueva bandera interna se consulta desde el flujo web nuevo. No se cambiaron rutas ni contratos móviles.

Los respaldos preparados incorporan una huella versionada del seguimiento y su auditoría, además de las de dataset e inventario. La restauración preparada exige esa huella cuando encuentra la tabla nueva. Los respaldos anteriores sin esa tabla conservan su validación anterior. **Estos scripts operativos se prepararon, pero no se ejecutaron contra operación.**

Protección y pruebas de restauración realizadas:

1. ZIP del QA anterior verificado, sin configuraciones privadas.
2. `pg_dump` del esquema QA anterior a la migración, archivo legible y restauración lógica en otro esquema de pruebas; dataset e inventario iguales.
3. Integración nueva con `pg_dump`/`pg_restore` real de un esquema sintético completo: compras, saldos, seguimientos, eventos, preparaciones y compensaciones iguales tras restaurar.
4. Prueba de huella de respaldo: cambios en cantidades o auditoría cambian el hash; etiquetas derivadas no lo alteran.

Evidencia: [verificación del respaldo QA](artifacts/web-continuacion-20261106/qa-backup-verification.json). No se afirma haber creado o restaurado un respaldo operativo nuevo.

## 5. Validación final

**402 pruebas aprobadas; cero fallidas u omitidas en las ejecuciones finales.**

| Suite | Pruebas | Evidencia |
|---|---:|---|
| Web | 292 | [Log](artifacts/web-continuacion-20261106/web-tests.log) |
| Backend | 45 | [Log](artifacts/web-continuacion-20261106/server-tests.log) |
| Toda la integración PostgreSQL disponible | 65 | [Log](artifacts/web-continuacion-20261106/all-integration.log) |

Lint [web](artifacts/web-continuacion-20261106/web-lint.log) y [servidor](artifacts/web-continuacion-20261106/server-lint.log), y [compilación](artifacts/web-continuacion-20261106/build.log) aprobados. Se mantiene la advertencia existente de chunks mayores de 500 KB; no se ocultó.

Las pruebas incluyen transacciones e idempotencia concurrente; terminados e insumos en una misma compra; bases e hidroneos; destinos ambiguos y vínculos manuales; rechazo entre actividades; compras anteriores al corte; evidencia de conteos; correcciones posteriores a un ancla; devoluciones parciales; anulación con retiro o conservación; fallo después de procesar parte de una corrección con rollback completo; inicial de jarcería posterior a compras; activación conjunta con plan vigente; y restauración.

También se verificaron las regresiones anteriores de jarcería, navegación, precios, tickets, ventas históricas y protocolos existentes. Para ejecutar los tests que importan el cliente móvil se usaron sus módulos originales en modo de lectura, sin modificarlos ni compilar la aplicación móvil.

### Pruebas antiguas ajustadas

Se reprodujeron dos fallos existentes en el árbol original, antes de corregir sus escenarios de prueba. [Log de referencia](artifacts/web-continuacion-20261106/original-known-failures.log).

- El activador legado solo autoriza esquemas 007/008; la prueba suponía que un único rollback dejaba siempre en 007. Ahora se prueba expresamente que el activador legado rechaza los esquemas posteriores sin alterar datos. La activación moderna conjunta tiene sus propias pruebas.
- Una prueba esperaba la antigua cantidad exacta en una venta web por importe, aunque la regla vigente ya redondeaba a un decimal. Se conserva y verifica la regla web; el escenario que necesita cantidad física pendiente usa una venta móvil, donde esa incertidumbre sigue siendo válida.
- El ensayo de migración desde 007 ahora prepara exactamente esa versión, independientemente de cuántas migraciones aditivas existan.

No se cambiaron cálculos móviles para acomodar las pruebas. Durante el desarrollo se corrigió también el aislamiento de la bandera web para que una migración deshabilitada no alterara la política pública de inventario ni las comprobaciones históricas de respaldo.

### Navegador y evidencias

Se comprobó en QA el guardado de una preparación de 18 litros, la venta de 2 litros desde el formulario web, el margen con costo real, los reportes por actividad y una compra de jarcería con entrada de 2 piezas pero saldo total desconocido. Su anulación con retorno dejó movimientos vinculados de +2 y −2, sin inventar un inicial.

- [Confirmar preparación](artifacts/web-continuacion-20261106/preparacion-confirmar.png).
- [Inventario tras preparación](artifacts/web-continuacion-20261106/inventario-preparado.png).
- [Rendimiento real](artifacts/web-continuacion-20261106/reporte-rendimiento.png).
- [Margen estimado](artifacts/web-continuacion-20261106/reporte-margenes.png).
- [Costos por proveedor](artifacts/web-continuacion-20261106/costos-proveedores.png).
- [Compra histórica y enlace a conciliación](artifacts/web-continuacion-20261106/compra-historica.png).
- [Anulación y destino físico](artifacts/web-continuacion-20261106/anulacion-destino-fisico.png).
- [Reporte de jarcería a 390 px](artifacts/web-continuacion-20261106/reporte-jarceria-web390.png): ancho del documento igual a 390 px, sin desbordamiento horizontal.

Consola de navegador sin errores durante la revisión final. No se hicieron ensayos en la web operativa.

## 6. Rendimiento

El análisis indexa movimientos por venta/renglón y costos por producto, evitando recorrer todo el historial por cada concepto.

Benchmark sintético sin base de datos: **1,000 productos y 10,000 ventas**, con sus movimientos y referencias de costo, en **27.77–43.24 ms** en tres ejecuciones. [Evidencia](artifacts/web-continuacion-20261106/report-performance.json). No representa una garantía de tiempo para otros equipos o volúmenes.

Medición del QA preparado, tres lecturas por endpoint: seguimiento de compras 3.97–7.13 ms; análisis de limpieza 6.19–7.08 ms; jarcería 6.43–6.80 ms; general 5.60–6.45 ms. Respuestas de análisis de aproximadamente 1.5–3.2 KB. [Muestras](artifacts/web-continuacion-20261106/qa-http-performance.json). Estas mediciones corresponden a los fixtures y momento indicados, no son una comparación con la base operativa.

El JavaScript inicial compilado pasa de 1,588.81 KB / 450.07 KB gzip en la entrega anterior a **1,609.68 KB / 455.60 KB gzip**: incremento aproximado de 1.3% al incorporar estos flujos. Se conserva la carga diferida del módulo de tickets.

Una navegación de QA registró DOMContentLoaded de 173.5 ms; es una observación con caché/entorno de desarrollo, no una prueba de arranque en frío. No se reinició Windows ni ningún servicio operativo para medir. La medición del arranque real y el perfil SQL operativo siguen pendientes de una ventana autorizada.

## 7. Archivos y alcance

El manifiesto detalla los 52 archivos acumulados y sus SHA-256. Las 32 diferencias de esta continuación se concentran en:

- Compras/inventario web: `PurchaseInventoryPanel`, `PurchaseFormModal`, `HardwarePurchases`, `InventoryPage` y `PurchasesPage`.
- Reportes: `OperationsReport`, `operationsReport.mjs`, `HardwareReports` y `ReportsPage`.
- Dominio y servidor: `purchaseInventory.mjs` web y servidor, `inventoryBaseline`, repositorio/servicio de inventario, dataset y rutas web, `webActivationPlan`.
- Migración 011, benchmark de análisis, pruebas de reportes, compras, lavandería, migración/regresiones y huella de respaldo.
- Respaldo preparado: `operationalBackup.mjs`, `backup-operational.mjs` y `verify-operational-restore.mjs`.

Los archivos anteriores de catálogo, categorías, alta por lote, compras por importe, mayoreo, menú y carga diferida permanecen dentro de la entrega acumulada. Los cambios nuevos no requieren dependencias adicionales.

## 8. Pendientes para considerar terminada la versión web en operación

| Pendiente | Motivo |
|---|---|
| Revisar y aprobar el plan operativo actual/propuesto | La configuración oficial de lavandería y el corte histórico cambian comportamiento comercial. No se ejecutaron. |
| Conciliar los 70 renglones reales con evidencia | Los siete posibles ajustes coincidentes no demuestran que una compra ya estuviera incluida. Los rendimientos teóricos no prueban preparaciones históricas. |
| Capturar el inventario inicial físico de jarcería | No puede deducirse de las compras acumuladas. |
| Configurar puntos de reposición y lotes reales donde falten | La ausencia del umbral impide clasificar una existencia positiva como suficiente o por reponer. |
| Respaldo operativo nuevo y restauración independiente | Los ensayos realizados son QA; no sustituyen el respaldo previo a la activación real. |
| Autorización de ventana, migración 011 y despliegue coordinado | No copiar cambios sobre Vite activo ni habilitar solo frontend. Deben publicarse backend, web y configuración compatibles. |
| Verificación posterior en operación | Health/readiness, persistencia, tickets y cálculos con datos reales, sin operaciones ficticias, y medición de arranque/carga. |

No quedan bloques de las prioridades 1–3 deliberadamente solo visuales o sin backend dentro del alcance descrito. Sí permanecen las limitaciones explícitas de confirmación por renglón completo y de márgenes estimados; no se presentan como producción parcial de insumos ni costeo contable por lotes.

Antes de activar también se debe revisar la compatibilidad de los clientes existentes con la configuración compartida de servicios. Las pruebas de contratos y ventas históricas pasaron, pero no se instaló ni se hizo una prueba de campo de la aplicación móvil.

## 9. Integridad y restricciones cumplidas

Se verificaron **352 archivos originales** contra sus hashes de referencia: sin cambios en el código servido. Los **12 archivos compartidos protegidos de móvil/tickets** coinciden con sus hashes anteriores. [Comprobación](artifacts/web-continuacion-20261106/source-integrity.json).

Express operativo 3003/PID 2484, Vite operativo 5173/PID 14724 y PostgreSQL 5432/PID 6580 permanecieron activos. Solo se actualizaron procesos propios de QA en el puerto de ensayo 5174, conservando su esquema y datos. No se instalaron servicios ni se modificó Windows.

**No hubo migraciones, ventas, compras ni inventarios ficticios en operación. No se alteraron datos históricos reales. No se modificó la aplicación móvil, sus contratos ni los archivos compartidos protegidos. No hubo APK, ADB, commits ni pushes.** No se trasladó información a la nube ni se expuso PostgreSQL.

La siguiente etapa móvil queda para después de la aprobación web y no forma parte de los cambios implementados.
