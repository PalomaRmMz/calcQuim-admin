# Completar productos entregados desde el folio

El desglose pendiente se completa en Ventas, dentro del detalle del folio.
Inventario ya no presenta listados ni formularios de pendientes de ventas;
conserva las existencias y su historial de movimientos.

Todos los renglones pendientes aparecen juntos. Cada uno trae la cantidad
registrada y un selector de productos compatibles con la tarifa histórica.
Si solo hay un producto compatible, se preselecciona. Se pueden repartir
cantidades entre varios productos, o desmarcar renglones para dejarlos pendientes.

Un botón guarda todos los renglones seleccionados. El motivo de auditoría es
Desglose de venta; las observaciones son opcionales. La decisión respecto al
conteo solo aparece si la venta es anterior, mostrando la fecha del conteo.
Los importes cobrados y las tarifas permanecen intactos.

`resolveSaleBreakdowns` valida que todos los pendientes pertenezcan al folio
y se encuentren vigentes. El guardado ocurre dentro de la transacción y control
de revisión existentes: un fallo revierte el lote completo, y la misma clave de
idempotencia no vuelve a descontar. El historial registra los renglones resueltos.

Validación: pruebas de múltiples renglones, cantidades incompletas, productos
incompatibles/repetidos, rollback completo, mezcla de folios e idempotencia.
La revisión visual automatizada no pudo completarse porque el control de Chrome
no logró verificar la URL activa. La compilación y lint se verificaron por código.
