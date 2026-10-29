# Inventario aproximado: implementación y activación local

El código reutiliza productos, unidades, compras, ventas e IDs existentes. La migración `006_inventory` es aditiva y no carga saldos iniciales, productos ni movimientos históricos. Se aplicó a `calcquim_operational` el 29 de octubre de 2026, con autorización expresa y ventana sin escrituras, después de generar y verificar un respaldo completo. Las pruebas utilizan exclusivamente esquemas UUID en `calcquim_activation_test`.

La verificación operativa confirmó el dataset previo idéntico, 70 productos, 5 compras y 2.268 comprobaciones relacionales correctas. React mostró los 70 productos como **Sin determinar**, sin movimientos ni asignaciones iniciales. Express fue reiniciado únicamente para cargar el módulo. No se ejecutaron operaciones ficticias sobre la base operativa ni se hicieron commits o pushes. Las evidencias y el respaldo permanecen en las carpetas privadas de `server/artifacts/`.

## Reglas confirmadas por el propietario

- Desconocido no equivale a cero. Entradas y salidas sin base numérica quedan en el historial sin mostrar una existencia calculada.
- Una estimación expresa lo que hay **al capturarla**. Es un nuevo punto de partida; no vuelve a sumar movimientos registrados anteriormente. El cero solo existe si se captura explícitamente. Una nueva estimación conserva las anteriores.
- El estado pasa de **Sin determinar** a **Aproximada registrada** y después a **Calculada desde una estimación**. Incluso el saldo calculado sigue siendo aproximado.
- Una venta directa con producto, cantidad física y unidad compatibles descuenta exactamente una vez. No se bloquea por saldo negativo: se muestra una advertencia.
- Las ventas por importe quedan pendientes aunque el cálculo financiero produzca una cantidad teórica. Se confirma explícitamente la cantidad física y se conserva el importe original.
- La agrupación visual actual no significa una venta sin producto. Se conserva el producto financiero y se elige explícitamente “Desglosar después por línea/categoría” para distribuir la salida física entre productos de ese grupo. El total físico debe coincidir exactamente; no se reparte por nombre, precio ni proporciones inventadas.
- Toda recepción, incluida la compra de terminado, se confirma manualmente. Preparación, compra de base, concentrado o hidroneo nunca crean existencias automáticamente.
- Una edición o anulación de compra con recepciones relacionadas genera una revisión pendiente; no presume devolución de mercancía.
- Anular una venta requiere indicar si el producto no salió o regresó físicamente. Solo en ese caso se compensa el descuento. Si permanece fuera, la salida se conserva.
- Las devoluciones parciales se registran aparte. Después se anula sin reposición automática, evitando contar dos veces el retorno. Una devolución no puede exceder la salida física pendiente de retornar.
- Las correcciones usan movimientos compensatorios. Los movimientos y el historial de cambios no se editan ni borran.
- Si una operación es anterior a la última estimación, se exige confirmar por producto si **ya estaba incluida** (solo historial, sin doble efecto) o si **debe aplicarse ahora**. Sin respuesta no se ejecuta. Se aplica a desgloses tardíos, movimientos retroactivos, correcciones y reposiciones por anulación. Una fecha de venta antigua puede dejar una salida pendiente de revisión en lugar de descontarla automáticamente.

## Interfaz

### Captura inicial y regularización auditada

Una ficha sin inicial ofrece únicamente **Registrar inventario inicial**: cantidad, unidad y observaciones opcionales. No pide motivo ni ofrece Otro. Express impone el motivo `initial_inventory` y la clasificación `INVENTARIO_INICIAL`, independientemente del texto enviado por el cliente. El cero requiere captura expresa. Los movimientos manuales requieren un inicial existente.

Las correcciones del inicial usan el motivo fijo **Corrección de inventario inicial** (`initial_correction`) y observaciones opcionales. Conservan anterior, nuevo, diferencia y fecha en el historial, sin editar movimientos originales. Los motivos antiguos permanecen intactos.

