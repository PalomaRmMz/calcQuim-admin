# Ajuste horizontal de captura de ventas — resultado

**Publicado y verificado en operación el 9 de noviembre de 2026.** En Registrar venta → Productos de limpieza, el modo de captura y los campos correspondientes comparten una fila en escritorio. En pantallas pequeñas se apilan.

## Archivo modificado

Únicamente [src/styles/components/SaleFormModal.css](src/styles/components/SaleFormModal.css).

Se aplicó grid al contenedor existente `.cleaning-sale-entry`, con el fieldset de radios a la izquierda y `.cleaning-entry-grid` a la derecha. Se ajustaron sus márgenes y la ocupación del campo único. No se modificó JSX, JavaScript, controles, etiquetas, eventos ni validaciones.

- Escritorio: dos áreas horizontales. En modo importe, el importe y la cantidad física confirmada permanecen dentro del área derecha y sus entradas quedan alineadas.
- Hasta 900 px: los dos campos del área derecha pueden apilarse para conservar su anchura.
- Hasta 700 px: las áreas izquierda y derecha se apilan.
- «Agregar a la venta» sigue fuera del grid y debajo de ambas áreas.

Los selectores están limitados a las clases existentes de captura de Limpieza. No afectan los campos de Jarcería o Lavandería.

## Pruebas

Primero se trabajó en una copia QA de frontend, conectada exclusivamente al backend PostgreSQL aislado `calcquim_activation_test`.

- **302 pruebas web aprobadas**, cero fallos y omisiones. [Log](artifacts/web-grid-captura-20261109/tests.log).
- Build QA y build operativo con salida **0**. [Build QA](artifacts/web-grid-captura-20261109/build.log), [build operativo](artifacts/web-grid-captura-20261109/operational-build.log).
- Navegador, ambos modos, a **1366, 768 y 390 px**.
- A 1366 px: áreas de 324 y 486 px, con el mismo origen vertical; en modo importe, ambas entradas se alinearon a la misma altura.
- A 768 px: áreas de aproximadamente 246 y 368 px, todavía en la misma fila; importe y confirmación física se apilan dentro del área derecha.
- A 390 px: áreas apiladas de 304 px. El ancho del documento fue 390 px.
- En los seis casos: dos radios, uno seleccionado, botón debajo y ancho del documento igual al viewport. Cero errores de consola o JavaScript en la comprobación operativa final.

[Mediciones QA](artifacts/web-grid-captura-20261109/qa-layout.json) y [mediciones posteriores en operación](artifacts/web-grid-captura-20261109/browser-operational.json).

### Comportamiento de ambos modos

Se comprobó en un **borrador QA que se canceló sin guardar**:

| Caso | Resultado |
|---|---|
| Por cantidad: 1 litro de Carisma | Línea de 1 litro por $19 |
| Cambio de modo | El valor se limpia como antes |
| Por monto: $38, con 2 litros confirmados | Línea de 2 litros por $38 |
| Cantidad cero | Se conserva el rechazo «Escribe un valor positivo.» |
| Confirmación física negativa | Se conserva el rechazo de cantidad física inválida |

No se guardaron ventas, ni siquiera en QA. Durante esta prueba de borrador se observaron **cero solicitudes de escritura a la API**. [Resultado](artifacts/web-grid-captura-20261109/qa-behavior.json).

## Publicación y conservación

Se respaldó el CSS original en `artifacts/web-grid-captura-20261109/original-style.zip`, con verificación de su hash. Se comprobó que no hubiera cambios recientes sobre el archivo antes de reemplazarlo.

La publicación se realizó con el gestor administrado detenido y los puertos de aplicación cerrados, sin copiar mientras Vite observaba el árbol. Después se arrancó el mismo gestor; web, API y acceso móvil quedaron listos. PostgreSQL no se reinició.

La lectura fresca anterior a publicar y la posterior conservaron **revisión 187** y generación `39656fe8-6025-4740-8f19-8b767f1e9a9c`. No se restauró el estado de revisión 185 del informe anterior: se preservaron las operaciones recientes del propietario.

La comparación íntegra confirmó igualdad del dataset, catálogo, inventarios, movimientos, composición física y seguimiento de compras. Se verificaron **275 archivos de código y estilos sin cambios**, excluyendo únicamente el CSS publicado. Esto incluye formularios, cálculos, conversión, redondeos, validaciones, guardado, tickets, Jarcería, Lavandería y backend. Siete módulos del cliente móvil también conservaron sus hashes.

Health/live, readiness y salud móvil respondieron **200**. El gestor informó `ready=true` y `mobileWarning=false`.

[Integridad de datos y código](artifacts/web-grid-captura-20261109/integrity.json), [hash del archivo publicado](artifacts/web-grid-captura-20261109/published-files.json) y [health/móvil](artifacts/web-grid-captura-20261109/health-mobile.json).

No hubo migraciones, escrituras comerciales de prueba, modificaciones móviles, compilaciones Android, commits ni pushes. No se ejecutó la corrección pendiente de Mr. Big.

## Capturas antes y después

| Resolución y modo | Antes | Después en operación |
|---|---|---|
| 1366 px · Por cantidad | [Antes](artifacts/web-grid-captura-20261109/antes-1366-quantity.png) | [Después](artifacts/web-grid-captura-20261109/despues-1366-quantity.png) |
| 1366 px · Por monto | [Antes](artifacts/web-grid-captura-20261109/antes-1366-amount.png) | [Después](artifacts/web-grid-captura-20261109/despues-1366-amount.png) |
| 768 px · Por cantidad | [Antes](artifacts/web-grid-captura-20261109/antes-768-quantity.png) | [Después](artifacts/web-grid-captura-20261109/despues-768-quantity.png) |
| 768 px · Por monto | [Antes](artifacts/web-grid-captura-20261109/antes-768-amount.png) | [Después](artifacts/web-grid-captura-20261109/despues-768-amount.png) |
| 390 px · Por cantidad | [Antes](artifacts/web-grid-captura-20261109/antes-390-quantity.png) | [Después](artifacts/web-grid-captura-20261109/despues-390-quantity.png) |
| 390 px · Por monto | [Antes](artifacts/web-grid-captura-20261109/antes-390-amount.png) | [Después](artifacts/web-grid-captura-20261109/despues-390-amount.png) |

**Resultado:** ajuste visual aplicado en operación, sin pendientes bloqueantes de este alcance. La lógica comercial y los datos no cambiaron.
