# Activación operativa de compactación web y redondeo v2

**Activación completada el 9 de noviembre de 2026.** Los 22 archivos autorizados están publicados; la migración 013 está aplicada; `web-cash-nearest-50-min-50-v2` está habilitada; la captura normal web y móvil quedó restablecida. Sin ventas ficticias ni modificaciones de datos comerciales durante el despliegue.

Todas las horas de este informe son America/Mexico_City (UTC−06:00); los JSON de evidencia conservan UTC.

## Resultado por fase

| Fase | Resultado y hora |
|---|---|
| Preflight fresco final | Aprobado, 17:20:10; revisión 192 y servicios sanos |
| Restauración independiente | Verificada, 17:20:09; 3265 comprobaciones relacionales sin fallos |
| Publicación técnica | 22 archivos y hashes verificados, 17:20:34.730 |
| Migración 013 | Confirmada, 17:20:34.823; v2 inicialmente deshabilitada |
| Política habilitada | 17:21:15.839; un único evento de auditoría |
| Arranque normal y reapertura | 17:22:16; API, Vite y receptor móvil administrados nuevamente |
| Comprobación final | Aprobada, 17:23:27; revisión 193, datos comerciales/físicos intactos |

La interrupción fue breve, aproximadamente de 17:20 a 17:22. No se reinició PostgreSQL. La autorización aplicada es la solicitud expresa `bb1515a3-dcf2-4de3-8da3-5d30cc5026b8`, para estos 22 archivos, 013 y v2; no se amplió a otros módulos.

## Estado inicial y final

| Dato | Antes | Después verificado |
|---|---|---|
| Proyecto servido | `D:\ReactApps\calcQuim-admin` | Mismo árbol operativo |
| Revisión | 192 | **193**, incremento técnico por configuración |
| Generación | `39656fe8-6025-4740-8f19-8b767f1e9a9c` | Sin cambios |
| Productos | 96, incluidos 25 de Jarcería | Idénticos |
| Categorías | Limpieza 12; Jarcería 9 | Idénticas |
| Líneas / grupos de precio | 9 / 10 | Idénticos |
| Compras / ventas | 8 / 54 | 8 / 54, contenido íntegro idéntico |
| Inventarios, movimientos y preparaciones | Huellas frescas registradas | Sin diferencias |
| Paquetes cerrados y unidades sueltas | Composición fresca registrada | Sin diferencias |
| Migraciones | 001–012, checksums válidos | 001–013; 001–012 intactas |
| Configuración monetaria | Tabla inexistente | V2 habilitada, un evento |
| Ventas operativas con metadato monetario nuevo | 0 | 0 al cierre; no se hicieron pruebas comerciales |

Se detectó actividad legítima posterior al corte de QA: revisión 190→192 y ventas 53→54. El respaldo nuevo incluyó esa actividad; no se reutilizó el snapshot 190. Dataset completo, contadores, compras, inventarios, movimientos, pendientes y composición física se compararon con el corte fresco bajo transacción antes y después. Solo cambian migración/configuración/revisión/idempotencia técnicas esperadas.

Evidencias: [preflight](artifacts/web-activation-v2-20261109/preflight.json), [actividad posterior a QA](artifacts/web-activation-v2-20261109/recent-activity-summary.json), [postflight final](artifacts/web-activation-v2-20261109/postflight.json). Este último registra **3265 comprobaciones relacionales, cero fallos y cero FK sin validar**.

## Paquete y publicación

Se verificaron los 403 archivos protegidos antes de intervenir. Ningún destino tenía cambios inesperados; no hubo reconciliación ni sustitución del paquete autorizado. Después de copiar, cada uno de los 22 archivos coincidió con su SHA-256 preparado; todos los demás archivos protegidos conservaron su huella anterior. No se añadieron dependencias.

- ZIP autorizado: SHA-256 `af4a468dd80c0bb672fc62692a9855bc59d105630900c4cae22f60a90ece8d4f`.
- Parche preparado: `f1773abeb8f5e77bb7f7ada57dbc4e779c7c321e7b5eb2ffe11410b7779ad60b`; `git apply --check` aprobado. La publicación se realizó por copia exacta, no por reset/checkout ni modificación del índice.
- [Manifiesto autorizado completo](artifacts/web-redondeo-final-20261109/manifest.json).
- [Registro de los 22 archivos desplegados y SHA-256 completos](artifacts/web-activation-v2-20261109/publication.json).
- [Respaldo fresco de los archivos originales](artifacts/web-activation-v2-20261109/operational-originals.zip), con CRC comprobado y copia adicional verificada.