`node scripts/regularize-initial.mjs` genera un plan privado en una transacción de solo lectura. Selecciona únicamente el primer `estimate` de cada producto, independientemente del motivo original; no reclasifica preparaciones, ventas, salidas o mermas. Marca capturas repetidas, posibles duplicados y productos con movimientos sin estimación para revisión.

La aplicación de un plan requiere autorización expresa del propietario y ventana cerrada. El ejecutor exige `--apply`, `--authorize-operational`, `--closed-window-confirmed`, `--plan=...`, `--expected-plan-sha256=...` y `--backup=...`. Verifica integridad y correspondencia exacta del respaldo, bloquea `dataset_state`, rechaza planes obsoletos o ambiguos y crea solamente eventos inmutables `initial_classification`. Cada evento conserva el movimiento original completo y su ID, además del hash del plan. No cambia cantidades, fechas, unidades, vínculos ni tipos técnicos de los movimientos originales.

La clasificación lógica se resuelve mediante `inventoryMovementClassification`: la marca del registro nuevo o el evento de reclasificación auditado. El motivo histórico original sigue disponible. La operación comprueba que saldos, movimientos y datos financieros siguen idénticos y hace rollback ante diferencias. Repetir un plan ya aplicado no agrega eventos. No requiere migración de esquema.

Los respaldos nuevos usan proyección de inventario versión 3; se mantiene la verificación de manifiestos de versiones 1 y 2. Las evidencias, planes y respaldos privados permanecen fuera de Git.

El listado utiliza el mismo `DataTable` de Productos, sin desplegables por categoría. Reutiliza `getProductDisplayName`, `categoryStyle`, `TableActions` y el orden inicial de Productos (categoría y línea, sobre nombres ordenados). Las columnas visibles son Producto, Existencia aproximada, Estado, Reposición, Lote habitual, Acciones y Categoría. Se mantienen la búsqueda, paginación, ordenación por encabezados, etiquetas de categoría y barra de color junto al producto. Los filtros de categoría, línea, producto y estado se aplican antes de mostrar la tabla.

Seleccionar el nombre o el lápiz Editar de un producto abre el modal compartido `AppModal`, con cinco secciones:

1. **Inventario inicial:** registrar una sola vez el punto de partida. El primer registro histórico `estimate` conserva su ID, fecha, cantidad y motivo originales; no se convierte en una entrada. Sin registro sigue «Sin determinar».
2. **Movimientos:** preparación y recepción suman. Salida y merma solicitan cantidades positivas y la interfaz las convierte a salidas negativas. **Conteo físico del saldo actual** registra lo que hay ahora, conserva el inicial y no vuelve a sumar los movimientos ya incluidos en ese conteo. También se conservan ajustes compensatorios y devoluciones.
3. **Correcciones:** mostrar inicial original y vigente, capturar el valor nuevo, revisar diferencia y saldo actual resultante, y elegir Error de captura, Corrección de conteo u Otro con explicación. Se registra un evento inmutable `initial_correction` con anterior, nuevo, diferencia, fecha y motivo en `inventory_changes`; no se modifica ni agrega un movimiento físico. La existencia se recalcula con el inicial corregido y los movimientos posteriores íntegros. Si ya existe un conteo/estimación posterior, la corrección se bloquea y requiere revisión; nunca se modifica silenciosamente el saldo ni se reaplica una diferencia absorbida por un conteo.
4. **Historial:** consultar inicial, conteos, movimientos, correcciones del inicial y configuración. Las compensaciones de movimientos físicos siguen exigiendo motivo y conservan el original.
5. **Reposición:** conservar punto y lote habitual, sin asignar cantidades automáticamente.

Los comandos nuevos son `inventoryInitial`, `inventoryCorrectInitial` e `inventoryCount`, mediante `POST /api/v1/commands/:name`. Utilizan la transacción y las precondiciones/idempotencia existentes. La corrección exige el ID del inicial y el valor anterior esperado; no puede repetirse sobre una versión diferente. `inventoryEstimate` permanece compatible con clientes anteriores, sin reescribir el primer registro.

