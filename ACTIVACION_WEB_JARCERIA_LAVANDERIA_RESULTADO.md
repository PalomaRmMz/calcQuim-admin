# CalcQuim — Activación web de jarcería y lavandería

Fecha: 5 de noviembre de 2026. **Integración aplicada en el Admin operativo**, utilizando la entrega armonizada como referencia. Web disponible en **http://127.0.0.1:5173**. Se conservan API 3003, acceso móvil 3016 y PostgreSQL operativo 5432.

Resultado verificado: **34 ventas, 8 compras y 126 movimientos históricos conservados; 71 productos de limpieza intactos; 21 productos nuevos de jarcería, 25 presentaciones, 3 proveedores y 4 servicios incorporados.** No se registraron ventas ni compras sintéticas en la base operativa.

## 1. Qué se integró

Se integraron Proveedores, Productos de limpieza, Productos de jarcería, Compras compartidas, ambos comparadores, ambos inventarios, Lavandería y Ventas web unificadas. Jarcería utiliza el formulario integrado de producto y presentaciones; Lavandería mantiene la lista de servicios y edición de tarifas de la entrega armonizada.

Las fuentes operativas están en `src` y `server/src`, dentro de `D:\ReactApps\calcQuim-admin`. Las copias QA anteriores se conservaron. El [manifiesto de fuentes instaladas](artifacts/activacion-web-20261105/installed-source.private.json) registra huellas de los 61 archivos integrados o corregidos, incluidas pruebas e infraestructura de arranque. Los originales recuperables se guardaron bajo `artifacts/activacion-web-20261105/source-before`.

**Reportes conserva su página, cálculos, pestañas y acceso operativo original.** No se activaron las pantallas ni el endpoint de reportes comerciales de QA: en operativo ese endpoint responde 404. Los reportes preparados siguen en las copias aisladas.

El arranque habitual conserva `Iniciar-CalcQuim.cmd` y `Detener-CalcQuim.cmd`. Se corrigió la espera de la primera transformación web y se limitó el cierre de un frontend propio que no termina. También se excluyeron las copias de `artifacts` de la vigilancia de Vite para evitar procesar los ensayos y respaldos como fuentes activas. No se cambiaron puertos, credenciales, IP ni subred.

## 2. Migraciones aplicadas

| Migración | Cambio |
|---|---|
| 009 — commerce | Presentaciones físicas, servicios, actividad de productos y referencias comerciales de renglones de venta |
| 010 — supplier_activity | Clasificación de proveedores por actividad |

Se aplicaron dentro de la misma transacción que el alta del catálogo autorizado, con los servicios detenidos y comprobando que el estado seguía coincidiendo con el respaldo restaurado. Antes del COMMIT se compararon ventas, compras, productos y proveedores históricos, movimientos, saldos de limpieza e información de recuperación móvil.

Las versiones 001–008 y sus checksums registrados permanecen intactos. El migrador acepta únicamente los formatos LF/CRLF equivalentes del mismo SQL histórico; no acepta cambios de contenido. La comprobación final acredita las versiones 1–10.

La revisión del dataset pasó de 141 a **143**; la generación permanece igual. El salto incluye el guardado del catálogo y la confirmación adicional de la transacción. No representa ventas ni movimientos nuevos. La verificación posterior y el respaldo final registran la revisión efectiva 143.

## 3. Proveedores incorporados

Se incorporaron con claves estables y giro **Jarcería**:

- Abarrotera Zorro.
- Jarcería La Libertad.
- Jarcería San Martín.

El catálogo queda con 8 proveedores. Los 5 anteriores conservan exactamente sus registros, contactos, identificadores, relaciones e historial. No se inventaron teléfonos, direcciones ni asignaciones de artículos a los nuevos proveedores.

Los proveedores históricos conservan su giro pendiente de clasificación. Para utilizarlos en una nueva compra de limpieza, debe seleccionarse su giro desde Proveedores. No se les asignó una actividad automáticamente ni se modificaron sus compras históricas.

La preparación del catálogo se probó dos veces: la segunda no produce cambios ni duplicados. Las coincidencias ambiguas de proveedores se rechazan en lugar de fusionarse.

## 4. Productos reales registrados

Se incorporaron **21 productos físicos y 25 presentaciones**, mediante las claves estables `fc:article:*` y `fc:presentation:*`. El [catálogo registrado](artifacts/activacion-web-20261105/catalog-registered.json) documenta productos, unidades, presentaciones, precios y servicios leídos después de la activación.

Se conservan separados los dos tamaños Mr. Big, las dos variantes del atomizador de ½ L, las bolsas de Roma y los tamaños de Zote. Sanitas se comercializa como paquete; no se habilitó venta por toalla. El dúo de cloro no se convirtió en dos artículos individuales.

No se cargaron costos de adquisición, compras, relaciones con proveedores ni existencias ficticias.

## 5. Precios configurados

