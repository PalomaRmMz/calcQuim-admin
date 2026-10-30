# Existencias y reposición

Disponible en **Reportes → Existencias y reposición**. Reutiliza `DataTable`, las etiquetas y colores de categorías, `TableActions`, la ficha `InventoryProductModal` y el generador Excel existente.

Consulta `GET /api/v1/inventory`, sin crear saldos paralelos, tablas nuevas o movimientos. No requiere migración ni reiniciar Express. El reporte no usa localStorage. Las cantidades provienen del saldo calculado por PostgreSQL y se comparan como decimales exactos, sin redondear para decidir alertas.

## Estados

- Sin existencia determinada: saldo desconocido; nunca se sustituye por cero.
- Agotado: saldo conocido menor o igual que cero. Un negativo muestra además **SALDO NEGATIVO: CONCILIAR**, con indicador y filtro propios.
- Por reponer: saldo positivo menor o igual al umbral configurado.
- Suficiente: saldo superior al umbral configurado.
- Sin punto de reposición: saldo conocido con umbral ausente. Nunca se supone un umbral de 5 L ni se clasifica automáticamente como suficiente.

Agotado tiene prioridad sobre la falta de umbral, pero esta última se muestra también como aviso y filtro independiente. Los indicadores pueden coincidir y no se suman entre sí. Respetan los filtros de categoría, línea y producto; pulsarlos cambia el filtro de estado.

**Necesito surtir** reúne agotados (incluidos negativos) y por reponer. Los desconocidos y los productos sin umbral se revisan en sus indicadores específicos; no se inventa una necesidad.

## Configuración y sugerencias

Abrir el nombre o el lápiz del producto → **Reposición**. Capturar punto y lote habitual, elegir el motivo y guardar. Se conserva la sugerencia explícita de 5 L para productos en litros; pulsarla solo completa el formulario y no guarda hasta confirmar. Los lotes pueden ser 20, 50, 65 u otra cantidad válida.

El lote habitual se muestra como cantidad orientativa de preparación/recepción, sin restarle el saldo ni convertirlo en existencia máxima. El modelo actual no tiene un objetivo explícito de existencias ni una configuración por producto de preparar/comprar: no se deducen de nombres, categorías, proveedores, compras o conversiones. La acción genérica es **Reponer**.

## Actualización y exportación

La consulta se repite al guardar, al cambiar la revisión de datos, al volver a la ventana, al pulsar **Actualizar** y cada diez segundos mientras el reporte está visible. Se muestra la hora de la última consulta correcta en la zona de Ciudad de México. Respuestas antiguas no reemplazan consultas más recientes. Ante un error se conservan los últimos datos con advertencia y se bloquea exportar/imprimir hasta actualizar correctamente.

**Lista imprimible**, **Exportar Excel** y **Exportar CSV** incluyen todos los resultados de los filtros, no solo la página visible. La lista se ordena inicialmente por categoría y producto; se puede ordenar la tabla por encabezados. La impresión abre una vista completa sin paginación. Excel reutiliza `exportWorkbook`; las cantidades se conservan como cadenas decimales exactas para evitar pérdida de precisión. CSV protege textos que podrían interpretarse como fórmulas y conserva cantidades negativas, unidades y estados. Generar estos archivos no escribe en PostgreSQL.

Una venta física inequívoca que deje el saldo bajo el umbral activa la alerta al volver al reporte o en su siguiente consulta automática. Las ventas pendientes de asignación no se convierten arbitrariamente en litros: mantienen las reglas del inventario existente.

## Verificación

`tests/inventory-report.test.js` cubre cero, negativos, desconocidos, umbral exacto, faltante y superado, precisión decimal, filtros, lote orientativo y exportaciones. `server/integration/inventoryReport.test.mjs` utiliza exclusivamente un esquema UUID de `calcquim_activation_test`, comprueba entrada, venta, cambio de umbral y que consultar/exportar no altera el snapshot de datos. Se incorpora a `npm.cmd run test:activation --prefix server`.

`server/browser/inventory-report-ui.mjs` redirige toda la API a un fixture sintético aislado. Verifica filtros, CSV, XLSX, impresión, error de lectura, edición del umbral desde la ficha y alertas tras ventas. Las comprobaciones operativas de interfaz se realizan bloqueando cualquier solicitud de escritura.