Esta separación utiliza las tablas y restricciones de la versión 6: **no requiere migración SQL ni transformación masiva de datos**. Los respaldos nuevos indican versión 2 de la proyección de inventario y las restauraciones siguen verificando manifiestos anteriores con la proyección de versión 1. No se alteran respaldos existentes.

Para corregir una captura real: abrir la ficha → Correcciones → capturar el nuevo inicial → revisar la diferencia → seleccionar motivo → Guardar corrección del inicial. El formulario nunca propone una cantidad correcta por su cuenta. `server/browser/inventory-initial-ui.mjs` prueba 12 → 8, entrada de 20, salida de 1.5, corrección con movimientos posteriores, conteo, bloqueo de ambigüedad y reinicio en el servidor sintético aislado.

Los pendientes de desglose y las revisiones de compras permanecen en la pantalla general. Las acciones de cada ficha actualizan el saldo mostrado después de confirmar el guardado en PostgreSQL.

La sección **Inventario** permite filtrar por categoría, línea y producto, consultar desconocidos y alertas, registrar estimaciones, preparación, recepción, ajustes, mermas, correcciones y devoluciones. También muestra movimientos, pendientes de desglose y recepciones por revisar.

El umbral y el lote habitual se configuran por producto y conservan su historial. El botón de **5 L** solo es una sugerencia explícita para litros, nunca una asignación automática. Un lote de 20, 50 o 65 L no representa una existencia máxima.

Para capturar una merma se indica cantidad negativa y motivo. Para una corrección se puede registrar un movimiento compensatorio o compensar un movimiento existente desde el historial. Las estimaciones se corrigen mediante una nueva existencia actual. Las salidas por venta se compensan mediante anulación con retorno confirmado o devolución explícita, no mediante un botón de edición.

Las alertas requieren una cantidad determinada y un umbral configurado; se activan al estar en o por debajo del umbral. No se supone el volumen de garrafas, botellas o envases. Solo se reutilizan equivalencias existentes de volumen o masa; las cantidades admiten hasta seis decimales sin redondear silenciosamente.

Mientras no exista el esquema, la sección muestra **Inventario pendiente de activación**. Los flujos previos continúan funcionando. No hay fallback a localStorage.

## Tablas nuevas

| Tabla | Función |
|---|---|
| `inventory_settings` | Política aprobada y disponibilidad del seguimiento futuro |
| `inventory_accounts` | Unidad del producto y referencia a la estimación vigente; sin saldo inicial predeterminado |
| `inventory_movements` | Libro inmutable de entradas, salidas, estimaciones, ajustes y reversas |
| `inventory_pending` | Renglón de venta pendiente, alcance del grupo y cantidad física por confirmar |
| `inventory_allocations` | Distribución confirmada y vínculos con sus movimientos |
| `inventory_replenishment` | Umbral y lote habitual opcionales |
| `inventory_changes` | Historial inmutable de estimaciones, configuraciones, desgloses, anulaciones y revisiones |

Cantidades SQL `numeric`, PK UUID para movimientos y pendientes, secuencia técnica para orden, FKs a IDs existentes, índices por producto, venta, compra y pendientes. Las referencias al renglón financiero son diferidas para conservar el repositorio transaccional existente. Los triggers impiden editar/borrar movimientos y validan anclas y reversas. La reversión `down` queda bloqueada si existe información de inventario.

## API

`GET /api/v1/inventory` devuelve disponibilidad, existencias, reposición, pendientes, movimientos, cambios y revisiones de compras. `/api/v1/dataset` añade `inventoryEnabled`.

Se reutiliza `POST /api/v1/commands/:name`, con `If-Match`, generación y `Idempotency-Key` existentes:

| Comando | Acción |
|---|---|
| `inventoryEstimate` | Capturar existencia actual estimada |
| `inventoryMovement` | Entrada, ajuste, merma, corrección o devolución física |
| `inventoryReplenishment` | Configurar o retirar umbral/lote |
| `inventoryReverse` | Compensar un movimiento corregible una sola vez |
| `inventoryAllocate` | Confirmar distribución física completa de un pendiente |
| `inventoryReviewPurchase` | Confirmar revisión física de una recepción relacionada |

