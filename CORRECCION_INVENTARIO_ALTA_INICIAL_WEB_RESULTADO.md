# CALCQUIM — Corrección de inventario y alta inicial integrada

6 de noviembre de 2026. **Preparado y probado en QA; sin activación operativa.** Continúa `AJUSTES_FINALES_NEGOCIO_UI_WEB_RESULTADO.md`, preservando sus 61 archivos y funcionalidades. La entrega acumulada tiene ahora **67 archivos**, con 15 archivos nuevos o modificados en esta etapa. [Manifiesto](artifacts/web-alta-inicial-20261106/manifest.json), [paquete preparado](artifacts/web-alta-inicial-20261106/prepared-changes.zip), [parche](artifacts/web-alta-inicial-20261106/changes.patch) y [copia de los 61 anteriores](artifacts/web-alta-inicial-20261106/prepared-before.zip).

## 1. Lectura fresca de datos reales

Se consultó PostgreSQL local mediante transacciones **REPEATABLE READ READ ONLY**, verificadas y cerradas con ROLLBACK. La lectura inicial y el preflight final encontraron revisión **172**, generación conservada. El último preflight corresponde a **15:36:24 de Ciudad de México** (21:36:24 UTC). La revisión 162 se usó únicamente como referencia de diferencias, nunca como estado operativo actual.

| Dato actual consultado | Resultado |
| --- | --- |
| Productos totales | 95 |
| Productos de jarcería | 24 |
| Iniciales de jarcería existentes | 14 |
| Jarcería sin inicial | 10; sin cantidades asignadas por esta entrega |
| Compras vigentes / renglones | 8 / 70, sin compras nuevas |
| Huellas de los 70 históricos confirmados | Conservan coincidencia con el listado aprobado |
| Migraciones | 001–010, checksums válidos; 011 pendiente |

Nuevos productos detectados: **93 Palo de escoba**, **94 Bote de basura colores chico** y **95 Jabón p/manos Zen**, conservando su actividad, unidades y presentaciones reales. No se reclasificaron ni se les asignaron existencias.

Desde la referencia anterior se identificaron seis iniciales nuevos y una corrección:

| ID | Producto | Inicial vigente en unidad base |
| --- | --- | --- |
| 75 | Sanitas 100 toallas 24 × 21 cm | 12 piezas; inicial original 11, corregido a 12 |
| 77 | Pastilla para baño | 10 piezas |
| 78 | Pastillas de cloro dúo (2) | 3 piezas |
| 90 | Zote barra 100 g | 3 piezas |
| 91 | Zote barra 200 g | 3 piezas |
| 92 | Zote barra 400 g | 1 pieza |

Se conservaron los 14 iniciales, sus correcciones y los productos agregados por el propietario. Los hashes del dataset e inventario operativo coincidieron entre la lectura inicial y la final de esta etapa. Esto acredita esas dos capturas; no congela actividad posterior.

Evidencias privadas: [lectura inicial](artifacts/web-alta-inicial-20261106/operational-read.private.json) y [preflight final](artifacts/web-alta-inicial-20261106/final-preflight.private.json). Contienen IDs, presentaciones, movimientos, cambios y plan vigente; no son archivos para publicar.

## 2. Mr. Big: variante confirmada y corrección preparada

Se identificaron ambas variantes antes de proponer una corrección. El propietario seleccionó expresamente **Mr. Big 600 hojas, ID 73**.

| Variante | ID | Presentación paquete | Contenido | Inicial actual | Historial físico |
| --- | --- | --- | --- | --- | --- |
| Mr. Big 800 hojas | 72 | `fc:presentation:mr-big-800:paquete-4` | 4 piezas | Sin inicial | Sin movimientos |
| Mr. Big 600 hojas | 73 | `fc:presentation:mr-big-600:paquete-4` | 4 piezas | 4 piezas | Un movimiento inicial; sin conteo posterior |

Para el ID 73: **4 paquetes × 4 piezas = 16 piezas base**. Se propone corregir el inicial absoluto de **4 a 16**, diferencia **+12**, mediante `inventoryCorrectInitial`. Se conserva el inicial `321ab900-0f78-4c72-9cc9-ea28856faff3`, registrado el 6 de noviembre a las 15:10:42 de Ciudad de México. No tiene compra ni venta vinculada; la lectura no encontró correcciones previas ni anclaje posterior, y el backend permite corregirlo.

El mecanismo conserva el movimiento original y agrega un evento de corrección: **no registra una entrada de +12 ni otro inicial de 16**. En la captura actual, el saldo resultaría 16; si después hay otros movimientos, deberán conservarse al calcular el saldo. La variante 800 no se modifica.

Se prepararon el [detalle de la corrección](artifacts/web-alta-inicial-20261106/MR_BIG_CORRECCION_PREPARADA.md) y el [borrador privado del comando](artifacts/web-alta-inicial-20261106/mr-big-correction.private.json), con ID, cantidad previa, conversión, observaciones y exigencia de precondiciones frescas. Están marcados sin autorización de escritura y sin ejecución.