Los scripts y evidencias de esta ventana permanecen en `artifacts/web-activation-v2-20261109`; no se copiaron al código servido. No se publicaron credenciales, fixtures, tickets sintéticos ni bases QA. No se hicieron commits ni pushes.

## Respaldo anterior a la intervención

Generado el 9 de noviembre a las **17:07:04**, sobre revisión 192 y migraciones 001–012:

- Archivo `postgres-2026-11-09T23-07-04-079Z-b5eaa53d-5c43-4f6d-8016-c5272144c827.dump`.
- Tamaño: **1,590,506 bytes**.
- SHA-256: `0c092977d0f1e6614cd5994f3719497b9c77e16a27c9a67012bac5dfa5711f42`.
- Original: `D:\ReactApps\calcQuim-admin\server\artifacts\operational\backups`.
- Copia adicional: `D:\CalcQuim-Backups\activation-web-v2-20261109`, junto con manifiesto y respaldo de archivos.

Se verificaron archivo, tamaño, SHA-256 y restauración en la base nueva **`calcquim_recovery_20261109_activatev2`**, creada por el propietario y verificada vacía antes del uso. No se sobrescribió la operación ni ninguna recuperación previa. Se comprobaron snapshot, relaciones, compras, inventarios y paquetes; también se ensayaron 013 y configuración v2 en esa restauración antes de intervenir la operación.

Resultados: **3265 comprobaciones relacionales, cero fallos y cero FK sin validar**; datos comerciales y físicos conservados tras el ensayo. [Restauración verificada](artifacts/web-activation-v2-20261109/restore-verified.json) · [Ensayo independiente](artifacts/web-activation-v2-20261109/recovery-rehearsal.json).

La copia adicional está en el mismo disco D:, por lo que **no equivale a respaldo fuera del dispositivo**. Se conservaron respaldos anteriores y no se copiaron credenciales.

## Cierre coordinado y servicios

El gestor confirmó propiedad de API/móvil y frontend. Se cerraron ordenadamente mediante su mecanismo existente, se verificaron puertos de aplicación cerrados y ausencia de transacciones comerciales activas. El estado completo se volvió a contrastar con el respaldo bajo bloqueo antes de publicar.

Durante la comprobación, el receptor móvil permaneció detenido. Se abrió una instancia temporal del backend nuevo y un frontend cuyo proxy rechazaba escrituras con 503; ese rechazo se comprobó usando un comando de diagnóstico sin efectos comerciales. No se alteraron permisos, contratos ni datos para establecer mantenimiento. La configuración autorizada se envió directamente a la API administrativa local.

Tras las comprobaciones, se cerró esa instancia temporal y se arrancó el gestor normal. Estado final:

| Servicio | Estado final |
|---|---|
| Gestor, API y receptor móvil | PID 15476; ready, sin advertencia móvil |
| API | `127.0.0.1:3003`; live/ready 200 |
| Frontend normal | PID 26244; `127.0.0.1:5173`, HTTP 200 |
| Receptor móvil | `127.0.0.1:3016` y `192.168.1.64:3016` disponibles |
| PostgreSQL | PID 7156; no reiniciado, acceso local preservado |

La instancia temporal con bloqueo ya no está en uso: **la captura normal quedó restablecida**. El arranque normal registrado tomó aproximadamente 1.03 s en este equipo; no es una medición de carga de negocio.

## Migración y configuración administrativa

013 se aplicó una sola vez mediante el migrador oficial con base/esquema operativos explícitos y transacción. Se conservaron checksums 001–012, dataset/revisión 192 y estado físico durante la migración. Se verificaron política v2 deshabilitada, historial vacío e integridad SQL con `search_path` seguro antes de confirmar.