Cada comando recibe un formulario en `args[0]`. Campos habituales: `productId`, `quantity`, `unit`, `reason`; recepción: `purchaseId` y `purchaseOrdinal`; devolución: `saleId`; desglose: `pendingId`, `allocations` y, si falta cantidad determinada, `confirmedQuantity`/`confirmedUnit`.

`createSale` acepta opcionalmente `inventory: {"ID_DEL_PRODUCTO": {pendingGroup:true,scope:"line"}}` o `scope:"category"`. Son instrucciones separadas del snapshot financiero. La agrupación no se activa solo porque la venta muestre un encabezado de línea.

`voidSale` añade un segundo argumento `{inventoryReturn:"returned"|"not_returned",reason:"..."}` cuando inventario está habilitado. El endpoint REST de anulación recibe ese objeto como body. Sin confirmación devuelve error y revierte toda la transacción. No existe edición financiera de ventas en la API actual; se rechaza una reescritura que pudiera invalidar el inventario.

Las operaciones que atraviesan una estimación requieren `baselineTreatment:"already_included"|"apply_now"`. En desgloses puede indicarse en cada asignación; en anulaciones admite también un mapa por ID de producto. La interfaz de anulación ofrece una elección general; si cada producto requiere una distinta, registrar las devoluciones individualmente en Inventario y anular sin una segunda reposición. El marcador de “ya incluido” se genera en el servidor, no se acepta como referencia libre del cliente.

Se comparte el bloqueo de `dataset_state`: venta, movimiento, asignación, revisión, resultado idempotente y revisión global se confirman juntos o hacen rollback. Repetir la misma solicitud no repite descuentos; reutilizar su clave con otro contenido se rechaza. Los IDs y unidades con historial de inventario no se eliminan ni cambian silenciosamente.

## Pruebas y respaldo

### Guardado y cierre de fichas

Las fichas reutilizan `AppModal`, `ValidatedForm` y `ConfirmDialog`. Una confirmación exitosa de Express actualiza el inventario, cierra la ficha y muestra un aviso durante cinco segundos. Si la operación quedó guardada pero falla la actualización de la vista, la ficha también se cierra y el aviso de recarga permanece: no debe repetirse el movimiento.

Durante el envío se bloquean los campos, el botón de guardar y el cierre manual. Un bloqueo sincrónico impide dos envíos incluso antes de que React actualice el botón. Los errores conservan los valores y la ficha abierta; los reintentos usan la protección idempotente existente de la API. Una actualización de datos no reinicia el formulario ni envía operaciones.

Cerrar con el botón, la X, Escape o el fondo del diálogo solicita confirmación si existen cambios sin guardar. Cambiar de pestaña también advierte antes de descartar la captura. Cancelar la advertencia conserva los valores.

`server/browser/inventory-modal-ui.mjs`, con el fixture sintético existente, prueba validaciones, conservación de campos ante error, cierre de todas las operaciones, doble envío, respuesta tardía, pérdida de respuesta después del commit y reintento sin duplicado, reposición y confirmación de descarte. Todas sus solicitudes API se redirigen al servidor aislado; no utiliza la base operativa.

### Motivos normalizados

Los formularios de inventario utilizan listas por operación, sin seleccionar un motivo automáticamente:

- Existencia aproximada: Inventario inicial, Conteo físico, Estimación visual y Corrección de existencia.
- Entradas: Preparación de producto, Recepción de producto terminado o Ajuste positivo, según el tipo seleccionado. El ajuste positivo tiene su propia opción de entrada; los ajustes de conteo/captura conservan sus motivos separados.
- Salidas y mermas: Uso interno, Merma y Corrección de salida.
- Ajustes: Corrección de conteo y Corrección de captura.

Cada lista incluye «Otro», que exige una explicación. «Observaciones» es opcional y no sustituye esa explicación. La misma captura se aplica a compensaciones, reposición, desglose, revisión de compras y anulación de ventas cuando corresponde a inventario.

