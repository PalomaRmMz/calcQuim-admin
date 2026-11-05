# CalcQuim — Resultado de la ampliación de jarcería y lavandería

Fecha: 5 de noviembre de 2026. Desarrollo sobre copias aisladas de Admin `6f43426` y móvil `c44bcd3`. Referencia utilizada: `AUDITORIA_CALCQUIM_JARCERIA_LAVANDERIA.md`.

## Estado ejecutivo

**La ampliación está implementada y funciona en el entorno QA aislado. No está activada en el negocio.** Se verificaron ventas mixtas, stock compartido entre paquetes y unidades, servicios configurables sin inventario, recepción explícita de compras, contratos compatibles con clientes anteriores y recuperación por idempotencia.

Pasan **370 pruebas automatizadas**, sumando las suites ejecutadas y sus subpruebas: 264 web, 39 servidor, 33 móvil, 14 integración comercial y 20 integración de limpieza/inventario/mayoreo. La compilación web, ESLint y la exportación Android con Hermes finalizaron correctamente.

**La entrega todavía tiene una limitación material:** no se generaron APK QA ni de distribución. La compilación nativa no pudo obtener Gradle 9.3.1 porque no está en caché y su descarga fue rechazada por la red del entorno. Por tanto, la interfaz y las exportaciones PNG/PDF **nativas** no se declaran verificadas en Android. Tampoco se dispone de un destino secundario independiente autorizado para acreditar una copia de recuperación fuera del proyecto. Se prepararon las operaciones correspondientes.

### Ubicación de la entrega

| Entregable | Ubicación |
|---|---|
| Admin completo aislado | [artifacts/ampliacion-20261105/calcQuim-admin](artifacts/ampliacion-20261105/calcQuim-admin) |
| Móvil completo aislado | [artifacts/ampliacion-20261105/calcQuim](artifacts/ampliacion-20261105/calcQuim) |
| Archivos de código modificados, sin datos ni credenciales | [CalcQuim-Ampliacion-Codigo.zip](artifacts/ampliacion-20261105/CalcQuim-Ampliacion-Codigo.zip) |
| Inventario de cambios y hashes antes/después | [SOURCE_CHANGES.json](artifacts/ampliacion-20261105/SOURCE_CHANGES.json) |
| Estado de APK | [APK_STATUS.json](artifacts/ampliacion-20261105/APK_STATUS.json) |
| PNG exportado por la aplicación web | [ticket-mixto-exportado.png](artifacts/ampliacion-20261105/ticket-mixto-exportado.png) |
| PDF generado por impresión Chromium del ticket real QA | [ticket-mixto-web.pdf](artifacts/ampliacion-20261105/ticket-mixto-web.pdf) |

El paquete de código contiene 49 archivos: 38 de Admin/servidor/pruebas y 11 de móvil. Es un conjunto de cambios para revisión e integración futura; **no es un instalador ni debe copiarse sobre los servicios activos**. El proyecto Android generado y los bundles se conservan aparte en la copia aislada. Los respaldos privados, bases, dependencias y configuraciones QA no están dentro del ZIP de código.

Entorno preparado para revisión local: web `http://127.0.0.1:5317`, API QA `127.0.0.1:3307`, PostgreSQL QA `127.0.0.1:55439`. La web presenta el aviso de PostgreSQL de ensayo y solicita abrir ese entorno. Estos servicios dependen de los procesos QA iniciados durante el trabajo; no son servicios permanentes de Windows. Para recrear la demostración se utiliza `node server/scripts/commerce-qa.mjs` desde la copia Admin, con la instancia PostgreSQL QA disponible. Cada inicio crea un esquema nuevo y datos sintéticos; no reutiliza ni reemplaza esquemas anteriores.

## 1. Qué se desarrolló en Admin

