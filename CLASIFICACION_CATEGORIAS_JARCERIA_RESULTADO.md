# Clasificación comercial de jarcería — resultado

**Aplicada en PostgreSQL operativo el 7 de noviembre de 2026, 18:32:44 UTC.** Se crearon nueve categorías y se asignaron los 25 productos actuales de jarcería. No hubo excepciones ambiguas en este corte.

## Consulta y alcance

La consulta inicial se realizó mediante una transacción `REPEATABLE READ READ ONLY`: revisión **182**, generación `39656fe8-6025-4740-8f19-8b767f1e9a9c`, 25 productos de jarcería y cero categorías. Se revisaron nombres exactos, identificadores, características y presentaciones. El producto reciente **Shampoo en sobre Pantene, ID 96**, corresponde a Higiene personal por su naturaleza de cuidado del cabello.

La aplicación terminó en revisión **183**, con la misma generación. Se preservó la información operativa reciente del propietario. No se reutilizó un inventario ni catálogo de una revisión anterior para sustituir datos.

## Categorías creadas

| ID | Categoría creada | Productos |
|---:|---|---:|
| 1 | Papel higiénico | 3 |
| 2 | Papel y toallas | 2 |
| 3 | Productos para baño | 2 |
| 4 | Fibras y esponjas | 3 |
| 5 | Atomizadores | 4 |
| 6 | Jabones en barra y polvo | 7 |
| 7 | Accesorios de limpieza | 1 |
| 8 | Recipientes y contenedores | 1 |
| 9 | Higiene personal | 2 |

Todas están activas y tienen productos. No se crearon líneas, grupos de precio, productos ni presentaciones adicionales.

## Clasificación completa

La columna «Anterior» corresponde a la lectura previa; «Asignada» es el resultado aplicado. Se muestran los nombres exactos y precios registrados por presentación, sin recalcularlos. El contenido indica el factor que ya existía, no una conversión nueva.

