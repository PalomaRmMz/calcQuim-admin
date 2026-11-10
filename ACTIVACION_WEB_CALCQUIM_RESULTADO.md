# Activación operativa web de CalcQuim — resultado

**Activación ejecutada satisfactoriamente el 7 de noviembre de 2026.** Pasaron las verificaciones críticas de restauración previa, integridad, migraciones, configuración atómica, conservación de datos, disponibilidad web y acceso móvil. No se ejecutó la corrección específica de Mr. Big ni se generaron transacciones ficticias en producción.

## 1. Revisión operativa

| Momento | Revisión | Generación |
|---|---:|---|
| Preflight y respaldo previo | 176 | `39656fe8-6025-4740-8f19-8b767f1e9a9c` |
| Activación confirmada y verificación posterior | 177 | `39656fe8-6025-4740-8f19-8b767f1e9a9c` |

La configuración comercial se confirmó a las **17:32:26 UTC**. El gestor actualizado arrancó a las **17:32:32 UTC**. El último contraste integral de datos documentado fue a las 17:36:24 UTC. Son referencias fechadas: la operación puede registrar nuevas revisiones posteriormente.

La consulta fresca identificó dos ventas adicionales respecto de la copia QA de revisión 173 y cambios de inventario en productos 63 y 84. Se conservaron. No había compras ni productos adicionales. No se usó la copia antigua para reemplazar datos operativos.

[Preflight privado](artifacts/web-activacion-20261107/preflight.private.json), [ejecución de activación](artifacts/web-activacion-20261107/activation.private.json) y [verificación posterior](artifacts/web-activacion-20261107/post-verification.private.json).

## 2. Respaldo y restauración verificada

Antes de publicar código o migrar se generó un respaldo PostgreSQL completo mediante las herramientas existentes, utilizando una transacción de lectura repetible y snapshot exportado. Se verificó el archivo y una segunda copia fuera del proyecto.

- Respaldo previo: **1.544.379 bytes**.
- SHA-256: `35af5216d43d60537a24f72d509e5680624ce6480b08599336bfcc113a48cc7e`.
- Revisión respaldada: 176; misma generación actual.
- Segunda copia: `D:\CalcQuim-Backups\web-activation-20261107`.
- [Manifiesto y ubicación primaria](artifacts/web-activacion-20261107/backup-result.private.json).

El propietario creó la base nueva vacía `calcquim_recovery_20261107_webactivation`, propiedad de `calcquim_operational_app`. No se concedieron privilegios globales ni se borraron bases existentes. Allí se restauró y verificó el respaldo: snapshot, inventario y relaciones coincidentes; **3.104 comprobaciones relacionales, cero fallos y cero claves foráneas sin validar**.

[Evidencia de restauración](artifacts/web-activacion-20261107/backups/recovery-1794072629519.private.json). Sobre esa copia se ensayaron 011/012 y la activación completa: revisión 176 → 177, 70 renglones incluidos, datos comerciales y movimientos base preservados, cero eventos físicos y ninguna corrección de Mr. Big. [Ensayo aprobado](artifacts/web-activacion-20261107/rehearsal.private.json).

También se guardaron copias de recuperación del código y configuración original en el proyecto, y una copia independiente de código sin `.env`. Los ZIP se verificaron. Las credenciales originales permanecieron en su ubicación.

Después de activar se generó otro respaldo con el script operativo actualizado: **1.579.863 bytes**, SHA-256 `84c454ba7824794c21648a4c3b2e932d4f75bc417ecafae2ad2239a4bbdf6efb`. Incluye huellas de inventario base versión 3, compras versión 1 y paquetes versión 1. Su segunda copia también fue verificada. [Registro de copia posterior](artifacts/web-activacion-20261107/post-backup-secondary.json). Este segundo respaldo no se restauró en otra base; la restauración real previa y el ensayo aislado sí se completaron antes del despliegue.

Las copias independientes están fuera del proyecto, pero en la misma unidad D:. No protegen contra pérdida de toda esa unidad. Los respaldos y evidencias privadas contienen información comercial: no deben publicarse.

## 3. Migraciones aplicadas

Se verificaron los checksums de 001–010 y que **011 y 012 eran las únicas pendientes**. Se aplicaron ambas en orden, dentro de la transacción del migrador. La consulta posterior confirmó las versiones **001–012**, todas con checksum válido.

011 habilitó el seguimiento de compras y preparaciones; 012 incorporó cuentas y eventos físicos de paquetes. No reconstruyeron existencias históricas ni corrigieron Mr. Big. La configuración se activó después por el mecanismo comercial atómico ya ensayado.

## 4. Archivos publicados

Se verificaron el ZIP autorizado, los 74 archivos preparados y los 352 hashes de referencia del árbol operativo antes de publicar. No se detectaron modificaciones posteriores sobre esa referencia. Se archivaron los originales, incluidas las modificaciones previas existentes.