- Nuevo módulo **Jarcería y lavandería**, en `/comercial`, con artículos físicos, presentaciones, servicios, compras por presentación, reportes e importación revisable.
- Alta y edición de artículos de jarcería sin modificar código, con unidad base y estado activo/inactivo. Conserva el módulo existente de productos y clasificación de limpieza.
- Presentaciones con precio manual independiente, contenido físico, unidad comercial, regla de cantidades enteras y estado. Incluye historial de cambios de precio/contenido.
- Servicios fijos o cotizados, adicionales modificables e historial de tarifas. El cobro personalizado se captura en la venta y no cambia la tarifa general.
- Formulario de venta rápida que busca conceptos de las tres actividades y los reúne en una sola venta. Los campos de cantidad/importe comienzan vacíos; el buscador muestra resultados después de escribir.
- Corrección de ventas comerciales WEB y MOVIL conservando versiones, ticket original y factores históricos. Los servicios solos no requieren una confirmación de devolución física.
- Anulación con tratamiento físico únicamente cuando existen renglones físicos; los servicios conservan motivo e historia comercial.
- Ticket PNG desde Admin y ticket original/actualizado para impresión/PDF.

Archivos principales: `src/pages/CommercePage.jsx`, `src/components/CommercialSaleForm.jsx`, `src/pages/SalesPage.jsx`, `src/components/MobileSaleCorrection.jsx`, `src/services/ticketExport.js` y `src/domain/commerce.mjs`, dentro de la copia Admin.

## 2. Qué se desarrolló en Express

- Se ampliaron los comandos existentes, conservando transacciones, revisión, generación, secuencia de folios, canal e idempotencia.
- Nuevos comandos: `saveCommerceProduct`, `savePresentation`, `saveService`, `savePresentationPurchase`, `receivePresentationPurchase`, `createCommercialSale` e importación comercial revisable.
- Express reconstruye tarifas y cantidades base desde el catálogo oficial. No acepta como autoridad el precio, factor o salida física enviados por el cliente.
- Las correcciones usan snapshots históricos; cambiar una presentación o tarifa después de vender no recalcula el pasado.
- `GET /api/v1/commerce/import-preview` proporciona el material de referencia sin escribir datos. La importación exige confirmar su huella, cuenta con claves técnicas estables y no vuelve a insertar el mismo catálogo.
- `GET /api/v1/commerce/reports` entrega agregados comerciales por renglón.
- Negociación móvil mediante `X-CalcQuim-Capabilities: fullclean-commerce-v1`. Un cliente anterior recibe su catálogo de limpieza, sin presentaciones ni servicios que no pueda interpretar. Las rutas y versiones mayoristas existentes se conservan.
- La recuperación de un intento continúa consultando su clave original antes de registrar; no sustituye el cuerpo guardado por uno nuevo.

Archivos principales: `server/src/services/commerce.mjs`, `commands.mjs`, `dataset.mjs`, `mobile/router.mjs`, `mobile/catalog.mjs`, `mobile/domain.mjs`, `mobile/sale.mjs` y `routes/data.mjs`.

## 3. Qué se desarrolló y verificó en PostgreSQL aislado

Se inicializó un clúster independiente en `artifacts/ampliacion-20261105/postgres-qa`, exclusivamente en loopback y puerto **55439**. No es una segunda base oficial del negocio: contiene restauraciones privadas para comprobación y esquemas sintéticos de QA.

La migración nueva **009_commerce** agrega:

- `commercial_presentations`: producto físico, factor, unidad, precio y registro comercial.
- `commercial_services`: concepto, unidad y modo de precio fijo/personalizado; el precio personalizado permanece NULL en catálogo.
- Clasificación de actividad en productos y renglones, tipo de línea, referencia de presentación/servicio y cantidad base.
- FKs para servicio y para la pareja presentación/producto; restricciones de forma y cantidades. Los CHECK comerciales rechazan formas incompletas, incluyendo los casos NULL.
- Unidades comerciales `paquete`, `carga` y `servicio`.
- Marca de disponibilidad del esquema comercial, sin cargar productos, tarifas o existencias.