| ID | Nombre exacto | Presentaciones y contenido existentes | Anterior | Asignada | Precios existentes | Observación |
|---:|---|---|---|---|---|---|
| 72 | Mr. Big 800 hojas | Mr. Big 800 hojas · paquete-4 (4 pieza por paquete)<br>Mr. Big 800 hojas · rollo (1 pieza por pieza) | Sin categoría | Papel higiénico | Mr. Big 800 hojas · paquete-4: $45.00<br>Mr. Big 800 hojas · rollo: $12.00 | Clasificación expresamente ejemplificada por el propietario. |
| 73 | Mr. Big 600 hojas | Mr. Big 600 hojas · paquete-4 (4 pieza por paquete)<br>Mr. Big 600 hojas · rollo (1 pieza por pieza) | Sin categoría | Papel higiénico | Mr. Big 600 hojas · paquete-4: $31.00<br>Mr. Big 600 hojas · rollo: $10.00 | Clasificación expresamente ejemplificada por el propietario. |
| 74 | Vogue | Vogue · paquete-6 (6 pieza por paquete)<br>Vogue · rollo (1 pieza por pieza) | Sin categoría | Papel higiénico | Vogue · paquete-6: $60.00<br>Vogue · rollo: $13.00 | Clasificación expresamente ejemplificada por el propietario. |
| 75 | Sanitas 100 toallas 24 × 21 cm | Sanitas 100 toallas 24 × 21 cm · paquete-100 (1 pieza por paquete) | Sin categoría | Papel y toallas | Sanitas 100 toallas 24 × 21 cm · paquete-100: $19.00 | Clasificación expresamente ejemplificada por el propietario. |
| 76 | Bobina de papel | Bobina de papel · pieza (1 pieza por pieza) | Sin categoría | Papel y toallas | Bobina de papel · pieza: $28.00 | Clasificación expresamente ejemplificada por el propietario. |
| 77 | Pastilla para baño | Pastilla para baño · pieza (1 pieza por pieza) | Sin categoría | Productos para baño | Pastilla para baño · pieza: $15.00 | Clasificación expresamente ejemplificada por el propietario. |
| 78 | Pastillas de cloro dúo (2) | Pastillas de cloro dúo (2) · duo (1 pieza por paquete) | Sin categoría | Productos para baño | Pastillas de cloro dúo (2) · duo: $15.00 | Clasificación expresamente ejemplificada por el propietario. |
| 79 | Fibra para trastes chica | Fibra para trastes chica · pieza (4 pieza por pieza) | Sin categoría | Fibras y esponjas | Fibra para trastes chica · pieza: $8.00 | Clasificación expresamente ejemplificada por el propietario. |
| 80 | Fibra para trastes mediana | Fibra para trastes mediana · pieza (1 pieza por pieza) | Sin categoría | Fibras y esponjas | Fibra para trastes mediana · pieza: $11.00 | Clasificación expresamente ejemplificada por el propietario. |
| 81 | Fibra Fregón | Fibra Fregón · pieza (1 pieza por pieza) | Sin categoría | Fibras y esponjas | Fibra Fregón · pieza: $11.00 | Clasificación expresamente ejemplificada por el propietario. |
| 82 | Atomizador ¼ L | Atomizador ¼ L · pieza (1 pieza por pieza) | Sin categoría | Atomizadores | Atomizador ¼ L · pieza: $12.00 | Clasificación expresamente ejemplificada por el propietario. |
| 83 | Atomizador ½ L variante A | Atomizador ½ L variante A · pieza (1 pieza por pieza) | Sin categoría | Atomizadores | Atomizador ½ L variante A · pieza: $17.00 | Clasificación expresamente ejemplificada por el propietario. |
| 84 | Atomizador ½ L variante B | Atomizador ½ L variante B · pieza (1 pieza por pieza) | Sin categoría | Atomizadores | Atomizador ½ L variante B · pieza: $20.00 | Clasificación expresamente ejemplificada por el propietario. |
| 85 | Atomizador 1 L | Atomizador 1 L · pieza (1 pieza por pieza) | Sin categoría | Atomizadores | Atomizador 1 L · pieza: $25.00 | Clasificación expresamente ejemplificada por el propietario. |
| 86 | Roma empacado 1 kg | Roma empacado 1 kg · bolsa (1 pieza por bolsa) | Sin categoría | Jabones en barra y polvo | Roma empacado 1 kg · bolsa: $45.00 | Clasificación expresamente ejemplificada por el propietario. |
| 87 | Roma empacado ½ kg | Roma empacado ½ kg · bolsa (1 pieza por bolsa) | Sin categoría | Jabones en barra y polvo | Roma empacado ½ kg · bolsa: $22.00 | Clasificación expresamente ejemplificada por el propietario. |
| 88 | Roma empacado ¼ kg | Roma empacado ¼ kg · bolsa (1 pieza por bolsa) | Sin categoría | Jabones en barra y polvo | Roma empacado ¼ kg · bolsa: $13.00 | Clasificación expresamente ejemplificada por el propietario. |
| 89 | Roma suelto | Roma suelto · kg (1 kg por kg)<br>Roma suelto · medio-kg (0.5 kg por pieza) | Sin categoría | Jabones en barra y polvo | Roma suelto · kg: $35.00<br>Roma suelto · medio-kg: $12.00 | Clasificación expresamente ejemplificada por el propietario. |
| 90 | Zote barra 100 g | Zote barra 100 g · barra (1 pieza por pieza) | Sin categoría | Jabones en barra y polvo | Zote barra 100 g · barra: $8.00 | Clasificación expresamente ejemplificada por el propietario. |
| 91 | Zote barra 200 g | Zote barra 200 g · barra (1 pieza por pieza) | Sin categoría | Jabones en barra y polvo | Zote barra 200 g · barra: $18.00 | Clasificación expresamente ejemplificada por el propietario. |
| 92 | Zote barra 400 g | Zote barra 400 g · barra (1 pieza por pieza) | Sin categoría | Jabones en barra y polvo | Zote barra 400 g · barra: $25.00 | Clasificación expresamente ejemplificada por el propietario. |
| 93 | Palo de escoba | Palo de escoba (1 pieza por pieza) | Sin categoría | Accesorios de limpieza | Palo de escoba: $15.00 | Clasificación expresamente ejemplificada por el propietario. |
| 94 | Bote de basura colores chico | Bote de basura colores chico (1 pieza por pieza) | Sin categoría | Recipientes y contenedores | Bote de basura colores chico: $28.00 | Clasificación expresamente ejemplificada por el propietario. |
| 95 | Jabón p/manos Zen | Jabón p/manos Zen (1 pieza por botella) | Sin categoría | Higiene personal | Jabón p/manos Zen: $29.00 | Clasificación expresamente ejemplificada por el propietario. |
| 96 | Shampoo en sobre Pantene | Shampoo en sobre Pantene (1 pieza por pieza) | Sin categoría | Higiene personal | Shampoo en sobre Pantene: $3.00 | Producto reciente; higiene del cabello. |

Las nueve categorías propuestas fueron pertinentes. Los ejemplos expresos del propietario cubren los productos 72–95; el ID 96 es inequívocamente un producto de higiene personal. No se clasificó por coincidencias parciales de texto ni se dejó ningún producto actual sin revisar.

Los factores existentes de Sanitas, cloro dúo, Fibra chica y Roma suelto se conservaron tal como estaban; esta tarea no los corrigió ni reinterpretó. Mr. Big 600 mantiene los precios frescos de $31 por paquete y $10 por rollo. **No se ejecutó su corrección pendiente de inventario.**

## Respaldo y restauración previos

Se utilizó el script operativo existente para crear un respaldo completo consistente, con snapshot exportado y huellas de dataset, inventario base, seguimiento de compras y composición física.

- Tamaño: **1.583.637 bytes**.
- SHA-256: `5e71fbf053798a9d6741c9219209a337abaedddc2a7e9ef39a0dea4ab07d0ed4`.
- [Manifiesto del respaldo](artifacts/web-clasificacion-jarceria-20261107/backup-result.private.json).
- Segunda copia verificada por hash en `D:\CalcQuim-Backups\jarceria-categories-20261107`, fuera del proyecto y en la misma unidad D:.

