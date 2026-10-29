# Persistencia PostgreSQL de ensayo — 28 de octubre de 2026

Documento histórico de la fase sintética. El estado vigente y el inicio operativo se describen en [PostgreSQL operativo](POSTGRESQL_OPERATIVO.md); no ejecutar los ejemplos de ensayo contra el puerto operativo.

La aplicación dispone de persistencia funcional en PostgreSQL local, **desactivada en el inicio habitual**. No se importó el respaldo original, no se abrió la aplicación habitual ni se accedió a su localStorage. No hay cambios móviles, de firewall o de exposición de red, commits ni pushes.

## Inicio explícito

Se conservan `npm.cmd run dev` y `npm.cmd start` en sus modos previos: navegador y health-only, respectivamente. Para probar almacenamiento PostgreSQL, usar dos terminales:

```powershell
# Terminal 1: backend sintético. Se usó 3003 porque ya había un proceso en 3001.
cd D:\ReactApps\calcQuim-admin\server
npm.cmd run migrate
$env:PORT = '3003'
npm.cmd run start:sandbox
```

```powershell
# Terminal 2: React de ensayo, origen independiente
cd D:\ReactApps\calcQuim-admin
$env:CALCQUIM_API_PORT = '3003'
npm.cmd run dev:postgres
```

Abrir `http://127.0.0.1:5174` y pulsar **Abrir entorno PostgreSQL de ensayo**. Todos los datos mostrados proceden de PostgreSQL; no hay fallback a localStorage ni semillas automáticas. Un aviso permanece visible. Detener ambos procesos con Ctrl+C. El proceso que ya existía en 3001 no se modificó ni se detuvo. Si 3001 está libre, se pueden omitir ambas variables de puerto y usar el valor predeterminado.

`build:postgres` genera `dist/postgres-sandbox/`, separado del build habitual. No publicar ni sustituir el frontend habitual por ese build. No se activó un corte definitivo ni una opción oculta para seleccionar PostgreSQL en el navegador habitual.

## Implementación

- Migraciones `001_core`, `002_integrity`, `003_rehearsal`, `004_trigger_path`, con SHA-256, bloqueo transaccional y registro de versión. `npm.cmd run migrate -- down` revierte solo la última y se niega si hay registros operativos o fuentes archivadas. No se hace downgrade destructivo de información para «hacer reversible» una migración.
- Esquema `calcquim_sandbox` en `calcquim_dev`, separado de `public`. En `calcquim_test` se restauró una copia sintética en el mismo nombre de esquema. Las pruebas crean y eliminan únicamente esquemas UUID propios. `public` no fue modificado.
- Tablas para catálogo, categorías, líneas, grupos de precio, unidades, proveedores, artículos, fuentes, conversiones, overrides de rendimiento, costos informados, compras/detalles/revisiones/tickets y ventas/detalles. Las cantidades e importes usan `numeric`; fechas de negocio usan `date`. FKs, unicidades, positivos/no negativos y totales diferidos se comprueban en DB.
- Campos originales y snapshots se conservan en JSONB por registro, junto a columnas relacionales de consulta/integridad. Compras y ventas se reconstruyen de cabecera y detalles; revisiones conservan su documento íntegro, incluidos anidamientos y fotos. Los tickets vigentes llevan hash de los bytes JPEG. No hay una tabla única con todo el negocio como JSON.
- Reglas de catálogo extraídas a `src/services/catalogDomain.js`, utilizadas por el provider habitual y por Express. Se reutilizan los servicios actuales de compras, artículos, lotes, conversiones, rendimientos, costos y ventas; no se escribió una versión alternativa de sus reglas.
- SQL en repositorios; reglas y transacciones en servicios; controladores y routers HTTP separados. Se conservan descuentos, redondeos, snapshots y cálculo actual del comparador/reportes.
- Cada comando bloquea la fila del dataset, valida generación/revisión, aplica reglas y guarda de forma atómica con su clave de idempotencia. Los contadores no reutilizan IDs eliminados; los folios de venta no colisionan. Una respuesta perdida se puede reintentar incluso tras recargar: React guarda solo hash/clave técnica en sessionStorage del origen de ensayo, nunca payload de negocio. No hay una segunda fuente principal de datos en el navegador.
- React conserva las páginas y formularios existentes; las acciones aceptan respuestas asíncronas y solo cierran tras confirmación de guardado. En el modo de ensayo, ventas y exportaciones consumen el contexto remoto. El inicio habitual sigue montando sus providers anteriores.