Se impide configurar carga/servicio como unidad de un producto físico. La jarcería fija sus precios mediante presentaciones y no puede activar mayoreo por litros desde el editor antiguo.

Las columnas históricas nuevas son nullable y no se reclasificaron ventas antiguas. No se cambiaron IDs, cantidades, unidades, tarifas ni importes históricos. El repositorio persiste las colecciones comerciales y sus proyecciones relacionales sin perderlas al guardar otros módulos.

### Respaldo actual y recuperación

Se verificó primero el respaldo disponible anterior. Después se tomó **un respaldo nuevo del estado actual**, escribiendo el archivo únicamente en el área aislada, con conexión a la base real bajo `default_transaction_read_only=on` y transacción REPEATABLE READ READ ONLY. Se usó un snapshot exportado para que dump, catálogo e inventario correspondieran al mismo corte.

Ese corte fue revisión **140**: **71 productos, 33 ventas y 124 movimientos**. Se restauró en `calcquim_current_restore_e567602689f2` de la instancia QA. Dataset e inventario coincidieron exactamente mediante serialización canónica y hashes. Las diferencias frente al corte de la auditoría anterior son actividad posterior del sistema; no se atribuyen a cambios realizados por esta ampliación.

Sobre esa restauración actual se aplicó y repitió la migración 009 dentro de una transacción de ensayo: ventas, productos, inventario y checksums 001–008 permanecieron iguales. La transacción se revirtió al terminar.

También se generó y restauró un dump **del modelo comercial nuevo**, con presentaciones, servicios, venta mixta y movimientos sintéticos. Coincidieron dataset e inventario completos. El último ensayo quedó en `calcquim_commerce_restore_ff007f46`, siempre en puerto 55439.

Evidencia privada local: `current-backup.manifest.json` y `commerce-restore-result.private.json`, en la carpeta de entrega aislada. No se subieron datos del negocio a servicios externos.

### Copia secundaria

No se seleccionó arbitrariamente otra carpeta personal o dispositivo como destino independiente. La copia primaria nueva está verificada y restaurada, pero **no acredita protección ante pérdida del disco D:**.

Quedó preparado `server/scripts/copy-secondary-backup.mjs`: requiere un manifiesto y una carpeta local existente autorizada, verifica SHA-256, crea archivos sin sobrescribir y verifica la copia. No se ejecutó sobre un destino independiente desconocido. El manifiesto conserva `secondaryVerified:false`.

## 4. Qué se desarrolló en móvil

- Se extendieron el catálogo y la captura existentes; no se creó un catálogo oficial móvil independiente.
- El buscador permanece vacío al inicio y sólo muestra resultados después de escribir. Integra limpieza, presentaciones de jarcería y servicios.
- Las presentaciones capturan cantidades; las indivisibles rechazan fracciones. Los servicios por carga capturan cargas enteras y adicionales sencillos. Los especiales capturan importe personalizado.
- El motor de litros/pesos y sus grupos comerciales continúa disponible para limpieza. Se conservaron aliases y búsqueda de variantes; una regresión detectada al unificar el catálogo se corrigió y la suite móvil completa pasa.
- Catálogo cacheado, borradores, servidor del intento, clave de idempotencia y credencial mantienen sus mecanismos existentes. No se borró ni se migró destructivamente AsyncStorage o SecureStore.
- Se adaptó el modelo de ticket para incluir adicionales y servicios personalizados. El importe cotizado no muestra una cantidad física aproximada de producto.
- La API solicita explícitamente la capacidad comercial; el protocolo de precios mayoristas sigue siendo `admin-sales-wholesale-v2`.

Archivos principales: `src/domain/commerce.mjs`, `catalog.mjs`, `commercial.mjs`, `sale.mjs`, `adminSales.mjs`, `adminUnits.mjs`, `ticket.mjs`, `src/services/mobileApi.mjs` y `src/screens/QuickSaleScreen.js`, en la copia móvil.

