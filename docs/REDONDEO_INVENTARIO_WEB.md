# Cantidad de inventario en ventas web por monto

Las ventas de origen WEB capturadas por monto descuentan la cantidad calculada
con la tarifa aplicada, redondeada a un decimal en la unidad vendida. Se usa
redondeo al más cercano y los empates suben: 0.25 → 0.3, 2.666… → 2.7.
El importe cobrado y la tarifa comercial permanecen intactos. La vista de captura
muestra la cantidad aproximada con un decimal.

Las cantidades capturadas directamente y las ventas móviles conservan sus reglas.
Si el redondeo produce cero, el renglón continúa pendiente en lugar de registrar
una salida de cero. Los grupos siguen requiriendo identificar los productos.
Las salidas automáticas registran `web_amount_rounded_1_decimal` como evidencia.

El 5 de noviembre de 2026 se regularizaron, con respaldo previo, únicamente los
pendientes web revisados: V-00020 (Downy Azul 0.7 L y Cloro 0.8 L) y V-00027
(Downy Azul 2.7 L). La evidencia privada conserva el plan y las aplicaciones.
Los importes y registros comerciales se verificaron sin cambios. No se recalculan
automáticamente movimientos históricos que ya fueron aplicados.