| Producto / presentación | Precio |
|---|---:|
| Mr. Big 800 hojas — paquete de 4 | $45 |
| Mr. Big 800 hojas — rollo | $12 |
| Mr. Big 600 hojas — paquete de 4 | $31 |
| Mr. Big 600 hojas — rollo | $10 |
| Vogue — paquete de 6 | $60 |
| Vogue — rollo | $13 |
| Sanitas — paquete de 100 toallas, 24 × 21 cm | $19 |
| Bobina de papel | $28 |
| Pastilla para baño | $15 |
| Pastillas de cloro — dúo de 2 | $15 |
| Fibra para trastes chica | $8 |
| Fibra para trastes mediana | $11 |
| Fibra Fregón | $11 |
| Atomizador ¼ L | $12 |
| Atomizador ½ L — variante de $17 | $17 |
| Atomizador ½ L — variante de $20 | $20 |
| Atomizador 1 L | $25 |
| Roma empacado 1 kg | $45 |
| Roma empacado ½ kg | $22 |
| Roma empacado ¼ kg | $13 |
| Roma suelto — 1 kg | $35 |
| Roma suelto — ½ kg | $12 |
| Zote 100 g | $8 |
| Zote 200 g | $18 |
| Zote 400 g | $25 |

Los precios se utilizaron literalmente. En particular, Roma suelto de ½ kg conserva $12, sin derivarlo proporcionalmente de $35/kg. No se aplica mayoreo de limpieza a estas presentaciones ni a los servicios.

## 6. Estado de inventarios

| Comprobación | Resultado |
|---|---|
| Productos históricos de limpieza | 71, registros intactos |
| Saldos y configuración de limpieza | Coinciden con el respaldo anterior |
| Movimientos históricos | 126, sin cambios |
| Desgloses pendientes de inventario antes del cambio | 0 |
| Recepciones históricas pendientes de revisión antes del cambio | 0 |
| Productos nuevos de jarcería | 21 sin inicialización |
| Saldos ficticios de cero agregados | Ninguno |

Las vistas permanecen separadas y utilizan el mismo motor físico. Las presentaciones equivalentes de un producto comparten existencia: un paquete de cuatro descuenta cuatro unidades. El saldo equivalente no acredita paquetes sellados.

Los productos nuevos muestran existencia **sin determinar**, sin movimiento inicial ni saldo de cero. La recepción exige registrar previamente un inventario inicial explícito. Ese conteo es una configuración comercial pendiente, no una existencia que el sistema pueda suponer.

## 7. Servicios disponibles

| Servicio | Tarifa |
|---|---:|
| Lavado por carga | $60 |
| Jabón y suavizante Full Clean, adicional por carga | +$10 |
| Secado adicional por carga | +$30 |
| Sólo exprimido | Personalizada al vender |
| Exprimido y secado | Personalizada al vender |
| Trabajo especial | Personalizada al vender |

El catálogo contiene cuatro servicios; lavado incluye los dos adicionales opcionales. Las combinaciones son $60, $70, $90 y $100 por carga. Los servicios personalizados no tienen una tarifa fija inventada.

Los cobros se capturan desde Ventas. Los servicios no generan salidas de detergente, suavizante ni otro inventario. No se agregó un flujo obligatorio de prendas, órdenes, anticipos o entregas.

## 8. Funcionamiento de Compras y Ventas

Compras conserva su historial unificado, filtros, detalle, comprobantes, versiones y anulaciones. La captura identifica limpieza o jarcería y filtra proveedores por actividad. Jarcería permite varias presentaciones en un documento, mostrando cantidad, contenido, equivalencia, costo por presentación y total.

Registrar una compra no confirma mercancía. La recepción se realiza por renglón desde su detalle y conserva trazabilidad. Las compras de jarcería con snapshots se corrigen mediante anulación y nuevo documento, con revisión física de las recepciones anteriores.

Ventas web admite limpieza, jarcería, lavandería y ventas mixtas en una captura y un ticket. Se conservan folios, tarifas históricas, correcciones, anulaciones e idempotencia.

Las escrituras de ensayo se realizaron **únicamente en PostgreSQL aislado 55439**: compra de 5 paquetes por $200, recepción de 20 unidades, venta de un paquete que deja 16, lavandería sin movimiento físico y venta mixta. Después de la integración, la base operativa sigue teniendo las mismas 34 ventas y 8 compras; no contiene esas operaciones de ensayo.

## 9. Compatibilidad con la APK actual

No se modificó el repositorio móvil, no se compiló ni instaló APK, no se utilizó ADB y no se tocó el almacenamiento del teléfono. Se verificaron sin cambios las huellas de 136 archivos móviles y configuraciones protegidas, incluidas las credenciales de conexión existentes.

El catálogo móvil operativo conserva exactamente los productos de limpieza y las opciones comerciales anteriores, incluidas las claves de tarifas y el mayoreo `admin-sales-wholesale-v2`. Mantiene generación, credencial, puertos y acceso por la IP/subred autorizadas. La lectura autenticada se comprobó tanto en loopback como por la dirección LAN existente.

Jarcería y lavandería quedan habilitadas sólo para la web: la API móvil operativa no anuncia las capacidades nuevas ni devuelve presentaciones o servicios. También rechaza intentos de venta comercial de esas actividades por el canal móvil.