**No se aplicó la corrección de Mr. Big, ni siquiera en la copia visual QA.** El formulario se mostró con 16 y se descartó sin guardar; la comprobación posterior mantiene su inicial en 4. El caso 4 → 16 con diferencia 12 y un único movimiento inicial se probó con un producto sintético independiente. Antes de escribir en operación se requiere autorización específica, respaldo aplicable y nueva lectura; un inicial cambiado, ya corregido o con conteo posterior obliga a detener/revisar, sin volver a sumar la diferencia.

## 3. Inicial opcional en el alta individual

Los formularios de **Nuevo producto de limpieza** y **Agregar producto de jarcería** incorporan «Registrar inventario inicial ahora (opcional)»:

- Desmarcado: crea el producto con existencia desconocida, sin movimiento inicial.
- Marcado: requiere cantidad y unidad; admite cero explícito y distingue ese cero de un inicial ausente.
- Limpieza: permite unidad base y conversiones dimensionales válidas, por ejemplo mL a L; no adivina contenidos de envases.
- Jarcería: permite unidad base o una presentación del propio producto. Muestra contenido y vista previa; el servidor utiliza el factor de la presentación guardada, no un factor arbitrario enviado en el inicial.
- Cambiar la unidad base reinicia la captura opcional para evitar reinterpretar una cantidad anterior. Las observaciones del conteo se conservan con el registro.

Producto, presentaciones, inicial, auditoría, revisión e idempotencia se guardan dentro de **una sola transacción**. Si falla cantidad, conversión, presentación o inventario, se revierte toda el alta; no queda un producto parcialmente guardado. Los reintentos con la misma clave devuelven el resultado existente, sin otro producto o movimiento.

El historial registra fecha del movimiento y del evento, origen «alta de producto web», cantidad/unidad capturada y, cuando corresponde, presentación/factor y equivalente base. La ficha muestra ese origen en Historial. El inicial mantiene la clasificación aproximada existente del sistema; cero confirmado significa una captura explícita de cero, frente a saldo desconocido, sin cambiar los contratos de clasificación.

La opción de limpieza se ofrece en modo PostgreSQL; no introduce inventario con almacenamiento local del navegador. Los formularios de edición no ofrecen reemplazar el inicial desde catálogo, y el backend rechaza intentos de añadirlo por esa vía a un producto existente.

## 4. Captura posterior y política general

La política temporal de Fibra chica queda sustituida por **inicial opcional para todos los productos**, sin lista exclusiva. Los indicadores antiguos de esa restricción no bloquean el nuevo flujo preparado.

Desde Inventarios se puede registrar el inicial de cualquier producto pendiente. Para jarcería se agregó selección de presentación también en esa captura posterior, con conversión validada y referencia del factor utilizado. No es obligatorio capturar todos los artículos y las compras/ventas mantienen su manejo de saldo indeterminado.

Un producto con inicial existente rechaza un segundo `inventoryInitial`. Para modificar el inicial se conserva el flujo de Correcciones, que valida ID y cantidad previa y mantiene el registro original. Un conteo posterior conserva la identidad del inicial; no se convierte en un segundo inicial ni en una edición del primero. No se eliminaron iniciales ni se recalcularon desde compras históricas.

## 5. Alta por lote de jarcería

Se conserva compatible y transaccional **sin inicial integrado por renglón**. Se probó alta de lote normal y rechazo íntegro de un lote que intenta enviar iniciales embebidos: no se ignoran silenciosamente ni se guarda parte del lote. Después del alta, cada inicial pendiente puede registrarse desde Inventarios. No se amplió obligatoriamente el diseño de la captura por lote.

## 6. Validación y evidencias visuales

**426 pruebas aprobadas, cero fallos y cero omitidas:** **300 web**, **45 backend** y **81 de integración PostgreSQL/HTTP**. Se ejecutaron las suites completas sobre el paquete actualizado. [Resumen](artifacts/web-alta-inicial-20261106/test-summary.json), logs [web](artifacts/web-alta-inicial-20261106/web-tests.log), [backend](artifacts/web-alta-inicial-20261106/server-tests.log) e [integración](artifacts/web-alta-inicial-20261106/integration-tests.log).

Cobertura nueva y de regresión:

| Escenario | Resultado |
| --- | --- |
| Alta de limpieza con inicial y conversión mL/L | Aprobado |
| Alta de jarcería con paquetes y factor guardado | Aprobado; 4 × 4 = 16, ignorando un factor extra arbitrario |
| Alta sin inicial y cero explícito | Aprobado; desconocido y cero permanecen distintos |
| Captura posterior, incluso con flag antiguo de Fibra chica | Aprobado |
| Corrección de inicial y rechazo de cantidad previa obsoleta | Aprobado; original conservado, sin nuevo movimiento físico |
| Inicial duplicado y reintentos concurrentes idempotentes | Aprobado |
| Cantidad vacía, negativa, precisión excesiva, unidad incompatible | Rechazo con reversión completa |
| Presentación ajena/inactiva, fracción de paquete entero y conversión no representable | Rechazo sin redondeo ni alta parcial |
| Edición de producto existente intentando reemplazar el inicial | Rechazo sin cambios persistidos |
| Alta por lote y preservación de productos, compras e inventarios existentes | Aprobado |

