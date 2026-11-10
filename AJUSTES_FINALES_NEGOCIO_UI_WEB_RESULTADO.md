# CALCQUIM — Ajustes finales de negocio y UI web

6 de noviembre de 2026. **Implementado y probado en QA; pendiente de activación operativa.** Continúa la preparación anterior sin reiniciar módulos ni reemplazar el código servido. Las decisiones comerciales recibidas se incorporaron al paquete preparado; no se ejecutaron en PostgreSQL operativo.

## 1. Decisiones del propietario aplicadas

| Decisión | Implementación preparada |
| --- | --- |
| Compras históricas ya incorporadas manualmente | Reconocimiento por declaración auditada, sin entrada nueva ni enlace supuesto a movimientos |
| Inicial nuevo solo para Fibra chica | Política de activación compartida por interfaz/backend; demás productos pueden seguir indeterminados |
| Reposición editable | Apartado visible por actividad; crear, cambiar y quitar mínimo/lote, con historial y sugerencia separada |
| No se necesitan preparaciones parciales | Se conserva preparación completa por renglón y cantidad final real |
| Jarcería autorizada dentro de la versión preparada | Alcance incorporado; activación técnica conjunta sigue pendiente de sus puertas de seguridad |

El paquete acumulado tiene **61 archivos**, con **15 archivos nuevos o modificados en esta entrega** respecto del preparado anterior y del árbol base correspondiente. Se preservaron los 52 archivos anteriores en un [archivo de referencia](artifacts/web-ajustes-negocio-20261106/prepared-before.zip). El [manifiesto actualizado](artifacts/web-ajustes-negocio-20261106/manifest.json) identifica hashes y cambios; el [ZIP acumulado](artifacts/web-ajustes-negocio-20261106/prepared-changes.zip) y el [parche](artifacts/web-ajustes-negocio-20261106/changes.patch) quedan listos para el despliegue autorizado, sin aplicarlos.

## 2. Compras históricas incorporadas manualmente

Se preparó el [listado de los 70 renglones confirmados](artifacts/web-ajustes-negocio-20261106/COMPRAS_HISTORICAS_CONFIRMADAS.md), correspondientes a ocho compras: 41 renglones de terminado y 29 de insumos según sus snapshots. La decisión del propietario resuelve su incorporación manual; ya no se exige adjudicarles los siete candidatos del informe anterior.

En la activación autorizada, esos renglones se marcarán `included`, con un evento `purchase_inventory_manual_included`, declaración del propietario, huella del renglón y efecto físico «ninguno». La tabla muestra «Ya incorporada manualmente» y el historial explica el origen. No se crean entradas, se modifican anclajes ni se asignan M01–M04 por coincidencia. La evidencia adicional puede adjuntarse a la revisión sin convertirse en otra entrada.

El [registro privado de decisiones](artifacts/web-ajustes-negocio-20261106/owner-decisions.private.json) congela compra/renglón/huella y distingue aprobación comercial de autorización de activación. El backend rechaza renglones cambiados, repetidos, ajenos al corte o con una operación física incompatible; el rechazo revierte la transacción completa. Los reintentos no duplican movimientos ni reconocimientos por renglón.

No se inventa volumen final de insumos históricos: su reconocimiento conserva cantidad real sin determinar cuando no se midió. Una devolución futura con cantidad desconocida necesita revisión física; la declaración no habilita un retiro arbitrario. Las compras nuevas posteriores al corte conservan la integración automática y las preparaciones confirmadas existentes.

En QA se reconocieron **los 70 renglones** de una copia local del catálogo/compras de la revisión 152: **cero movimientos físicos nuevos, cero enlaces inferidos y ninguna cantidad final inventada**. Esa copia omite comprobantes adjuntos y no importó el inventario operativo: la comparación de saldos corresponde al estado QA antes/después, no certifica los saldos reales. La integración sintética adicional comprueba también reconocimiento sobre stock previo existente. [Evidencia del ensayo de 70 filas](artifacts/web-ajustes-negocio-20261106/historical-70-qa.json).

## 3. Inventario inicial parcial de jarcería

La activación conjunta configura la clave estable `fc:article:fibra-chica`. Solo Fibra chica ofrece y acepta un inicial NUEVO. Se usa su producto de catálogo, sin buscar por parecido del nombre. El backend valida tanto `inventoryInitial` como la vía antigua `inventoryEstimate`, evitando eludir la restricción desde otro cliente web.

Los demás artículos sin inicial mantienen saldo indeterminado, historial y administración de reposición. No se exige completar todos los conteos ni se bloquean compras/ventas por esa ausencia. Las entradas vinculadas pueden existir con saldo total desconocido; no se deduce un inicial de ellas. No se capturó una cantidad real de Fibra chica porque no se proporcionó su conteo.

