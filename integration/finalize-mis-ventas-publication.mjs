import assert from 'node:assert/strict';
import {readFile,writeFile,cp,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const admin=new URL('../',import.meta.url),mobile=new URL('file:///D:/ReactApps/calcQuim/'),out=new URL('.artifacts/mis-ventas-publication/',mobile),stage=new URL('integration/official-sales-prepared/',mobile),backupDir=new URL('.artifacts/mobile-inventory-activation/activation-mis-ventas-20261112/',mobile);
const json=async u=>JSON.parse(await readFile(u,'utf8')),hash=b=>createHash('sha256').update(b).digest('hex');
const api=await json(new URL('api-verification.json',out)),pub=await json(new URL('publication-applied.json',out)),initial=await json(new URL('initial.json',out)),backup=await json(new URL('backup.private.json',backupDir)),preservation=await json(new URL('operational-preservation.json',backupDir)),manifest=await json(new URL('manifest.json',stage));
assert.equal(preservation.equal,true);assert.equal(api.commercialDataPreserved,true);assert.equal(hash(await readFile(new URL('src/pages/SalesPage.jsx',admin))),initial.protectedSalesPageSha256);
for(const f of manifest.files){assert.equal(hash(await readFile(new URL(f.path,f.repository==='admin'?admin:mobile))),f.preparedSha256);assert.equal(hash(await readFile(new URL(f.repository+'/'+f.path,stage))),f.preparedSha256);}
await cp(new URL('.artifacts/mis-ventas-publication/visual/',admin),new URL('visual/',out),{recursive:true});
const visualFiles=await readdir(new URL('visual/',out));for(const name of ['listado-operativo.jpg','detalle-operativo.jpg','web-excluida.jpg','tickets.jpg','anteriores.jpg','agregar-producto.jpg','borrador-final.jpg'])assert.ok(visualFiles.includes(name));
const managerState=await json(new URL('server/artifacts/launcher/manager.private.json',admin));const r=await fetch('http://127.0.0.1:3099/status',{headers:{Authorization:'Bearer '+managerState.token}}),manager=await r.json();assert.equal(manager.ready,true);assert.equal(manager.mobileWarning,false);
const at=new Date().toISOString(),result={at,status:'ACTIVACIÓN COMPLETADA',authorized:true,published:true,verifiedFromEmulatorAgainstOperationalBackend:true,emulator:'emulator-5554',expoUri:'exp://127.0.0.1:8081',qaListeners:[],adbReverse:[8081],filesActuallyReplaced:pub.files.map(f=>({repository:f.repository,path:f.path,sha256:f.preparedSha256})),nineFilesVerified:true,sixOtherSourcesUntouched:true,revisionInitial:api.before.revision,revisionFinal:preservation.revision,generationInitial:api.before.generation,generationFinal:preservation.generation,sales:api.after.sales,purchases:api.after.purchases,products:api.after.products,commercialDataPreserved:true,protectedSalesPagePreserved:true,backupSha256:backup.sha256,archiveReadable:true,secondaryVerified:true,independentRestorePerformed:false,servicesReady:true,manager,visualFiles,blockers:[],commits:0,pushes:0,apkGenerated:false};
await writeFile(new URL('result.json',out),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
await writeFile(new URL('android-verification.json',out),JSON.stringify({at,emulator:'emulator-5554',expoGoDataCleared:false,reinstalled:false,originalProject:true,qaRedirects:false,operationalBackend:true,mobileFolios:['V-00022','V-00024'],historicalDetail:'V-00022, Cloro, cantidad histórica 0.6666666666666666 litro, precio $6, importe $4',webFolioSearchEmpty:'V-00063',tickets:'V-00001/$60, confirmed',legacyRows:0,inventoryOpened:true,addProductOpenedAndReturnedWithoutSaving:true,draftBeforeAfter:'0 conceptos / $0',finalScreen:'Venta rápida',visualFiles},null,2)+'\n');
Object.assign(manifest,{published:true,publicationAuthorized:true,publishedAt:pub.at,verifiedAt:at,publicationEvidence:'.artifacts/mis-ventas-publication/result.json'});await writeFile(new URL('manifest.json',stage),JSON.stringify(manifest,null,2)+'\n');
const prefix=`# ACTIVACIÓN COMPLETADA — Mis ventas Android

Publicada y verificada el 12 de noviembre de 2026 (${at}) desde **emulator-5554 y Expo Go contra el backend operativo**. No es una vista previa. La autorización expresa del propietario cubrió el manifiesto vigente y el plan de Mis ventas. [Resultado final](.artifacts/mis-ventas-publication/result.json).

## Publicación efectiva y alcance

Una sola intervención coordinada. Se sustituyeron exactamente tres archivos por sus propuestas verificadas:

- Admin: server/src/repositories/salesHistory.mjs.
- Android: src/components/MainSections.js.
- Android: src/screens/SalesScreen.js.

Los nueve hashes de destino y propuesta se comprobaron antes y después. Los otros seis archivos se dejaron intactos. Respaldo de los tres originales en .artifacts/mis-ventas-publication/files-before; el manifiesto conserva originalSha256 y preparedSha256 para revisión/reversión exclusiva de código. src/pages/SalesPage.jsx conservó su hash. No se publicaron herramientas QA ni se reconstruyó el historial. [Archivos aplicados](.artifacts/mis-ventas-publication/publication-applied.json).

## PostgreSQL y respaldo fresco

Estado inicial/final: revisión **${api.before.revision} → ${preservation.revision}**, generación **${preservation.generation}**, **${api.after.sales} ventas, ${api.after.purchases} compras y ${api.after.products} productos**. PostgreSQL permaneció encendido; no se crearon/eliminaron bases o esquemas ni se ejecutaron migraciones. Las 13 migraciones aplicadas coinciden con sus fuentes.

Respaldo fresco creado ${backup.createdAt}, ${backup.bytes} bytes, archivo ${backup.file}. SHA-256 **${backup.sha256}**. Archivo custom comprobado por índice y lectura completa con pg_restore a salida descartada; copia adicional en D:/CalcQuim-Backups/preparacion-inventario-android-20261110 con el mismo hash. [Metadatos](.artifacts/mobile-inventory-activation/activation-mis-ventas-20261112/backup.private.json). No se efectuó restauración independiente: intervención limitada a código sin cambios de esquema; no se afirma haber probado una restauración nueva ni se sobrescribió una recuperación ocupada.

Dos observaciones previas y la comprobación tras drenaje confirmaron cero transacciones activas y ausencia de cambios comerciales durante la interrupción. El gestor existente agrupa Express, API móvil y frontend: se cerró/reinició ese grupo para cargar el módulo, sin reiniciar PostgreSQL ni procesos ajenos. El servicio volvió listo y sin mobileWarning. Express 3003, frontend 5173 y API móvil 3016 por loopback y LAN respondieron correctamente. [Preflight](.artifacts/mis-ventas-publication/preflight.json), [API](.artifacts/mis-ventas-publication/api-verification.json).

Huellas finales idénticas: dataset, ventas, compras, productos, inventarios, paquetes físicos, redondeo web v2 y migraciones. SHA-256 de operaciones **${api.after.hash}**. [Preservación final](.artifacts/mobile-inventory-activation/activation-mis-ventas-20261112/operational-preservation.json). Cero ventas ficticias y cero escrituras comerciales de prueba.

## Verificación posterior real

- API loopback y LAN: dos ventas móviles incluidas, 61 ventas Web excluidas por folio e ID directo 404, búsqueda móvil exacta, orden descendente, páginas de una venta sin repeticiones, detalle comparado contra PostgreSQL, parámetros inválidos 400 y venta inexistente 404.
- Origen desconocido: actualmente no hay ventas operativas con ese origen (excludedUnknown=0). Su exclusión y 404 están cubiertos por las pruebas PostgreSQL QA previas del mismo código/hash, incluidos origen ausente y evidencia contradictoria. No se fabricaron ejemplos operativos para simular ese caso.
- Bearer ausente/incorrecto 401 en listado y detalle. Política instalada conserva exclusivamente sales:read para lectura; las dos rutas instaladas rechazaron 403 al ejercitarlas con un principal sin ese permiso. No se cambiaron credenciales ni facultades de escritura.
- Android original exp://127.0.0.1:8081: pestaña Mis ventas, V-00022/$4 y V-00024/$87; detalle Cloro con cantidad, precio e importe históricos; volver conserva listado. Buscar V-00063 muestra el estado vacío. Solo hay dos ventas móviles reales: Ver más ventas queda deshabilitado al límite 20; la paginación se comprobó por API al límite 1.
- Tickets guardados V-00001/$60 y Datos anteriores con cero renglones conservados y accesibles. Inventario abre y Agregar producto abre/regresa sin guardar. Venta rápida conserva el borrador original de cero conceptos/$0. Sin borrar AsyncStorage, comprobantes o credenciales. [Validación Android](.artifacts/mis-ventas-publication/android-verification.json), [capturas](.artifacts/mis-ventas-publication/visual).

Se reutilizaron las ocho pruebas específicas y 44 de regresión de QA; no se repitió el desarrollo ni se atribuyen esas 52 ejecuciones al periodo posterior a publicar. Las comprobaciones API y visuales anteriores sí fueron posteriores a la publicación.

## Incidencias y cierre

Expo Go necesitó relanzar el enlace original después de quedar en su pantalla Home al reiniciar; se abrió de nuevo el proyecto y cargó el bundle publicado. Sin reinstalar, borrar datos, reiniciar el AVD o reparar módulos. Se completó el registro de generación leyendo dataset_state directamente durante preflight; no implicó cambio de aplicación ni datos. No hubo fallos críticos ni reversión. Queda pantalla final Venta rápida. Metro original 8081 y su reverse permanecen; sin listeners/puentes QA 3018/8082/8083.

**Sin bloqueos pendientes de esta activación.** Sin APK, commits, pushes, corrección Mr. Big ni cambios en ventas móviles habilitadas de Jarcería/Lavandería. Manifiesto marcado published=true únicamente después de observar Mis ventas funcionando contra operación.

---

## Antecedentes de preparación: sustituidos por la activación anterior

Las menciones siguientes a «pendiente de publicación» describen el estado histórico anterior.

`;
const report=new URL('HISTORIAL_VENTAS_OFICIALES_ANDROID_RESULTADO.md',mobile);await writeFile(report,prefix+await readFile(report,'utf8'));
const plan=new URL('.artifacts/mis-ventas/deployment-plan.md',mobile);await writeFile(plan,'# Estado: ACTIVACIÓN COMPLETADA\n\nLos tres archivos funcionales se publicaron en una sola intervención autorizada y se verificaron desde emulator-5554 contra el backend operativo. Los otros seis permanecen idénticos. Resultado: ../mis-ventas-publication/result.json. No repetir este despliegue. El plan siguiente es antecedente histórico.\n\n'+await readFile(plan,'utf8'));
const readme=new URL('README.md',stage);await writeFile(readme,'# Mis ventas PUBLICADO Y VERIFICADO\n\nActivación completada contra operación desde emulator-5554. Evidencia: ../../.artifacts/mis-ventas-publication/result.json. No volver a publicar este paquete sin revisar el estado actual. El texto siguiente conserva la preparación histórica.\n\n'+await readFile(readme,'utf8'));
console.log(JSON.stringify({status:result.status,published:true,verifiedFromEmulator:true,revision:result.revisionFinal,changedFiles:3,blockers:[]}));
