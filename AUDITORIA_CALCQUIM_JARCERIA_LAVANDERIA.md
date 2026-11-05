# Auditoría integral de CalcQuim: Admin, móvil, jarcería y lavandería

Fecha de corte: 5 de noviembre de 2026, zona America/Mexico_City. Repositorios: `D:\ReactApps\calcQuim-admin` (rutas sin prefijo en este informe) y `D:\ReactApps\calcQuim` (prefijo **Móvil/**).

## A. Estado operativo actual

### Dictamen ejecutivo

CalcQuim tiene una base aprovechable y no requiere reconstrucción. PostgreSQL es la persistencia del Admin servido actualmente; la API móvil responde contra esa misma base. El mayoreo **ya está implementado, migrado y activado**: debe conservarse. Proveedores, artículos comprados, ofertas por proveedor, costos históricos, ventas, folios, idempotencia y movimientos de inventario aportan gran parte de la infraestructura necesaria.

Las ampliaciones indispensables son: distinguir productos físicos de servicios en el dominio comercial; introducir presentaciones con equivalencia explícita y stock compartido; conservar la evidencia histórica de esas equivalencias; ampliar los contratos, validadores y vistas de ambos clientes; clasificar ingresos por actividad. No basta agregar categorías llamadas Jarcería y Lavandería.

Hallazgos prioritarios:

1. **Migrador bloqueable por formato:** los archivos locales de las migraciones 6, 7 y 8 tienen CRLF y sus hashes registrados corresponden a LF. Normalizando CRLF a LF coinciden los tres contenidos. El migrador compara bytes sin normalizar y rechazaría el estado actual como migración modificada. No se ejecutó ni corrigió.
2. **Prueba de paridad en rojo por formato:** 14 de 15 pruebas de mayoreo seleccionadas pasan. Falla la comparación textual estricta entre los motores Admin y móvil; tras normalizar saltos de línea, son iguales. No evidencia un cálculo diferente, pero la verificación automatizada actual queda fallida.
3. **Respaldo reciente no equivale a recuperación demostrada:** los tres manifiestos más recientes indican archivo legible, pero `restoreVerified:false` y `secondaryVerified:false`. La activación histórica sí declara una restauración verificada; no acredita la recuperación del estado actual ampliado.
4. **Una presentación de compra no es una presentación de venta:** hay contenido y texto de presentación en abastecimiento, pero no una relación comercial paquete/rollo con descuento sobre una misma existencia ni control de paquetes cerrados/abiertos.
5. **Servicio sin inventario ausente:** las ventas actuales validan referencias físicas o agrupaciones de productos. No existe una exclusión contractual de servicios en `syncInventory`.

### Estado comprobado en esta auditoría

| Componente | Evidencia actual | Alcance de la conclusión |
|---|---|---|
| Express | GET `http://127.0.0.1:3003/api/v1/health/live` → 200, `status:ok`; `/ready` → 200, base disponible | Proceso accesible y conexión viva; no se ejecutaron comandos de negocio |
| Frontend | GET `http://127.0.0.1:5173/` → 200; módulo servido `src/main.jsx` con `CALCQUIM_OPERATIONAL:true` | Frontend servido en modo operativo; no se probó interacción visual ni un build de producción |
| API móvil | GET autenticado `http://127.0.0.1:3016/api/mobile/v1/catalog` → 200, `environment:operational`, `salesEnabled:true`, revisión 133 | Lectura móvil operativa desde este equipo; no prueba tráfico desde el teléfono |
| PostgreSQL | PostgreSQL 18.6, base/esquema `calcquim_operational`, rol `calcquim_operational_app` | Consultas con `default_transaction_read_only=on` y transacciones READ ONLY |
| Migraciones | Versiones 1–8 registradas; columnas y restricciones de ventas consultadas | Aplicadas; hashes de 6–8 difieren únicamente por LF/CRLF |
| Mayoreo | Metadatos y catálogo activo `admin-sales-wholesale-v2`, `wholesale-threshold`, `official-price-group-v1` | Activado en base y expuesto por API; cálculo cubierto por pruebas de memoria |
| Inventario | `sales_enabled:true`; 71 productos con inicial y existencia conocida, cero saldos negativos | Estado derivado de registros, no conteo físico presencial |
| Conciliación | `planInventoryReconciliation`: 45 renglones `correct`, cero renglones/ventas pendientes, cero operaciones preparadas | Coherencia lógica del plan a revisión 133; no se aplicó conciliación |
| APK instalada | No se inspeccionó el dispositivo | Versión instalada, conexión efectiva, borradores y comprobantes privados: no verificados |

Agregados consultados, sin exponer registros individuales: 71 productos, 12 categorías, 9 líneas, 10 grupos de precios, 5 proveedores, 70 artículos comprados, 77 fuentes y 8 compras. Hay 30 ventas: 28 WEB y 2 MOVIL; estos conteos incluyen los registros sin afirmar que todos sean ventas vigentes ni distinguir su procedencia humana o sintética. Los 116 movimientos registrados son 71 estimaciones y 45 salidas por venta. No hay pendientes de inventario activos. Todos los productos actuales usan `litro`; hay 10 grupos con tarifa de mayoreo y ningún producto con tarifa individual de mayoreo. La existencia de registros MOVIL evidencia uso histórico del canal, no identifica el equipo que los originó.

### Git y dependencias

| Repositorio | Rama | HEAD | Estado inicial |
|---|---|---|---|
| Admin | `serviciofull` | `6f43426`, 2026-11-05 10:56:18 -0600, «correccion de desglose de ventas» | Limpio |
| Móvil | `dev` | `c44bcd3`, 2026-11-05 10:40:23 -0600, «correcion de conexion y pantallas» | Limpio |

Commits anteriores Admin: `8852cb8` (2026-11-05, inventario y corrección de ventas), `bcb869a` (2026-10-31, depuración), `924d958` (2026-10-31, conexión APK). Móvil: `74d47d1` (2026-10-31, depuración), `22cb55a` (2026-10-31, corrección APK), `4ebd948` (2026-10-30, punto de control). Para leer Git móvil se usó `git -c safe.directory=...` únicamente en el comando; no se cambió configuración global ni local.

Versiones resueltas en lockfiles: Admin React 19.2.8 y Vite 8.2.2; servidor Express 5.3.0 y pg 8.23.1; móvil Expo 56.0.3, React Native 0.85.3 y React 19.2.3. Manifiestos: Admin React Router `^8.3.1`, MUI 6.2.1; móvil AsyncStorage 2.2.0, NetInfo 12.0.1, React Navigation 7, expo-secure-store/print/sharing de la serie 56 y view-shot 5.1.0. El servidor declara Node >=22.22.3. El lockfile no acredita por sí solo la versión cargada por cada proceso en ejecución ni la incluida en una APK instalada.

### Preparado, desplegado y utilizado

`vite.config.js` detecta el marcador privado de activación y define el modo operativo; el módulo servido lo confirma. `scripts/local-system.mjs` administra Express, frontend y conexión móvil, pero no se ejecutó por sus efectos de arranque/cierre y escritura. `runtime.mjs` escucha en loopback y verifica identidad y privilegios de la conexión operativa. `scripts/operational-mobile.mjs` abre el acceso móvil separado.

La configuración de escritorio móvil indica loopback `http://127.0.0.1:3016`, LAN `http://192.168.1.64:3016` y subred `192.168.1.0/24`; existe credencial de 64 caracteres, cuyo valor se omitió. No implica que esa URL esté guardada en el teléfono. El listener loopback respondió; el alcance LAN desde otro equipo y las reglas efectivas de firewall no se probaron.

Existe evidencia local de un APK (`Móvil/.artifacts/apk-result.json`, `dist/CalcQuim-Pruebas-WiFi.apk`, buildId `d7dc1716-cf92-4b93-a364-decbd0b76dfa`). Es un registro de compilación anterior, no una certificación del binario instalado ni de que contenga el HEAD actual. Tampoco se verificó que el proceso Express haya recargado todos los cambios del HEAD: las respuestas acreditan comportamiento observado, no identidad byte a byte del servidor cargado. Carpetas `dist`, `.artifacts` e `integration/admin` son artefactos/copias y no fuentes oficiales independientes.

## B. Arquitectura real

### Web y persistencia

`src/main.jsx` selecciona entre `PostgresApplication`, modo PostgreSQL de ensayo y `DataSessionGate` + `ApplicationRoot` de almacenamiento del navegador. `PostgresApplication.jsx` lee snapshots de API, proporciona `CatalogContext`, `ProcurementContext` y `PersistenceContext`, y envía acciones al servidor. No usa localStorage como sustituto cuando falla PostgreSQL. `App.jsx` organiza los módulos y rutas; `pages/` contiene productos/clasificación, abastecimiento/proveedores, compras/comparador, ventas, inventario y reportes; `components/` aporta formularios, tablas, motivos, desglose y corrección.

`services/catalogDomain.js`, `catalogValidation.js`, `supplyModel.js`, `procurementDomain.js`, `salesStorage.js` y `utils/` contienen reglas reutilizadas por Express. Los providers locales y `catalogStorage.js`/`procurementStorage.js` conservan otra modalidad de persistencia, no sincronización automática de dos fuentes oficiales. Evitar que una futura actividad se agregue sólo a esa modalidad y se dé por disponible en PostgreSQL.

### Express y contratos

`server/src/app.mjs` monta salud, `/api/v1` y `/api/mobile/v1`. `routes/data.mjs` expone dataset, recursos, comandos, inventario y analítica; `controllers/data.mjs` traduce precondiciones. `services/commands.mjs` despacha al dominio. `services/dataset.mjs` controla transacción, generación, revisión e idempotencia; `repositories/dataset.mjs` traduce agregados JSON a tablas y columnas de integridad.

La lectura usa REPEATABLE READ READ ONLY. Los comandos bloquean `dataset_state`, validan revisión/generación y registran la respuesta idempotente junto al cambio. Web usa `If-Match`, `X-Dataset-Generation`, `Idempotency-Key` y `X-CalcQuim-Mode`; `apiClient.js` conserva claves técnicas en sessionStorage. Repetir una clave con contenido distinto genera conflicto. No son ventas separadas por cliente: WEB/MOVIL terminan en la misma colección y secuencia `V-00001`.

El repositorio escribe el agregado: upserts en colecciones, eliminación de ausentes y reconstrucción de detalles (`sale_items`, `purchase_items`, revisiones, recibos y overrides) dentro de la transacción. Esto conserva atomicidad con restricciones diferidas, pero vuelve sensible cualquier ampliación no incluida en la serialización y hace crecer el costo con el dataset completo. No se propone reescribirlo ahora; sí preservar nuevos campos y medir en pruebas aisladas al crecer los datos.

La versión de ruta HTTP es v1 y la de precios vigente es `admin-sales-wholesale-v2`: son ejes distintos. El validador de catálogo también reconoce `admin-sales-normal-v1` y el antiguo `admin-sales-v1`, pero el POST móvil sólo admite normal-v1/wholesale-v2 en la entrada y el dominio exige después la versión que corresponde a la activación actual. Reconocer un catálogo antiguo no garantiza que se pueda confirmar una venta con su protocolo. `commercialOptionsVersion` declara `official-relations-v1` en el código del endpoint. No hay una negociación general de capacidades para servicios/presentaciones ya implementada.

### PostgreSQL: tablas y relaciones

| Subsistema | Tablas reales | Relaciones/garantías relevantes |
|---|---|---|
| Estado | `dataset_state`, `schema_migrations`, `idempotency_requests`, `migration_sources` | Generación/revisión, checksums, respuesta por request_key y huella de importación |
| Catálogo | `categories`, `product_lines`, `price_groups`, `products`, `units` | Línea pertenece a categoría; producto referencia categoría/línea/grupo; precio individual excluye grupo; unidad con FK |
| Abastecimiento | `suppliers`, `purchased_items`, `supply_sources`, `supply_conversions`, `source_yield_overrides`, `supplier_costs` | Artículo → varias fuentes/proveedores; artículo → productos de salida; excepciones por fuente/conversión; costos por fuente y fecha |
| Compras | `purchases`, `purchase_items`, `purchase_revisions`, `purchase_receipts` | Cabecera por proveedor; detalles con artículo/fuente/producto cuando corresponde; revisiones y comprobante |
| Ventas | `sales`, `sale_items` | Folio único; renglón por ordinal, cantidad/unidad/precio/importe y record JSON; producto nullable para agrupaciones admitidas |
| Inventario | `inventory_settings`, `inventory_accounts`, `inventory_movements`, `inventory_pending`, `inventory_allocations`, `inventory_replenishment`, `inventory_changes` | Cuenta por producto; ancla de estimación; movimientos y cambios inmutables; pendientes y asignaciones; mínimos/lotes |

`001_core` crea la estructura; `002_integrity` unidades, FKs y validación diferida de totales; `003_rehearsal`/`004_trigger_path` atienden ensayo/ruta de funciones; `005_operational` habilita propósito operativo; `006_inventory` agrega libro de inventario; `007_mobile_sales` admite referencias agrupadas y varios renglones del mismo producto; `008_wholesale` agrega tarifas y marca de esquema. La migración 007 elimina la antigua unicidad `(sale_id,product_id)`; web todavía impide repetir producto en su formulario/dominio. Los renglones se conservan por `(sale_id,ordinal)`.

### Móvil, sincronización y datos locales

`Móvil/App.js` conecta `QuickSaleScreen`, `ConnectionScreen` y `SaleSummaryScreen` con `useMobileSale`. Pantallas antiguas de calculadora/catálogo/lista permanecen en el árbol, pero no forman parte del navegador principal actual. `src/domain/catalog.mjs` y `commercial.mjs` preparan búsqueda y opciones comerciales; `sale.mjs` construye renglones; `submission.mjs` resuelve envío y recuperación; `mobileApi.mjs` limita URL a red local y agrega autenticación/timeout.

`useMobileSale.js` sincroniza catálogo al conectar red, volver a primer plano y reintentar cada 15 segundos estando offline. No hay réplica bidireccional general de PostgreSQL ni cola que confirme ventas desconectadas: se conserva el borrador y el intento, y la confirmación oficial requiere servidor. `persistence.mjs` guarda esquema 1 en AsyncStorage (`calcquim_mobile_v1`), catálogo cacheado, uso/búsquedas, borrador y recibos. El token está en SecureStore (`calcquim.mobile.token`). Hay claves separadas para QA y lectura de claves heredadas; no se inspeccionó almacenamiento real del dispositivo.

Estados: draft, sending, confirmed, offline, unknown y rejected. Antes de enviar se persiste clave, cuerpo y servidor del intento; al recuperar un envío interrumpido se trata como unknown. Primero se consulta `/sales/status/:key`; sólo ante not_found se registra. El intento no cambia silenciosamente de servidor ni se sustituye su cuerpo por un catálogo nuevo. El catálogo verifica revisión, generación y versión de precios; un cambio de generación preserva borrador/caché para revisión.

### Autenticación, autorización y límites

Web: restricción de hostname localhost/127.0.0.1; escrituras exigen modo y origen local. No se encontró una capa de usuarios/roles comerciales en `app.mjs`: la confianza está en el equipo local, no en cuentas de cajero. Esa restricción por Host no reemplaza autenticación si en el futuro se publica el API o se agrega un proxy.

Móvil: Bearer compartido con comparación timingSafeEqual, longitud mínima y flags de habilitación/autorización operativa. `mobile-lan-access.mjs` restringe IP local autorizada y pares de la subred. La configuración actual usa HTTP; el token y los datos no tienen cifrado de transporte en esa LAN. No ampliar exposición sin revisar este límite. PostgreSQL usa rol de aplicación y loopback; el arranque operativo rechaza privilegios administrativos y listeners no locales.

### Respaldos, recuperación y duplicación conceptual

`backup-operational.mjs` usa pg_dump, snapshot exportado y hash del dataset/inventario; `operationalBackup.mjs` crea manifiesto SHA-256, verifica archivo y permite copia secundaria. La retención es informativa, no borra copias. La descarga JSON/Excel del frontend es una copia lógica/exportación; no acredita respaldo completo de movimientos y recuperación PostgreSQL.

`scripts/Backup-Diario.ps1` y `Preparar-Tarea-Respaldo.ps1` preparan ejecución diaria, con sesión Windows iniciada y privilegios mínimos. La consulta de la tarea `CalcQuim-Respaldo-Diario` no pudo resolverla en este contexto; su registro y próxima ejecución quedan no verificados. Existen archivos de estado históricos de la tarea, que no prueban su programación actual. No se ejecutaron esos scripts porque crean artefactos.

`server/scripts/restore-check.mjs` está dirigido a respaldo sintético y base de pruebas; no debe confundirse con restauración operativa automática. El marcador `activation.private.json` declara restauración histórica verificada, sin volverla a probar hoy.

El backend importa directamente reglas del Admin para catálogo, compras, ventas y unidades. Móvil tiene copias de unidades, catálogo, venta, cálculo y ticket; Admin además conserva `domain/mobileReceipt`. `Móvil/integration/admin` es otra copia de integración histórica. El motor de mayoreo de los dos repositorios coincide tras normalizar saltos de línea; sigue siendo código duplicado que requiere comprobación de paridad. El plan futuro debe mantener un contrato/dominio canónico y una forma controlada de distribuirlo, sin introducir por obligación otra tecnología.

## C. Funcionalidades verificadas

Definiciones: **implementado** = regla/ruta inspeccionada; **probado** = ejecución en esta auditoría, indicando su alcance; **desplegado** = respuesta activa o esquema aplicado; **operativo** = evidencia actual del comportamiento indicado. «No verificado» no equivale a fallo.

| Funcionalidad | Implementado | Probado ahora | Desplegado | Operativo acreditado |
|---|---|---|---|---|
| Salud Express/PostgreSQL | Sí | GET y SELECT READ ONLY | Sí | Sí, disponibilidad |
| Frontend PostgreSQL | Sí | HTML y módulo servido | Sí | Servicio accesible; UI completa no verificada |
| Lectura de catálogo móvil | Sí | GET autenticado | Sí | Sí desde escritorio |
| Mayoreo automático | Sí | 14/15 pruebas seleccionadas pasan; una falla de paridad textual | Esquema/metadatos/API activos | Motor activo; venta real nueva no ensayada |
| Ventas web/folios/idempotencia | Sí | Inspección, pruebas de dominio seleccionadas | API común viva, historial WEB | Uso histórico; escritura actual no ensayada |
| Ventas móvil/recuperación | Sí | Cálculo/request de memoria; sin POST | Catálogo habilitado e historial MOVIL | Uso histórico del canal; teléfono actual no verificado |
| Iniciales/movimientos | Sí | Lectura y plan de conciliación | Tablas/política activas | 71 iniciales y 45 salidas coherentes con el plan |
| Desglose agrupado | Sí | Inspección | Tablas existentes, sin pendientes activos | Ruta de escritura no ensayada |
| Correcciones/anulaciones | Sí | Corrección comercial en memoria, resto estático | Integrado en código/API común | Transacción real no ensayada |
| Compras/múltiples proveedores/costos | Sí | Inspección y estructura | Tablas e historial existentes | Uso histórico; altas/recepciones no ensayadas |
| Tickets móvil PNG/PDF | Sí | Inspección de exportadores | Registro de APK previo | Exportación en dispositivo no verificada |
| Ticket de venta móvil en Admin | Sí | Inspección del botón de impresión | Fuente integrada | Impresión/PDF del navegador no verificados |
| Reportes de compras/inventario/catálogo | Sí | Inspección, inventario derivado leído | Rutas/tablas disponibles | Visualización/exportación no ensayadas |
| Respaldo completo | Sí | Lectura de manifiestos | Archivos y evidencia histórica | Ejecución actual programada y restauración reciente no verificadas |
| Paquetes/rollos con stock común | No completo | Análisis | No acreditado | No |
| Servicios/ticket mixto físico-servicio | No | Análisis | No acreditado | No |

Verificaciones ejecutadas: Git en ambas carpetas; lectura de código/manifiestos/lockfiles; GET de salud, frontend y catálogo móvil; consultas estructurales y agregadas de PostgreSQL con READ ONLY; comparación de hashes; plan de conciliación puro sobre snapshot de lectura; `node --test tests/wholesale-groups.test.js tests/wholesale-pricing.test.js D:/ReactApps/calcQuim/tests/wholesale.test.mjs`. Resultado: 15 pruebas, 14 correctas, 1 fallida (comparación textual LF/CRLF); no escribe archivos ni conecta a PostgreSQL.

La consulta inicial de política usó un nombre inexistente (`inventory_policy`), falló con 42P01 y la transacción se revirtió. Se corrigió la lectura a la tabla real `inventory_settings` en una nueva transacción. No tuvo cambios persistentes. El plan de conciliación no ejecutó `applyInventoryReconciliation`.

Pendientes por requerir escrituras/artefactos: build/lint con posibles cachés, suites de integración PostgreSQL, ventas y devoluciones de prueba, recepción de compras, migración, exportación PNG/PDF, restauración y prueba de APK. No se ejecutaron. La única creación autorizada en el workspace es este informe; no se modificaron fuentes, configuración, precios, datos, ramas ni servicios, ni se instalaron dependencias.

## D. Catálogo y precios

### Representación actual

- Categorías: `categories`, nombres únicos normalizados, estado y opción de prefijo comercial. Líneas: `product_lines`, dependientes de categoría. `catalogUtils.js` compone nombre visible con línea o prefijo de categoría.
- Grupos: `price_groups` con precio normal y mayoreo opcional; no son equivalentes a una categoría ni a una línea. Los productos se vinculan por `priceGroupId`.
- Productos: `products` con unidad, disponibilidad, clasificación, precio individual o grupo excluyentes. Las variantes se representan como productos separados y clasificados; no hay tabla explícita de familia/atributos/variantes o presentaciones vendibles con stock común.
- `ProductFormModal.jsx` ya permite elegir las unidades de `utils/units.js`. La unicidad SQL `(category_id,line_id,name_key)` exige nombres/identidades que distingan presentaciones cuando sean productos distintos.
- Precio individual: propiedad `price` del producto; mayoreo individual sólo permitido por litro, con precio individual y sin grupo. No duplicar un producto para cada proveedor o precio de compra.
- Mayoreo: `wholesalePricing.mjs`, umbral 10 litros, tarifa explícita, sin descuento fijo nuevo. Agrupa por fuente oficial de precio (`group` o `individual` + id), no por coincidencia de valor ni por agrupación visual. Conserva numerador/denominador e importe capturado; mezcla ambigua de litros/pesos exige confirmación física.
- `calculateHistoricalItems` mantiene interpretación de ventas antiguas, incluido el descuento histórico del 15%; no debe utilizarse para imponer ese porcentaje a nuevas ventas.

### Unidades y presentaciones

| Venta | Capacidad actual | Límite relevante |
|---|---|---|
| Litro/mL | Admitida | Mayoreo automático se reconoce sobre unidad litro; no generalizar umbral a otras unidades |
| Importe monetario | Captura `amount`; se deriva cantidad según tarifa | Importe no es unidad física; web redondea salida a décima, móvil exige exactitud física o desglose |
| Pieza | Unidad admitida en web/móvil/SQL | Sin regla general de cantidad entera; no probado con stock operativo por pieza |
| Paquete | No hay unidad `paquete` en catálogo de unidades | Texto de presentación no crea conversión paquete/pieza ni inventario común |
| Kilogramo/gramo | Admitidos con conversión de masa | Todos los productos actuales son litros; uso real por masa no acreditado |
| Presentación individual | Puede existir como producto con unidad pieza/envase/bolsa/etc. | No existe vínculo de contenido con otra presentación para descontar una sola reserva |
| Carga de lavandería | Ausente | Requiere unidad comercial/validación y tipo servicio, sin inventario |

`convertQuantity` sólo convierte dentro de una dimensión: L/mL y kg/g; pieza, botella, bolsa, envase, garrafa y porrón tienen dimensiones propias. No infiere contenido por nombre ni convierte envase a litro. La FK `units` impide agregar una etiqueta sólo en la UI. Tampoco kg y pieza son intercambiables por gramaje del empaque.

Búsqueda web: Autocomplete por nombre visible/categoría/línea, selección rápida y agrupación visual en `SaleFormModal`. Móvil: `searchChoices` normaliza texto, busca palabras en nombre/contexto, pondera uso y recencia; contempla producto, línea, grupo y categoría con tarifas compatibles. No se verificó un sistema de códigos de barras/SKU como identificación comercial transversal.

Para jarcería simple por pieza se reutiliza prácticamente todo el catálogo/precio individual, pero deben añadirse restricciones de fraccionamiento y clasificación por actividad para evitar vender fracciones de rollo. Para presentaciones relacionadas hace falta relación explícita, precio por presentación y cantidad de stock por unidad base. No cambiar las unidades o IDs de los productos de limpieza actuales con historia.

## E. Compras y proveedores

`SuppliersPanel.jsx`, `SupplierFormModal.jsx` y `procurementDomain.saveSupplier` administran proveedor, contacto, ubicación y estado. `supplyModel.savePurchasedItem` identifica artículo comprado; `saveSupplySource` relaciona artículo, proveedor, unidad/cantidad y texto de presentación; `sourceIdentity` evita fuentes equivalentes duplicadas. `saveSupplyConversion` relaciona artículo y producto final; `effectiveSourceYield`/overrides ajustan rendimientos por fuente.

`supplier_costs` y `addSupplierPrice` conservan cotizaciones: precio, cantidad/unidad cubierta, fecha y vigencia, con snapshot. No son el precio de venta. `savePurchase`, `purchase_items`, `purchase_revisions` y `purchase_receipts` guardan cantidades, costos efectivamente capturados, comprobantes e historia. `purchaseUtils.calculatePurchaseItem` admite costo unitario/total; `purchaseAnalytics` y `calculateEffectiveCost` comparan costos sólo con unidades y rendimientos compatibles. El precio de venta lo establece el propietario; la infraestructura no exige imponer margen fijo.

**Un mismo artículo puede comprarse a varios proveedores con costos diferentes sin duplicar el producto:** un `purchased_item` se vincula con varias `supply_sources` y sus `supplier_costs`; las conversiones apuntan al mismo producto. `finishedProductFlow.ensureFinishedSource` busca/reutiliza la identidad técnica READY_TO_USE y añade fuente por proveedor. Sus comprobaciones dependen de artículo activo, una salida y unidades compatibles; una configuración ambigua o previamente duplicada no se fusiona automáticamente. Revisar identidades antes de una carga masiva futura.

**Compra de paquete y venta por unidad:** puede representarse el contenido como 4 piezas y texto «paquete de 4», cotizando el precio por 4 piezas. Las funciones permiten costo por `priceQuantity` y cantidad de presentación. Eso permite costo unitario coherente si se captura el contenido correctamente, pero no ofrece automáticamente una entrada «1 paquete», venta de «1 paquete» con precio propio, ni saldo de paquetes cerrados.

READY_TO_USE aplica equivalencia directa: `buildReadyToUseYield` y `validateSupplyConfiguration` no aceptan un rendimiento arbitrario 1 pieza → 4 piezas como producto terminado. Las conversiones de BASE/OTHER no deben usarse para simular apertura de empaques: describen abastecimiento/producción potencial, no transferencia física transaccional ni reserva compartida.

**Compra e inventario están separados:** la política actual es `purchase:explicit_receipt`. Guardar una compra no suma automáticamente todo lo comprable a existencias finales. `inventoryMovement` de tipo receipt puede vincular compra y ordinal y registra confirmación; preparar producción/entradas es explícito. Editar o anular compras con movimientos marca revisión requerida, sin ajustar stock a escondidas. Los 8 documentos de compra no implican 8 recepciones físicas; en el corte no hay movimientos receipt registrados.

## F. Ventas e inventario

### Flujo web

`SaleFormModal` selecciona productos activos/disponibles con tarifa válida; captura cantidad o importe, fecha, pago, notas y posible intención de desglose por línea/categoría. Un producto sólo aparece una vez en la captura web. `salesStorage.createSale` revalida catálogo, tarifa/unidad y cálculo; agrega snapshots, origen WEB, historial y folio. En modo PostgreSQL se envía comando, no se persiste la venta oficial en el navegador.

### Flujo móvil

`QuickSaleScreen` usa opciones comerciales y tarifas oficiales. `makeLine` valida cantidad hasta seis decimales e importe hasta dos, referencia y productos elegibles. Puede vender una agrupación sin identificar todavía cada producto. `requestBody` transmite evidencia, revisión y generación; Express reconstruye la línea con catálogo oficial y rechaza precios/nivel de mayoreo incompatibles. La política nueva exige coincidencia con la versión activa; un cliente de precios normales no puede registrar libremente sobre un catálogo activado en v2.

`createMobileSale` asigna origen MOVIL y folio común, guarda `originalReceipt` y líneas con referencias `product`, `line`, `category` o `priceGroup`. `correctMobileSale` conserva referencias y modos de captura, aplica tarifas históricas, guarda revisiones/versión/recibo actualizado e invalida desgloses anteriores. Es una corrección web de ventas móviles; no un editor genérico de cualquier venta.

`SalesPage` ofrece historial, filtros de fechas/origen/pendientes, totales de ventas vigentes, promedio y detalle. `voidSale` conserva documento; con inventario habilitado exige disposición física `returned`/`not_returned`. No confundir anulación comercial con devolución automática. `MobileSaleBreakdown`/`resolveSaleBreakdowns` permiten completar varias asignaciones atómicamente sin cambiar el importe comercial original.

### Inventario y reglas que deben preservarse

`inventoryInitial` registra el primer ancla; `inventoryCorrectInitial` audita diferencia y controla si aún es corregible; `inventoryCount`/estimate crea nueva referencia de existencia. Las entradas prepared/receipt, salidas justificadas, waste, ajustes, retornos y correcciones exigen cantidades compatibles y motivos. `inventoryReasons.js` normaliza catálogo de motivos y observaciones.

El saldo se deriva de ancla + movimientos posteriores aplicables + correcciones auditadas. Antes de una operación histórica, `checkBaseline` pide decidir si ya estaba incluida en la estimación o debe aplicarse ahora. El libro de movimientos no se edita: se compensan salidas/reversiones y se registran cambios inmutables. IDs y unidades con cuentas/historia no se cambian silenciosamente.

Ventas específicas con cantidad física descontable producen salida; agrupaciones o cantidades no representables generan `inventory_pending`. `allocate` comprueba pertenencia y elegibilidad histórica y exige suma física exacta; crea movimientos y `inventory_allocations` sin alterar el precio ni la venta agrupada. Anulación/corrección gestionan retorno/reversión y cancelación de pendientes; devoluciones parciales impiden una segunda reposición automática.

**Diferencia web/móvil importante:** `exactSaleQuantity` redondea capturas WEB por importe a una décima en la unidad vendida, conservando el importe; para MOVIL admite conversión monetaria física exacta hasta seis decimales o deja pendiente. No heredar ese redondeo para rollos/piezas: podría generar una fracción física a partir de pesos. La futura regla debe depender de la unidad/presentación y no sólo del origen.

La política permite saldo negativo con aviso (`negative:allow_warn`); no es un bloqueo estricto de stock insuficiente. En este corte no hay negativos. `inventoryReport`, `InventoryReport` e `inventoryReconciliation` permiten estado de reposición, pendientes, conciliación y trazabilidad; tener cero pendientes no prueba físicamente las existencias. El plan actual encuentra 45 líneas correctas frente al libro, sin aplicar cambios.

### Capacidad de ticket mixto

Una venta ya contiene múltiples renglones y unidades, pero los validadores no admiten un renglón servicio libre. `validateSales` exige producto o agrupación admitida, unidad reconocida y cantidad positiva; `sale_reference_required` restringe referencias sin producto; `syncInventory` intenta resolver producto o pendiente físico. Agregar sólo `service:true` al JSON no basta.

Para jarcería por pieza, se reutilizan confirmación, total, pago, folio e idempotencia; se amplía resolución de presentación y salida de stock base. Para lavandería, esos mismos mecanismos admiten una nueva rama explícita de servicio con tarifa configurada/cotizada y sin movimiento ni pendiente físico. Ventas mixtas requieren que ambos tipos convivan en `sale_items` y que corrección/anulación atiendan inventario sólo de las líneas físicas.

## G. Servicios de lavandería

No existe un módulo actual de tarifas por carga. Propuesta de dominio mínima: concepto de servicio persistido oficialmente en PostgreSQL, unidad comercial carga donde corresponda, tarifa configurable y modalidad de precio fijo o personalizado. El renglón conserva identificación del servicio, descripción, tarifa/versión histórica, cantidad, adicionales y total; tipo comercial explícito `service`. El importe personalizado requiere descripción y autorización/validación en servidor; no una edición del catálogo por cada trabajo.

| Servicio por una carga | Componentes definidos | Total definido |
|---|---|---:|
| Lavado con insumos del cliente | Lavado 60 | $60 |
| Lavado con insumos de Full Clean | Lavado 60 + jabón/suavizante 10 | $70 |
| Lavado y secado con insumos del cliente | Lavado 60 + secado 30 | $90 |
| Lavado, insumos Full Clean y secado | Lavado 60 + insumos 10 + secado 30 | $100 |
| Sólo exprimido | Cotización al momento | Personalizado |
| Exprimido y secado | Cotización al momento | Personalizado |
| Trabajo especial | Descripción y cotización al momento | Personalizado |

Los componentes adicionales pueden conservarse dentro de la línea de servicio con desglose histórico y total; no requieren crear SKU físicos para jabón o suavizante. No inferir una tarifa de secado solo a partir del adicional de $30 ni precio para exprimido. No cobrar por kg/prenda ni descontar insumos automáticamente. Cantidad de cargas y multiplicación deben ser explícitas; restricciones para fracciones dependen de la política comercial pendiente.

`createSale`, `createMobileSale`, `requestBody`, `validateSales`, repositorio y restricción SQL deben admitir la referencia servicio. El servidor decide tarifa fija/adicionales; para personalizado valida monto y concepto. `syncInventory`, reversas, desglose y conciliación deben omitir completamente líneas servicio. Su anulación sólo afecta estado comercial/ingresos. La tarifa futura se modifica en catálogo, sin recalcular recibos ya confirmados. El motor de mayoreo por litro queda intacto y no se aplica a carga ni a cotizaciones.

Alcance comercial de venta no equivale a administración de órdenes de lavandería: recepción, identificación de bolsas, estado del trabajo, entrega y anticipos no se encontraron implementados como flujo específico. Añadirlos sólo si el propietario los necesita; no son indispensables para cobrar los conceptos definidos.

## H. Jarcería

### Aplicación de los ejemplos conocidos

| Familia | Identidad y unidad futura | Precaución |
|---|---|---|
| Mr. Big 600/800 hojas | Artículos distintos por especificación; rollo base y presentación 4 rollos | No confundir igual marca con mismo artículo; relación paquete/rollo explícita |
| Vogue paquete de 6 | Artículo propio, rollo base, presentación 6 | Factor independiente del paquete de cuatro |
| Pastillas baño / cloro dúo | Pieza o presentación comercial definida | Dúo fraccionable sólo con contenido/unidad y precio decididos |
| Fibras, Fregón | Pieza y variantes reales identificadas | Evitar duplicar por proveedor |
| Sanitas 100 toallas, 24 × 21 cm | Presentación identificada con ese contenido | No asumir venta de toalla individual ni conteo de sueltas |
| Bobinas | Pieza y especificación del producto | No convertir a kg/metros sin equivalencia comercial real |
| Atomizadores | Pieza con capacidad como atributo/descripción | Capacidad del envase no es litro de producto de limpieza |
| Roma empacado | Presentación y gramaje de fábrica | Paquete y contenido son conceptos diferentes |
| Roma suelto | Artículo vendible por masa si esa es la operación elegida | No convertir precio de bolsa a kg automáticamente sin dato de contenido |
| Zote en barra | Pieza diferenciada por gramaje/tipo | Gramaje distingue variante; no impone venta fraccionada por peso |

Abarrotera Zorro, Jarcería La Libertad y Jarcería San Martín son ejemplos comerciales aportados, no altas realizadas ni proveedores cuya presencia actual se haya afirmado. No se introdujeron productos, costos o existencias.

### Modelo mínimo recomendado

Conservar el producto físico como identidad del artículo inventariable y agregar presentaciones vendibles que lo referencien: unidad base, cantidad base por presentación, nombre, precio individual/grupo aplicable, estado y regla de fraccionamiento. Paquete de cuatro y rollo pueden tener precios independientes y descontar 4 o 1 rollos del mismo stock. Snapshot del factor y precio al confirmar evita que una edición futura cambie el pasado.

Para compra se puede reutilizar cantidad/contenido y fuente por proveedor, ampliando la captura para que «1 paquete de 4» se traduzca explícitamente en 4 unidades base y en su costo. La recepción física conserva el vínculo con la compra y el factor usado. Un producto comprado a distintos proveedores converge en el mismo stock, sin crear reservas duplicadas por origen.

**Cerrar/abrir paquetes es una necesidad distinta del saldo total:** con 10 rollos sólo se sabe contenido total; no se puede asegurar que haya dos paquetes sellados. Si se necesita prometer empaque cerrado, se requieren saldos por estado/presentación y una operación de apertura que retire un paquete cerrado y habilite sus unidades sueltas atómicamente. No sumar simultáneamente paquete y rollos al total base. El stock por estado agrega trabajo y debe implementarse sólo con esa necesidad confirmada; el factor para evitar doble descuento sí es indispensable al vender ambas presentaciones.

Alternativa de separar paquete y rollo como productos con cuentas distintas exige una transferencia/apertura transaccional explícita y conciliación entre cuentas; tiene más riesgo de duplicación y se recomienda sólo si el control físico por empaque lo justifica. No representarlos como dos productos sin relación.

## I. Tickets y reportes

### Comprobantes

`Móvil/src/components/Ticket.js` y `domain/ticket.mjs` muestran logo oficial, nombre Full Clean Home & Laundry, domicilio de Niños Héroes No. 10 en San Mateo Ayecac, Tepetitla de Lardizábal, Tlaxcala, teléfono/WhatsApp, fecha/hora, folio, versión, conceptos, cantidad/unidad, precio, importes y total MXN. La marca está centralizada por copia en `brand.mjs`; logo raster y versión embebida se encuentran en assets/domain. Se verificó su referencia en código, no que los datos de contacto sigan comercialmente vigentes.

`SaleSummaryScreen` exporta PNG con captureRef/view-shot (1080 de ancho, espera carga de logo/layout) y PDF mediante expo-print + ticketHtml; escribe archivo en caché propia y usa expo-sharing. Esas rutas no se ejecutaron porque generan artefactos y requerirían dispositivo/estado privado. El recibo se muestra sólo con evidencia de confirmación.

Admin reutiliza `domain/mobileReceipt/ticket.mjs` mediante `services/saleReceipt.js`; `MobileSaleCorrection` ofrece ticket original y actualizado y abre impresión del navegador, desde donde puede guardarse PDF. No se encontró en `SalesPage` un exportador PNG general ni una ruta equivalente de ticket para toda venta WEB: su detalle en pantalla no prueba esa función. No afirmar paridad de exportación web/móvil.

El formato de líneas ya es suficientemente general para nombres y unidades distintas. Requiere adaptar `ticketModel` y el contrato de recibo a pieza/paquete/carga, factor/composición cuando sea relevante y precio personalizado. Se puede conservar diseño, logo, encabezado, folio y total. El emisor debe utilizar snapshots; no consultar el precio vigente para reconstruir un ticket histórico. Los recibos móviles locales no se actualizan automáticamente cuando Admin corrige una venta: el hook guarda el recibo confirmado original; no se observó una sincronización general de revisiones a todo el historial local.

### Reportes existentes y reutilización

| Necesidad | Base disponible | Trabajo real necesario |
|---|---|---|
| Ingresos totales | `SalesPage`: sumas de ventas no anuladas, período, promedio, origen | Reutilizar importes confirmados; para actividad agregar clasificación histórica por renglón |
| Ingresos limpieza/jarcería/lavandería | Renglones y totales existentes | Nuevo agregador/filtro por actividad y tipo; un ticket mixto no se clasifica entero en una sola actividad |
| Stock por tipo de producto | `inventoryReport.js`, InventoryReport, filtros categoría/línea y estado | Filtrar actividad física; presentar stock base/comercial sin sumar unidades heterogéneas |
| Más vendidos | Datos de renglón disponibles | Nuevo ranking; separar cantidad base, presentación e ingresos; resolver agrupaciones con asignaciones |
| Servicios más solicitados | Sin servicios registrados en modelo | Nuevo ranking sobre servicios/cargas/trabajos, sin inferir cargas a partir del dinero |
| Costos/proveedores | `purchaseReport`, `purchaseAnalytics`, CostEvolution y comparador | Reutilizables con contenido/factores compatibles; preservar fuentes reales y cotizaciones separadas |
| Rentabilidad por actividad | `grossMargin` y costo efectivo de referencia | Hoy sólo referencia/comparación, no utilidad contable realizada por actividad |

`ReportsPage` se centra en abastecimiento, rendimientos, compras/proveedores, catálogo, configuración y existencias/reposición. Sus rankings de cobertura o productos obtenibles no son rankings de ventas. `purchaseReport` usa totales pagados/snapshots y excluye compras anuladas; CostEvolution separa compras reales de costos informados y series de unidades incompatibles. `inventoryReport` diferencia desconocido, agotado, bajo, suficiente y sin punto de reposición, advierte negativos y exporta CSV/Excel.

No se encontró imputación histórica completa de costo de mercancía vendida por lote ni costos de agua, energía, mano de obra y servicios para lavandería. Por tanto, no calcular rentabilidad realizada de las tres actividades con costos actuales de referencia. Puede informarse ingreso y compras efectivas por separado, y margen estimado únicamente cuando esté claramente etiquetado y exista costo comparable. La ampliación de costeo realizado es opcional para cobrar, indispensable antes de prometer ese indicador.

## J. Riesgos de integración

| Prioridad | Riesgo y evidencia | Tratamiento recomendado para futura implementación |
|---|---|---|
| Alta | Hashes 006–008 LF registrados frente a CRLF locales; `db/migrate.mjs` compara bytes | Resolver reproducibilidad de archivos históricos antes de nueva migración; no actualizar checksums a ciegas ni editar SQL aplicado |
| Alta | Restauración reciente/copia secundaria no acreditadas | Ensayar recuperación del último respaldo con inventario en destino aislado, y verificar copia independiente antes de cambios operativos |
| Alta | `writeDataset` recompone detalles y serializa colecciones conocidas | Ampliar lectura/escritura, snapshots y backups a la vez; verificar no perder campos nuevos al guardar con cliente antiguo |
| Alta | APK instalada desconocida y clientes con precios anteriores | Negociar capacidades/versiones; no enviar líneas nuevas a clientes que no las comprenden; mantener lectura/estado de intentos previos |
| Alta | Borrador/intento persistido incluye servidor, cuerpo, generación y revisión | Migración local conservadora; consultar estado por clave antes de permitir reemplazo; nunca limpiar AsyncStorage/SecureStore para actualizar |
| Alta | Motor mayorista sólo para litros y fuente oficial | Mantener umbral/reglas/histórico; no aplicar mayoreo a piezas/cargas ni agrupar artículos por mismo valor numérico |
| Alta | `syncInventory` supone producto o grupo físico | Rama explícita servicio sin movimiento ni pendiente; factores físicos para presentación y reversas |
| Alta | Redondeo WEB a décima y cantidades decimales permitidas | Políticas por unidad para piezas/cargas; evitar fracciones y stock negativo inesperado |
| Alta | Paquete y rollo pueden duplicar reserva si se crean sin relación | Un stock base y factores o transferencias cerradas/abiertas atómicas |
| Media | Tarifas, unidades, contenido y clasificación pueden cambiar | Guardar snapshots/versión en cada renglón; no recalcular historia con catálogo actual |
| Media | API móvil distingue v1 HTTP y versión de precios v2 | No considerar `/v1` garantía de compatibilidad semántica; versionar tipos/capacidades sin reemplazar reglas históricas |
| Media | Cambios de IP autorizada/red y HTTP con Bearer | Validar LAN y exposición en despliegue; preservar restricción local y secreto; no asumir conectividad por tener URL configurada |
| Media | Idempotencia y bloqueo de revisión global | Conservar consulta/replay de respuesta original; nuevas compras/ventas pueden invalidar revisiones de clientes activos y exigir refresco |
| Media | Correcciones/anulaciones físicas y anclas posteriores | Mantener motivos, historia, tratamiento de baseline y confirmación de retorno sólo para líneas físicas |
| Media | Sin roles de cajero y precio libre futuro | Validar cotización en servidor y definir permiso real antes de exponerlo a más operadores |
| Media | Copias en `Móvil/integration/admin`, scripts prepare/publish/activate/cleanup | Tratar como históricos; pueden escribir fuentes o datos. No ejecutarlos como mantenimiento rutinario ni usar sus migraciones copiadas como fuente oficial |
| Media | Fuentes actuales, dist y proceso cargado no identificados entre sí | Publicar con versión/build verificable y comprobar contratos; no asumir que reiniciar o instalar APK es parte de esta auditoría |

El fallo de paridad textual de mayoreo debe registrarse y resolverse en la próxima tarea; no se ocultó ni se modificaron archivos para hacerlo pasar. La igualdad normalizada demuestra la causa de formato, no certifica todas las demás copias de dominio. No se ejecutó una auditoría completa de seguridad ni de todas las suites.

## K. Propuesta de arquitectura futura

Mantener React, Express, PostgreSQL, React Native/Expo y el modelo de comandos existente. PostgreSQL seguirá siendo la única autoridad de catálogo comercial, tarifas, ventas, compras e inventario; caché móvil y exportaciones no podrán crear fuentes oficiales alternativas.

### Ampliación mínima de dominio

1. **Clasificación estable de actividad** (limpieza, jarcería, lavandería) y tipo comercial físico/servicio. Persistir snapshot de actividad en la venta; categorías/líneas siguen aportando navegación, sin convertirse en tarifas o tipos físicos por nombre.
2. **Presentaciones de productos físicos** con referencia al producto/base inventariable, contenido/factor, unidad comercial, precio y regla de cantidad. Precio por presentación independiente cuando corresponda, con reutilización de validación individual/grupo. No alterar las unidades ni IDs históricos de limpieza.
3. **Servicios oficiales configurables** con unidad carga o trabajo cotizado, combinaciones/adicionales definidos y permiso de precio personalizado. Pueden administrarse en el mismo módulo de catálogo, con colección/relación propia cuando convenga; no forzar un servicio dentro de `products` físicos para eludir las restricciones actuales.
4. **Renglón comercial discriminado** con referencia válida según tipo, cantidad/unidad comercial, precio/importe y snapshots. Físico añade presentación, cantidad base y factor; servicio añade tarifa/adicionales o cotización y nunca genera stock. Conservar las referencias agrupadas históricas y su evidencia de elegibilidad.
5. **Adaptación transversal**: repositorio, restricciones SQL, cálculo servidor/clientes, contrato catálogo/venta/estado/recibo, corrección/anulación, conciliación, backup e informes. Ampliar `sale_reference_required` para servicios de manera verificable, no dejar referencias JSON libres sin integridad.

Los nombres de campos/tablas futuros son decisiones de implementación, no tablas existentes ni instrucciones SQL ejecutadas. El catálogo puede tener una pantalla unificada y tablas separadas para servicios/presentaciones; esto conserva experiencia de captura sin duplicar proveedores, precios o stocks.

### Orden recomendado

1. Resolver hashes/formato y fallo de paridad; fijar evidencia de versión desplegada. Ensayar respaldo/restauración del estado actual en entorno aislado. No alterar checksums registrados para silenciar el error sin comprobar contenido.
2. Definir contrato aditivo y compatibilidad de clientes, valores por defecto para históricos físicos y preservación de intentos pendientes. Preparar migraciones nuevas reversibles/ensayadas sin reescribir ventas o unidades existentes.
3. Incorporar presentaciones/unidad base y recepción explícita de compras. Primero probar múltiples proveedores y paquete de cuatro/seis con ventas individuales/completas; evitar doble stock. Implementar cerrado/abierto sólo si se confirma la necesidad.
4. Incorporar servicio y tarifas por carga/cotización, con exclusión completa de inventario. Verificar las cuatro combinaciones dadas y tickets mixtos.
5. Adaptar web y móvil, exportadores y reportes; probar clientes antiguos, borradores, cambios de catálogo, pérdida de respuesta, reintento, corrección, anulación y retorno parcial en base aislada. Mantener pruebas actuales de mayoreo.
6. Desplegar en ventana operativa controlada con respaldo validado y contrato compatible. Verificar esquema, versión y clientes, después habilitar las nuevas actividades. La carga real de artículos/precios/stock se planifica aparte y nunca usa datos de ejemplo como ventas reales.

### Indispensable, opcional y preservado

**Indispensable:** tipo servicio y exclusión física, factores para stock compartido cuando se vendan paquete/unidad, validación de unidades/fraccionamiento, precios históricos, adaptación de contratos/serialización/recuperación, compatibilidad de móvil y fuente única PostgreSQL.

**Pequeñas ampliaciones:** etiquetas/unidades comerciales, formularios/buscador, clasificación y filtros, ticket genérico. El renglón mixto y stock por presentación requieren trabajo transversal y no deben calificarse como un cambio meramente visual.

**Opcional:** control de sellado/apertura si sólo importa contenido total; órdenes/entrega de lavandería; código de barras; costeo contable realizado; usuarios múltiples; mejoras de rendimiento según medición. No son condición para reutilizar la plataforma, aunque algunos se vuelven necesarios si se promete su resultado.

**Preservar:** motor de mayoreo por litro, tarifas/grupos actuales, IDs y unidades con historia, política de recepción explícita, movimientos inmutables/anclas, folios, idempotencia, snapshots de comprobantes y consulta de intentos. No reconstruir mayoreo ni reemplazar catálogos por copias dentro de móvil.

## L. Reutilización exacta

| Ruta o tabla | Funcionalidad existente | Reutilización propuesta | Cambio requerido | Riesgo |
|---|---|---|---|---|
| `src/main.jsx`, `PostgresApplication.jsx` | Modo operativo, providers, snapshot | Mantener PostgreSQL como autoridad | Exponer nuevas colecciones/capacidades | Medio |
| `categories`, `product_lines`; `CategoriesPage.jsx` | Clasificación y nombres | Navegación de jarcería/servicios | Actividad estable separada o vinculada, con snapshot | Bajo |
| `products`; `catalogDomain.js`, `catalogValidation.js` | Identidad/precio/disponibilidad | Artículos físicos existentes y nuevos | Presentaciones y regla de fracciones; preservar historia | Alto |
| `price_groups`, `PriceGroupFormModal.jsx` | Tarifas por fuente oficial | Tarifas físicas existentes | No mezclar pieza/carga con agregación por litro | Alto |
| `src/domain/wholesalePricing.mjs` y copia móvil | Motor mayorista exacto | Conservar completo | Resolver paridad de formato; excluir nuevos tipos de su umbral | Alto |
| `units`, `utils/units.js`, móvil `domain/adminUnits.mjs` | Normalización y dimensiones | L/mL, kg/g y pieza | Unidad carga/paquete si se adopta; factores por presentación fuera de conversión dimensional | Alto |
| `suppliers`; `procurementDomain.saveSupplier` | Proveedores/contactos | Mismos proveedores compartidos | Ningún nuevo catálogo duplicado | Bajo |
| `purchased_items`; `supplyModel.savePurchasedItem` | Artículo independiente del proveedor | Una identidad por material/artículo real | Evitar alta repetida por proveedor | Bajo |
| `supply_sources`; `saveSupplySource`, `sourceIdentity` | Fuentes/presentación por proveedor | Múltiples proveedores y costos | Captura explícita de contenido de paquete | Medio |
| `supply_conversions`, `source_yield_overrides` | Rendimientos/salidas y excepciones | Conservar limpieza y costo comparable | No usar como apertura de paquetes; relación comercial nueva | Alto |
| `supplier_costs`; `addSupplierPrice` | Cotización histórica por cantidad/unidad | Costos de jarcería por fuente | Alinear contenido con unidad base | Bajo/medio |
| `finishedProductFlow.ensureFinishedSource` | Reutilización READY_TO_USE | Compra de terminados por proveedor | Resolver presentación sin inventar rendimiento | Medio |
| `purchases`, `purchase_items/revisions/receipts` | Compras y evidencia histórica | Compras reales nuevas | Snapshots de contenido/factor; no autoentrada silenciosa | Medio |
| `purchaseUtils.js`, `procurementUtils.js` | Costo unitario/total, conversión válida | Comparación por pieza/kg | Factor comercial explícito donde corresponda | Medio |
| `SaleFormModal.jsx`, `salesStorage.createSale` | Captura web, pago, snapshots, folio | Venta mixta en mismo formulario | Resolver tipo/presentación/servicio y repetición por presentación | Alto |
| `server/src/mobile/catalog.mjs`, `commercial.mjs` | Opciones oficiales y elegibilidad | Búsqueda rápida ampliada | Nuevos tipos y capacidades compatibles | Alto |
| `server/src/mobile/domain.mjs` | Confirmación/corrección móvil | Confirmación común e historia | Ramas para nuevos tipos y snapshots | Alto |
| `server/src/services/dataset.mjs` | Transacción, revisión, generación, replay | Sin duplicar idempotencia ni folios | Conservar respuesta vieja y claves, nuevas validaciones | Alto |
| `server/src/repositories/dataset.mjs` | Traducción JSON/relacional | Persistir agregado oficial | Añadir colecciones/campos; evitar pérdidas al reconstruir detalles | Alto |
| `sales`, `sale_items`, `sale_reference_required` | Cabecera/renglones y totales | Ticket mixto | Referencia servicio/presentación y FKs/checks adecuados | Alto |
| `inventory_accounts/movements/changes` | Stock auditado e inmutable | Stock físico base por artículo | Factor y reversión exactos; servicios excluidos | Alto |
| `server/src/services/inventory.mjs` | Salidas, anclas, retornos, recepción | Conservar reglas físicas | Tipo no inventariable y cantidades base; no redondear piezas a décimas | Alto |
| `inventory_pending/allocations`; `MobileSaleBreakdown.jsx` | Desglose físico histórico | Mantener agrupaciones de limpieza | Servicios nunca pendientes; separar unidades incompatibles | Alto |
| `inventoryReconciliation.mjs` | Plan y aplicación controlada | Auditoría de ventas físicas futuras | Plan entiende presentación y omite servicio | Alto |
| `inventoryReasons.js`, formularios de motivos | Motivos/observaciones consistentes | Mermas, ajustes, apertura si existe | Nuevos motivos sólo para eventos realmente nuevos | Bajo |
| `Móvil/src/hooks/useMobileSale.js` | Catálogo/cache/borrador/confirmación | Misma experiencia de captura | Preservación/migración local, capacidades nuevas | Alto |
| `Móvil/src/domain/persistence.mjs`, `submission.mjs` | Intento durable y recuperación por clave | Reusar en tickets mixtos | Validadores versionados; consulta del intento previo intacta | Alto |
| `Móvil/src/services/mobileApi.mjs` | URL local, token, timeout | Conservar transporte y estados | Negociación aditiva; no reenviar cuerpo distinto con misma clave | Alto |
| `domain/mobileReceipt/ticket.mjs`; móvil `domain/ticket.mjs`, `components/Ticket.js` | Ticket y marca | Mismo diseño para nuevos conceptos | Unidades/tipos/adicionales, snapshots | Medio |
| `Móvil/src/screens/SaleSummaryScreen.js` | Exportación PNG/PDF | Reusar exportadores | Probar ticket mixto/largo en entorno aislado | Medio |
| `MobileSaleCorrection.jsx` | Corrección y ticket original/actualizado | Reutilizar historial y print | Separar parte física de servicio; acceso general al ticket si se requiere | Alto |
| `reportAnalytics.purchaseReport`, `purchaseAnalytics.js` | Costos/compras por proveedor | Reportes jarcería | Filtros/actividad, no mezclar referencias y costos reales | Bajo/medio |
| `inventoryReport.js`, `InventoryReport.jsx` | Estados y reposición/exportación | Stock físico por actividad | Unidades base y presentaciones sin doble suma | Medio |
| `SalesPage.jsx` | Totales por período, origen e historial | Base de ingresos mixtos | Agregación por actividad a nivel renglón y ranking nuevo | Medio |
| `operationalBackup.mjs`, `backup-operational.mjs` | Dump/hashes/copia secundaria opcional | Proteger catálogo ampliado y libro | Ensayo actual de recuperación y nuevas verificaciones | Alto |
| `server/src/db/migrate.mjs`, `server/migrations/` | Migración versionada por checksum | Migraciones aditivas futuras | Resolver LF/CRLF sin alterar significado/aplicado | Alto |
| `Móvil/integration/admin`, scripts `integration/` | Copias/parches de integración antiguos | Referencia histórica únicamente | Evitar ejecutarlos sobre fuentes/datos actuales | Alto |

## M. Decisiones comerciales pendientes

Estas decisiones no detuvieron la auditoría y no incluyen elecciones ordinarias de programación:

1. Precios reales de venta por artículo/presentación de jarcería y sus costos/contenidos efectivos por proveedor; no hay obligación de margen fijo. No extrapolar tarifas de limpieza.
2. Qué empaques se venden cerrados, cuáles se abren y cuáles admiten venta suelta: rollos, dúos de cloro, Sanitas, Roma y demás. Determinar si se necesita conocer paquetes sellados disponibles, además del contenido total.
3. Unidad efectiva de Roma suelto y otras ventas a granel, mínimo comercial y fracciones permitidas. Kg está soportado técnicamente, pero no se impone como política de todos los artículos.
4. Tarifas de sólo exprimido, exprimido/secado y trabajos especiales, y qué operadores pueden fijar el cobro personalizado. La tarifa de secado solo no está definida por el adicional de lavado.
5. Qué constituye una carga y si se admiten fracciones o múltiples cargas con los mismos adicionales. Los cuatro precios por una carga ya definidos no requieren otra decisión para programarse.
6. Si se requiere un flujo de recepción/seguimiento/entrega, anticipos o saldos de lavandería además de registrar y cobrar la venta. No asumirlo dentro de un simple ticket.
7. Sólo si se desea rentabilidad realizada: costos operativos de lavandería y criterio comercial/contable de asignación de costos. Con los datos actuales se pueden informar ingresos y referencias de adquisición, sin inventar utilidad.

La implementación posterior puede decidir autónomamente nombres de tablas/campos, ubicación de componentes, estrategia de migración aditiva y pruebas aisladas, respetando los límites y contratos descritos. Esta auditoría no implementa ni activa jarcería o lavandería.