El bundle Android final se exportó correctamente con Metro/Hermes: `mobile-export-final/_expo/static/js/android/index-dfb183d9ff37088b8136971ae3b7971d.hbc`, aproximadamente 4.8 MB. **Compilar el bundle no demuestra ejecución nativa ni equivale a generar una APK.**

## 5. Cómo funciona el inventario de paquetes y unidades

Cada artículo mantiene una sola existencia física en su unidad base. La presentación es una opción comercial, no otro inventario.

Ejemplo comprobado: Mr. Big 800 tiene rollo con factor 1/precio $12 y paquete de cuatro con factor 4/precio $45. Desde 20 rollos equivalentes, vender un paquete y un rollo registra $57 y deja **15 rollos**, con dos salidas físicas correctas. Repetir simultáneamente la solicitud no genera otra venta ni vuelve a descontar stock.

El snapshot de cada renglón conserva presentación, factor, unidad base, cantidad base, tarifa, actividad y tipo. Se ensayó cambiar después el factor/precio del catálogo y corregir/anular la venta: se utilizó el factor y precio originales.

No se redondean por dinero las piezas indivisibles. La regla WEB vigente de décimas para ventas de limpieza por importe se conserva; no se reutiliza para rollos o fibras.

El estado comercial indica `equivalent_only`: la cantidad equivalente **no afirma disponibilidad de empaques sellados**. No se exige registrar aperturas. La separación de cerrados/sueltos sigue siendo una ampliación posterior si se define esa política; no hay un saldo de paquetes sellados inventado.

### Compras y recepción

Comprar 5 paquetes de cuatro registra 20 unidades base y conserva costo por paquete. La pantalla web registró una compra QA de 5 paquetes a $40: total $200, contenido 20 rollos y costo $10 por rollo. Registrar la compra no ingresó stock; la recepción explícita lo hizo una sola vez.

Las fuentes, artículos comprados y proveedores existentes se reutilizan. La integración verificó dos proveedores y costos distintos para el mismo artículo sin duplicar el producto ni su stock. Una compra comercial conserva su snapshot de contenido; el editor antiguo no permite cambiarla silenciosamente dejando un factor incoherente. Para corregirla se conserva el original, se anula/registra el documento correcto y se revisa el efecto físico de una recepción previa.

## 6. Cómo funcionan las tarifas de lavandería

El concepto fijo de referencia es lavado por carga a $60; adicionales configurables: insumos Full Clean $10 y secado $30 por carga. Se verificaron $60, $70, $90 y $100, además de dos cargas por $200 con ambos adicionales.

Sólo exprimido, exprimido/secado y trabajo especial son conceptos con precio personalizado, sin tarifa ficticia. Su importe se valida al vender y no modifica el catálogo. No se agregó una tarifa independiente de secado ni cobro por kg/prenda.

Servicios y adicionales no generan salidas, pendientes de desglose o devoluciones físicas. Tampoco se descuenta detergente/suavizante automáticamente. Las correcciones y anulaciones de servicios se comprobaron sin movimientos de inventario.

El módulo administra tarifas y cobros; no incorpora órdenes de recepción/entrega de ropa, anticipos o seguimiento de trabajos no solicitados como flujo definido.

## 7. Cómo se registran las ventas mixtas

Una sola captura reúne cualquier combinación de las actividades y genera un solo registro, folio y ticket. Se conservan origen WEB/MOVIL, confirmación del servidor, idempotencia, totales, snapshots y versiones comerciales.

Caso ejecutado desde la interfaz web:

| Renglón | Importe |
|---|---:|
| Mr. Big 800, un paquete de cuatro | $45 |
| Lavado de dos cargas, insumos y secado | $200 |
| Fabuloso QA, 10 L con tarifa mayorista de prueba $15/L | $150 |
| **Una venta WEB, folio V-00001** | **$395** |

