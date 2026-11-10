# CALCQUIM — Preparación final para activación web

6 de noviembre de 2026. **Preparado para revisión; no autorizado ni activado.** Se continuó desde `CONTINUACION_ESTABILIZACION_WEB_20261106_RESULTADO.md`, conservando sus 52 archivos y la evidencia de 402 pruebas aprobadas. No se rehicieron funcionalidades.

## 1. Estado final de los requisitos

| Requisito | Resultado de esta preparación | Pendiente para operación |
| --- | --- | --- |
| Conciliación histórica | Revisados 70 renglones vigentes de 8 compras; tabla completa y evidencias | Decisión del propietario por renglón; ninguna aplicada |
| Jarcería | Identificados 21 productos sin inicial; hoja física y procedimiento sobre la interfaz existente | Contar, aprobar y capturar existencias reales |
| Reposición | Revisados 92 productos; referencias de lote para 31, sin mínimos inventados | Aprobar mínimos/lotes o excepciones explícitas |
| Lavandería y clientes compartidos | Diez escenarios adicionales de compatibilidad aprobados en memoria | Aprobar cambio comercial de centrifugado; verificación posterior y de campo |
| Integridad y dependencias | 52 preparados y 352 originales verificados; ZIP/parche válidos; 29 dependencias directas/dev coinciden con locks | Repetir preflight en la ventana si cambia el árbol |
| Migraciones | 001–010 aplicadas y checksums válidos; 011 ausente | Autorización y aplicación controlada de 011 |
| Activación y recuperación | Plan actualizado, con puertas de respaldo/restauración y recuperación por fase | Ventana, respaldo definitivo, ensayo y autorización; nada ejecutado |

Se hizo una lectura PostgreSQL consistente en transacción **REPEATABLE READ READ ONLY**, cerrada con ROLLBACK, a las **14:31:03 de Ciudad de México**, revisión **152**. El plan anterior era revisión 149: se preservó la actividad posterior. Los 70 renglones son los mismos; no se trasladó el dataset de QA a operación. Esta captura no impide que el negocio siga cambiando.

## 2. Conciliaciones históricas pendientes de decisión

La [tabla completa de conciliación](artifacts/preparacion-activacion-20261106/CONCILIACION_HISTORICA_REVISION.md) contiene los 70 renglones, compra/fecha/proveedor, producto y destino, cantidad, clasificación, anclaje, posible movimiento y acción propuesta. El [plan privado actualizado](artifacts/preparacion-activacion-20261106/reconciliation.private.json) conserva IDs y evidencias para su enlace posterior. Ninguna decisión está aprobada.

Los snapshots clasifican **41 renglones de terminado y 29 de insumos**. No hay vínculos explícitos suficientes para declarar una compra ya contabilizada; tampoco hay fundamento para declarar que todas falten. Las compras previas pueden estar incluidas en anclajes o ajustes. Un rendimiento teórico no prueba preparación ni volumen final.

Las siete coincidencias posibles se reducen a **cuatro movimientos**, todos ajustes positivos genéricos del 5 de noviembre sin referencia a factura/compra:

| Compra / renglón | Producto | Cantidad | Movimiento candidato | Decisión pendiente |
| --- | --- | --- | --- | --- |
| 05-ago / C01-R03 | Carisma | 10 L | M03 | Revisar inclusión en anclaje del 29-oct y atribución del ajuste |
| 05-ago / C01-R15 | Desengrasante Industrial | 10 L | M02 | Revisar inclusión en anclaje del 29-oct y atribución del ajuste |
| 14-oct / C07-R02 | Carisma | 10 L | M03 | Descartar doble atribución con agosto/noviembre |
| 04-nov / C08-R01 | Más Negro | 20 L | M01 | Confirmar recepción y motivo real del ajuste |
| 04-nov / C08-R02 | Desengrasante Industrial | 10 L | M02 | Confirmar a cuál compra corresponde, si corresponde |
| 04-nov / C08-R03 | Carisma | 10 L | M03 | Confirmar a cuál compra corresponde, si corresponde |
| 04-nov / C08-R04 | Zote Blanco | 20 L | M04 | Confirmar recepción y motivo real del ajuste |