El catálogo compartido `src/services/inventoryReasons.js` define IDs estables como `initial_inventory`, `prepared_product` y `other`. Express valida el ID y su operación, y guarda `reasonCode`, `reasonCatalogVersion`, `reasonExplanation` y `observations` dentro de la columna JSONB `reference` existente. La columna `reason` conserva la etiqueta legible. No requiere migración ni modificación de registros anteriores.

El historial anterior sigue mostrando el texto original. Los clientes antiguos que todavía envíen solo `reason` se mantienen compatibles y sus nuevas solicitudes se identifican como `legacy_free_text`, sin adivinar equivalencias. La interfaz actual exige seleccionar un código. Para filtrar movimientos nuevos puede utilizarse `reference->>'reasonCode'`; no deben actualizarse los motivos históricos para convertirlos al catálogo.

Las pruebas aisladas comprueban las listas permitidas, rechazo de códigos ajenos, explicación obligatoria, observaciones separadas, duplicados, lectura después de reiniciar y conservación íntegra del historial previo.

```powershell
npm.cmd run test:inventory --prefix server
npm.cmd run test:activation --prefix server
npm.cmd test --prefix server
npm.cmd run lint --prefix server
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

La suite de inventario prueba desconocido/cero, anclas, equivalencias, ventas, desgloses, importes, mermas, correcciones, devoluciones, anulaciones, compras, concurrencia, rollback, HTTP, reinicio, caída de conexión e inmutabilidad. También respalda y restaura un esquema sintético con movimientos e historia y compara el estado completo. No se prueba contra la base operativa.

La prueba de navegador `server/browser/inventory-ui.mjs` utiliza el fixture efímero `server/scripts/inventory-ui-fixture.mjs`. Crea únicamente un esquema UUID en `calcquim_activation_test`, redirige todas las solicitudes API de un contexto de navegador aislado hacia ese servidor y prohíbe localStorage. Comprueba las fichas, estimación, preparación, reposición, reinicio de Express, recarga completa de React, venta directa, duplicados, desglose agrupado, importe pendiente, merma y compensación. Al finalizar cierra el servidor sintético y elimina exclusivamente su esquema temporal. La evidencia agregada queda fuera de Git en `server/artifacts/inventory/ui-validation.private.json`.

El respaldo automático sigue usando la misma tarea. Cuando exista inventario, añade su hash al manifiesto dentro del mismo snapshot de lectura. La recuperación compara tanto el dataset previo como el inventario; no se sobrescriben dumps ni evidencias anteriores.

## Procedimiento de activación utilizado

Este procedimiento ya se ejecutó. No repetirlo sobre la versión 6; los pasos se conservan como referencia de la ventana autorizada.

1. Obtener autorización explícita para `006_inventory` y confirmar una ventana con CalcQuim cerrado y sin escrituras.
2. Ejecutar la suite sintética; se guarda evidencia privada con el checksum de la migración validada.
3. Solo dentro de esa autorización, ejecutar desde `server/`:

```powershell
node scripts/apply-inventory-operational.mjs --authorize-operational --closed-window-confirmed
```

El script exige la base y rol operativos locales, versiones previas 1–5, evidencia sintética, respaldo nuevo íntegro correspondiente al estado actual y evidencia previa de restauración. Bloquea los comandos de la aplicación durante respaldo/aplicación y utiliza una única transacción para migración y comprobaciones. Si falla, revierte el esquema nuevo y no habilita el módulo.

4. Comprobar que el dataset previo sigue idéntico y todas las tablas de inventario de negocio están vacías. Reiniciar Express y recargar React en la ventana autorizada. No ejecutar pruebas ficticias sobre la base operativa.

5. El propietario captura gradualmente las existencias reales estimadas. Las ventas anteriores no se convierten en movimientos retroactivos; los productos siguen sin determinar hasta su estimación explícita.

No se requiere crear bases ni roles operativos adicionales para esta migración. No se hizo commit ni push de este desarrollo.