Se consultó el libro posterior: salida de 4 piezas y 10 litros; ningún movimiento por lavandería y cero pendientes. Los valores e inventarios de demostración son **fixtures QA**, no altas, precios vigentes o existencias reales del negocio.

Los intentos antiguos siguen consultándose con su clave/cuerpo originales. Se ensayaron pérdida de respuesta después del registro, reconsulta y recuperación sin duplicado; solicitud concurrente repetida, conflicto por cuerpo distinto y revisión obsoleta.

## 8. Tickets y reportes

Se preservaron logo oficial, marca, domicilio, contacto, fecha/hora, folio, total y diseño general. Un ticket identifica paquete, pieza, litro, carga o servicio, y muestra los adicionales comerciales. El ticket actualizado conserva el original y su versión.

**Verificado en web:** exportación PNG real mediante canvas/descarga; PDF mediante el HTML real del ticket y la impresión Chromium; lectura de conceptos y total, y revisión visual del PNG. El HTML se ajustó a un ancho legible en pantalla conservando la página A4 para imprimir. La imagen crece según la longitud de los conceptos.

**Pendiente en Android nativo:** captura con view-shot, expo-print y compartir con expo-sharing. Se conservaron y ampliaron sus datos de entrada; el bundle compila, pero no se ejecutaron esas funciones en un dispositivo o APK nueva.

Los reportes nuevos incluyen ingresos por actividad a nivel renglón, total general, cantidad de ventas mixtas, presentaciones vendidas, artículos de jarcería en su unidad base y servicios solicitados. Los históricos sin clasificación permanecen **SIN_CLASIFICAR**. No se suman litros, rollos y cargas en un único total físico.

Se reutilizan inventario, compras, comparación/evolución de costos por proveedor y reportes existentes. Servicios y presentaciones conservan cambios de tarifa para consultar evolución cuando existe información. No se ofrece utilidad neta ni rentabilidad realizada sin costo de mercancía vendida y gastos operativos suficientes.

## 9. Resultados de pruebas

| Verificación ejecutada | Resultado | Evidencia en `artifacts/ampliacion-20261105/` |
|---|---|---|
| Suite web existente | 264/264 | `web-tests.log` |
| Suite unitaria servidor | 39/39 | `server-tests.log` |
| Suite móvil existente | 33/33 | `mobile-tests.log` |
| Integración comercial PostgreSQL/HTTP | 14/14 | `commerce-integration.log` |
| Integración limpieza, inventario, mayoreo y regularización | 20/20 | `cleaning-integration.log` |
| ESLint Admin/servidor | Correcto | `lint.log` |
| Build web | Correcto; advertencia de tamaño del bundle | `web-build.log` |
| Metro/Hermes Android | Exportación correcta | `mobile-export.log`, `mobile-export-final/` |
| Restauración de respaldo anterior y actual | Dataset/inventario coincidentes | Manifiestos privados de restauración |
| Restauración de modelo comercial nuevo | Dataset/inventario coincidentes | `commerce-restore-result.private.json` |
| Migración sobre copia actual real | Históricos y checksums conservados; rollback del ensayo | Mismo resultado privado |
| Venta mixta por UI y compra/recepción por UI | Ejecutadas sobre QA sintético | Ticket de ejemplo y registros del esquema QA de esa sesión |
| PNG/PDF web | Generados | Archivos enlazados al inicio |
| APK y exportación nativa | No verificadas | `APK_STATUS.json` |

Las pruebas seleccionadas de integración cubren umbrales y grupos mayoristas, tarifa individual, litros/pesos, cantidades físicas, desglose, correcciones, anulaciones, reversas, datos históricos, reintentos, concurrencia, compras de varios proveedores, paquetes 4/6, indivisibles, diferencias de gramaje, cargas/adicionales, precios personalizados y servicios sin movimientos.