M02 comparte dos candidatos y M03 comparte tres. **No se asignó el mismo movimiento varias veces ni se confirmó por fecha/cantidad.** Los IDs completos y horarios constan en la tabla ampliada. Para los otros 63 renglones sigue siendo necesaria evidencia de recepción, preparación o cobertura por inventario previo. No se crearon entradas ni se modificaron saldos.

El propietario debe resolver por renglón: ya incluido con evidencia identificada, terminado recibido que realmente falta, insumo pendiente, preparación realizada con volumen real y tratamiento del anclaje, o discrepancia pendiente. Las conciliaciones parciales que no encajen en el flujo por renglón completo requieren revisión específica; no forzarlas.

## 3. Productos de jarcería pendientes de inventario inicial

**Los 21 productos de jarcería del catálogo carecen de inicial y saldo determinado.** La [hoja de conteo de los 21 productos](artifacts/preparacion-activacion-20261106/INVENTARIO_INICIAL_JARCERIA_REVISION.md) los identifica por nombre/ID, unidad base y equivalencias de presentaciones, con campos de cantidad, responsable y corte en blanco.

Se reutiliza la ficha preparada de Inventarios → Jarcería → «Registrar inventario inicial». El procedimiento exige conteo físico, conversión comprobada de paquetes a unidades, pesaje para kg, control de entradas/salidas durante el corte y verificación del historial. Un cero requiere conteo confirmado. No se dedujeron existencias de compras ni se cargaron cifras ficticias. La fecha física se documenta en observaciones y se concilia con la hora de captura; no se inventa un corte retroactivo.

Hay equivalencias actuales que el propietario debe confirmar: **Fibra para trastes chica (ID 79)** tiene presentación «pieza» con factor 4 piezas base; Roma suelto tiene «medio-kg» con unidad comercial «pieza» y factor 0.5 kg. Sanitas y el dúo de pastillas cuentan como artículos empacados. Se documentó su tratamiento sin alterar el catálogo ni asumir errores. La etiqueta y el significado físico deben quedar claros antes de operar esas presentaciones.

## 4. Puntos de reposición pendientes de configurar

**71 productos de limpieza y 21 de jarcería** no tienen mínimo ni lote habitual configurados. La [propuesta de revisión de los 92 productos](artifacts/preparacion-activacion-20261106/PROPUESTA_REPOSICION_REVISION.md) muestra cantidades históricas de terminado y, para 31 productos, una moda única como referencia de lote, señalando los casos de una sola observación. No se usaron rendimientos teóricos de insumos para definir lotes de terminado.

Todos los mínimos siguen pendientes; no se estableció un valor global. Antes de aprobarlos se necesitan consumo representativo, plazo real de proveedor y reserva justificada. Jarcería necesita además su conteo. Ninguna propuesta se guardó en PostgreSQL. La ausencia de saldo se mantiene separada de la ausencia de punto de reposición.

## 5. Riesgos para datos reales

| Riesgo | Tratamiento preparado |
| --- | --- |
| Doble entrada histórica por ajustes o anclajes | Evidencia y aprobación por renglón; siete candidatos no se convierten en enlaces automáticos |
| Inflar terminado con bases/concentrados/hidróneos | Mantener insumos pendientes; exigir elaboración y volumen final real |
| Duplicar compras al corregir/reintentar | Conservar claves idempotentes, transacciones y seguimiento único ya preparados; no repetir solicitudes con claves nuevas |
| Captura física con operaciones simultáneas | Corte documentado, control de movimientos y conciliación entre conteo y captura |
| Confundir unidad comercial con contenido del paquete | Confirmar factores y etiquetas de presentaciones, especialmente Fibra chica (factor 4), antes de usar conversiones |
| Plan obsoleto por negocio concurrente | Refrescar revisión/generación/hash y evidencias en ventana; abortar ante cambios no revisados |
| Recuperación que borre negocio posterior | Respaldo nuevo del incidente, restauración independiente y corrección hacia delante; no restaurar automáticamente el dump previo |
| Márgenes/rotación presentados como exactos con faltantes | Conservar etiquetas de costo estimado o dato insuficiente; no inventar costos, inventarios ni umbrales |