No se crean existencias ni producción al comprar bases, concentrados o hidroneos. Las conversiones se conservan como destinos alternativos; no se suman como producción simultánea.

## API

Con `start:sandbox` están disponibles:

- `GET /api/v1/dataset`: snapshot consistente, revisión, generación y contadores.
- `GET`, `POST`, `PATCH /:id`, y `DELETE /:id` cuando el dominio lo permite, en `categories`, `product-lines`, `price-groups`, `products`, `suppliers`, `purchased-items`, `supply-sources`, `supply-conversions`. Artículos/conversiones se inactivan y no tienen borrado físico expuesto. No se modifican costos históricos por PATCH.
- `GET`, `POST /supplier-costs`; `GET`, `POST`, `PATCH /purchases/:id`; `GET`, `POST /sales`; anulaciones en `POST /purchases/:id/void` y `/sales/:id/void`. GET de detalle por ID para esos recursos.
- `POST /api/v1/commands/:name`: las acciones actuales de formularios y lotes, con `{args:[...]}`. Incluye configuración compuesta de artículos/fuentes/conversiones/costos, alta rápida de producto terminado dentro de compra y lotes de rendimientos. La lista permitida está en `server/src/services/commands.mjs`; no permite reemplazar arbitrariamente el dataset.
- `GET /api/v1/analytics/procurement`, `/analytics/reports` y `/analytics/purchases`; parámetros de fecha para reproducibilidad.

Toda mutación requiere `X-CalcQuim-Mode: synthetic`, `If-Match: revisión`, `X-Dataset-Generation: generación`, `Idempotency-Key: clave única`. No regenerar la clave al reintentar una operación de resultado desconocido. Misma clave/cuerpo reproduce resultado sin duplicar; misma clave/cuerpo diferente devuelve 409. Datos antiguos devuelven 412; validación 422; relaciones/duplicados 409; DB no disponible 503. No se muestran SQL, stack ni secretos.

API/DB/Vite escuchan solo en loopback. El proxy de ensayo apunta exclusivamente a 127.0.0.1. No se habilitó CORS para sitios externos. Los hosts externos y escrituras sin cabecera de ensayo se rechazan. Esto es un entorno local sintético; autenticación de negocio, permisos mínimos definitivos de producción y acceso LAN pertenecen a fases posteriores.

## Postman

Importar `server/postman/CalcQuim-persistence.postman_collection.json`, establecer `baseUrl=http://127.0.0.1:3003` para los comandos anteriores y ejecutar en orden. La colección captura IDs, generación y revisión, asigna claves y comprueba catálogo, fuentes, conversiones, costos, comparador, compra/reintento/edición, venta, anulaciones, protección de referencias y reportes. Cada ejecución usa nombres sintéticos únicos. No incluye contraseñas ni datos reales.

La colección fue ejecutada automáticamente contra Express y PostgreSQL reales en un esquema de prueba aislado, interpretando sus scripts pre-request/test. La colección health-only previa sigue disponible y su estado esperado ahora puede configurarse a 200.

## Respaldo y restauración sintéticos

Desde `server/`, con desarrollo configurado:

```powershell
npm.cmd run backup:sandbox -- mi-ensayo.dump
npm.cmd run restore:check -- mi-ensayo.dump
```

El primer comando usa `pg_dump` y genera dump/manifiesto en `server/artifacts/`, ignorado por Git. No sobrescribe archivos existentes y verifica que la revisión no cambió durante el respaldo. El segundo selecciona únicamente `calcquim_test`, verifica hashes, exige que el esquema de destino **no exista**, restaura transaccionalmente con `pg_restore` sin `--clean` y concilia el snapshot completo. Si ya existe `calcquim_sandbox` en pruebas, se niega a borrarlo o reemplazarlo. No eliminarlo para continuar sin revisar antes qué contiene. El test automatizado hace el ensayo en un esquema UUID de su propiedad.

