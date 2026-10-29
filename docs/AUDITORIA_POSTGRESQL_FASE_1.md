# CalcQuim Admin: auditoría y diseño para PostgreSQL local

Fecha: 20 de octubre de 2026. Alcance: Fase 1, análisis estático y propuesta técnica. Repositorio: `D:\ReactApps\calcQuim-admin`, rama `dev`, HEAD `b86e88b`.

## 1. Resultado y límites de la auditoría

La aplicación puede migrarse a React/Vite → Express → PostgreSQL local conservando la separación actual entre catálogo, artículos comprados, fuentes de abastecimiento, conversiones e historial económico. No conviene trasladar simplemente el sobre JSON completo a una única tabla como almacenamiento operativo.

Se inspeccionaron código, pruebas existentes, manifiesto, estructura y metadatos del entorno. No se inició Vite ni se abrió la aplicación: algunas cargas escriben transformaciones automáticamente. No se leyó localStorage, no se abrió el respaldo JSON del directorio raíz, no se usaron datos reales como fixtures o logs, no se ejecutaron importaciones, migraciones ni conexiones a bases de datos. Este documento es el único entregable añadido; no contiene DDL ejecutable ni implementación de backend.

**La existencia de estructuras en el código no demuestra que haya registros reales de cada entidad.** Quedan pendientes los conteos, versiones efectivamente almacenadas, campos adicionales, tipos de ID reales, referencias huérfanas y precisión numérica de los datos. Ningún faltante se debe completar automáticamente. La propuesta incluye una etapa de diagnóstico sobre copia para resolverlos antes del corte.

## 2. Entorno y estructura comprobados

| Comprobación de lectura | Resultado |
|---|---|
| Node.js | `v22.22.3` |
| npm | `10.9.8`, comprobado con `npm.cmd --version` |
| Ejecución de npm en PowerShell | `npm --version` resuelve a `npm.ps1` y la política de scripts lo bloquea; `npm.cmd` funciona. No se cambió la política |
| PostgreSQL y herramientas | `psql`, `pg_dump`, `postgres`, `pg_ctl` no encontrados mediante `Get-Command` |
| Servicio Windows | No se encontraron servicios con nombre o descripción PostgreSQL |
| Instalación habitual | No se encontró `C:\Program Files\PostgreSQL` ni entradas de instalaciones en las ramas PostgreSQL consultadas del Registro, de 32 y 64 bits |
| Conclusión sobre PostgreSQL | Instalación no detectada en estas comprobaciones. No prueba ausencia de instalaciones portátiles, WSL, contenedores u otra ruta; versión y disponibilidad sin confirmar |
| Git inicial | Árbol limpio; `dev...origin/dev`, sin indicadores de diferencia en el estado local. No se hizo fetch para comprobar el remoto |
| Backend existente | No se encontró API de negocio, Express, cliente `pg` ni configuración PostgreSQL en el código inspeccionado |
| Servidor encontrado | `benchmarks/comparator/server.mjs` inicia Vite para medición; no es un backend de negocio |

Estructura: `src/context`, `src/services`, `src/utils`, `src/pages`, `src/components`, `src/data`, `src/styles`; también `tests`, `benchmarks/comparator`, `public`, `dist`, `node_modules` y `.playwright-mcp`. Los archivos generados no se trataron como fuente de verdad. No se encontraron instrucciones AGENTS.md aplicables en la raíz del repositorio ni en los ancestros revisados.

Scripts actuales de `package.json`: `test: node --test tests/*.test.js`, `dev: vite`, `build: vite build`, `lint: eslint .`, `preview: vite preview`. No existen scripts de servidor, migración o respaldo PostgreSQL. Dependencias principales declaradas: React `^19.2.8`, React DOM `^19.2.8`, Vite `^8.2.2`, React Router `^8.3.1`, MUI, Bootstrap, Material React Table y `write-excel-file`. Estas son versiones declaradas, no una auditoría de resolución de todo el lockfile.

## 3. Inventario completo de almacenamiento encontrado en src

Fuente central: [catalogStorage.js](../src/services/catalogStorage.js), `STORAGE_KEYS`, líneas 8–18. Se buscaron referencias a localStorage y operaciones `getItem`, `setItem`, `removeItem`, `clear` sobre el adaptador `storage`. No se encontraron mecanismos de persistencia en sessionStorage o IndexedDB en `src`.

| Clave literal | Contenido y uso | Lectores/escritores principales |
|---|---|---|
| `calcquim_categories` | Lista de categorías | Catálogo, hook; exportación/importación y reset |
| `calcquim_product_lines` | Lista de líneas con `categoryId` | Catálogo, hook; exportación/importación y reset |
| `calcquim_products` | Lista de productos vendibles | Catálogo, hook; alta rápida durante compra; exportación/importación y reset |
| `calcquim_price_groups` | Lista de grupos de precio | Catálogo, hook; exportación/importación y reset |
| `calcquim_procurement_v1` | Sobre de abastecimiento e historial: `version`, `supplyConfigurationVersion`, `supplyModelVersion`, `suppliers`, `purchasedItems`, `supplyItems`, `supplyConversions`, `supplierPrices`, `purchases`; puede incluir `supplyMigration` | `procurementStorage`, `ProcurementProvider`; importación, reset, exportaciones y comprobación de historial |
| `calcquim_purchases` | Historial antiguo de compras; entrada de compatibilidad, conservada al crear el sobre nuevo | Lectura/migración en `procurementStorage`; exportaciones, importación; reset la elimina |
| `calcquim_sales` | Lista de ventas con detalle y anulaciones | `salesStorage`, `SalesPage`; exportación/importación y reset |
| `calcquim_sales_sequence` | Secuencia heredada de folios de venta | `SalesPage` la lee y `createSale` la considera. No se encontró incremento ordinario de esta clave; importación puede restaurarla y reset la elimina |
| `calcquim_reset_pending` | Marca de restablecimiento incompleto | `dataReset`, `ApplicationRoot`; respaldo original y verificación de importación |
| `calcquim_reset_epoch` | Generación de datos para invalidar escrituras antiguas | Hooks, providers, ventas, `ApplicationRoot`; `dataReset`, importación y recuperación la escriben |
| `calcquim_import_pending_v1` | Diario con valores previos para revertir una restauración interrumpida | `backupImport`: creación, lectura, recuperación y eliminación |

Las primeras ocho son `BUSINESS_STORAGE_KEYS` en [dataReset.js](../src/services/dataReset.js). Las dos marcas de reset son operativas; el diario de importación también contiene copias de información del negocio. `calcquim-data-writer-v1` **no es una clave localStorage**: es el nombre de un Web Lock en [dataSession.js](../src/services/dataSession.js).

### Puntos de acceso y responsabilidades