El estado de seguimiento aún no existe en operación: `purchase_inventory` está ausente. La migración 011 es aditiva y deshabilita inicialmente la automatización; el comando conjunto registra el corte sin entradas retroactivas. Las referencias históricas solo se resuelven después de aprobación. No se aplicaron migraciones, UPDATE, ventas, compras, conteos ni movimientos operativos en esta etapa.

## 6. Compatibilidad de servicios compartidos

Se comparó la configuración vigente con la propuesta oficial del paquete, aplicada **solo en objetos en memoria**:

| Servicio | Actual | Propuesto para aprobación |
| --- | --- | --- |
| Lavado por carga | $60; adicionales insumos $10 y secado $30 | Completa/media: solo lavado $60/$30; con insumos $70/$40; con secado $90/$60; completo $100/$50 |
| Solo secado | Sin servicio separado | $30 por carga entera |
| Exprimido y secado | Importe libre; unidad servicio | Centrifugado + secado, $40 por carga entera; mismo ID compartido |
| Trabajo especial | Importe libre | Servicio a medida; importe libre y descripción obligatoria |
| Sólo exprimido | Importe libre | Se conserva su definición existente |

El cambio de unidad y modo de precio de **Exprimido y secado** necesita aprobación explícita. Las correcciones de ventas históricas usan su snapshot, conservando unidad «servicio» y precio personalizado; no se reinterpretan con la tarifa nueva.

Los **diez escenarios de compatibilidad pasaron**: catálogo y precios aceptados por los módulos reales del cliente actual; mismos productos/opciones móviles antes y después; una solicitud física del cliente conserva conceptos/importe; modo operativo no expone servicios/presentaciones aun con cabecera de capacidad; solicitudes de ambos tipos siguen rechazadas con `WEB_ONLY_COMMERCE`; protocolo porcentual antiguo conserva su rechazo; ticket/snapshot histórico estable; nueva regla por carga; «Sólo exprimido» conservado. [Resultados y hashes](artifacts/preparacion-activacion-20261106/compatibility.json).

Las solicitudes de prueba fueron a servidores HTTP efímeros en memoria, sin conexión a base y sin POST operativo. Se importaron módulos fuente del cliente para comprobar el contrato; no se compiló, instaló ni modificó móvil. Siete archivos fuente del cliente conservaron hashes antes/después y los archivos compartidos conservan la referencia previa. Esto **no certifica una APK instalada ni una prueba de campo**. La solución del servidor es mantener la compuerta operativa actual, sin habilitar lavandería/presentaciones para móvil. Los catálogos/borradores pendientes deben resincronizarse ante cambio de revisión, conservando recibos y claves de reintento.

## 7. Procedimiento de activación y recuperación

El [plan detallado de activación y recuperación](artifacts/preparacion-activacion-20261106/PLAN_ACTIVACION_Y_RECUPERACION.md) establece responsables, condiciones de aborto, preflight, respaldo con copia independiente, restauración en base nueva, migración exclusiva 011, despliegue conjunto, comando atómico de servicios/corte, reapertura y verificaciones. Incluye recuperación diferenciada antes de migrar, tras migrar, tras activar y tras nuevas operaciones reales.

