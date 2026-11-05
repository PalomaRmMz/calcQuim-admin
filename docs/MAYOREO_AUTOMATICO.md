# Mayoreo automático configurable

**Corrección de distribución móvil — 3 de noviembre de 2026:** la APK v3 entregada tenía firma e identificador correctos pero un formato de envío incompatible con el servidor revisado. La versión vigente es `artifacts/preparacion-final/apk/CalcQuim-Distribucion-v4.apk`, código Android 4, misma firma y claves de almacenamiento; su bundle y protocolo fueron verificados. Debe instalarla manualmente el propietario como actualización. La red y el catálogo operativo funcionan; no se debe relajar el rechazo de solicitudes antiguas ni borrar datos para resolver esta incidencia. Véase `artifacts/preparacion-final/activacion-operativa/INCIDENCIA_APK_V3_20261103.md`.

**Estado operativo actualizado — 3 de noviembre de 2026:** migración 008 aplicada y motor `admin-sales-wholesale-v2` activo después de la confirmación de instalación de APK v3. Política `wholesale-threshold` y acumulación por grupo oficial. Respaldo restaurado y conciliado; 16 ventas, 22 renglones y 93 movimientos conservados, sin pendientes. Admin, Express y catálogo móvil verificados también tras reiniciar. Las tarifas mayoristas reales siguen vacías: se conserva el precio normal hasta configurarlas. Evidencia privada en `artifacts/preparacion-final/activacion-operativa/ACTIVACION_COMPLETADA_20261103.md`.

El informe siguiente documenta la preparación y sus pruebas anteriores a esta activación; sus referencias a autorización o despliegue pendientes son históricas.

Implementación del 31 de octubre de 2026. Probada con datos sintéticos en esquemas temporales exclusivos de `calcquim_activation_test`, en navegador y en Android. **No aplicada ni activada en `calcquim_operational`.**

## Regla comercial

El nuevo motor `admin-sales-wholesale-v2` selecciona la tarifa por renglón:

- Menos de 10 litros: precio normal.
- Desde 10 litros inclusive: precio de mayoreo configurado para toda la cantidad.
- Sin tarifa mayorista válida: precio normal y advertencia discreta al alcanzar el umbral.
- Otras unidades: precio normal; el umbral de litros no se extiende a kg, piezas ni otras unidades.

No se convierte el mayoreo en un porcentaje. Las tarifas mayoristas nuevas empiezan vacías. Se admiten importes monetarios de dos decimales, positivos y no superiores al precio normal. Un cero, un precio negativo, uno superior al normal o una precisión monetaria inválida se rechazan.

El modelo persistido usa **precio individual o grupo**, de forma excluyente. Al seleccionar precio individual, el producto utiliza sus propias tarifas normal y mayorista. No se toma el mayoreo del grupo si falta el individual. El resolvedor nuevo da prioridad a una tarifa individual explícita; no se relaja la restricción que impide guardar simultáneamente ambos tipos en un producto. No se infieren precios a partir de categorías o líneas.

## Captura por importe: decisión confirmada por el propietario

La política seleccionada es `wholesale-threshold`: **mayoreo desde el importe de 10 litros a la tarifa mayorista**.

Ejemplo exclusivamente sintético, no precargado como tarifa real: normal $20/L y mayoreo $15/L.

| Captura | Resultado |
|---|---|
| 9 L | Normal: $180 |
| 10 L | Mayoreo: $150 |
| $149.99 | Normal: 7.4995 L |
| $150 | Mayoreo: 10 L |
| $151 | Mayoreo: aproximadamente 10.066667 L |

El cambio de cantidad al alcanzar el importe mínimo es consecuencia de esta regla comercial explícitamente elegida, no de una conversión iterativa. No se divide primero entre una tarifa para cambiarla después: se compara el importe en centavos contra el costo exacto de 10 litros mayoristas, se elige una tarifa una sola vez y luego se obtiene la cantidad.

