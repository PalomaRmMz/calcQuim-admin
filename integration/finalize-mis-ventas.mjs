import {readFile,writeFile,cp,mkdir} from 'node:fs/promises';
const root=new URL('file:///D:/ReactApps/calcQuim/'),admin=new URL('../',import.meta.url),stage=new URL('integration/official-sales-prepared/',root),out=new URL('.artifacts/mis-ventas/',root);
await mkdir(out,{recursive:true});await cp(new URL('.artifacts/mis-ventas/visual/',admin),new URL('visual/',out),{recursive:true});
const manifest=JSON.parse(await readFile(new URL('manifest.json',stage),'utf8'));
const table=manifest.files.map(f=>`| ${f.repository} | \`${f.path}\` | ${f.originalSha256===f.preparedSha256?'Sin cambios; compatibilidad conservada':'Modificado'} |`).join('\n');
const plan=`# Mis ventas — despliegue único pendiente de autorización

Nueva versión preparada el 12 de noviembre de 2026. **No publicada, publicación no autorizada.** El historial general anterior sí fue publicado; su autorización no autoriza esta versión. No repetir los scripts históricos de publicación/finalización: contienen supuestos del historial general y rutas de evidencia ya ocupadas.

Paquete vigente: integration/official-sales-prepared/manifest.json, scope verified-mobile-v1, published=false. Nueve archivos existentes: cinco backend y cuatro Android. Solo tres cambian respecto a lo publicado; los otros seis se conservan exactamente. Destinos relativos a D:/ReactApps/calcQuim-admin (admin) o D:/ReactApps/calcQuim (mobile):

| Repositorio | Destino exacto | Estado |
|---|---|---|
${table}

## Compatibilidad y secuencia posterior

No requiere migración, cambios de esquema, índices, nuevas rutas o permisos. Usa las mismas tablas y transacciones READ ONLY. Bearer y sales:read permanecen. No publicar herramientas QA, pruebas, copia preview-app ni adaptadores 3018/8082.

1. Obtener autorización operativa específica para Mis ventas. Este documento no la concede.
2. Releer estado comercial y servicios; verificar originalSha256 de los nueve destinos y preparedSha256 del paquete. Conservar operaciones legítimas posteriores; revisar cualquier diferencia de código antes de copiar.
3. Generar y verificar respaldo fresco con las herramientas existentes, sin crear/eliminar bases ni reutilizar rutas de recuperación ocupadas. Respaldar los nueve archivos existentes en una carpeta nueva para esta versión.
4. Una sola intervención coordinada de backend y Android, usando el gestor existente y ventana autorizada. Aplicar/verificar los nueve archivos del manifiesto; seis son idénticos. No usar la autorización ni el despliegue anterior. No reiniciar PostgreSQL.
5. Verificar listado y detalle únicamente móviles, búsqueda de folio Web vacía, ID Web/desconocido 404, Bearer 401, permiso 403, paginación y Expo Go; Inventario/Agregar producto conservados. No crear ventas de prueba en operación.
6. Comparar integridad comercial con referencia fresca. Ante fallo, revertir solo código desde el respaldo nuevo; no restaurar datos comerciales ni AsyncStorage. Marcar publicación únicamente tras comprobación operativa real.

Comprobación de preparación reutilizable: desde D:/ReactApps/calcQuim-admin ejecutar node integration/verify-mis-ventas.mjs. Su hash comercial de referencia corresponde a revisión 234; si hay actividad comercial legítima posterior, revisar/actualizar esa referencia sin sobrescribir datos.

Pendiente: autorización y ejecución operativa con respaldo/verificación frescos. Sin APK, commits ni pushes.
`;
await writeFile(new URL('deployment-plan.md',out),plan);
const oldPlan=new URL('.artifacts/official-sales-recovery/deployment-plan.md',root);
await writeFile(oldPlan,'# Plan sustituido para la nueva versión Mis ventas\n\nLa publicación anterior del historial general se conserva como antecedente. La nueva versión NO está publicada ni autorizada. Usar [.artifacts/mis-ventas/deployment-plan.md](../mis-ventas/deployment-plan.md). No repetir el despliegue histórico.\n');
await writeFile(new URL('README.md',stage),`# Mis ventas — preparado, NO publicado\n\nPaquete vigente: nueve archivos y hashes en manifest.json (verified-mobile-v1). Reutiliza el historial oficial publicado anteriormente; solo modifica salesHistory.mjs, SalesScreen.js y MainSections.js.\n\nListado y detalle SQL restringidos a evidencia móvil persistida. Los registros Web, desconocidos o contradictorios no se exponen. Mis ventas conserva folio, fecha, cobrado, búsqueda exacta, páginas y detalle; Tickets guardados y Datos anteriores separados.\n\nPruebas: ocho de historial y 44 de regresión aprobadas. PostgreSQL QA con ROLLBACK y lecturas operativas READ ONLY. Nueve fuentes compilan. Validación visual en emulator-5554/Expo Go mediante copia QA aislada.\n\nPlan vigente: ../../.artifacts/mis-ventas/deployment-plan.md. Informe: ../../HISTORIAL_VENTAS_OFICIALES_ANDROID_RESULTADO.md. No ejecutar los scripts históricos prepare-official-sales/publish-official-sales/finalize-official-sales: corresponden al historial general anterior y evidencias ocupadas. Nueva publicación requiere autorización expresa.\n`);
const reportUrl=new URL('HISTORIAL_VENTAS_OFICIALES_ANDROID_RESULTADO.md',root),old=await readFile(reportUrl,'utf8');await cp(reportUrl,new URL('baseline/resultado-anterior.md',out));
const report=`# Mis ventas — versión preparada, todavía NO publicada

Actualización del 12 de noviembre de 2026. La inspección inicial encontró ambos repositorios sin modificaciones visibles en git y un cambio posterior a la referencia del encargo: **el historial general ya estaba publicado** (cierre anterior 21:41:50Z). Se verificaron sus nueve hashes antes de preparar esta versión. No se sustituyó ninguna fuente operativa ni se reiniciaron servicios comerciales. La evidencia anterior se conserva abajo y en .artifacts/mis-ventas/baseline.

## Cambios y filtro de origen

Se reutilizaron los nueve archivos existentes. La consulta SQL aplica el mismo predicado al listado y al detalle: origin=MOVIL persistido, o ausencia de origin con evento created/channel=MOVIL; cualquier evento created/channel=WEB excluye la venta. Un origin explícito distinto de MOVIL también la excluye. No se infiere por fecha, importe, folio, ticket local ni pertenencia del ID. No se modifica ningún registro histórico.

El filtro se aplica antes de ORDER BY, LIMIT y cursor; el folio y fechas operan sobre ese conjunto. El detalle devuelve 404 fuera del conjunto incluso por ID directo, antes de consultar sus renglones o comprobante. El cursor de listado queda ligado al nuevo alcance verified-mobile-v1 para rechazar cursores anteriores. Se conservan Bearer, permiso independiente sales:read, fecha/ID descendentes, límites, instantánea/revisión y paginación de renglones.

Mis ventas presenta filas compactas con folio, fecha e importe cobrado histórico (monetary.collectedCents cuando existe; total histórico en otro caso), búsqueda exacta por folio, consulta explícita de hasta 20 ventas y Ver más ventas. Se retiraron los filtros de fechas de la interfaz y los textos técnicos del listado. Detalle de productos/cantidades, retorno sin recrear la sesión/lista/búsqueda, engranaje de Configuración y navegación Venta rápida | Inventario | Mis ventas.

Tickets guardados y Datos anteriores permanecen como accesos secundarios separados. Se conservan comprobantes, vínculo fuerte por ID/folio/SHA-256, estados inciertos y recuperación actual. No se envían, duplican, borran ni enlazan por coincidencia de importe/fecha. No se tocó AsyncStorage, credenciales, modelo de Venta rápida ni inventarios.

## Archivos

${table}

Solo los tres marcados como modificados cambian comportamiento. Manifiesto y README actualizados en integration/official-sales-prepared. Pruebas existentes actualizadas: tests/official-sales-history.test.mjs. Herramientas de preparación/verificación/documentación en calcQuim-admin/integration/{prepare-mis-ventas,update-mis-ventas-tests,verify-mis-ventas,finalize-mis-ventas}.mjs; fuera del despliegue. Se actualizaron este informe y los planes de despliegue, conservando el antecedente anterior.

## Pruebas y evidencia

- Ocho pruebas del historial aprobadas, cero fallos: inclusión móvil, exclusión Web/desconocida/contradictoria, detalle por ID 404, orden, búsqueda, parámetros, cursores inválidos/obsoletos, permisos 401/403, detalle fiel, privacidad y vínculo fuerte. Lectura de dos ventas móviles reales y exclusión de las otras 61 por listado/folio/ID; revisión 234.
- PostgreSQL QA calcquim_activation_test: casos de origen ausente/Web/desconocido/contradictorio, 5,000 cabeceras de crecimiento, detalle de 60 renglones y estado vacío. Todos los ejemplos dentro de una transacción con ROLLBACK; comprobación de cero residuos. No se creó/eliminó ninguna base ni se escribió PostgreSQL operativo.
- Las 44 pruebas existentes de regresión aprobaron: borradores, recuperación incierta, tickets, persistencia, inventario, capturas, mayoreo, navegación y redondeos. npm.cmd test; sin generar APK.
- Las nueve fuentes preparadas compilan mediante Babel; nueve hashes de propuesta y nueve hashes operativos comprobados. Evidencia: [.artifacts/mis-ventas/package-verification.json](.artifacts/mis-ventas/package-verification.json), [lecturas reales](.artifacts/mis-ventas/real-read-verified.json), [QA y rollback](.artifacts/mis-ventas/qa-growth-verified.json).
- QA visual con la habilidad computer-use, únicamente emulator-5554 / Pixel_6 y Expo Go, copia aislada existente en 8082 y servidor GET READ ONLY 3018. Se observaron V-00022/$4 y V-00024/$87, detalle Cloro con cantidad/importe guardados, retorno conservando el listado, búsqueda Web V-00063 vacía, tickets V-00001/$60, Datos anteriores con cero renglones, error offline con consulta anterior no actual, Inventario y alta que abre/regresa sin guardar. Borrador inicial/final de cero conceptos/$0 conservado. Entrada de folio y cierre de entrada al consultar comprobados; la navegación con teclado físico del emulador se conservó. La paginación completa se comprobó por API/QA: solo hay dos ventas móviles reales, por eso Ver más ventas aparece deshabilitado con límite 20. [Capturas](.artifacts/mis-ventas/visual).

## Web, backend y publicación

Revisión de Web en solo lectura: src/pages/SalesPage.jsx ya filtra MOVIL/WEB, muestra pendientes de desglose mediante inventoryPending, permite completar desglose y abre MobileSaleCorrection con ticket e historial. No se añadió conciliación ni estado Pendiente de precisar en Android. Esa capacidad Web existente no implica que toda venta móvil necesite precisarse.

Backend comercial conserva la versión anterior del historial general; Mis ventas solo está en el paquete. No requiere migración ni endpoints nuevos. Salud API web 3003 y frontend 5173: 200. Estado comercial verificado: revisión 234, 63 ventas, 9 compras. SHA-256 de operaciones d1e92a484a77c0a39e778f32ea291311e1c952e6418e9ec9a09719a779ad9b82, idéntico al cierre anterior. Sin cambios de precios, Jarcería/Lavandería para venta móvil, Mr. Big, compras o existencias.

Expo Go se recuperó del fallo inicial de descarga reutilizando el puente IPv4/IPv6 y reiniciando únicamente Expo Go; sin reinstalar, borrar datos, nuevo emulador o APK. El cierre de QA y retorno al proyecto original se registra en cierre.json; no confundir la vista previa con activación operativa.

**Pendiente real: autorización y despliegue operativo único de esta nueva versión**, con respaldo fresco y verificaciones posteriores. No se hicieron commits ni pushes. El manifiesto nuevo tiene published=false y publicationAuthorized=false. [Plan vigente](.artifacts/mis-ventas/deployment-plan.md). No publicar/repetir el paquete general anterior ni usar sus scripts de cierre como verificador de Mis ventas.

---

## Antecedente: historial general publicado antes de esta tarea

El texto siguiente documenta la versión anterior; sus afirmaciones de publicación no se refieren a Mis ventas.

`;
await writeFile(reportUrl,report+old);
await writeFile(new URL('test-results.json',out),JSON.stringify({at:new Date().toISOString(),history:{tests:8,passed:8,failed:0},regression:{tests:44,passed:44,failed:0},published:false},null,2));
console.log('Report, deployment plans, README and visual evidence updated.');