Se publicaron **74 rutas**: 73 coinciden exactamente con el paquete y una contiene una corrección adicional del respaldo. El archivo `server/src/services/operationalBackup.mjs` ya pertenecía a las 74 rutas; por ello la corrección no aumenta el total.

La corrección conserva `packInventorySha256` y su versión en los manifiestos primario y secundario: el script preparado enviaba esos datos, pero el servicio los descartaba. Se probó antes de publicar y se comprobó su presencia en el respaldo posterior. El ZIP original no se modificó.

[Lista publicada y hashes finales](artifacts/web-activacion-20261107/published-files.json), [overlay del respaldo](artifacts/web-activacion-20261107/overlay/server/src/services/operationalBackup.mjs) y [prueba de regresión](artifacts/web-activacion-20261107/backup-regression.test.mjs).

No se rehízo la funcionalidad ni se sobrescribieron cambios del propietario con una copia antigua. La carpeta QA y su paquete siguen disponibles.

## 5. Servicios actualizados

Se utilizó el cierre del gestor existente para suspender la web, API y acceso móvil durante la ventana. Antes de publicar se verificó que los puertos 3003, 3016, 3099 y 5173 ya no escuchaban; Vite no estaba utilizando el árbol operativo.

Después de publicar, migrar y activar se inició el gestor actualizado. Su estado posterior: `managed=true`, `ready=true`, `ownsExpress=true`, `ownsReact=true`, `mobileWarning=false`. Se reanudaron backend, Vite y acceso móvil. **No se reinició PostgreSQL** ni se modificó su ubicación local.

La primera lectura del ZIP utilizó inicialmente un prefijo incorrecto y se detuvo antes de escribir archivos; se corrigió a `prepared/`, se repitió la comprobación y la publicación terminó correctamente dentro de la ventana. No hubo publicación parcial por ese error.

## 6. Funcionalidades activadas

- Compras → Inventarios: compras nuevas inequívocas según presentación, insumos pendientes de preparación y entradas por elaboración confirmada, con trazabilidad y controles de duplicación.
- Gestión física de paquetes cerrados y unidades sueltas, apertura automática durante ventas individuales y correcciones auditables. La composición anterior permanece desconocida hasta conteo explícito.
- Inicial opcional al crear productos y captura posterior, sin exigir el conteo completo de jarcería y sin permitir un segundo inicial.
- Mejoras preparadas de jarcería, limpieza, reportes, navegación, captura y reposición editable.
- Lavandería: lavado y medias cargas según tabla oficial, solo secado, centrifugado con secado y servicio a medida. Se conservó el servicio previo de solo exprimido y las ventas históricas.

Tarifas configuradas: lavado completo/medio $60/$30; con insumos $70/$40; con secado $90/$60; servicio completo $100/$50. Solo secado $30 por carga entera; centrifugado + secado $40 por carga entera. Servicio a medida exige descripción y precio personalizado.

Se verificó la configuración almacenada contra todas las definiciones oficiales. No se generaron servicios cobrados ficticios para probarla.

## 7. Conservación de compras, ventas e inventarios

Antes y después: **95 productos, 42 ventas, 8 compras y 86 productos con inicial registrado**. Se comparó íntegramente el dataset excluyendo únicamente la configuración de servicios autorizada: los demás datos coinciden.

Se conservaron todos los movimientos base, saldos, cantidades iniciales originales y corregidas, anclajes y configuraciones de reposición existentes. No se creó ningún movimiento físico durante el reconocimiento. Los **104 registros previos de auditoría** están presentes entre los 246 posteriores; los 142 nuevos documentan el corte, la política y el reconocimiento de renglones.

[Preservación de auditoría](artifacts/web-activacion-20261107/history-preservation.json). No se registraron ventas, compras, productos, iniciales ni inventarios ficticios en operación. Las pruebas con operaciones simuladas permanecieron en QA o en memoria.

## 8. Compras históricas reconocidas

Se comprobó que los **70 renglones** coincidían exactamente con las compras, identificadores y huellas autorizadas. El mecanismo atómico los dejó como `included`, con evidencia de declaración del propietario y **sin efecto sobre existencias**. No se inventaron rendimientos históricos ni correspondencias con ajustes manuales.

No quedaron renglones históricos del corte pendientes de ese reconocimiento. Las compras futuras se tratarán según la configuración activada, conservando las revisiones necesarias cuando no sean inequívocas.

## 9. Health, readiness y persistencia

Pasaron **12 lecturas HTTP posteriores**, todas con estado 200: health/live, health/ready, dataset, productos, categorías, proveedores, compras, inventario, seguimiento de compras, catálogo de reportes y reportes de Limpieza/Jarcería.

Muestras locales: live 20,45 ms; readiness 133,87 ms; dataset 43,98 ms; inventario 22,81 ms; reportes Limpieza 15,91 ms y Jarcería 40,04 ms. No son garantías de latencia futura. Las lecturas PostgreSQL y HTTP confirmaron revisión, generación y persistencia después del reinicio.