| Archivo | Acceso/efecto encontrado |
|---|---|
| [catalogStorage.js](../src/services/catalogStorage.js) | `inspectCatalogStorage` y `loadCollection` leen; `saveCollection` y `persistCatalogCollection` escriben. Este último compara el valor esperado antes del guardado |
| [useCatalogCollection.js](../src/context/useCatalogCollection.js) | Captura valor crudo y generación, persiste antes de publicar estado React; puede restaurar o eliminar la clave en un rollback de compra |
| [CatalogContext.jsx](../src/context/CatalogContext.jsx) | Inicializa cuatro colecciones, comprueba cambios de catálogo entre pestañas, aplica CRUD/lotes; coordina el catálogo con una compra que crea producto |
| [procurementStorage.js](../src/services/procurementStorage.js) | `readJSON`, ambos loaders, `persistProcurement`, `productHasHistory`. **Los loaders pueden escribir**, no son lectores puros |
| [ProcurementProvider.jsx](../src/context/ProcurementProvider.jsx) | Importa `loadSupplyProcurement` con alias `loadProcurement`; inicia modelo v2 y persiste comandos de abastecimiento/compras en un único sobre |
| [salesStorage.js](../src/services/salesStorage.js), [SalesPage.jsx](../src/pages/SalesPage.jsx) | Carga, validación, comparación del crudo esperado y escritura de ventas; lectura de secuencia heredada y generación |
| [exportSnapshot.js](../src/services/exportSnapshot.js) | Lectura de colecciones y metadatos para exportación interpretada; puede usar catálogos iniciales si no hay clave |
| [rawBackup.js](../src/services/rawBackup.js) | Dos lecturas de cada clave de `STORAGE_KEYS` para detectar cambios; descarga JSON con cadenas originales y valores null |
| [backupImport.js](../src/services/backupImport.js) | Prepara y valida en memoria; baseline; diario; reemplazo de claves; rollback/recovery. Recuperación modifica almacenamiento |
| [dataReset.js](../src/services/dataReset.js) | Escribe colecciones vacías y marcas; elimina claves antiguas/secuencia; completa reset y recupera importación al arrancar |
| [ApplicationRoot.jsx](../src/ApplicationRoot.jsx) | Ejecuta `completePendingReset()` al inicializar; escucha eventos de storage y lee marcas |
| [ImportBackupModal.jsx](../src/components/ImportBackupModal.jsx) | Captura baseline del storage y prepara vista previa; delega la restauración al servicio |

`CatalogHooks`, `ProcurementContext`, `DataAdministrationContext` exponen estado/acciones. Los servicios de lotes, dominio, cálculos y validación preparan transformaciones; no son almacenamientos independientes. Comparador y reportes consumen esos estados y cálculos, sin claves propias.

## 4. Entidades y relaciones demostradas por el código

No hay modelos ORM ni tipos TypeScript de dominio; los modelos son objetos JavaScript construidos y validados por servicios/contextos.

| Entidad existente | Campos observados relevantes | Fuente |
|---|---|---|
| Categoría | `id`, `name`, `active`, `useAsProductPrefix`, `colorKey` | `CatalogContext`, `catalogValidation` |
| Línea | `id`, `name`, `categoryId`, `active` | `CatalogContext` |
| Grupo de precio | `id`, `name`, `price`, `active` | `CatalogContext` |
| Producto | `id`, `name`, `categoryId`, `lineId`, `unit`, `active`, `available`, `priceGroupId`, `price` | `CatalogContext`, `catalogValidation`, `finishedProductFlow` |
| Proveedor | `id`, `name`, `active`, `phone`, `address`, `mapsUrl`, `notes`, `createdAt`, `updatedAt` | `procurementDomain.saveSupplier` |
| Artículo comprado, v2 | `id`, `name`, `sourcingType`, `unit`, `active`, `materialReference`, timestamps cuando existen; compatibilidad `legacySupplyItemId` | `supplyModel` |
| Fuente/alternativa, `supplyItems` v2 | `id`, `purchasedItemId`, `supplierId`, `purchaseUnit`, `purchaseQuantity`, `presentation`, `active`, `notes`, timestamps, `yieldOverrides` | `supplyModel`, `supplyYieldBatch` |
| Conversión, v2 | `id`, `purchasedItemId`, `outputProductId`, `active`, `yield`, timestamps cuando existen | `supplyModel` |
| Rendimiento | `inputQuantity`, `inputUnit`, `outputQuantity`, `outputUnit`; override puede incluir `presentationSourceId`, `presentationQuantity` | `procurementUtils`, `supplyYieldBatch` |
| Costo informado, `supplierPrices` | `id`, `supplyItemId`, `supplierId`, `supplierNameSnapshot`, `price`, `priceQuantity`, `priceUnit`, `quotedAt`, `validUntil` opcional, `snapshot`, `createdAt`; campos adicionales del input preservados por spread | `procurementDomain.addSupplierPrice` |
| Compra | `id`, `supplierId`, `supplier`, `supplierNameSnapshot`, `date`, `reference`, `notes`, `items`, `total`, `receipt`, `createdAt`, `updatedAt`, `revisions`, `voidedAt` | `procurementDomain.savePurchase`, `purchaseReceipt` |
| Renglón de compra | `id` cuando existe, `quantity`, `costMode`, `cost`, `unitCost`, `total`, `effectiveCost`, `effectiveUnit`, `group`; snapshot de fuente/artículo/producto/presentación/rendimiento y `conversionSnapshots` | `purchaseUtils`, `procurementUtils.supplySnapshot`, `supplyModel.sourceSnapshot` |
| Venta | `id`, `folio`, `date`, `payment`, `notes`, `items`, `total`, `createdAt`, `voidedAt`; exportador tolera `customer` histórico si existe | `salesStorage`, `dataExport` |
| Renglón de venta | `productId`, nombres históricos, `priceGroupIdSnapshot`, `unit`, `price`, `quantity`, `entryMode`, `requestedAmount`, `subtotal`, `discountRate`, `discount`, `amount`, `group` | `salesStorage`, `salesUtils` |
| Foto de ticket | `name`, `dataUrl` JPEG | `purchaseReceipt` |
| Archivo de migración interna | `supplyMigration.version`, `diagnostics`, `originalSupplyItems` | `supplyModel.migrateSupplyModel` |

Relaciones explícitas:

- Categoría 1:N líneas por `categoryId`; categoría 1:N productos, con categoría opcional en registros admitidos por validación. Línea 1:N productos por `lineId`, opcional; la línea debe pertenecer a la categoría del producto.
- Grupo de precio 1:N productos por `priceGroupId`. Grupo e importe individual no pueden coexistir. Un producto puede no tener precio. Grupo inactivo produce precio vigente null, sin convertirlo a cero.
- Artículo comprado 1:N fuentes y 1:N conversiones. Conversión N:1 producto por `outputProductId`; el par artículo/producto es único. Se permiten varios productos alternativos relacionados con un artículo.
- Proveedor 1:N fuentes por `supplierId`. Producto y proveedor se relacionan en v2 por producto ← conversión → artículo ← fuente → proveedor. No existe un `supplierId` directo en el modelo de producto.
- Fuente y conversión tienen overrides por par `source.id` / `conversion.id`; ambos deben pertenecer al mismo artículo. El rendimiento efectivo es override, luego rendimiento base, luego pendiente.
- Proveedor 1:N compras; compra 1:N renglones. Cada compra modificada conserva snapshots de versiones anteriores en `revisions`, potencialmente anidados en información histórica. No sumar revisiones como compras adicionales.
- Fuente 1:N costos informados y renglones de compra. Los snapshots de conversiones fijan los destinos conocidos en ese momento. Una compra antigua puede tener producto directo sin la estructura v2: no reconstruir destinos por nombre.
- Venta 1:N renglones, producto 1:N renglones de venta. Un producto no puede repetirse dentro de una venta. El renglón de venta no tiene un ID autónomo creado por el código: no inventar un ID de negocio al importarlo.
- `group` de compras/ventas es agrupación histórica de presentación, no prueba suficiente de una FK actual a categoría o línea. Igual precaución con `priceGroupIdSnapshot` y nombres históricos.