**Se preservó actividad operativa concurrente.** La lectura final, exclusivamente `READ ONLY`, encontró revisión **162**, ocho iniciales de jarcería ya existentes y **Fibra chica aún sin inicial**. Por tanto, ahora quedan 13 productos sin inicial: Fibra chica habilitada para captura y otros 12 pendientes. Los ocho existentes no se borraron, corrigieron ni sustituyeron. La política nueva no elimina iniciales previos y conserva su historial; la regresión comprueba además que un conteo posterior no reescribe el inicial.

Los 70 renglones confirmados siguen coincidiendo con sus huellas y no hay renglones adicionales en esa lectura. El inventario sí cambió desde la preparación anterior; se conservó y exige un preflight fresco en la ventana. [Lectura y plan privados](artifacts/web-ajustes-negocio-20261106/operational-preflight.private.json).

Las equivalencias de presentaciones permanecen sin modificación, incluida la presentación «pieza» de Fibra chica con factor 4. El inicial se captura en piezas BASE físicamente contadas; no multiplicar por ese factor salvo que el conteo corresponda realmente a la presentación completa. No se supone su contenido ni se transforma una compra pasada en saldo.

## 4. Administración editable de reposición

Inventarios de limpieza y jarcería incluyen **Puntos de reposición y lotes habituales**, con selector de producto y acceso directo a su ficha. La pestaña Reposición está disponible incluso sin inventario inicial. Permite guardar, editar después y vaciar mínimo/lote con motivo, conservando auditoría y sin generar existencias.

La sugerencia del sistema aparece en un bloque distinto de los valores que se aprobarán al guardar. Solo propone lote cuando existe una cantidad más frecuente inequívoca entre compras vigentes de terminado; excluye insumos y compras anuladas. Indica cuántas observaciones lo respaldan y permite copiarlo al borrador, sin guardarlo automáticamente. No propone mínimo sin consumo/plazo fiable. Se retiró la sugerencia genérica de 5 L; no se fijaron umbrales operativos ni se confundió la aprobación de la funcionalidad con aprobación de números.

## 5. Preparaciones

**No se implementaron preparaciones parciales.** Se mantiene el flujo por renglón completo, volumen final realmente obtenido, destino y vínculo a compra, correcciones/compensaciones e historial. El reconocimiento de insumos históricos no los vuelve a elaborar ni vuelve a ingresar terminado.

## 6. Registrar venta: radios y grid

Para limpieza, el selector convencional se sustituyó por radios **Por cantidad / Por monto**. La selección es inmediata y exclusiva; al cambiar se limpian el valor y la confirmación física anterior, evitando arrastrarlos al otro modo.

Los campos activos usan CSS grid: en modo monto, importe y cantidad física confirmada quedan en una fila en escritorio; a 390 px se apilan sin desbordamiento. Se conservaron tipografía, controles, espaciado y modal. Lavandería mantiene sus propios campos y reglas. No se cambiaron funciones de precios, redondeo, descuentos ni cálculo de cantidades.

La revisión con datos reales copiados a QA detectó nombres repetidos como Carisma: se corrigió la clave de las opciones de búsqueda para usar su identificador, eliminando el aviso de claves duplicadas y manteniendo las variantes seleccionables.

Evidencia visual revisada:

- [Por cantidad, escritorio](artifacts/web-ajustes-negocio-20261106/venta-cantidad-escritorio.png).
- [Por monto, campos alineados](artifacts/web-ajustes-negocio-20261106/venta-monto-escritorio.png).
- [Por monto, 390 px](artifacts/web-ajustes-negocio-20261106/venta-monto-movil390.png).
- [Fibra chica: inicial habilitado y vacío](artifacts/web-ajustes-negocio-20261106/fibra-chica-inicial-habilitado.png).
- [Otro artículo: inicial pendiente](artifacts/web-ajustes-negocio-20261106/jarceria-inicial-pendiente.png).
- [Reposición editable sin inicial](artifacts/web-ajustes-negocio-20261106/reposicion-editable-sin-inicial.png).

## 7. Pruebas y verificación

**414 pruebas aprobadas, cero fallos y cero omitidas:** web **296**, backend **45**, integración PostgreSQL/HTTP **73**. Son ejecuciones nuevas de las suites, no la suma de resultados repetidos. [Resumen](artifacts/web-ajustes-negocio-20261106/test-summary.json); logs [web](artifacts/web-ajustes-negocio-20261106/web-tests.log), [backend](artifacts/web-ajustes-negocio-20261106/server-tests.log) e [integración](artifacts/web-ajustes-negocio-20261106/integration-tests.log).