Se conserva siempre el importe capturado en centavos. Cuando la cantidad es una fracción periódica se conserva también su numerador y denominador, se muestra como aproximada y no se altera el importe para redondear litros. Las cantidades capturadas directamente admiten hasta seis decimales. La selección del umbral y el redondeo monetario usan aritmética entera.

El motor también tiene pruebas para las alternativas `normal-threshold` y `require-liters`. La última bloquea el intervalo ambiguo en lugar de confirmar una tarifa silenciosamente. **La alternativa autorizada para la activación es `wholesale-threshold`.** No se ofrece un selector de normal/mayoreo en cada venta.

## Configurar desde Admin

Una vez autorizadas la migración y activación:

1. **Productos → Grupos de precio → Editar**: conservar el precio normal y capturar el nuevo **Precio de mayoreo por litro**.
2. **Productos → Editar producto → Precio individual**, unidad litro: conservar el normal y capturar **Precio de mayoreo individual por litro**.
3. Guardar. Las tarifas persisten en Express/PostgreSQL y se pueden modificar posteriormente. Vaciar el mayorista lo deja sin configurar; no lo reemplaza con un descuento predeterminado.

Los formularios validan el campo opcional y el servidor vuelve a validarlo. Las pruebas de navegador guardaron y reabrieron un mayorista de grupo y uno individual, comprobando que los normales permanecieran iguales. También registraron una venta web con selección automática de mayoreo.

Antes de la activación, los formularios informan que el mayoreo está pendiente. No intentan escribir campos nuevos sobre un esquema que no los tiene.

## Express y móvil

- El catálogo de Express publica las dos tarifas oficiales y la política elegida. React Native no contiene una lista fija de precios mayoristas.
- Cada tarifa agrupada distingue **precio normal + precio mayorista + unidad**. Productos que comparten el normal pero difieren en mayoreo no se mezclan como si fueran una tarifa inequívoca.
- El protocolo del catálogo cambia a `admin-sales-wholesale-v2` al activar. El móvil actualizado admite v1 y v2; una versión antigua no debe usarse con el nuevo catálogo.
- El servidor reconstruye la tarifa desde sus datos vigentes y rechaza afirmaciones de precio o tipo de tarifa incorrectas. Se mantienen revisión, generación e idempotencia existentes.
- Las ventas guardan precio unitario aplicado, tipo normal/mayoreo, ambas tarifas de referencia, versión y política de cálculo. El recibo conserva esos datos y muestra **Tarifa de mayoreo**, sin atribuir un porcentaje ficticio.
- Los cambios de configuración afectan nuevas ventas. Las anteriores no se recalculan. Las correcciones explícitas utilizan las tarifas históricas del renglón y preservan el recibo original.
- El desglose físico utiliza los productos compatibles del renglón histórico. No cambia el importe y no vuelve a aplicar una salida ya asignada.

La lógica anterior v1 se mantiene para compatibilidad con datos e instalaciones no activadas. Mientras la base operativa siga en v1 conserva su comportamiento existente; no se cambió de manera encubierta durante estas pruebas. Las nuevas ventas v2 no usan el descuento general del 15%.

## Migración y activación pendientes de autorización

Archivos concretos para revisar:

- `server/migrations/008_wholesale.up.sql`: columnas numéricas opcionales `wholesale_price` en productos y grupos, restricciones y marca `wholesalePricingSchema: 2`.
- `server/migrations/008_wholesale.down.sql`: retirada condicionada; bloquea si ya existe configuración o historial de mayoreo.
- `configureWholesalePricing` en `server/src/services/commands.mjs`: activación comercial explícita, después de la migración, con `{ "amountPolicy": "wholesale-threshold" }`.

La migración no precarga mayoristas, no actualiza los precios normales ni reescribe ventas o movimientos. **Instalar el esquema no activa automáticamente la regla.** La activación es una operación separada con los controles de concurrencia existentes. Sin la marca de esquema el servidor rechaza esa activación y la escritura de tarifas mayoristas.