El ensayo utilizó directamente los módulos actuales, sin modificar, del cliente móvil para vender limpieza contra el servidor integrado aislado y recuperar el mismo intento sin duplicarlo. Los registros operativos de idempotencia y las respuestas anteriores se conservaron.

Se corrigió antes de activar una regresión de la entrega QA que quitaba el mayoreo de las opciones comerciales al filtrar el catálogo móvil. La comparación posterior confirma identidad de sus datos y opciones frente al estado previo.

No se exige actualizar la APK ni borrar borradores. Un borrador con revisión anterior puede solicitar la recarga habitual del catálogo antes de un envío nuevo; un intento ya enviado conserva su consulta de estado y recuperación. No se inspeccionaron borradores internos del teléfono: la verificación de pendientes se realizó en el servidor y la conservación del protocolo se probó en aislamiento.

## 10. Pruebas realizadas

| Grupo final | Resultado | Evidencia |
|---|---:|---|
| Web sobre las fuentes operativas integradas | 271 aprobadas | [Registro](artifacts/activacion-web-20261105/root-web-tests.log) |
| Servidor sobre las fuentes operativas integradas | 44 aprobadas | [Registro](artifacts/activacion-web-20261105/root-server-tests.log) |
| Integraciones PostgreSQL en QA | 51 aprobadas | [Registro](artifacts/activacion-web-20261105/integration-tests.log) |
| **Total, incluidas subpruebas de Node** | **366 aprobadas; 0 fallidas, omitidas o canceladas** | [Validación](artifacts/activacion-web-20261105/validation.private.json) |
| ESLint | Aprobado | [Registro](artifacts/activacion-web-20261105/root-lint.log) |
| Compilación web operativa | Aprobada | [Registro](artifacts/activacion-web-20261105/root-build.log) |

Se verificaron regresiones de limpieza y mayoreo, historial, compras y recepciones, servicios sin inventario, ventas mixtas, correcciones, anulaciones, idempotencia, contratos móviles y protección de Reportes. Las nuevas pruebas cubren las opciones mayoristas del protocolo anterior, la restricción comercial a la web y el arranque con una transformación inicial lenta.

El [ensayo sobre respaldo restaurado](artifacts/activacion-web-20261105/rehearsal.private.json) comprobó además las migraciones, el catálogo autorizado idempotente y la integridad histórica antes del cambio real.

En navegador se revisaron sin escribir operaciones las rutas de jarcería, compras, ambos comparadores, ambos inventarios, lavandería, ventas y Reportes. Se confirmó el acceso original de Reportes sin enlaces comerciales nuevos.

El gestor final está **ready**, posee Express y React y no presenta advertencia móvil. Su cierre y posterior arranque se comprobaron con los mecanismos habituales. [Comprobación posterior](artifacts/activacion-web-20261105/postverification.private.json).

## 11. Estado de respaldos

Se obtuvieron respaldos consistentes mediante un snapshot PostgreSQL exportado, con transacción READ ONLY. Se verificaron el archivo, SHA-256 y restauración real en bases nuevas de la instancia aislada 55439.

| Respaldo | Revisión | Recuperación comprobada |
|---|---:|---|
| Anterior a integrar | 141 | Snapshot, relaciones e inventario coincidentes |
| Posterior a integrar | 143 | Snapshot, relaciones e inventario coincidentes |

Evidencias privadas: [manifiesto previo](artifacts/activacion-web-20261105/backup.manifest.private.json) y [manifiesto posterior](artifacts/activacion-web-20261105/after-backup.manifest.private.json). Ambos indican la ubicación del dump y su huella. Los primeros ensayos y sus respaldos también se conservaron.

Los dumps y las restauraciones están en almacenamiento local. Esta comprobación no acredita una copia independiente fuera de este equipo. No se sobrescribió la base operativa con un respaldo ni con un dataset QA, ni se eliminó ningún respaldo.

## 12. Bloqueos o pendientes

**No queda un bloqueo técnico que impida el uso de la web integrada.** Permanecen estas configuraciones y límites explícitos:

- Registrar los inventarios iniciales reales de los 21 productos de jarcería. Mientras se desconozcan, permanecen sin determinar.
- Clasificar desde Proveedores los 5 registros históricos antes de nuevas compras que exijan giro; se conservaron sin asignaciones automáticas.
- Registrar costos de adquisición y relaciones de abastecimiento cuando exista evidencia real. El comparador no recomienda proveedores sin costos comparables.
- Los servicios especiales mantienen importe personalizado; no se definieron tarifas no autorizadas.
- La disponibilidad de paquetes sellados requiere comprobación física; no se deduce de unidades equivalentes.
- No se realizó una prueba física desde el teléfono ni se cambió su aplicación. La compatibilidad acreditada corresponde al protocolo, datos del catálogo, cliente existente en aislamiento y acceso LAN.
- Una copia de respaldo fuera del equipo sigue sin acreditarse.

Se conserva la rama existente y el índice de Git; los cambios no fueron confirmados ni enviados. No se modificaron credenciales, red ni fuentes móviles. La información histórica del negocio quedó preservada.