No se desactivaron pruebas fallidas. La paridad normaliza únicamente CRLF/LF. Se corrigió el arnés SSR para proporcionar Router a páginas que ya lo requerían. Una prueba antigua de inventario esperaba que una venta WEB por importe no redondeara; se actualizó a la regla vigente de décimas y se utilizó una venta MOVIL de fracción no terminante para seguir verificando la conciliación pendiente. El motor mayorista y la regla de redondeo no se modificaron.

Los dos archivos `wholesalePricing.mjs` mantienen **exactamente los bytes de sus fuentes originales respectivas**; `SOURCE_CHANGES.json` lo verifica. Las fuentes mayoristas Admin/móvil se comparan estrictamente tras normalizar terminadores, y también se conservan sus pruebas de comportamiento.

## 10. APK QA y distribución

Se generó el proyecto Android en la copia móvil y el bundle Android final. Se intentó `gradlew --offline --no-daemon assembleRelease`, usando Java/SDK locales y caché Gradle aislada.

El wrapper necesita Gradle 9.3.1, ausente en caché. Su intento de descarga falló con `java.net.SocketException: Permission denied: getsockopt`. No se recurrió a compilación en nube ni se enviaron fuentes privadas o datos a EAS. No se presentó una APK antigua como si fuera la versión ampliada.

Quedó preparado [scripts-build-qa-local.ps1](artifacts/ampliacion-20261105/calcQuim/scripts-build-qa-local.ps1): prepara la variante separada `.revisionqa`, orientada al servidor de pruebas, y compila localmente sin instalar en dispositivos. Requiere completar las dependencias locales de Gradle/Android. Su firma de depuración sólo serviría para QA; **no certifica compatibilidad con la firma de la APK instalada**.

No se accedió al teléfono ni se usó ADB. La instalación futura corresponde al propietario. La APK de distribución necesita una firma compatible y una verificación nativa antes de considerarse lista.

## 11. Migraciones preparadas y verificadas

- Modificado únicamente el mecanismo de verificación de `server/src/db/migrate.mjs` para aceptar hashes de SQL idéntico con LF o CRLF. No elimina espacios, comentarios ni cambios de SQL. Se ensayó rechazo de alteraciones de contenido y de otros separadores.
- Las migraciones **001–008 permanecen sin modificaciones**. Sus checksums almacenados no se actualizaron.
- Preparadas `009_commerce.up.sql` y `009_commerce.down.sql`. El descenso bloquea la eliminación si existen conceptos o ventas comerciales; no pretende borrar información de operación.
- Ensayadas creación, repetición, descenso con esquema vacío, integraciones y aplicación sobre restauración actual con conservación del pasado.
- **Ninguna migración se ejecutó en la instancia operativa.**

## 12. Limitaciones y pendientes técnicos

1. APK QA y distribución no generadas; falta disponibilidad de Gradle/dependencias nativas y, para distribución, firma compatible verificable.
2. Ejecución de la pantalla ampliada y exportaciones nativas PNG/PDF pendiente. Las pruebas Node, HTTP, PostgreSQL y compilación Hermes no sustituyen esa verificación.
3. Copia secundaria en medio local independiente todavía no acreditada; operación de copia verificada preparada.
4. El build web conserva una advertencia de bundle grande. No bloqueó build ni UI; se mantiene como mejora de rendimiento, sin introducir una reconstrucción del proyecto.
5. Los saldos equivalentes no representan paquetes sellados ni procesos de apertura. Ese control no se activó ni se simula.
6. Continúan las limitaciones de confianza del entorno local y credencial móvil compartida documentadas en la auditoría. El cobro personalizado no introduce una administración multiusuario de permisos.

## 13. Datos comerciales pendientes

