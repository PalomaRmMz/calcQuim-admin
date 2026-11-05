# Consultas locales

Revisión del 5 de noviembre de 2026: base de aproximadamente 16 MB,
71 productos, 30 ventas y 7 compras. El volumen no explica por sí solo la demora.

Se reemplazaron las consultas individuales por cada folio con cuatro lecturas
de detalles por lote. La lectura completa usa 16 consultas, frente a 61 en la
medición anterior. Se conserva el orden de los renglones y el historial.

El gestor inicia Vite en un proceso hijo con cierre administrado por IPC.
La preparación de módulos de la interfaz ya no comparte el hilo de ejecución
con Express y sus conexiones PostgreSQL. El pool operativo admite cuatro
conexiones y libera las inactivas después de cinco segundos.

Actualizar datos consulta el servidor sin recargar toda la interfaz.

Después del cambio, tres lecturas HTTP del dataset tardaron 86, 22 y 19 ms;
las de inventario, 28, 18 y 20 ms. Son mediciones locales de API, no una garantía
del tiempo total de renderizado del navegador. Pasaron 25 pruebas de integración
de persistencia e inventario, lint de los archivos modificados y la compilación.