Checksum registrado de 013: **`55e1baf6014c9e8e9b97c32ebe6f7410e6a388b677c8d151d5e6ab58c025633b`**. [Evidencia](artifacts/web-activation-v2-20261109/migration.json).

La habilitación utilizó exclusivamente `configureWebPaymentPolicy` por API administrativa existente, en localhost y con cabecera de modo operativo, revisión 192, generación fresca, aprobación expresa, motivo que referencia la solicitud del propietario y clave de idempotencia persistida `web:v2:activate:ebedd380-50a8-446f-8add-61cb87020416`. No se actualizó la configuración mediante SQL manual.

Resultado: `web-cash-nearest-50-min-50-v2` habilitada, **un único evento de auditoría**, revisión 193. [Solicitud](artifacts/web-activation-v2-20261109/configuration-request.json) · [Resultado y comprobaciones](artifacts/web-activation-v2-20261109/configuration.json).

## Política y pruebas posteriores

Efectivo WEB: redondeo único del total general al múltiplo de $0.50 más cercano, empate arriba; mínimo $0.50 solo para total positivo menor de $0.25; cero permanece cero. Transferencia/Tarjeta exactas. Backend autoritativo con centavos enteros; conceptos, cantidades físicas y ajustes con signo separados.

Se ejecutaron cálculos del dominio **ya publicado**, sin ventas guardadas, para cero, 1/10/24/25/49/50/74/75 centavos y $11.01/$11.25/$11.49/$11.99; todos coinciden con v2. Los mismos importes conservan su valor exacto en transferencia/tarjeta.

En la UI operativa, un borrador de Alcohol de 0.000222 litro produjo subtotal $0.01 y mostró $0.50 en Efectivo, con ajuste +$0.49; transferencia/tarjeta mostraron $0.01. Se cancelaron todos los borradores. No se pulsó registrar ni se generaron ventas ficticias en PostgreSQL.

**12 casos responsive aprobados**: 1366/768/390 px, Limpieza por cantidad/monto y Jarcería por unidad/paquete. Sin desbordamiento horizontal. Tarifa + modo + campo/confirmación física alineados en escritorio; Tarifa + cantidad para Jarcería; apilamiento en móvil. Capturas inspeccionadas visualmente. [Métricas](artifacts/web-activation-v2-20261109/browser-layout.json) · [Métodos de pago](artifacts/web-activation-v2-20261109/browser-payment.json).

| Evidencia | Enlace |
|---|---|
| Antes: Limpieza / Jarcería | [Limpieza](artifacts/web-activation-v2-20261109/before-cleaning-1366.png) · [Jarcería](artifacts/web-activation-v2-20261109/before-hardware-1366.png) |
| Después, 1366 px | [Limpieza monto](artifacts/web-activation-v2-20261109/after-1366-cleaning-amount.png) · [Jarcería paquete](artifacts/web-activation-v2-20261109/after-1366-package-quantity.png) |
| Después, 768 px | [Limpieza cantidad](artifacts/web-activation-v2-20261109/after-768-cleaning-quantity.png) · [Jarcería unidad](artifacts/web-activation-v2-20261109/after-768-roll-quantity.png) |
| Después, 390 px | [Limpieza monto](artifacts/web-activation-v2-20261109/after-390-cleaning-amount.png) · [Jarcería paquete](artifacts/web-activation-v2-20261109/after-390-package-quantity.png) |
| Captura normal restablecida | [Formulario](artifacts/web-activation-v2-20261109/final-cleaning-live.png) · [Vista previa v2](artifacts/web-activation-v2-20261109/final-v2-live-preview.png) |
| Historial existente | [Detalle histórico](artifacts/web-activation-v2-20261109/historical-detail.png) |

Los **21 tickets históricos** disponibles en el corte fresco producen HTML idéntico byte por byte antes/después. Se consultó el detalle real V-00054 conservando productos, presentación y $58.00 históricos. No se redondearon ventas anteriores. Correcciones, anulaciones y diferencias pendientes mantienen el comportamiento probado: un total revisado no afirma cobro/reembolso adicional realizado.

Las **522 pruebas QA aprobadas** (334 web, 45 backend, 143 PostgreSQL) corresponden exactamente a los archivos desplegados. No se repitieron escrituras de esos tests en producción. Las comprobaciones operativas añadieron integridad completa, política activa, ejemplos del código publicado, UI y rutas reales de lectura. No hay fallos críticos pendientes.