- Confirmar los precios proporcionados antes de importar en operación; se conservaron literalmente, incluidos Roma suelto ½ kg a $12 y las dos variantes de atomizador ½ L a $17/$20.
- Costos de adquisición, fuentes/presentaciones reales por proveedor y existencias iniciales verificadas. El catálogo de referencia mantiene estos datos desconocidos; no inicializa stock ni costos.
- Identificación física precisa de las dos variantes de atomizador y cualquier relación de empaques todavía no definida. No se fusionan por capacidad o nombre parecido.
- Tarifa de cada trabajo especial/exprimido al cotizar. No se presupone un precio fijo ni secado independiente a $30.
- Política de paquetes sellados/sueltos y posibles fracciones de carga, sólo si se desea ampliar las reglas conservadoras actuales.
- Datos de contacto completos de proveedores si se quieren registrar. Los nombres/localidad aportados se muestran para revisión, sin inventar teléfonos o domicilios ni insertarlos automáticamente.

Los artículos de referencia usan claves técnicas estables, no únicamente nombres para deduplicar. Sanitas y cloro dúo no ofrecen venta individual de toalla/pastilla. Roma empacado y suelto se mantienen diferenciados; el gramaje de Zote identifica barras enteras.

## 14. Procedimiento de futura activación

Este procedimiento está preparado para una tarea posterior autorizada; no se ejecutó:

1. Completar compilación/firma y pruebas nativas, incluyendo borrador anterior, reconexión, pérdida de respuesta y PNG/PDF de un ticket mixto. Confirmar el destino secundario y verificar allí un respaldo nuevo.
2. Revisar `SOURCE_CHANGES.json` contra las ramas y cambios que existan entonces. El negocio siguió operando durante el desarrollo; no usar el snapshot de QA como reemplazo del dataset actual.
3. Abrir una ventana operativa autorizada y tomar un respaldo consistente del estado de ese momento. Restaurarlo en destino aislado y validar dataset, inventario y migraciones.
4. Integrar los cambios productivos de las copias; excluir `.env`, bases QA, puertos QA, dumps, dependencias, fixtures, artefactos y scripts de demostración. Conservar credenciales y configuraciones reales. No ejecutar parches antiguos de `integration/`.
5. Aplicar la corrección de verificación y la migración aditiva 009, con precondiciones y respaldo comprobado. No modificar SQL histórico ni reescribir tarifas/cantidades antiguas.
6. Desplegar servidor compatible y frontend de forma controlada; comprobar clientes antiguos y consulta de intentos ya registrados. El código no obliga a borrar datos móviles.
7. Revisar el catálogo de referencia en Admin, ajustar los datos comerciales necesarios y confirmar una sola importación idempotente. Dar de alta/vincular proveedores reales y registrar existencias únicamente con información confirmada.
8. Instalar manualmente la APK aprobada cuando corresponda. Verificar con el propietario la operación de las nuevas actividades sin alterar el motor mayorista de limpieza.

El respaldo/restauración no se utiliza para devolver la base operativa a un corte anterior mientras continúan ventas: eso perdería operaciones posteriores. Cualquier recuperación o reversión requiere evaluar el estado actual y preservar esos registros.

## 15. Autorización operativa

**No se solicita activación en esta entrega**, porque siguen pendientes la APK/verificación nativa y la copia secundaria independiente. Solicitar autorización ahora daría por preparada una parte que no está comprobada.

Una vez cerrados esos puntos y actualizadas las verificaciones, corresponde una única solicitud de autorización para la ventana operativa, integración, migración e importación revisada. Hasta entonces la ampliación permanece en las copias QA.

No se realizaron commits, pushes, cambios de rama, altas operativas, migraciones operativas, cambios de credenciales/firewall/puertos habituales, reinicios de servicios habituales ni accesos al teléfono. La lectura de PostgreSQL real y el respaldo nuevo fueron de solo lectura; las escrituras de pruebas pertenecen exclusivamente a la instancia aislada.

Referencia de SDK consultada antes de modificar móvil: [documentación oficial de Expo SDK 56](https://docs.expo.dev/versions/v56.0.0/).