## 10. Pruebas y revisión visual posteriores

Se conserva la evidencia de las **448 pruebas aprobadas** del paquete preparado. Esta activación añadió el ensayo sobre la restauración real y ejecutó cinco pruebas de respaldo, todas aprobadas. Diez comprobaciones adicionales de compatibilidad aprobaron usando HTTP simulado en memoria, sin escrituras operativas. No se contabilizan como una repetición integral de las 448.

El build web operativo pasó: JavaScript principal 1.569,32 kB / 444,97 kB gzip; CSS 275,07 / 39,65 kB gzip. [Log](artifacts/web-activacion-20261107/build.log). No se compiló móvil.

Se navegaron diez pantallas operativas: productos, categorías, jarcería, proveedores, compras, inventarios de ambas actividades, reportes, lavandería y ventas. No aparecieron errores de JavaScript. Se probaron las tres actividades del reporte. Se abrieron y cancelaron borradores de venta sin guardar: Limpieza conservó dos radios exclusivos y un seleccionado; al cargar con ancho 390 px, documento 390 px y diálogo 366 px.

Se renderizaron **10 tickets históricos reales** sin imprimirlos ni modificar ventas. [Resultado](artifacts/web-activacion-20261107/tickets.json). La edición de reposición se comprobó disponible y sus valores existentes se preservaron; no se guardaron umbrales ficticios.

Evidencias:

- [Inventario de jarcería y composición desconocida](artifacts/web-activacion-20261107/inventario-jarceria-operativo.png).
- [Formulario de Limpieza](artifacts/web-activacion-20261107/limpieza-formulario-operativo.png) y [carga a 390 px](artifacts/web-activacion-20261107/limpieza-390-operativo.png).
- [Lavandería operativa](artifacts/web-activacion-20261107/lavanderia-operativa.png).
- [Reportes](artifacts/web-activacion-20261107/reportes-operativos.png).
- [Historial de ventas](artifacts/web-activacion-20261107/web-ventas-operativa.png).
- [Registro de navegador](artifacts/web-activacion-20261107/browser-verification.json) y [compatibilidad](artifacts/web-activacion-20261107/compatibility.json).

## 11. Pendientes y recuperación

**Mr. Big 600 hojas, ID 73, sigue con inicial y saldo de 4 piezas**, sin composición física determinada. Su movimiento inicial `321ab900-0f78-4c72-9cc9-ea28856faff3` permanece intacto. La corrección a cuatro paquetes cerrados/16 rollos no se mezcló con el despliegue y continúa pendiente de su operación separada y verificación actualizada.

También siguen pendientes los conteos reales de composición desconocida y los puntos de reposición que el propietario no haya configurado. No se deducen existencias de compras históricas ni se asignan cifras para completar reportes. La venta de paquetes cerrados sin composición confirmada se bloquea hasta conciliación; esto es un control de integridad activado.

Observación visual no bloqueante: al redimensionar una sesión de escritorio a 390 px sin recargar se observó ancho de documento 421 px, con estado de navegación conservado. Al cargar desde el inicio a 390 px se verificó ancho correcto de 390 px. Queda pendiente revisar esa transición de tamaño; no se alteró el formulario de ventas para corregirla durante el despliegue.

La recuperación debe conservar los hechos posteriores a la activación. No ejecutar `down` de 012 si ya hay eventos ni restaurar el respaldo previo sobre operaciones reales nuevas. Ante un incidente: preservar respaldo actual y evidencias, suspender escrituras si corresponde y conciliar las operaciones nuevas antes de autorizar restauración. El respaldo posterior ya incluye las huellas físicas; el anterior no sustituye esa auditoría.

La revisión automática rechazó la copia independiente inicial que contenía `.env.operational` y `.env.migration`, por exposición de credenciales. Se completó una alternativa sin secretos; no se copiaron esos archivos fuera del proyecto. La protección ante pérdida de toda la unidad D: sigue requiriendo otra ubicación de respaldo autorizada.

## 12. Estado móvil y contratos

No se modificó, compiló ni instaló la aplicación móvil ni Android. Se comprobaron sin cambios los hashes de siete módulos del cliente. El backend conserva el contrato y el acceso restringido: catálogo móvil sin autenticación → **401**; con credencial existente → **200**, revisión 177.

Incluso anunciando capacidad comercial, el catálogo móvil operativo no expone servicios, presentaciones ni productos de jarcería. Los diez controles de compatibilidad también verificaron rechazo de comercio web por el cliente y preservación de reglas históricas. No se envió ninguna venta ficticia a los endpoints operativos.

## 13. Git y estado final

**Sin commits ni pushes. PostgreSQL permanece local. La versión web autorizada está activa y sus verificaciones críticas pasaron.** Los pendientes de datos reales y la observación de redimensionamiento quedan explícitos; no se declara terminada toda futura mejora de CalcQuim ni se inicia trabajo móvil.