### Presentaciones, modalidades y resultados calculados

`SOURCING_TYPES`: `READY_TO_USE`, `BASE`, `HYDRONEO`, `CONCENTRATE`, `OTHER`. Bases, concentrados e hidroneos son modalidades de artículo, no tablas ni existencias separadas en el código.

Unidades en [units.js](../src/utils/units.js): `litro`, `mililitro`, `kg`, `gramo`, `pieza`, `garrafa`, `envase`, `botella`, `bolsa`, `porron`. Solo hay conversión automática entre unidades de la misma dimensión: L/mL y kg/g; cada tipo de envase tiene dimensión propia. No se deduce el contenido de una garrafa o botella por el nombre. `purchaseQuantity=null` indica contenido no informado o compra a granel según contexto, nunca cero.

Un rendimiento configura cantidades de entrada y salida. Puede estar pendiente en modalidades de transformación. `READY_TO_USE` solo admite equivalencia directa de unidades compatibles. La salida teórica de compra y el costo efectivo se calculan con la regla capturada; **no existen movimientos de producción ni un libro de inventario en el dominio inspeccionado**. Comprar concentrado no crea existencias de producto terminado. Varias conversiones son destinos alternativos; no sumar sus salidas como producción simultánea.

### Costos, precios y reportes

[supplyModelAnalytics.js](../src/utils/supplyModelAnalytics.js) combina compras no anuladas y costos informados. Ordena por fecha y timestamp; conserva el criterio actual de desempate. Para referencia compara última compra con último costo informado no vencido; en empate de fecha entre ambos prioriza compra. Si el último costo informado está vencido, el código no busca automáticamente otra cotización anterior vigente.

El comparador puede proyectar un costo informado con el rendimiento actual; la compra usa conversiones históricas realmente capturadas. El historial visible conserva snapshots históricos. Preservar ambas perspectivas; no actualizar retrospectivamente compras al cambiar una conversión.

[reportAnalytics.js](../src/utils/reportAnalytics.js) calcula cobertura, modalidades, dependencias, oportunidades, rendimientos pendientes/variables y gasto de compras por periodo/proveedor/artículo. `purchaseReport` excluye anuladas y usa importes/nombres históricos; agrupa cantidades por unidad. No hay entidad persistida «reporte». Las ventas tienen su página/historial; no se asume que ReportsPage incluya analítica de ventas que no aparece en su código.

Nombres de visualización con prefijos de línea/categoría se calculan en `catalogUtils`. No guardar ese texto calculado como reemplazo del nombre original del producto.

## 5. Riesgos de migración y controles

| Riesgo comprobable en código | Control propuesto |
|---|---|
| Cargar la aplicación puede migrar/escribir, completar reset o deshacer importación pendiente | Extracción futura sin montar providers ni llamar loaders; diagnosticar marcas pendientes antes de interpretar datos |
| Clave ausente usa catálogos de `src/data/mock*`; `[]` significa catálogo vacío explícito | Guardar ausencia/null/lista vacía por separado. Registrar versión/hash de semillas y decidir explícitamente cómo preservar el catálogo efectivo; no rellenar faltantes silenciosamente |
| Sobre v1, configuración v3, modelo v2 son ejes distintos | Detectar las tres versiones; transformación explícita sobre copia y validación antes de persistir |
| `calcquim_purchases` puede coexistir con sobre actual | Mantener archivo antiguo separado; no concatenar ni duplicar compras por tener IDs coincidentes |
| IDs numéricos, cadenas numéricas, UUID y prefijos `article:`, `conversion:`, `direct:` | Conservar valor y tipo original; detectar ambigüedad; no exigir UUID ni renumerar |
| Normalizaciones actuales usan Number, String o igualdad estricta según función | Registrar equivalencias permitidas y casos ambiguos; no unificar automáticamente `1`, `"1"` y `"01"` |
| Validadores tienen diferente profundidad; un sobre válido puede contener inconsistencias de relaciones | Ejecutar diagnóstico estructural y cruzado; staging conserva todo, promoción bloqueada si hay errores sin resolver |
| Cambios de catálogo/rendimiento alteran proyecciones actuales | Snapshots inmutables e historial aparte del catálogo vigente |
| Revisiones y conversiones pueden multiplicar importes al hacer joins | Agregar al nivel correcto; distinguir versión vigente, revisión y destino alternativo |
| JavaScript usa coma flotante y redondeos por renglón | Preservar números históricos; contrato decimal y pruebas de paridad antes de cambiar cálculo |
| Tickets como data URL consumen localStorage | Conservar bytes y hash; almacenamiento binario local en DB con respaldo conjunto |
| Diario no incluido en respaldo original | Verificar/exportar diario por mecanismo de recuperación separado antes de una extracción futura; no restaurarlo como estado operativo nuevo |
| Campos desconocidos/ausentes frente a null | Archivo crudo inmutable y mapa de presencia; no descartar propiedades ni generar timestamps históricos |
| Doble escritura navegador/DB permite divergencia | Un solo escritor por conjunto de dependencias; ningún fallback silencioso a localStorage |

El respaldo original actual enumera `Object.values(STORAGE_KEYS)` y **no incluye** `IMPORT_JOURNAL`. Su doble lectura detecta algunos cambios, pero no es una transacción global ni detecta toda secuencia de cambio y reversión. No ejecutarlo durante una restauración/reset. Excel es exportación interpretada para lectura, no un respaldo reversible completo.

## 6. Diseño relacional propuesto

Esta sección define un contrato de esquema; no se ejecutó SQL. Operación normalizada; archivo original y snapshots históricos se conservan deliberadamente para trazabilidad. Las tablas técnicas aquí propuestas no representan entidades de negocio ya existentes.

### Convenciones de tipos y nulabilidad