No se usará el activador de alta inicial ni el migrador genérico de desarrollo como si fueran un despliegue operativo. El migrador interno aplica todos los pendientes: la ejecución futura debe comprobar que solo exista 011 pendiente. El rollback de archivos no revierte tarifas ni movimientos; no se bajará esquema ni restaurará una copia anterior perdiendo transacciones.

El [plan privado vigente](artifacts/preparacion-activacion-20261106/activation-plan.private.json) está marcado `executed: false`, `authorized: false` y con decisiones pendientes. Su revisión 152 debe refrescarse al autorizar la ventana. No contiene autorización implícita.

### Verificación de esta entrega

- Los **52 preparados** coinciden con su manifiesto; el ZIP tiene CRC válido y coincide en sus 52 entradas. `git apply --check` pasa sobre el árbol actual.
- Los **352 archivos originales** coinciden con la referencia de la continuación, incluidas modificaciones preexistentes. No se sustituyó código servido ni se alteraron los 52 preparados.
- Manifiestos de paquetes sin cambios semánticos; **29 dependencias directas/de desarrollo instaladas** coinciden con sus locks; Node v22.22.3. No se instalaron dependencias. Esto no es auditoría de vulnerabilidades ni validación exhaustiva de dependencias transitivas.
- Migraciones 001–010 verificadas en lectura; 011 pendiente. PostgreSQL 18.6 permanece local.
- La evidencia anterior conserva **402 pruebas**: web 292, backend 45 e integración 65, todas aprobadas. No se presenta como una nueva ejecución de esas suites. Esta preparación añadió los diez escenarios de compatibilidad en memoria; no reemplazan ensayos con el respaldo definitivo.
- Puertos operativos conservan sus PID: API 3003, móvil 3016 y gestor 3099: 2484; Vite 5173: 14724; PostgreSQL 5432: 6580. No se reiniciaron servicios. El listener LAN móvil previamente existente permanece igual.

Evidencias: [verificación consolidada](artifacts/preparacion-activacion-20261106/preparation-verification.json), [integridad del ZIP](artifacts/preparacion-activacion-20261106/zip-verification.json), [resumen de lectura](artifacts/preparacion-activacion-20261106/summary.json) y [listeners observados](artifacts/preparacion-activacion-20261106/operational-listeners.txt). Los JSON privados contienen información comercial local; conservarlos fuera de publicaciones y repositorios remotos.

## 8. Decisiones que requiere el propietario

1. Resolver o mantener explícitamente pendientes los 70 renglones, aportando evidencia; decidir la atribución real de M01–M04 sin duplicaciones.
2. Confirmar destino/naturaleza de productos e insumos y volumen real de preparaciones históricas cuando exista evidencia. Separar casos parciales que necesitan un tratamiento específico.
3. Designar responsable y corte del conteo físico de los 21 productos de jarcería; aprobar cantidades reales antes de capturarlas.
   Confirmar también las equivalencias y etiquetas de presentaciones señaladas en la hoja de conteo.
4. Aprobar mínimos/lotes por producto o excepciones documentadas; las 31 referencias observadas no son configuración aprobada.
5. Aprobar tarifas y reglas de lavandería, especialmente mismo ID con nueva unidad/precio para centrifugado, medias cargas y descripción del servicio a medida.
6. Autorizar ventana, responsables, interrupción coordinada futura, respaldo/copia independiente, base nueva de recuperación, migración 011, publicación conjunta y criterio de reapertura/recuperación.
7. Definir tolerancia de indisponibilidad/pérdida y aceptar solo resultados demostrados de restauración; autorizar verificaciones posteriores sobre negocio real, sin transacciones ficticias.

**La preparación para revisión está entregada. La actualización integral web no se declara terminada en operación:** faltan decisiones comerciales, conteos/configuración aprobados, respaldo y ensayo definitivo, activación autorizada y verificaciones posteriores. No se alteró PostgreSQL operativo, no se activaron cambios, no se modificó móvil y no hubo commits ni pushes.