Se cubrieron reconocimiento de terminado/hidróneo histórico sin movimientos, transacción completa ante huellas cambiadas o repetidas, idempotencia, exclusión de compras nuevas, inicial autorizado/rechazado por backend, preservación de iniciales previos, reposición sin inicial creada/editada/vaciada y entradas nuevas con saldo desconocido. Pasaron también las regresiones previas de preparación completa, anulaciones, compensaciones, respaldos/restauración QA, jarcería, navegación y lavandería. La validación del motivo ahora precede a la revisión temporal del anclaje, conservando ambas comprobaciones y haciendo consistente el error para motivos inválidos.

En navegador: radios exclusivos, alineación horizontal a 1366 px, adaptación a 390 px, rechazo de cantidad cero, limpieza del valor al cambiar modo, acceso a reposición y separación de lavandería. Borradores: Carisma, $19 → 1 litro y 2 litros → $38; se cancelaron sin POST de venta. Tras corregir la clave de búsqueda, la comprobación de variantes no registró errores de consola. [Verificación de navegador](artifacts/web-ajustes-negocio-20261106/browser-verification.json).

Se repitieron y aprobaron los **diez escenarios de compatibilidad** con módulos fuente del cliente móvil actual y servicios compartidos, en memoria y sin base operativa. [Resultados y hashes](artifacts/web-ajustes-negocio-20261106/compatibility.json). No se modificó, compiló ni instaló móvil; la prueba de campo de una APK sigue fuera de alcance.

La compilación web QA pasó: 1,465 módulos, JavaScript inicial de 1,553.43 kB / 440.89 kB gzip. Persiste la advertencia de chunks grandes; el tiempo de compilación no es una medida de arranque operativo. [Log de compilación](artifacts/web-ajustes-negocio-20261106/build.log). No se instalaron dependencias ni se alteraron manifests/locks.

Los **352 originales** conservan sus hashes. Los 61 preparados y el contenido del ZIP se verificaron con SHA-256/CRC; `git apply --check` del parche pasa sobre el árbol actual. Los siete archivos fuente móviles comprobados conservan hashes; el árbol compartido protegido queda cubierto también por la referencia original. [Integridad](artifacts/web-ajustes-negocio-20261106/source-integrity.json).

## 8. Activación: preparada, pendiente de ejecución autorizada

El [plan actualizado de activación y recuperación](artifacts/web-ajustes-negocio-20261106/ACTIVACION_AJUSTES_NEGOCIO.md) incorpora el nuevo paquete de 61 archivos, la declaración de los 70 renglones y el inicial parcial. Sustituye las condiciones anteriores que exigían decidir de nuevo esos históricos o completar todos los iniciales; no sustituye los requisitos técnicos de seguridad.

Sigue pendiente solo la migración **011**, sin modificación de su SQL ni migraciones adicionales. El comando conjunto configura servicios, corte histórico, declaración manual y política de iniciales en una transacción. Su hash de plan cambió al incluir la política nueva; se debe obtener un hash/revisión/generación vigentes sobre datos completos en la ventana. No reutilizar el plan antiguo ni omitir la declaración preparada.

Antes de operación: respaldo nuevo y copia independiente, restauración verificada en base nueva, preflight fresco que preserve cambios concurrentes, ventana autorizada y despliegue coordinado web/backend/configuración. La aprobación funcional de jarcería está recibida; no se vuelve a solicitar. No se interpreta como autorización para ejecutar la ventana ni para cambiar tarifas compartidas sin la revisión prevista en el plan anterior.

Después: verificar sin operaciones ficticias los saldos/anclajes existentes, el reconocimiento sin entradas nuevas, iniciales previos preservados, saldo desconocido permitido, edición de reposición, tickets/servicios compartidos, persistencia y respaldo posterior. Ante fallo se preservan hechos reales y se usa la recuperación por fases; no se restaura una copia vieja perdiendo negocio posterior.

Permanecieron los PID operativos: API/móvil/gestor **2484**, Vite **14724**, PostgreSQL **6580**. El nuevo QA usa **5175** y un esquema nuevo en `calcquim_activation_test`; no se reinició ni sustituyó el QA anterior ni servicios operativos. [Listeners](artifacts/web-ajustes-negocio-20261106/operational-listeners.txt).

**No se escribió en PostgreSQL operativo, no se activó el paquete ni se copió sobre Vite operativo. No se modificó móvil, no hubo APK, commits ni pushes.** La entrega funcional está preparada para revisión; la versión web no se declara activada ni íntegramente terminada en operación hasta cumplir sus verificaciones de publicación.