Para activar en producción hace falta autorización expresa para aplicar **solamente la migración 008** sobre la base operativa y activar la política elegida. Primero debe distribuirse el móvil actualizado, que acepta tanto el catálogo anterior como el nuevo; una app anterior no reconoce el protocolo nuevo. Después se actualizan Express y Admin, se aplica la migración autorizada, se activa la política elegida y se recarga el catálogo. La exportación Android probada no equivale a haber generado, firmado o distribuido una APK nueva.

No usar los scripts antiguos de activación de inventario o publicación móvil para esta operación: sus alcances y supuestos de versión son distintos. No se ejecutaron contra la base operativa. Antes de cualquier aplicación autorizada debe verificarse la recuperación existente sin sobrescribir respaldos.

## Validaciones realizadas

| Verificación | Resultado |
|---|---|
| Suite web y dominio | 248/248 pasan |
| Backend unitario | 35/35 pasan |
| Suite móvil, incluida paridad con Express | 28/28 pasan |
| Integración PostgreSQL de mayoreo | 2/2 pasan en esquemas temporales propios |
| Regresión de inventario/reporte | Pasa en el entorno aislado |
| Lint web y backend | Pasa |
| Lint móvil con configuración JS/JSX recomendada usada en la tarea anterior | Pasa |
| Build web | Pasa |
| Exportación Android de producción, Hermes | Pasa; no es una APK nativa firmada |
| Formularios reales en navegador, con API de ensayo | Guardado, edición y persistencia tras recargar pasan |
| Venta web por 10 L | Aplica tarifa configurada a toda la cantidad |
| Android, botón original Registrar venta | Confirma con Express/PostgreSQL sintético |
| Android tras reinicio | Conserva recibo y tarifas |

La prueba Android utilizó tarifas exclusivamente sintéticas configuradas en esa base de ensayo: normal $20/L, grupo mayorista $14/L e individual mayorista $17/L. Desde el botón original de la app se confirmaron tres conceptos: 9 L normales ($180), 10 L de grupo ($140) y captura individual por $170 (10 L). Total confirmado: **$490**, precios unitarios históricos **20, 14 y 17**. No se inyectó un recibo ni se sustituyó el envío por una llamada desde Node.

Las pruebas de migración ensayaron expresamente la actualización desde 007 con productos, precio normal, inventario y venta histórica ya presentes. Después de 008 todos esos registros permanecieron idénticos y los mayoristas siguieron vacíos. Tras activar sin tarifa mayorista, una nueva venta conservó el normal y mostró la advertencia.

La integración verifica además: rechazo de tarifa manipulada, rechazo de precio mayorista inválido con rollback, modificación y eliminación de la tarifa opcional, persistencia tras reiniciar Express, recibos originales intactos después de cambiar tarifas, idempotencia y desglose de 10 L en 6 + 4 con un único movimiento por asignación. El segundo desglose del mismo pendiente es rechazado.

## Protección de datos y entrega

No se aplicó la migración ni la activación en `calcquim_operational`. Las escrituras de prueba se limitaron a esquemas nuevos con nombre aleatorio y destino restringido a `calcquim_activation_test`; se limpiaron únicamente esos esquemas propios. No se editaron productos, precios, compras, ventas, inventarios o respaldos reales, ni se borró AsyncStorage/SecureStore o datos del emulador habitual.

Los logs, snapshots, estados Android y comprobaciones de huellas están excluidos de Git en `artifacts/wholesale/`. No se incluyeron credenciales o datos comerciales reales en los nuevos tests. No se hicieron commits ni pushes.

El control final conservó idénticos los 711 archivos protegidos preexistentes y las tablas de las bases de restauración y ensayo. La base operativa tuvo actividad concurrente: aparecieron cinco ventas WEB, V-00006 a V-00010, entre 11:14 y 11:16 del 31 de octubre de 2026. El usuario confirmó expresamente que las capturó durante esta sesión. Por ello la comparación completa de esa base no es idéntica al inicio; no se revirtieron ni editaron esos movimientos. Su esquema sigue en 007 y el mayoreo continúa sin activar.
