# Ajuste de captura de lavandería web

5 de noviembre de 2026. **Captura visual simplificada en la web integrada. Medias cargas y nuevas modalidades verificadas en QA; pendientes de habilitar en producción.** No se reiniciaron servicios ni se aplicaron cambios de configuración a PostgreSQL operativo.

## 1. Archivos modificados

- Interfaz: `src/components/CommercialSaleForm.jsx` y el nuevo `LaundrySaleFields.jsx`.
- Dominio y configuración preparada: `src/domain/commerce.mjs`, `laundryPricing.mjs` y `officialLaundryServices.mjs`.
- Validación e historial del backend: `server/src/services/commerce.mjs` y `server/src/mobile/domain.mjs`, ambos dentro de Admin.
- Ticket web: `src/domain/mobileReceipt/ticket.mjs`.
- Pruebas: `tests/laundry-pricing.test.js`, `tests/laundry-capture-render.test.js` y `server/integration/laundry-capture.test.mjs`.

## 2. Elementos visuales eliminados

La captura de lavado muestra tipo de lavado, cantidad de cargas, subtotal inmediato y **Agregar a la venta**. Se ocultan el selector de tarifa monetaria, los adicionales con precios unitarios y cualquier desglose de cargas completas/medias o fórmula. El resumen de conceptos, buscador vacío inicial, forma de pago y total general se conservan.

Servicio a medida muestra descripción obligatoria, importe personalizado y subtotal. La descripción se conserva en el resumen, historial y ticket.

## 3. Tarifas y cantidades

La configuración oficial preparada define completa/media: solo lavado **60/30**, con insumos **70/40**, con secado **90/60** y completo **100/50**. El componente no contiene estos precios: lee el servicio del catálogo.

El dominio admite incrementos positivos de 0.5 y suma cargas completas más la media específica. **4.5 completas = $450**. Secado y centrifugado con secado conservan $30 y $40 por carga entera, sin inventar medias cargas. Se rechazan cantidades y combinaciones inválidas.

Express reconstruye el importe desde la configuración oficial. El subtotal enviado por el navegador no es autoridad. Los snapshots conservan tarifas y cálculo para correcciones; los registros antiguos mantienen su regla anterior. No hacen falta nuevas tablas ni migraciones: la configuración cabe en los registros JSON existentes de servicios.

## 4. Homogeneidad visual

Se reutilizan la ventana y encabezado actuales, `Field`, selectores, botones, tabla y clases existentes. No se modificó ningún estilo global.

Capturas QA revisadas: [lavado de $450](artifacts/ajuste-lavanderia-20261105/lavado-450.png), [venta mixta de $92.50](artifacts/ajuste-lavanderia-20261105/venta-mixta-9250.png) y [servicio a medida](artifacts/ajuste-lavanderia-20261105/servicio-a-medida.png).

## 5. Pruebas aprobadas

**329 pruebas**, incluidas subpruebas: [280 web](artifacts/ajuste-lavanderia-20261105/web-tests.log), [44 servidor](artifacts/ajuste-lavanderia-20261105/server-tests.log) y [5 de integración PostgreSQL aislada](artifacts/ajuste-lavanderia-20261105/integration-tests.log). Cero fallidas u omitidas. Lint y compilación web aprobados.

Se comprobaron las cuatro combinaciones para 0.5, 1, 1.5 y 4.5 cargas; validaciones; servicios independientes; descripción obligatoria; corrección, anulación, snapshots e idempotencia; tickets; mayoreo y precios físicos.

En navegador QA se verificaron actualización inmediata, bloqueo de cantidades inválidas y registro de **Salvo 1 kg $35 + media carga completa $50 + Downy 0.5 L $7.50 = $92.50**. Esos productos se utilizaron como fixtures; no se incorporaron al catálogo real. En operativo sólo se abrió y canceló el formulario para comprobar compatibilidad con cargas enteras y bloqueo seguro de medias aún no configuradas.

## 6. Compatibilidad y conservación

No se modificaron fuentes móviles, contratos de la APK, Reportes, mayoreo ni catálogos físicos reales. No hubo APK, ADB ni escrituras de ensayo en producción. El proceso operativo conserva el mismo PID.

Durante el trabajo apareció una venta web adicional de limpieza: revisión 143 → 144. Se conserva, junto con todas las ventas anteriores; productos, proveedores, compras, presentaciones y servicios coinciden con el estado previo. [Verificación final](artifacts/ajuste-lavanderia-20261105/validation.private.json).

## 7. Pendientes reales

El servidor activo todavía usa la regla de cargas enteras y el catálogo real no contiene medias cargas, Solo secado ni las nuevas definiciones de Servicio a medida y Centrifugado + secado. **No se habilitó ese flujo en producción**, porque hacerlo requiere cargar el backend preparado y actualizar la configuración real de servicios de forma coordinada. La solicitud prohíbe interrumpir servicios; por ello se detuvo únicamente esa parte operativa.

La interfaz actual permite las cargas enteras vigentes y muestra un aviso breve al intentar medias todavía no habilitadas. La experiencia completa está disponible para revisión en **http://127.0.0.1:5358/ventas**, entorno sintético con PostgreSQL 55439.

No se hicieron commits ni pushes.