En esta sesión, `synthetic-validation.dump` se creó y restauró satisfactoriamente. Se compararon datos completos, contadores, generación, revisiones y fotos. El script asume las herramientas en `C:\Program Files\PostgreSQL\18\bin`; `PG_BIN_PATH` permite otra ruta local. Nunca se pasan contraseñas en argumentos de consola ni se guardan en manifiestos.

## Importación futura del original: herramienta preparada, no ejecutada con datos reales

```powershell
# Solo cuando se autorice leer una copia del respaldo real:
npm.cmd run import:preview -- RUTA_EXPLICITA_AL_ARCHIVO
```

La prevalidación imprime únicamente hash, conteos y códigos de incidencias. No conecta a DB, no modifica el archivo ni localStorage, no aplica semillas, no inventa IDs o relaciones. Detecta claves ausentes, operaciones de almacenamiento pendientes, referencias inválidas, precisión numérica perdida y necesidad de revisión de modelos antiguos/archivo legacy. Campos desconocidos y valores originales quedan disponibles sin modificación.

El ensayo de transferencia posterior es explícito:

```powershell
npm.cmd run import:stage -- RUTA_EXPLICITA SHA256_REVISADO calcquim_test_import_IDENTIFICADOR_NUEVO
```

Ese comando solo usa `calcquim_test` y un esquema `calcquim_test_import_*` vacío. Requiere prevalidación correcta y huella exacta, conserva el archivo completo en `migration_sources`, no renumera IDs, concilia lectura de vuelta campo por campo y revierte todo ante diferencia. Repetir la misma fuente no duplica registros. Se marca como **migration_rehearsal** y la API de ensayo se niega a abrirlo como dataset sintético. No existe comando de promoción al almacenamiento definitivo ni importación de originales desde la UI. En este trabajo solo se ensayó con un JSON construido expresamente como fixture sintético.

Antes del corte real faltan: autorización para leer la copia real, diagnóstico de todas sus versiones y claves, resolución explícita de incidencias legacy/identidades, conciliación de conteos/importes/IDs/revisiones/fotos/campos, restauración completa de esa copia, respaldo final coherente, congelamiento de escrituras y aprobación del corte. Cambiar una bandera a un dataset vacío no cumple ese procedimiento. Un rollback después de nuevas operaciones debe reconciliarlas; no puede volver simplemente a una copia antigua del navegador.

## Verificaciones realizadas

- 233 pruebas existentes de React: pasaron.
- 14 pruebas unitarias del backend: pasaron.
- 12 pruebas de integración reales: incluyen subpruebas de catálogo, historia, tickets, ventas, alta rápida y rollback compuesto, carreras/reintentos, rollback SQL, cliente React, REST, importación en ensayo, Postman y dump/restore.
- Lint del frontend y backend y ambos builds: comprobados; el build de ensayo avisa de tamaño de bundle, sin fallo.
- Navegador de ensayo: creación de categoría/producto/venta, recarga y recuperación desde PostgreSQL con acceso a localStorage bloqueado; sin acceso al origen habitual.
- Puertos de ensayo y PostgreSQL comprobados con netstat: 127.0.0.1; archivos privados/artifacts excluidos de Git.

El repositorio ya tenía backend/documentación y archivos de Postman sin rastrear; se conservaron. No se inspeccionaron respaldos originales, no se mostraron contraseñas ni se cambiaron configuraciones privadas existentes durante esta implementación.

Límite deliberado de esta primera implementación: las mutaciones sincronizan el agregado completo dentro de una transacción y las lecturas cargan el dataset para mantener compatibilidad con la lógica actual. Es adecuado para el ensayo local, pero con historial grande requiere medición, consultas paginadas y actualizaciones incrementales antes de habilitar múltiples clientes o LAN. JSONB preserva valores semánticos; los bytes originales solo se conservan en el archivo archivado. No se declara demostrada la transferencia de datos reales todavía.