Para el ensayo visual se creó un esquema nuevo en `calcquim_activation_test`, con copia local de los 95 productos y del estado consultado de inventario. Se comprobó coincidencia de los saldos e iniciales antes del ensayo y que el reconocimiento histórico no los alterara. Esta copia de trabajo no sustituye un respaldo operativo ni su restauración completa verificada.

En navegador se guardaron solamente **dos productos sintéticos QA**: limpieza con inicial cero y jarcería con cuatro paquetes equivalentes a 16 piezas. La revisión posterior confirmó un solo movimiento inicial por producto, los **95 productos y sus 95 filas de inventario originales conservados**, compras/ventas intactas y Mr. Big sin corregir. [Preservación al preparar QA](artifacts/web-alta-inicial-20261106/qa-preservation.json) y [verificación tras el navegador](artifacts/web-alta-inicial-20261106/browser-qa-verification.json).

Capturas revisadas:

- [Alta de limpieza con cero explícito](artifacts/web-alta-inicial-20261106/alta-limpieza-cero.png).
- [Alta de jarcería con paquetes y equivalente](artifacts/web-alta-inicial-20261106/alta-jarceria-paquetes.png).
- [Captura responsive a 390 px](artifacts/web-alta-inicial-20261106/alta-inicial-movil390.png): documento y viewport de 390 px, sin desbordamiento horizontal.
- [Inicial pendiente disponible posteriormente](artifacts/web-alta-inicial-20261106/inicial-posterior-pendiente.png).
- [Mr. Big: borrador de corrección sin guardar](artifacts/web-alta-inicial-20261106/mr-big-correccion-borrador.png).

No hubo errores de consola en la revisión visual. Se repitieron y aprobaron los **diez escenarios de compatibilidad** del cliente móvil actual y los servicios compartidos, en memoria y sin POST operativo. [Resultados y hashes](artifacts/web-alta-inicial-20261106/compatibility.json). No se modificó, compiló ni instaló la aplicación móvil; su prueba de campo sigue fuera del alcance.

La compilación web QA pasó: 1,467 módulos; JavaScript inicial 1,559.10 kB / 442.44 kB gzip. Se conserva la advertencia de chunks grandes. No se instalaron dependencias ni se cambiaron manifests/locks. [Compilación](artifacts/web-alta-inicial-20261106/build.log).

## 7. Integridad, preflight y activación pendiente

Los **352 archivos originales** conservan sus hashes, incluidas las modificaciones preexistentes del árbol operativo. Los 67 preparados y su ZIP se verificaron por SHA-256/CRC; `git apply --check` pasa. Los archivos fuente móviles comprobados conservan sus hashes. [Integridad](artifacts/web-alta-inicial-20261106/source-integrity.json).

El [preflight final de solo lectura](artifacts/web-alta-inicial-20261106/final-preflight.private.json) contiene revisión/generación frescas, productos, iniciales, correcciones, movimientos de Mr. Big, validación de migraciones y huellas históricas, y plan de activación actualizado. Queda sin autorización y sin ejecutar. El hash del plan cambia con la política general; no reutilizar el hash del paquete anterior.

La [adenda de activación y recuperación](artifacts/web-alta-inicial-20261106/ACTIVACION_ALTA_INICIAL.md) sustituye la restricción anterior, actualiza el conjunto a 67 archivos y separa la corrección individual de Mr. Big de la publicación web. Sigue pendiente solo **011**, sin cambios en su SQL; esta mejora no agrega migraciones ni aplica backfill de iniciales. El listado de 70 compras manualmente incorporadas se conserva sin nuevas entradas ni reposiciones.

Antes de activar: preflight nuevo que conserve cualquier cambio posterior a revisión 172, respaldo nuevo y copia independiente, restauración verificada, ventana autorizada y publicación coordinada de web/backend/configuración. La corrección de Mr. Big queda pendiente de autorización específica de escritura y comprobaciones vigentes; no se ejecuta dentro de una migración ni del corte histórico.

Los servicios operativos conservaron sus PID: API/móvil/gestor **2484**, Vite **14724** y PostgreSQL **6580**. El nuevo QA usa **5176**, sin reiniciar los servicios operativos ni sustituir los QA anteriores. [Listeners](artifacts/web-alta-inicial-20261106/operational-listeners.txt).

**No se alteró PostgreSQL operativo, no se corrigió Mr. Big automáticamente, no se activó ni copió el paquete al servido operativo y no hubo commits ni pushes.** La funcionalidad está preparada y probada en QA; la activación y sus verificaciones reales permanecen pendientes.