## Compatibilidad móvil

Aplicación Android, APK, código móvil, autenticación y contratos sin modificaciones. Los siete módulos protegidos del cliente conservan hashes; los archivos de protocolo del servidor se conservaron dentro del control de código.

Después del arranque normal: catálogo autorizado por localhost y LAN 200, sin credencial 401 y consulta de estado de idempotencia 200. El catálogo coincide con el previo salvo revisión y marca de generación de respuesta. Mantiene `admin-sales-wholesale-v2`, restricciones móviles actuales y Jarcería/Lavandería bloqueadas en Android.

El canal lo seleccionan las rutas autorizadas del servidor; la política web no se aplica a MOVIL. La exactitud monetaria móvil, rechazo de invocación móvil por canal web y cliente web antiguo incompatible están cubiertos por las pruebas del mismo backend desplegado. No se registró una venta móvil de prueba ni se afirmó una prueba física del teléfono: la verificación operativa fue por sus rutas existentes.

## Respaldo posterior

Creado a las **17:22:08**, antes de reabrir captura, con revisión 193, 013 y huella de configuración monetaria:

- `postgres-2026-11-09T23-22-08-285Z-bd9cda7e-2e67-41d0-b783-c35dc74b4ed2.dump`.
- 1,594,378 bytes; SHA-256 `990d44487b7387c502181936142d26d938a281c81b8f516fb9b33273d1d20944`.
- Archivo legible y copia adicional con hash verificado en la misma ubicación separada. Incluye `webPaymentSnapshotVersion: 1` y huella de `web_payment_settings`.

La restauración completa de esta ventana corresponde al respaldo **anterior** y al ensayo independiente posterior. El segundo respaldo se verificó como archivo/copia, no se declara restaurado en otra base. Los manifiestos conservan sus indicadores iniciales; evidencias posteriores de restauración y copia se documentan por separado.

## Incidencias y recuperación

1. El primer guard del script auxiliar de despliegue rechazó `tests/web-payment.test.js` porque solo enumeraba prefijos `src`/`server`. Ocurrió antes de copiar archivos o ejecutar SQL. Se corrigió únicamente ese guard para incluir `tests`, ya presente entre los 22 archivos autorizados. Se repitieron sus comprobaciones y el paquete original se publicó sin alterarlo.
2. El primer proceso temporal de validación terminó al ejecutarse sin terminal persistente. La comprobación encontró conexión rechazada antes de enviar el comando administrativo. Se inició con terminal persistente, se validó salud y bloqueo de escritura y entonces se habilitó v2. No hubo habilitación duplicada ni escritura comercial.

No se requirió restaurar datos, ejecutar down ni revertir archivos. La migración se confirmó íntegramente una vez. Permanecen advertencias no críticas conocidas del modal compartido (`aria-hidden`/foco); no se detectaron excepciones JavaScript que bloquearan los escenarios. No se ocultaron discrepancias de datos.

## Condiciones posteriores

Recargar pestañas web antiguas antes de capturar. V2 ya contiene el mínimo comercial aprobado; no hace falta otra autorización para usar esta versión activada. No existe un flujo automático nuevo para liquidar diferencias de correcciones/reembolsos ni pagos mixtos: sus estados siguen explícitos.

Desde la habilitación existe historial: **no ejecutar down ni volver a validadores/tickets antiguos**. Si apareciera una falla crítica, suspender capturas, preservar operaciones nuevas y reparar hacia adelante; cualquier deshabilitación futura debe usar el comando administrativo auditado. Nunca restaurar este respaldo sobre ventas posteriores sin reconciliación y autorización específica de recuperación.

Se recomienda conservar una copia fuera del dispositivo. No se ejecutó la corrección pendiente de Mr. Big, cambios de catálogo/precio/proveedores, compras, preparaciones, ajustes de inventario ni desarrollo móvil.

**Cierre:** publicación técnica completada; 013 aplicada; política v2 habilitada; captura comercial normal restablecida. Datos comerciales y físicos preservados en el corte final; sin pendientes críticos de esta activación.
