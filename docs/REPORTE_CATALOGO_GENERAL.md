# Catálogo general

Disponible en **Reportes → Catálogo general → Exportar a Excel**. Consulta PostgreSQL en cada descarga; no consulta localStorage ni el catálogo móvil.

## Datos y precios

`GET /api/v1/reports/general-catalog` reutiliza `service.read()`, que abre una transacción `REPEATABLE READ READ ONLY`. Devuelve las cuatro colecciones, revisión, generación y fecha de captura. Si una instancia anterior de Express responde 404, el cliente consulta `/api/v1/dataset`, con la misma transacción de lectura, y selecciona las cuatro colecciones. Otros errores no activan esta compatibilidad.

Se reutiliza `catalogProductPrice`: un grupo asignado tiene prioridad y debe existir y no estar inactivo; sin grupo se toma el precio individual. Un precio ausente, inválido o de un grupo inactivo se exporta como **No determinado**. No se infieren grupos desde categorías o líneas ni precios desde compras, costos, inventario o ventas. El modelo actual no contiene escalas por presentación o volumen.

Las hojas Productos, Categorías, Líneas de productos y Grupos de precios conservan nombres exactos, IDs como texto, estados y relaciones explícitas. Cada fila incluye hora de generación en Ciudad de México y el registro original en JSON para preservar campos adicionales. La columna Orden refleja el campo `order` cuando existe; se deja vacía cuando el registro no lo tiene. Los grupos muestran las unidades e IDs de todos sus productos asignados; no se inventa una unidad propia del grupo.

El archivo usa la infraestructura existente de `write-excel-file`: XLSX real, encabezados azules, filas alternadas, autofiltros, primera fila inmovilizada, números monetarios y textos tipados explícitamente como String (sin interpretarlos como fórmulas). No modifica el esquema ni los datos.

## Verificación

- `node --test tests/general-catalog.test.js`: estructura, relaciones, identificadores, precios, compatibilidad HTTP, XML XLSX, filtros, panel congelado y ausencia de fórmulas.
- `node --test server/integration/generalCatalog.test.mjs`: base `calcquim_activation_test`, esquema temporal exclusivo, datos sintéticos, persistencia al reconstruir Express y ausencia de cambios después de lecturas. Limpia únicamente su esquema temporal.
- `server/browser/general-catalog-ui.mjs`: prueba de descarga y recarga contra la infraestructura de interfaz sintética existente. Requiere una página Playwright y el objeto privado de configuración del fixture; nunca almacena sus credenciales en el código.

Verificación manual adicional: abrir el archivo descargado en Microsoft Excel para comprobar el comportamiento nativo. Las pruebas automatizadas inspeccionan el paquete XLSX, pero no sustituyen esa apertura.