El propietario creó la base vacía `calcquim_recovery_20261107_categories`. El respaldo se restauró allí, sin reemplazar ninguna base existente. Pasaron snapshot, inventarios, huellas de paquetes y compras y **3.160 comprobaciones relacionales**, con cero fallos y cero claves foráneas sin validar. [Evidencia](server/artifacts/operational/backups/recovery-1794076283947.private.json).

La clasificación completa se ensayó sobre esa restauración antes de escribir en operación. Su repetición devolvió la operación registrada, sin duplicar categorías ni asignaciones. No se ampliaron privilegios del usuario de aplicación.

## Aplicación e integridad

Se reutilizaron las reglas existentes `saveHardwareCategory` y `saveCommerceProduct`, con `hardwareCategories` y `hardwareCategoryId`. El lote se ejecutó en **una transacción**, con bloqueo del estado del dataset, revisión/generación esperadas, comparación contra el respaldo restaurado y clave única de idempotencia.

Antes de confirmar se exigió que las únicas diferencias fueran la colección de categorías y `hardwareCategoryId` de los 25 productos. Las reglas existentes de sincronización de inventario se comprobaron dentro de esa misma transacción. Cualquier diferencia adicional habría provocado rollback del lote.

El detalle y motivo de las asignaciones quedaron registrados en el mecanismo existente de idempotencia, clave `hardware-categories:20261107:revision182`, además del informe privado. No se añadieron movimientos ni eventos artificiales al historial de inventarios.

Se verificó la conservación de:

- Nombres, características, unidades, estados y demás propiedades de los productos.
- Identidades, nombres, factores, precios e historiales de todas las presentaciones.
- Costos, proveedores, compras y ventas: **96 productos totales, 46 ventas y ocho compras** conservados.
- Inventarios iniciales y sus correcciones, saldos, anclajes, composición de paquetes/sueltos, movimientos, auditoría y reposición.
- Seguimiento y eventos de compras, sin nuevas recepciones ni preparaciones.

No se modificó código operativo, frontend ni backend. No hubo migraciones, despliegue o reinicio de servicios. PostgreSQL permanece local. No se modificó ni compiló móvil; siete módulos del cliente conservaron sus hashes. Sin commits ni pushes.

## Validación

- **302 pruebas web aprobadas; cero fallos y omisiones.** [Log](artifacts/web-clasificacion-jarceria-20261107/regression.log).
- Ensayo de clasificación sobre la restauración independiente: nueve categorías, 25 asignaciones y conservación de toda la información ajena a clasificación. [Resultado](artifacts/web-clasificacion-jarceria-20261107/rehearsal.private.json).
- Repetición idempotente del ensayo: sin duplicados. [Registro](artifacts/web-clasificacion-jarceria-20261107/idempotency-rehearsal.log).
- Tres comprobaciones adicionales en esa base aislada: alta individual con categoría, alta por lote con categoría y rollback íntegro de un lote inválido. Los productos y presentaciones previos permanecieron iguales. [Resultado QA](artifacts/web-clasificacion-jarceria-20261107/qa-regression.json). Los productos de prueba existen únicamente allí.
- Navegador operativo: nueve categorías visibles, conteos por categoría correctos y los nueve filtros probados. Los resultados sumaron los 25 productos: 3, 2, 3, 4, 7, 2, 1, 1 y 2 según el orden propuesto.
- Precios y presentaciones visibles después de clasificar. Formularios de alta individual y por lote abiertos y cancelados, con las nueve categorías disponibles; **sin guardar productos de prueba en operación**.
- Verificación posterior de solo lectura: revisión 183, dataset igual al resultado autorizado, inventario completo igual al anterior, composición física y seguimiento de compras sin cambios. Health/live, readiness y salud del acceso móvil: **200**.

[Ejecución operativa](artifacts/web-clasificacion-jarceria-20261107/execution.private.json) y [verificación final](artifacts/web-clasificacion-jarceria-20261107/verification.json). Los archivos privados contienen información comercial y no deben publicarse.

## Evidencia visual

- [Las nueve categorías reales y sus conteos](artifacts/web-clasificacion-jarceria-20261107/categorias-reales-operativas.png).
- [Productos, categoría y precios preservados de papel higiénico](artifacts/web-clasificacion-jarceria-20261107/productos-categoria-precios.png).
- [Higiene personal con el producto reciente Pantene](artifacts/web-clasificacion-jarceria-20261107/higiene-personal-producto-reciente.png).

## Excepciones y estado final

**25 de 25 productos clasificados; cero excepciones pendientes.** Esto no autoriza clasificar automáticamente artículos que se agreguen después. Las nuevas altas deben seleccionar la categoría correspondiente o revisarse si su naturaleza es ambigua.

La corrección física pendiente de Mr. Big permanece separada de esta tarea. Ante una futura reclasificación, modificar únicamente la asignación mediante el mecanismo existente; no restaurar este respaldo anterior sobre operaciones comerciales nuevas.