- `CID`: `bigint`, positivo y dentro del entero seguro JavaScript (hasta 9007199254740991), para IDs de catálogo. Importación conserva ID crudo y tipo en procedencia; la API compatible entrega los números esperados por el catálogo actual. Una cadena numérica no se convierte sin comprobar identidad y registrar la transformación.
- `EID`: `text`, no vacío, para IDs de abastecimiento, compras y ventas. Preserva UUID y prefijos. Los raros IDs numéricos se conservan con tipo original en procedencia y el serializador compatible; colisiones al textualizar bloquean promoción. Los IDs nuevos pueden ser UUID como texto.
- `N`: `numeric` sin escala fija para cantidades, costos unitarios, precios y valores históricos. Evita redondear al importar números que el código admite sin límite de decimales. Rechazar NaN/infinito y aplicar positivos/no negativos según campo. No usar `money`, `real` o `double precision` como fuente económica. PostgreSQL documenta `numeric` como decimal exacto: [tipos numéricos](https://www.postgresql.org/docs/current/datatype-numeric.html).
- `D`: `date` para fechas de negocio; `T`: `timestamptz` para instantes. Mantener cadena original en archivo; no convertir fecha de negocio a UTC desplazando el día. Reglas de «hoy» con `America/Mexico_City` para la instalación objetivo.
- `U`: `text` con FK a `units.code`; `J`: `jsonb` para snapshots, extensiones y procedencia. JSONB no conserva bytes ni orden textual: la copia exacta es `raw_value text`.
- `?` indica columna nullable; el resto es NOT NULL salvo campos históricos cuyo dato esté ausente: estos se admiten como null con presencia registrada, nunca se completan con valores inventados. Campos obligatorios faltantes impiden promoción. Banderas históricas ausentes requieren conservar ese hecho y representar el comportamiento efectivo del frontend en el adaptador, no fingir un valor capturado.
- Tablas mutables llevan `row_version bigint NOT NULL` (contador técnico), y `position integer` por colección para recuperar orden original. Los detalles tienen `ordinal integer` no negativo. Son metadatos técnicos, no nuevos IDs de negocio.

### Catálogo y abastecimiento

| Tabla | Columnas propuestas | Claves y reglas |
|---|---|---|
| `units` | `code text`, `label text`, `dimension text`, `factor N` | PK code; factor >0. Semillas exclusivamente del código, con alias en adaptador; no crear conversiones adicionales |
| `categories` | `id CID`, `name text`, `name_key text`, `active boolean?`, `use_as_product_prefix boolean?`, `color_key text?`, position, row_version | PK id; unique name_key; nombre no vacío |
| `product_lines` | `id CID`, `category_id CID`, `name text`, `name_key text`, `active boolean?`, position, row_version | PK id; FK categoría; unique(category_id,name_key), unique(id,category_id) |
| `price_groups` | `id CID`, `name text`, `name_key text`, `price N`, `active boolean?`, position, row_version | PK id; unique name_key; price >=0 |
| `products` | `id CID`, `name text`, `name_key text`, `category_id CID?`, `line_id CID?`, `unit U`, `active boolean?`, `available boolean?`, `price_group_id CID?`, `price N?`, position, row_version | PK id; FKs categoría/grupo; FK compuesta (line_id,category_id) → líneas; CHECK línea implica categoría; CHECK grupo y precio no simultáneos; price >=0 si existe |
| `suppliers` | `id EID`, `name text`, `name_key text`, `active boolean`, `phone text?`, `address text?`, `maps_url text?`, `notes text?`, `created_at T?`, `updated_at T?`, position, row_version | PK id; unique name_key; URL validada por servicio conforme al validador actual |
| `purchased_items` | `id EID`, `name text`, `sourcing_type text`, `unit U`, `active boolean`, `material_reference text?`, `legacy_supply_item_id text?`, `created_at T?`, `updated_at T?`, position, row_version | PK id; modalidad limitada a cinco códigos; **sin unique por nombre**, no fusionar artículos |
| `supply_sources` | `id EID`, `purchased_item_id EID`, `supplier_id EID`, `purchase_unit U`, `purchase_quantity N?`, `presentation text?`, `notes text?`, `active boolean`, `created_at T?`, `updated_at T?`, `identity_key text`, position, row_version | PK id; FK artículo/proveedor; cantidad >0 si existe; unique identity_key; unique(id,purchased_item_id), unique(id,supplier_id) |
| `supply_conversions` | `id EID`, `purchased_item_id EID`, `output_product_id CID`, `active boolean`, `input_quantity N?`, `input_unit U?`, `output_quantity N?`, `output_unit U?`, `created_at T?`, `updated_at T?`, position, row_version | PK id; FKs artículo/producto; unique(artículo,producto); unique(id,purchased_item_id); cuatro campos de rendimiento todos null o todos presentes y positivos |
| `source_yield_overrides` | `source_id EID`, `conversion_id EID`, `purchased_item_id EID`, cuatro campos de rendimiento obligatorios, `presentation_source_id EID?`, `presentation_quantity N?`, row_version | PK(source_id,conversion_id); FKs compuestas a fuente y conversión con artículo común; metadata presentación ambos null o ambos presentes, fuente de presentación = source_id y cantidad >0 |

`name_key` se obtiene con la misma normalización de `normalizeText` (minúsculas, NFD, sin diacríticos, espacios), no simplemente con `lower(name)`. Unique de productos: `(category_id,line_id,name_key)` con nulls tratados como iguales mediante `NULLS NOT DISTINCT` en una versión que lo soporte, o índices parciales equivalentes. No elimina originales que entren en conflicto: el diagnóstico detiene la promoción.

`identity_key` reproduce `sourceIdentity`: artículo, proveedor, unidad dimensional canónica, cantidad convertida con su regla actual de precisión y presentación normalizada. Es clave técnica calculada; no sustituye ID ni contenido original. Validarla en servicio y proteger unicidad en DB, incluidas fuentes inactivas. Un cambio de algoritmo requiere versión y prueba de compatibilidad.

Compatibilidad de dimensiones, igualdad READY_TO_USE, proveedor/artículo activos, bloqueo de cambio de identidad con historial, y reglas de activación de categoría/línea son validaciones transaccionales del servicio. No expresar restricciones entre filas mediante CHECK que consulte otras tablas. Para reforzar coherencia de cambios por acceso fuera de API, usar triggers específicos o restringir DML a los comandos del servicio; definirlos en implementación.

### Historial de compras, costos y ventas

| Tabla | Columnas propuestas | Claves y reglas |
|---|---|---|
| `supplier_costs` | `id EID`, `source_id EID`, `supplier_id EID`, `supplier_name_snapshot text?`, `price N`, `price_quantity N`, `price_unit U`, `quoted_at D`, `valid_until D?`, `created_at T?`, `snapshot J`, `extensions J`, position | PK id; FK (source_id,supplier_id) a fuente; precio >=0, cantidad >0, vigencia >= cotización; append-only |
| `purchases` | `id EID`, `supplier_id EID`, `supplier_legacy_label text?`, `supplier_name_snapshot text?`, `date D`, `reference text?`, `notes text?`, `total N`, `created_at T?`, `updated_at T?`, `voided_at T?`, `extensions J`, position, row_version | PK id; FK proveedor; total >=0; referencia **no única**, el código no la exige |
| `purchase_items` | `purchase_id EID`, `ordinal integer`, `legacy_item_id EID?`, `source_id EID?`, `purchased_item_id EID?`, `product_id CID?`, `output_product_id CID?`, `direct_product_id CID?`, `name text`, `unit U`, `quantity N`, `cost_mode text?`, `cost N?`, `unit_cost N?`, `total N`, `effective_cost N?`, `effective_unit U?`, `snapshot J`, `group_snapshot J?`, `extensions J` | PK(compra,ordinal); unique parcial(compra,legacy_item_id) cuando existe; FKs explícitas cuando resueltas; cantidad >0, costos >=0; modo unit/total o null histórico. No asumir ID global del detalle |
| `purchase_revisions` | `purchase_id EID`, `revision_path text`, `parent_revision_path text?`, `ordinal integer`, `snapshot J` | PK(compra,revision_path); FK compra y FK al padre de la misma compra; path técnico preserva anidamiento/orden; snapshot íntegro e inmutable, incluye detalles y foto histórica |
| `purchase_receipts` | `purchase_id EID`, `name text`, `mime_type text`, `content bytea`, `sha256 text`, `original_data_url text?` | PK/FK compra; 0..1 foto vigente; JPEG, límites equivalentes a `receiptValid`; conservar bytes, nombre y original para round-trip |
| `sales` | `id EID`, `folio text?`, `date D`, `payment text?`, `notes text?`, `customer_snapshot J?`, `total N`, `created_at T?`, `voided_at T?`, `extensions J`, position, row_version | PK id; unique parcial folio si no vacío; total >=0; nuevos pagos: Efectivo/Transferencia/Tarjeta; no inventar cliente ni tabla customers |
| `sale_items` | `sale_id EID`, `ordinal integer`, `product_id CID`, `name text`, `product_name_snapshot text?`, `price_group_id_snapshot CID?`, `unit U`, `price N`, `quantity N`, `entry_mode text?`, `requested_amount N?`, `subtotal N?`, `discount_rate N?`, `discount N?`, `amount N`, `group_snapshot J?`, `extensions J` | PK(venta,ordinal); unique(venta,product_id); FKs venta/producto; cantidad >0, importes >=0; snapshot grupo de precio no tiene FK obligatoria al catálogo actual |

Los campos de snapshot de compra/costo conservan `supplyNameSnapshot`, `productNameSnapshot`, `productUnitSnapshot`, `supplierNameSnapshot`, `sourcingType`, `purchaseUnit`, `purchaseQuantity`, `presentation`, `yield`, `purchasedItemId`, `conversionSnapshots`, y cualquier propiedad adicional. No se reconstruyen a partir del catálogo actual. Las columnas operativas de detalle se cotejan con el snapshot al escribir.

Las revisiones y snapshots se guardan como documentos históricos inmutables, no como catálogos actuales normalizados. Si se necesitan consultas históricas por conversión, añadir proyecciones derivadas `purchase_item_conversion_snapshots` y `supplier_cost_conversion_snapshots`, con PK del propietario + ordinal y campos capturados, sin sustituir el snapshot original ni inventar referencias. No son requisito para sustituir la persistencia: inicialmente el servicio puede leer esos arrays del snapshot. Nunca sumar importes por cada conversión.

Histórico con relación explícita huérfana: conservar referencia original en staging/snapshot y bloquear promoción operativa hasta resolverla con evidencia. No crear un proveedor o producto ficticio para satisfacer una FK. Ausencia legítima de vínculo en compra antigua admite null; un ID presente sin entidad no equivale a ausencia legítima.

### Tablas técnicas propuestas

| Tabla | Columnas y restricciones |
|---|---|
| `document_counters` | `name text PK`, `last_value bigint >=0`; contador transaccional de folios, no renumera documentos |
| `idempotency_requests` | `operation_scope text`, `request_key text`, `request_hash text`, `response_status integer`, `response_body J`, `created_at T`; PK(scope,key); respuesta y operación en misma transacción |
| `migration_runs` | `id uuid PK`, `source_sha256 text UNIQUE`, `captured_at T?`, `code_revision text`, `schema_version text`, `status text`, `validated_at T?`, `promoted_at T?`; estados explícitos |
| `migration_raw_entries` | `run_id uuid FK`, `storage_key text`, `raw_value text?`, `sha256 text?`; PK(run,key); null representa clave ausente, no JSON null interpretado |
| `migration_records` | `run_id uuid FK`, `collection text`, `record_path text`, `original J`, `original_id J?`, `presence J`, `target_key text?`, `status text`; PK(run,collection,path); incluye sobre/versiones, archivo legacy y supplyMigration |
| `migration_issues` | `run_id uuid FK`, `issue_number bigint`, `collection text`, `record_path text`, `code text`, `resolution J?`; PK(run,issue_number); sin volcar contenido de negocio a logs |
| `dataset_state` | `singleton boolean PK CHECK(singleton)`, `generation uuid`, `revision bigint`, `source_versions J`; controla generación y lectura consistente |

No agregar timestamps creados con `now()` a registros históricos ausentes: los timestamps técnicos del proceso se distinguen de los del negocio. Las nuevas operaciones sí reciben tiempos del servidor.

### Índices y borrados

Además de PK/UNIQUE: índices de todas las FKs de consulta/bloqueo (`products.category_id`, `products.line_id`, `products.price_group_id`, `supply_sources.supplier_id`, `supply_sources.purchased_item_id`, `supply_conversions.output_product_id`, `source_yield_overrides.conversion_id`, referencias de detalles). Índice de costos `(source_id,quoted_at DESC,created_at DESC)`; compras `(supplier_id,date DESC)` y `(date DESC)`; ventas `(date DESC)`; detalles `(source_id,purchase_id)` y `(product_id,sale_id)`. Índices parciales de documentos no anulados si las mediciones posteriores lo justifican. No agregar GIN a todos los JSONB de forma preventiva.

`ON DELETE RESTRICT` para catálogos, proveedores, fuentes, conversiones e historial; preferir inactivar cuando existe uso. Compras/ventas se anulan. Borrado de agregados económicos no se expone. Restricciones no deben permitir que el borrado de un catálogo arrastre historia. El mantenimiento excepcional de tablas técnicas tiene ciclo separado.

### Dinero, cantidades, identificadores y transacciones

Importar la representación decimal de cada número sin recalcularla; validar rango antes de convertir al frontend. La API nueva transportará decimales como cadenas; un adaptador explícito mantendrá temporalmente los Number requeridos por las funciones actuales, con límites verificados. No cambiar globalmente el parser `numeric` de pg para convertir todo a Number.

Nuevos documentos deben conservar los redondeos de `purchaseUtils` y `salesUtils`: compra redondea total de renglón a centavos y luego total; venta calcula subtotal/descuento en centavos y aplica 15% para litros desde 10 L, también con modo por monto y su umbral específico. Cantidades fraccionarias se admiten: el código no exige enteros para piezas. Precio cero es distinto a faltante. No endurecer la escala de históricos a dos decimales; validar y registrar discrepancias sin corregirlas. Si se adopta librería decimal, demostrar equivalencia con las reglas JavaScript incluidas sus fronteras de redondeo antes de activarla.

Los totales históricos se comparan según la tolerancia existente de aproximadamente 0.011, con diferencias de frontera entre validadores; no se corrigen para hacerlos coincidir. Para nuevas operaciones el servicio calcula todos los importes y guarda cabecera/detalles atómicamente; un trigger diferido puede reforzar suma de detalles y presencia de al menos un renglón. No aceptar del cliente un total sin comprobarlo.

Catálogo: importar IDs explícitos; futuras secuencias bigint de cada catálogo se inicializan por encima del máximo importado, sin reutilizar eliminados. No usar MAX+1 en peticiones concurrentes. Conservar original en procedencia, incluida diferencia string/number. Abastecimiento/historial: text sin conversión obligatoria a UUID. Detalles sin ID: ordinal técnico, manteniendo ausencia de ID de negocio. Folios originales intactos; iniciar contador en máximo entre folios V- reconocidos y secuencia heredada válida; valores inválidos detienen diagnóstico. Incrementar contador bajo bloqueo de fila y UNIQUE folio.

Cada comando usa BEGIN/COMMIT/ROLLBACK en **el mismo cliente** tomado del pool, liberado en finally, como exige [node-postgres](https://node-postgres.com/features/transactions). Transacción única para:

1. Crear/editar compra, conservar revisión y ticket, y crear producto/artículo/conversión/fuente cuando corresponda al flujo de producto terminado.
2. Crear fuente y costo inicial; configurar lotes de artículos/fuentes/conversiones/rendimientos.
3. Registrar venta, validar precio/unidad vigentes, asignar folio y guardar idempotencia.
4. Anular documentos y actualizar versión; cambiar clasificación por lote sin estados parciales.
5. Promover una importación validada y ajustar contadores.

Bloqueos de filas involucradas y de contador, orden estable de bloqueo y `row_version` para evitar actualizaciones perdidas. Comprobar referencias/estados/precios dentro de la transacción; repetir solo conflictos transitorios, de forma acotada y con idempotencia. Lecturas conjuntas para reportes/exportación en snapshot `REPEATABLE READ READ ONLY` y `today` fijo.

## 7. Diseño inicial de Express en localhost

Estructura propuesta, todavía no creada:

```text
server/
  src/app.js                  # composición de middleware y routers
  src/server.js               # escucha loopback y cierre ordenado
  src/config/                 # variables de entorno validadas
  src/routes/                 # métodos, paths y validadores
  src/controllers/            # HTTP → comando/consulta → respuesta
  src/services/               # reglas de negocio y transacciones
  src/validation/             # contratos estructurales y de dominio
  src/repositories/           # SQL parametrizado, sin req/res
  src/db/                     # pool, transacciones y versiones de esquema
  src/middleware/             # errores, sesión local, versiones, idempotencia
  tests/                      # solo datos sintéticos
  migrations/                 # futuras migraciones revisables
  postman/                    # futura colección sin secretos ni datos reales
```

Base propuesta: `http://127.0.0.1:3001/api/v1`; puerto pendiente de disponibilidad. Frontend sigue React/Vite. En desarrollo, proxy de Vite o CORS limitado al origen exacto elegido; localhost y 127.0.0.1 son orígenes distintos para localStorage. No cambiar de origen antes de extraer los datos originales.

API escucha `127.0.0.1` (y solo ::1 si se configura conscientemente), nunca 0.0.0.0. PostgreSQL configurado posteriormente con `listen_addresses` solo loopback, `pg_hba.conf` restringido a base/rol local, autenticación con contraseña y rol de aplicación sin superusuario. [La documentación de conexión](https://www.postgresql.org/docs/current/runtime-config-connection.html) distingue la interfaz de escucha de las reglas de autenticación. No se modificó ninguna configuración ahora.

Credenciales en entorno del servidor o almacenamiento local de secretos, fuera de Git; nunca `VITE_*`, bundle frontend, Postman compartido o logs. Diferenciar rol de aplicación de rol administrador/migrador. Validar Host y Origin para escrituras, requerir sesión/token local para peticiones mutantes; CORS por sí solo no autentica. Postman usará token local privado, sin sincronizar secretos con servicios en nube.

### Rutas propuestas

| Método y ruta relativa | Función |
|---|---|
| `GET /health/live`, `GET /health/ready` | Proceso disponible y DB/esquema listos; sin credenciales ni configuración en respuesta |
| `GET /dataset` | Snapshot compatible de catálogo/abastecimiento/ventas, generación y revisión; sin exponer diario operativo |
| `GET /categories`, `/product-lines`, `/price-groups`, `/products`, `/suppliers`, `/purchased-items`, `/supply-sources`, `/supply-conversions` | Listas filtradas; permitir activos/inactivos y paginación sin truncamiento silencioso |
| `GET /{recurso}/:id` | Detalle para los ocho recursos anteriores |
| `POST /{recurso}`, `PATCH /{recurso}/:id` | Crear/editar con reglas del catálogo/dominio; inactivación mediante PATCH |
| `DELETE /categories/:id`, `/product-lines/:id`, `/price-groups/:id`, `/products/:id`, `/suppliers/:id`, `/supply-sources/:id` | Solo si el dominio actual lo permite y no hay referencias/historial. Sin cascadas; conversiones/artículos inicialmente se inactivan |
| `POST /products/batches`, `PATCH /products/batches` | Altas/ediciones de producto por lote, manteniendo contrato explícito de duplicados aceptados/rechazados del flujo actual |
| `POST /supply-configurations/batches` | Configurar artículos/conversiones/fuentes y, si aplica, costos; soporta flujo de productos terminados |
| `PATCH /supply-conversions/yields/batch` | Editar solo rendimientos de relaciones existentes |
| `PUT /supply-sources/:id/yield-overrides/:conversionId` | Crear/reemplazar rendimiento específico; DELETE de esa misma ruta restablece herencia con validación |
| `GET /supplier-costs`, `POST /supplier-costs` | Historial y nuevo costo informado; filtro por fuente/proveedor/fecha |
| `GET /purchases`, `GET /purchases/:id`, `POST /purchases`, `PATCH /purchases/:id` | Historial, detalle, registro y edición con revisión; POST acepta compra de terminado y alta rápida en una operación |
| `GET /purchases/:id/revisions`, `GET /purchases/:id/receipt` | Historia y ticket; evitar descargar todas las fotos en listas |
| `POST /purchases/:id/void` | Anulación, sin borrar historial |
| `GET /sales`, `GET /sales/:id`, `POST /sales`, `POST /sales/:id/void` | Venta/anulación e historial; sin endpoint de edición de venta que hoy no existe |
| `GET /analytics/procurement`, `GET /analytics/reports`, `GET /reports/purchases` | Consultas derivadas con fecha de evaluación explícita y versión del dataset |
| `GET /exports/products`, `/exports/procurement`, `/exports/full` | Datos para Excel o archivo, desde snapshot consistente |
| `GET /backups/original` | Futuro archivo lógico versionado, generado desde DB; no fingir que contiene los bytes originales del navegador después de editar en DB |

Registrar rutas estáticas `batches`/`yields` antes de `:id`. Los IDs textuales viajan con codificación URL; no validar solo patrón UUID.

Inicialmente el comparador/reportes puede seguir calculando en frontend sobre el snapshot compatible; las rutas analíticas se activan cuando demuestren paridad. No crear tabla de reportes ni persistir costos derivados como nuevos costos informados. No proponer endpoints especializados móviles.

Administración de importación/restauración futura: herramienta local separada del CRUD ordinario, con vista previa, fingerprint, staging y promoción controlada. No exponer ahora `/reset` ni un reemplazo arbitrario de todo el dataset por POST. Si se necesita conservar el restablecimiento total de la aplicación, diseñarlo posteriormente como comando administrativo con respaldo previo y generación nueva; no implementarlo como cascada de DELETEs de la API.

### Contratos, errores y duplicados

Respuestas de consulta: `{data, meta: {generation, revision, nextCursor}}`, manteniendo campos y orden del adaptador. Mutaciones devuelven recurso actualizado y `ETag`; PATCH/DELETE/anulación requieren `If-Match`. Cliente de generación antigua recibe conflicto, equivalente a las protecciones de `resetEpoch` actuales.

Validación en capas: forma/tipos/tamaño, números finitos, fechas, unidades, referencias, reglas entre entidades y invariantes económicas. No permitir asignación masiva de IDs, totales derivados, snapshots o anulaciones por payload libre. Los históricos se importan por el canal de migración, no relajando el CRUD.

Error uniforme: `{error:{code,message,fields?,requestId}}`. Estados: 400 JSON/formato incorrecto, 401 sesión local ausente, 404 recurso inexistente, 409 duplicado/referencia usada/idempotencia incompatible, 412 versión antigua, 422 dominio inválido, 413 archivo/cuerpo excesivo, 503 DB no disponible, 500 inesperado. Middleware final de cuatro argumentos, siguiendo [manejo de errores de Express](https://expressjs.com/en/guide/error-handling/). Mapear códigos PostgreSQL; no devolver SQL, stack, parámetros, contraseñas, notas, fotos ni datos del negocio en logs. Logs técnicos con requestId/código/duración.

`Idempotency-Key` obligatorio para POST económicos y lotes. En la misma transacción, reservar PK(scope,key), comparar hash canónico del comando, escribir cambios y respuesta. Reintento idéntico devuelve la respuesta original sin crear compra/costo/venta adicional; misma clave con cuerpo distinto → 409. La reserva concurrente espera o responde conflicto temporal; nunca ejecuta dos veces. Conservar claves de operaciones económicas mientras puedan reintentarse, sin una caducidad corta que permita duplicación tardía. Folio UNIQUE, identidad de fuente UNIQUE y versiones son defensas complementarias. No deduplicar por importe, fecha, referencia comercial o nombre.

## 8. Transferencia sin pérdidas y corte gradual

Propuesta para fases posteriores; nada de lo siguiente se ejecutó en esta auditoría:

1. Congelar la revisión de código y documentar origen/perfil del navegador. Crear extracción cruda coherente bajo exclusión de escrituras, sin loaders; incluir mapa de claves, ausencia/null y marcas/diario. Si hay reset/import pendiente, detener y resolver por procedimiento de recuperación sobre copia; no interpretar estado intermedio como dataset final.
2. Guardar archivo original inmutable fuera del repositorio, con hash SHA-256, fecha y copias locales separadas. Identificar versión de semillas si alguna clave está ausente. No usar Excel como entrada de migración.
3. Diseñar y probar importador solo con datos sintéticos. Lectura estricta de versiones, conteos, IDs, referencias, tipos, fechas, fotos, números y campos desconocidos; generar incidencias sin contenido sensible en logs.
4. Cargar una copia en staging aislado de una DB de ensayo. Preservar las ocho claves de negocio, metadatos, migración interna original, archivo legacy y todos los snapshots. Generación nueva del destino separada de la original. Ninguna llamada a `migrateProcurement`, `repairPurchaseLinks` o `migrateSupplyModel` contra el navegador real.
5. Para modelos antiguos, transformación explícita y revisable en memoria/staging. Reutilizar reglas solo cuando no inventen identidad o datos. El migrador actual puede generar IDs por UUID: bajo la restricción de no inventar faltantes, registros sin identidad suficiente deben quedar pendientes; no copiar ese comportamiento automáticamente. Si el esquema nuevo necesita claves técnicas, etiquetarlas como técnicas y conservar ID de negocio ausente.
6. Resolver cada ambigüedad con evidencia y registrar decisiones por ruta de origen, nunca por similitud de nombres. Reintento de misma huella no duplica importación. No promover si quedan errores bloqueantes o pérdidas de campos sin clasificación.
7. Conciliar, ensayar restauración y revisar diferencias. La promoción del dataset validado y contadores debe ser atómica. La importación nunca elimina/modifica el origen.
8. Incorporar un adaptador de persistencia React detrás de las acciones actuales. Comenzar con lecturas de DB en modo comparación y navegador como único escritor; luego congelar escrituras para extracción final y validación del corte. No hay escritura espejo automática.
9. Cambiar a API como escritor de todo el agregado conectado: catálogo + abastecimiento + compras deben cambiar juntos cuando la compra puede crear producto. Ventas consulta los mismos precios/unidades del catálogo y debe participar en el corte o quedar temporalmente en lectura. «Gradual» significa capas y módulos preparados gradualmente, no partir una transacción entre localStorage y PostgreSQL.
10. Conservar localStorage y respaldos como evidencia del instante de corte. Tras nuevas escrituras en DB, volver al navegador antiguo perdería cambios: rollback requiere congelar y reconciliar esas operaciones o restaurar una DB validada, nunca un simple cambio de bandera a una copia vieja.

## 9. Respaldo y restauración

Hoy: `collectRawBackup` → JSON `application: CalcQuim`, `formatVersion:1`, `capturedAt`, `storage` con cadenas originales; `prepareBackupImport` valida y prepara; `applyBackupImport` compara baseline, guarda diario, cambia generación y aplica claves; recuperación revierte una restauración interrumpida. No se ejecutaron estas funciones. `dataExport`/`excelExport` producen hojas legibles con incidencias y cálculos, no sustituyen ese archivo original.

Después: respaldos lógicos locales de PostgreSQL en formato custom, antes/después de cada migración o actualización y con frecuencia según operaciones aceptables de pérdida. Mantener varias generaciones y copia en otro medio local: una sola carpeta en el mismo disco no cubre fallo del disco. Tickets en bytea quedan dentro del mismo respaldo. Incluir versión de esquema/aplicación, hash y conteos; roles/configuración necesarios en inventario separado sin contraseñas versionadas.

[pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html) permite snapshot consistente de una base; formato custom se restaura con [pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html). El dump de una base no incluye roles globales. Elegir herramientas compatibles con la versión realmente instalada al implementar.

Restaurar primero en DB nueva de ensayo, sin `--clean` sobre la base activa. Verificar esquema, filas, FKs, folios, documentos anulados, revisiones y hashes de fotos; ejecutar conciliación y smoke tests. Solo después planificar cambio de conexión con aplicación detenida y generación nueva para invalidar sesiones anteriores. Si hay error, mantener la base anterior intacta. No guardar dumps ni originales reales en Git; `.gitignore` ya excluye `.env`/`.env.*` salvo ejemplo, y `CalcQuim_*.json`/xlsx, pero otros nombres y archivos ya versionados requieren revisión antes de agregar entregables.

## 10. Dependencias necesarias, sin instalar ahora

| Elemento | Uso previsto |
|---|---|
| PostgreSQL local estable + psql + pg_dump + pg_restore | Motor, diagnóstico, respaldo/restauración; instalación manual posterior y versión comprobada |
| Express | HTTP, routers y middleware de errores |
| `pg` | Pool, SQL parametrizado y transacciones |
| Validador de esquemas, por ejemplo Zod | Contratos del servidor y variables de entorno |
| `cors`, solo si no se usa proxy de mismo origen | Lista exacta de orígenes permitidos |
| `decimal.js`, si se decide cálculo decimal en servidor | Precisión explícita después de pruebas de paridad, no cambio automático de reglas |
| Herramienta de migraciones, por ejemplo node-pg-migrate | Versionado y revisión de DDL; rol distinto de aplicación |
| `node:test` existente y Supertest para API | Pruebas sintéticas unitarias/integración |
| Postman local | Prueba manual/colección de contratos y reintentos; variables privadas, sin subir datos reales |

Node dispone de mecanismos para variables de entorno; dotenv es opcional, no requisito automático. No se necesita ORM para el diseño propuesto. Congelar versiones y lockfile del backend después de comprobar compatibilidad con Node y PostgreSQL instalados; no actualizar dependencias del frontend como parte de esta migración.

## 11. Propuesta Postman y pruebas de equivalencia

Crear posteriormente colección local con `baseUrl`, token privado, `generation`, `etag`, IDs capturados y claves de idempotencia; usar exclusivamente datos sintéticos identificables, en base de prueba. Ningún endpoint está implementado todavía y no se afirma que haya pasado pruebas HTTP.

Secuencia de la colección:

1. Liveness/readiness; petición sin sesión rechazada en escritura; Origin/Host no permitido rechazado.
2. Categoría → línea → grupo → producto; producto sin precio; precio cero; inactivos; línea de otra categoría rechazada.
3. Proveedor → artículo → fuente/presentación → conversión; costo informado con cantidad/unidad/fecha; fuente duplicada e incompatible rechazada.
4. Rendimiento pendiente, rendimiento base y override por fuente; READY_TO_USE directo; ninguna conversión automática de garrafa a litros sin regla.
5. Compra nueva con ticket sintético; edición conserva revisión; anulación conserva detalle; compra de terminado con alta rápida atómica; fallo de último renglón revierte todo.
6. Venta por cantidad y por monto; fronteras de 10 L y 15%; precio o unidad cambiado produce rechazo; folio asignado solo una vez.
7. Repetir POST con misma clave/cuerpo: mismo ID y un único registro; clave igual/cuerpo diferente: 409. Dos solicitudes simultáneas de venta reciben folios distintos.
8. PATCH con ETag viejo: 412; catálogo con historial no se borra; DB detenida: 503 sin fallback al navegador ni guardado aparente.
9. Consultar comparador, reportes y exportaciones con `today` fijo; verificar anexos fuera de listas; toda paginación recorrida.

Postman sirve para contratos y flujos, pero carreras y caídas entre pasos requieren integración automatizada contra una DB de ensayo. Usar tests sintéticos existentes como oráculo funcional tras revisar sus dependencias: `backup-import`, `data-export`, `data-session`, `catalog-integral`, `procurement-consistency`, `supply-model`, `source-yield-overrides`, `finished-product-flow`, `purchase-receipt`, `report-analytics` y demás relevantes. No se ejecutó la suite en esta fase documental.

### Evidencia exigida para aceptar una transferencia real

| Prueba | Criterio de aceptación |
|---|---|
| Integridad del original | Hash de archivo y de cada cadena cruda igual antes/después; ausencia vs cadena `null` vs `[]` conservada; localStorage original sin cambios |
| Conteos | Igualdad por colección, documentos vigentes/anulados, renglones, fotos, costos, conversiones, overrides y cada revisión; archivo legacy separado |
| Identidades | Igualdad de conjuntos de IDs, tipos originales, folios y referencias explícitas; sin renumeración, fusiones ni IDs de negocio nuevos para faltantes |
| Campos | Comparación por ruta de todos los campos, arrays y orden; unknown fields/presencia recuperables; transformaciones autorizadas con mapa reversible |
| Importes históricos | Coincidencia exacta de valores capturados por documento/renglón y totales por fecha/proveedor/estado. Diferencias preexistentes visibles, no «reparadas» |
| Cantidades y unidades | Cantidades originales iguales, agregados por unidad/dimensión; rendimientos/overrides equivalentes; ninguna existencia terminada creada al importar concentrados |
| Historia y fotos | Revisiones sin cambios, anulaciones intactas, snapshots históricos idénticos semánticamente y hash binario del ticket igual |
| Paridad funcional | Mismo precio vigente, disponibilidad, fuente de referencia, desempates, vencimientos, costos efectivos, márgenes, coberturas y gasto con mismo today y versión de reglas |
| Precisión derivada | Importes monetarios redondeados iguales en centavos; cantidades/costos derivados con tolerancia explícita por unidad y rango, nunca tolerancia amplia para ocultar pérdida. Definirla con sintéticos antes del ensayo real |
| Atomicidad y concurrencia | Fallos inducidos no dejan cabecera/detalle parcial; reintentos no duplican; versiones antiguas no sobrescriben; folios sin colisiones |
| Round-trip y restauración | Dataset reconstruido coincide campo a campo con fuente o mapa de transformación autorizado; dump restaurado en DB vacía pasa las mismas conciliaciones |

No basta con comparar suma global o número de productos. Conservar un acta de conciliación con hashes, conteos y códigos de diferencias, sin publicar contenido del negocio. Todas las pruebas de mutación o fallos se hacen sobre información sintética o copia aislada, nunca sobre el origen real.

## 12. Implementación por etapas y puertas de avance

| Etapa | Trabajo | Evidencia para avanzar |
|---|---|---|
| 1. Auditoría, esta entrega | Inventario y diseño, sin ejecutar migración | Documento revisable; incógnitas de datos reales explicitadas |
| 2. Entorno local | Confirmar/instalar manualmente PostgreSQL; loopback, roles y secretos; backend vacío y health | Versiones, conexión local y ausencia de exposición de red comprobadas |
| 3. Contratos y esquema | Migraciones revisadas, repositorios, validación, transacciones/idempotencia | Esquema y restricciones probados con sintéticos; ningún dato real |
| 4. Dominio y API | Catálogo, abastecimiento, compras, ventas, exportaciones; conservar reglas actuales | Suite sintética + Postman + pruebas concurrentes y de rollback |
| 5. Importación ensayada | Extractor seguro, staging, diagnóstico, conciliación y restore en copia | Cero pérdidas/ambigüedades sin resolver; ensayo repetible e idempotente |
| 6. Adaptador React | Lecturas comparadas, manejo de errores/versiones y preparación del corte conectado | Compras/productos/comparador/reportes/ventas con paridad; sin doble escritura |
| 7. Corte local | Respaldo final, congelamiento, promoción atómica y cambio de escritor | Conciliación final aceptada, restauración demostrada, origen intacto |
| 8. Operación | Respaldos, restauraciones periódicas y observación técnica | Datos nuevos protegidos y rollback que no pierda operaciones posteriores |

Pendientes antes de SQL definitivo: instalación/versionado real de PostgreSQL; diagnóstico autorizado de copia; presencia de claves/diarios/semillas; versión del sobre y modelo; IDs mixtos, huérfanos, campos extra y precisión; volumen/tickets para dimensionar límites; origen/puerto final; objetivo de pérdida y tiempo de recuperación. No requieren cambios en esta fase y no se resolvieron con suposiciones.

## 13. Referencias principales del repositorio

- Persistencia y arranque: `src/services/catalogStorage.js:8`, `src/context/useCatalogCollection.js:6`, `src/context/CatalogContext.jsx:39`, `src/context/ProcurementProvider.jsx:5`, `src/services/procurementStorage.js:64`, `src/services/salesStorage.js:26`, `src/ApplicationRoot.jsx:19`, `src/services/dataSession.js:1`.
- Dominio y relaciones: `src/services/catalogValidation.js:7`, `src/services/procurementDomain.js`, `src/services/supplyModel.js:10`, `src/services/supplyModel.js:60`, `src/services/supplyModel.js:73`, `src/services/supplyModel.js:95`, `src/services/supplyYieldBatch.js:42`, `src/services/finishedProductFlow.js:43`.
- Cálculos y reportes: `src/utils/units.js:3`, `src/utils/procurementUtils.js:20`, `src/utils/procurementUtils.js:68`, `src/utils/purchaseUtils.js:1`, `src/utils/salesUtils.js:8`, `src/utils/supplyModelAnalytics.js:5`, `src/utils/reportAnalytics.js`, `src/pages/ReportsPage.jsx:61`.
- Respaldo y administración: `src/services/rawBackup.js:5`, `src/services/exportSnapshot.js:11`, `src/services/dataExport.js:268`, `src/services/excelExport.js:28`, `src/services/backupImport.js:14`, `src/services/backupImport.js:50`, `src/services/dataReset.js:7`, `src/services/purchaseReceipt.js:1`.

Las referencias externas enlazadas sustentan decisiones técnicas generales; el inventario y las relaciones se fundamentan en el código local. No se verificó información del negocio con fuentes externas.
