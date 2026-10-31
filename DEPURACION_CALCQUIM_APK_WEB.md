# DEPURACIÓN CALCQUIM APK Y WEB

Seguimiento: los pendientes de Expo Go y ESLint de ventas se investigaron y corrigieron posteriormente. La causa, comparación A/B y validación completa desde Android están en [CORRECCIONES_EXPO_VENTAS.md](docs/CORRECCIONES_EXPO_VENTAS.md). El resto de este informe conserva los resultados históricos de la limpieza.

Fecha: 31 de octubre de 2026. Auditoría y limpieza conservadora sobre las ramas existentes. No se hicieron commits, pushes, cambios de rama, instalaciones ni desinstalaciones de paquetes.

## 1. Estado inicial y alcance

| Proyecto | Ruta | Rama | Archivos rastreados | Cambios / nuevos / staged iniciales |
|---|---|---|---:|---|
| Admin | D:\ReactApps\calcQuim-admin | inventario | 381 | 0 / 0 / 0 |
| Móvil | D:\ReactApps\calcQuim | dev | 130 | 0 / 0 / 0 |

Referencias iniciales de Git: Admin 924d9581429926e7550105c4d1215dbb979a42c5; móvil 22cb55a284572b65e280f3a22ca4fe2e15f1f718. Se respetaron ambos HEAD y el índice. La excepción de propiedad de Git del móvil se aplicó solamente a cada comando mediante safe.directory; no se cambió la configuración global.

Se inspeccionaron imports estáticos y dinámicos, require(), navegación, scripts package.json, configuraciones Expo/Metro/Babel/Tailwind, relaciones entre copias de integración y referencias en pruebas y documentación. El grafo estático se usa para proponer candidatos, nunca como prueba suficiente para borrar código. Tailwind escanea todo src y la vinculación nativa puede incluir dependencias sin imports JavaScript.

La solicitud permite retirar solo A. No se borró ningún elemento B ni C. Las pruebas PostgreSQL que crean y eliminan esquemas de ensayo no se ejecutaron: esta auditoría no ejecuta DROP, migraciones ni cambios en bases existentes. Para probar escritura se usó Express con estado sintético exclusivamente en memoria.

## 2. Inventario previo y archivos detectados

### A. Generados seguros: eliminación efectuada

| Proyecto | Ruta | Bytes verificados | Archivos | Referencias y motivo | Riesgo | Regeneración |
|---|---|---:|---:|---|---|---|

| Admin | node_modules/.vite-tests | 62278138 | 3322 | Salida Vite; .vite-tests tiene UUID por prueba; .vite es caché anterior. La caché activa .vite-admin queda fuera. No es almacén de ventas ni tickets. | Bajo: siguiente ejecución recompila | Vite y dependencias instaladas |

| Admin | node_modules/.vite | 1648521 | 86 | Salida Vite; .vite-tests tiene UUID por prueba; .vite es caché anterior. La caché activa .vite-admin queda fuera. No es almacén de ventas ni tickets. | Bajo: siguiente ejecución recompila | Vite y dependencias instaladas |

| Móvil | node_modules/.vite | 676 | 8 | Salida Vite; .vite-tests tiene UUID por prueba; .vite es caché anterior. La caché activa .vite-admin queda fuera. No es almacén de ventas ni tickets. | Bajo: siguiente ejecución recompila | Vite y dependencias instaladas |

La clasificación y la lista de rutas, tamaños y SHA-256 se guardaron antes del borrado en artifacts/cleanup/deletion-plan.private.json e INVENTARIO_PREVIO.md. Cada archivo se comprobó otra vez contra su hash antes de Remove-Item -LiteralPath. No se usó git clean, borrado recursivo de carpetas ni se tocó la caché activa del navegador. Los directorios antiguos vacíos pueden permanecer; no se confunden con archivos recuperables.

### B. Código aparentemente anterior: conservado, requiere autorización

| Proyecto | Ruta | Bytes | Referencias encontradas | Motivo | Riesgo / regeneración |
|---|---|---:|---|---|---|

| Admin | src/components/BatchSupplyModal.jsx | 23227 | tests/navigation.test.js; tests/render.test.js | Fuera del grafo de entrada actual; validar uso histórico, dinámico y pruebas antes de retirar | Medio/alto; restaurar desde Git, no se regenera compilando |

| Admin | src/components/SupplyFormModal.jsx | 6947 | tests/navigation.test.js; tests/render.test.js | Fuera del grafo de entrada actual; validar uso histórico, dinámico y pruebas antes de retirar | Medio/alto; restaurar desde Git, no se regenera compilando |

| Admin | src/utils/batchSupplyOperations.js | 1322 | src/components/BatchSupplyModal.jsx; tests/procurement-batch.test.js | Fuera del grafo de entrada actual; validar uso histórico, dinámico y pruebas antes de retirar | Medio/alto; restaurar desde Git, no se regenera compilando |

| Móvil | src/components/ProductButton.js | 1412 | Sin referencia encontrada en los archivos examinados | Fuera del grafo de entrada actual; validar uso histórico, dinámico y pruebas antes de retirar | Medio/alto; restaurar desde Git, no se regenera compilando |

| Móvil | src/components/ProductSearchInput.js | 4363 | src/screens/AddSaleScreen.js; src/screens/CalculatorScreen.js | Fuera del grafo de entrada actual; validar uso histórico, dinámico y pruebas antes de retirar | Medio/alto; restaurar desde Git, no se regenera compilando |

| Móvil | src/components/QuickNav.js | 2778 | src/screens/AddSaleScreen.js; src/screens/CalculatorScreen.js; src/screens/ListScreen.js; otras menciones | Fuera del grafo de entrada actual; validar uso histórico, dinámico y pruebas antes de retirar | Medio/alto; restaurar desde Git, no se regenera compilando |

| Móvil | src/components/ResultBox.js | 2196 | src/screens/AddSaleScreen.js; src/screens/CalculatorScreen.js | Fuera del grafo de entrada actual; validar uso histórico, dinámico y pruebas antes de retirar | Medio/alto; restaurar desde Git, no se regenera compilando |

| Móvil | src/components/SaleCard.js | 4172 | src/screens/ListScreen.js | Fuera del grafo de entrada actual; validar uso histórico, dinámico y pruebas antes de retirar | Medio/alto; restaurar desde Git, no se regenera compilando |

| Móvil | src/data/Products.js | 8241 | integration/admin/server/src/services/commands.mjs; integration/admin/src/services/dataExport.js; src/components/ProductSearchInput.js; otras menciones | Fuera del grafo de entrada actual; validar uso histórico, dinámico y pruebas antes de retirar | Medio/alto; restaurar desde Git, no se regenera compilando |

| Móvil | src/screens/AddSaleScreen.js | 5573 | Sin referencia encontrada en los archivos examinados | Fuera del grafo de entrada actual; validar uso histórico, dinámico y pruebas antes de retirar | Medio/alto; restaurar desde Git, no se regenera compilando |

| Móvil | src/screens/CalculatorScreen.js | 5258 | Sin referencia encontrada en los archivos examinados | Fuera del grafo de entrada actual; validar uso histórico, dinámico y pruebas antes de retirar | Medio/alto; restaurar desde Git, no se regenera compilando |

| Móvil | src/screens/HomeScreen.js | 4687 | Sin referencia encontrada en los archivos examinados | Fuera del grafo de entrada actual; validar uso histórico, dinámico y pruebas antes de retirar | Medio/alto; restaurar desde Git, no se regenera compilando |

| Móvil | src/screens/ListScreen.js | 4924 | Sin referencia encontrada en los archivos examinados | Fuera del grafo de entrada actual; validar uso histórico, dinámico y pruebas antes de retirar | Medio/alto; restaurar desde Git, no se regenera compilando |

| Móvil | src/screens/ProductCatalogScreen.js | 9346 | Sin referencia encontrada en los archivos examinados | Fuera del grafo de entrada actual; validar uso histórico, dinámico y pruebas antes de retirar | Medio/alto; restaurar desde Git, no se regenera compilando |

| Móvil | src/screens/ProductFormScreen.js | 7494 | Sin referencia encontrada en los archivos examinados | Fuera del grafo de entrada actual; validar uso histórico, dinámico y pruebas antes de retirar | Medio/alto; restaurar desde Git, no se regenera compilando |

| Móvil | src/storage/productsStorage.js | 4559 | Sin referencia encontrada en los archivos examinados | Fuera del grafo de entrada actual; validar uso histórico, dinámico y pruebas antes de retirar | Medio/alto; restaurar desde Git, no se regenera compilando |

| Móvil | src/utils/exportProducts.js | 1583 | src/screens/ProductCatalogScreen.js | Fuera del grafo de entrada actual; validar uso histórico, dinámico y pruebas antes de retirar | Medio/alto; restaurar desde Git, no se regenera compilando |

| Móvil | src/utils/importProducts.js | 1032 | src/screens/ProductCatalogScreen.js | Fuera del grafo de entrada actual; validar uso histórico, dinámico y pruebas antes de retirar | Medio/alto; restaurar desde Git, no se regenera compilando |

| Móvil | src/utils/numberInput.js | 257 | src/screens/AddSaleScreen.js; src/screens/CalculatorScreen.js; src/screens/ProductFormScreen.js | Fuera del grafo de entrada actual; validar uso histórico, dinámico y pruebas antes de retirar | Medio/alto; restaurar desde Git, no se regenera compilando |

| Móvil | src/utils/salesCalculations.js | 1228 | src/components/ResultBox.js; src/components/SaleCard.js; src/screens/AddSaleScreen.js; otras menciones | Fuera del grafo de entrada actual; validar uso histórico, dinámico y pruebas antes de retirar | Medio/alto; restaurar desde Git, no se regenera compilando |

Los tres candidatos Admin suman 31496 bytes. Los 17 candidatos móviles suman 69103 bytes. No se ha demostrado que retirarlos reduzca la APK: los módulos fuera del grafo ya pueden estar ausentes del bundle.

### B. Otras duplicaciones o material de trabajo: conservado

| Proyecto | Ruta | Tamaño inicial | Referencias / motivo | Riesgo | Regeneración |
|---|---|---:|---|---|---|

| Móvil | integration/admin/** (22 archivos) | 171309 bytes | Copias de Admin y migración 007, usadas por preparación/publicación y como referencia; no son una segunda aplicación móvil | Alto: pueden sobrescribir versiones actuales si se ejecutan herramientas antiguas | Recuperar desde Git; no ejecutar scripts para regenerar sin revisar |

| Móvil | integration/amend-admin.mjs | 4181 bytes | Utilidad puntual de integración; revisar referencias entre scripts y documentación. No es script de arranque habitual de package.json | Alto si se ejecuta: puede copiar código hacia Admin | Git; conservar hasta autorización |

| Móvil | integration/finalize-admin.mjs | 3183 bytes | Utilidad puntual de integración; revisar referencias entre scripts y documentación. No es script de arranque habitual de package.json | Alto si se ejecuta: puede copiar código hacia Admin | Git; conservar hasta autorización |

| Móvil | integration/prepare-admin.mjs | 8235 bytes | Utilidad puntual de integración; revisar referencias entre scripts y documentación. No es script de arranque habitual de package.json | Alto si se ejecuta: puede copiar código hacia Admin | Git; conservar hasta autorización |

| Móvil | integration/protect-references.mjs | 1467 bytes | Utilidad puntual de integración; revisar referencias entre scripts y documentación. No es script de arranque habitual de package.json | Alto si se ejecuta: puede copiar código hacia Admin | Git; conservar hasta autorización |

| Móvil | integration/publish-redesign.mjs | 4850 bytes | Utilidad puntual de integración; revisar referencias entre scripts y documentación. No es script de arranque habitual de package.json | Alto si se ejecuta: puede copiar código hacia Admin | Git; conservar hasta autorización |

| Móvil | integration/update-inventory-test.mjs | 791 bytes | Utilidad puntual de integración; revisar referencias entre scripts y documentación. No es script de arranque habitual de package.json | Alto si se ejecuta: puede copiar código hacia Admin | Git; conservar hasta autorización |

| Móvil | integration/update-redesign-docs.mjs | 1579 bytes | Utilidad puntual de integración; revisar referencias entre scripts y documentación. No es script de arranque habitual de package.json | Alto si se ejecuta: puede copiar código hacia Admin | Git; conservar hasta autorización |

| Móvil | integration/update-revision.mjs | 536 bytes | Utilidad puntual de integración; revisar referencias entre scripts y documentación. No es script de arranque habitual de package.json | Alto si se ejecuta: puede copiar código hacia Admin | Git; conservar hasta autorización |

| Admin | postman/collections/CalcQuim local — Fase 2 Health/.resources/definition.yaml<br>server/postman/CalcQuim local — Fase 2 Health/.resources/definition.yaml | 538 bytes entre copias | Contenido idéntico; rutas distintas de colecciones Postman pueden corresponder a importaciones existentes | Medio: romper referencias del workspace | Git / exportación Postman revisada |

| Admin | postman/collections/CalcQuim local — Fase 2 Health/Liveness — proceso HTTP.request.yaml<br>server/postman/CalcQuim local — Fase 2 Health/Liveness — proceso HTTP.request.yaml | 866 bytes entre copias | Contenido idéntico; rutas distintas de colecciones Postman pueden corresponder a importaciones existentes | Medio: romper referencias del workspace | Git / exportación Postman revisada |

| Admin | postman/collections/CalcQuim local — Fase 2 Health/Readiness — conexión PostgreSQL.request.yaml<br>server/postman/CalcQuim local — Fase 2 Health/Readiness — conexión PostgreSQL.request.yaml | 1176 bytes entre copias | Contenido idéntico; rutas distintas de colecciones Postman pueden corresponder a importaciones existentes | Medio: romper referencias del workspace | Git / exportación Postman revisada |

| Admin | server/.npm-cache/ | 18431903 bytes | Caché de instalación: regenerable con acceso al registro, pero útil para reinstalación sin red. No se asume que sea prescindible para recuperación | Medio en entorno sin red | npm con acceso al registro |

Las pruebas actuales se conservaron completas. Que una prueba mencione una pantalla antigua no demuestra redundancia: puede verificar compatibilidad, migraciones o regresiones. Los documentos de fases anteriores se conservan como historial; solo se corrigió la afirmación desactualizada de la rama fija en GIT_INICIO_RESPALDOS.md.

### C. Protegidos: no eliminados ni modificados

| Proyecto | Ruta / recurso | Tamaño inicial cuando aplica | Referencias / motivo | Riesgo | Recuperación |
|---|---|---:|---|---|---|
| Admin | calcquim_operational y bases de ensayo/restauración | No aplica | Datos operativos y recuperación | Crítico | Respaldos; ninguna escritura ejecutada |
| Admin | server/artifacts/** | 17628330 bytes | Activación, respaldos, migración, restauración, gestor y tarea diaria | Crítico | Conservar todas las evidencias previas |
| Admin | CalcQuim_Respaldo_Original_*.json | 1064726 bytes | Respaldo histórico real | Crítico | Conservar original |
| Ambos | .env*, *.dump, *.backup, claves, tickets, fotografías y registros privados | Variable | Credenciales, datos reales y recuperación | Crítico | No se regeneran desde código |
| Móvil | .artifacts/** | 80945056 bytes | Evidencias privadas y compilaciones de verificación | Alto | Conservar |
| Móvil | output/** | 5590629 bytes | Muestras sintéticas y capturas referenciadas por output/README.md | Alto como evidencia; tickets protegidos por la solicitud | Conservar; no retirar del índice automáticamente |
| Móvil | dist/*.apk y hash existente | 182085220 bytes | APK firmadas de referencia; necesarias para comparación e instalación | Alto | Conservar binarios y firma |
| Móvil | assets/** | 1371948 bytes | Logo, iconos, favicon y splash | Alto: identidad y arranque | Conservar originales |

El catálogo fijo src/data/Products.js y el almacenamiento anterior se mantienen. La aplicación actual entra por QuickSaleScreen, ConnectionScreen y SaleSummaryScreen y sincroniza el catálogo desde Admin. useMobileSale aún lee claves anteriores mediante readLegacyData; ConnectionScreen permite revisar/compartir la recuperación. La ausencia de una pantalla antigua en la navegación no autoriza borrar las claves existentes ni sus rutas de compatibilidad.

## 3. Eliminación segura realizada

Se eliminaron 3416 archivos de caché, 63927335 bytes (60.97 MiB): 3408 archivos de Admin y 8 del móvil. El número incluye cachés producidas durante las pruebas iniciales. Los manifiestos web-deleted.private.json y mobile-deleted.private.json registran el resultado por proyecto.

No se retiraron fuentes, paquetes, módulos nativos, pruebas, endpoints, migraciones, scripts de respaldo ni recursos de tickets. No se ejecutaron herramientas antiguas de publicación ni cambios de esquema.

## 4. Archivos conservados y cambios de organización

- Admin .gitignore: agrega exclusión de cachés, APK/AAB y material de firma sin ocultar fuentes, migraciones o plantillas.

- Móvil .gitignore: excluye futuras credenciales, respaldos, evidencias privadas, cachés, APK y salidas de trabajo. Los archivos ya versionados de output permanecen versionados.

- Móvil .easignore: refuerza la exclusión de documentos de trabajo, respaldos, claves de firma y artefactos de pruebas al preparar la carga EAS. Las exclusiones no borran archivos del disco.

- Admin eslint.config.js: no analiza evidencias o copias temporales dentro de artifacts, conservando el análisis de las fuentes reales.

- Admin docs/GIT_INICIO_RESPALDOS.md: consulta la rama existente en vez de afirmar que siempre es dev.

El archivo .easignore tiene prioridad sobre .gitignore en la preparación EAS; no garantiza por sí solo una APK más pequeña. Se verificaron 54 rutas necesarias de fuentes, assets y configuración: ninguna queda excluida; tampoco quedaron permitidas las rutas sintéticas de credenciales y documentos evaluadas. Referencia: [Expo EAS ignore](https://docs.expo.dev/build-reference/easignore/). Antes de modificar el proyecto Expo se consultó su instrucción AGENTS.md y la [documentación exacta de SDK 56](https://docs.expo.dev/versions/v56.0.0/).

## 5. Dependencias: uso directo, indirecto y candidatos

| Proyecto / paquete | Evidencia | Decisión |
|---|---|---|
| Admin: @emotion/react, @emotion/styled | Peers de MUI y material-react-table | Conservar |
| Admin: @mui/icons-material, @mui/x-date-pickers | Peers declarados de material-react-table, usados indirectamente por sus controles | Conservar |
| Admin: @fortawesome/fontawesome-svg-core | Peer de react-fontawesome | Conservar |
| Admin: @popperjs/core | Peer de bootstrap; revisar también uso MUI/transitivo | Conservar; no retirar por falta de imports directos |
| Admin: @types/react, @types/react-dom | Herramientas y tipos; no se importan en ejecución | Conservar |
| Admin backend: express, pg | Rutas REST, integración móvil y PostgreSQL | Conservar |
| Móvil: babel-preset-expo | Referenciado por babel.config.js | Conservar |
| Móvil: react-native-screens | Navegación native-stack / vinculación nativa | Conservar |
| Móvil: react-native-reanimated | NativeWind / react-native-css-interop; no basta buscar imports en src | Conservar |
| Móvil: expo-status-bar | Plugin app.json, uso de configuración | Conservar |
| Móvil: expo-print, expo-sharing, expo-file-system, react-native-view-shot | SaleSummaryScreen: PDF, caché, captura PNG y compartir | Conservar; probado en Android |
| Móvil: netinfo, async-storage, secure-store, expo-crypto | Conexión, borrador, credencial e idempotencia | Conservar |
| Móvil: @react-native-picker/picker | Sin import encontrado; posible inclusión nativa | B: requiere autorización y revisión del autolinking antes de retirar |
| Móvil: expo-document-picker | Importación de catálogo en utilidades anteriores | B: requiere decidir retiro del flujo anterior y probar recuperación |
| Móvil: prettier-plugin-tailwindcss | Sin referencia de configuración encontrada; instalado en dependencies | B: posible mover a devDependencies si se conserva el formateo; no se hizo |

No se modificaron package.json, lockfiles ni paquetes instalados. Las dependencias de herramientas no aumentan necesariamente el bundle; las dependencias nativas pueden estar vinculadas aun sin imports JavaScript.

## 6. Optimización conseguida

scripts/vite-cache.mjs ahora elimina al cerrar solamente la carpeta UUID generada por su propia instancia SSR. Comprueba la ruta .vite-tests y evita symlinks. No limpia .vite-admin ni cachés de otras instancias. La prueba nueva crea una caché sintética y otra activa, cierra el plugin y verifica que solo desaparece la primera. Las 244 pruebas completas posteriores dejan cero archivos en .vite-tests. Esto corrige la acumulación que motivó la mayor parte de la limpieza.

scripts/audit-git.mjs deja de fallar al inspeccionar el índice por el límite de salida de git show. Reconoce exclusivamente el logo oficial mediante ruta exacta y SHA-256 del PNG original; otras imágenes incrustadas siguen generando hallazgo y los demás patrones de secretos se mantienen. Se comprobó que el PNG original, su representación móvil y la usada por Admin tienen la misma huella. No se modificó ni regeneró el logo. La auditoría Git final pasa sin hallazgos ni archivos staged.

No hubo reducción funcional del frontend ni refactorización de precios, cálculo comercial, inventario, ventas o sincronización.

## 7. Tamaños antes y después

| Medida | Antes | Después de limpieza y pruebas | Interpretación |
|---|---:|---:|---|
| Árbol Admin comparable, sin .git ni carpeta de esta auditoría | 274401348 bytes (261.69 MiB) | ≈214.61 MB (204.7 MiB) | Reducción aproximada de 57 MiB netos en ese ámbito |
| Árbol móvil, sin .git | 586275974 bytes (559.12 MiB) | ≈586.28 MB | Prácticamente igual: 676 bytes retirados, compensados por las reglas nuevas |
| Build web dist | 2962427 bytes | 2962427 bytes | Mismo tamaño; esta limpieza no reduce el bundle web |
| APK móvil de referencia v2 | 92055682 bytes (87.79 MiB) | 92055682 bytes | Binario conservado sin cambios; no es una compilación nueva |

Las medidas suman bytes lógicos de archivos y omiten junctions/symlinks. No representan espacio asignado por NTFS. La carpeta privada artifacts/cleanup conserva aproximadamente 31 MB de inventarios, huellas, registros y pruebas sintéticas creados para esta auditoría: se excluye explícitamente de la comparación homogénea, pero sí ocupa disco; por ello el ahorro real total de la carpeta Admin es menor que los 57 MiB del ámbito comparable. No se borra esa evidencia privada automáticamente.

La APK v2 contiene 1264 entradas: 74291584 bytes en librerías nativas para arm64-v8a, armeabi-v7a, x86 y x86_64 (≈80.7% del archivo). El bundle Android ocupa 4182424 bytes; res y resources.arsc suman aproximadamente 4.99 MB. No se encontraron Excel, PDF, DOCX ni respaldos en sus entradas. Esto muestra que la mayor oportunidad requiere evaluar arquitecturas/AAB y módulos nativos, no borrar documentación del repositorio sin revisar. Cambiar arquitecturas requiere autorización y comprobar dispositivos destino.

No se compiló ni firmó una APK comparable nueva y no se afirma que la APK haya disminuido. Las dos APK previas corresponden a estados distintos del propietario y no se usaron como un antes/después de esta limpieza.

## 8. Pruebas y verificaciones

| Verificación | Resultado | Alcance / límite |
|---|---|---|
| Web, suite inicial | 243/243 pasan | Antes de cambios |
| Web, suite posterior | 244/244 pasan | Incluye regresión de limpieza SSR; productos, compras, ventas, inventario, reportes y exportaciones |
| Backend unitario inicial y posterior | 35/35 pasan en ambas ejecuciones | Incluye respaldos sintéticos e integridad; sin escrituras en bases existentes |
| Móvil inicial y posterior | 24/24 pasan | Catálogo, búsqueda comercial, cantidades, pesos, borradores, recuperación, tickets, LAN y configuración APK |
| Compilación web antes/después | Ambas pasan | dist conserva 2962427 bytes; permanece aviso de chunk grande |
| Lint de archivos modificados | Pasa | Cache, auditor Git, config ESLint y prueba |
| Lint global de fuentes | No pasa: 1 error preexistente | SalesPage.jsx:43, react-hooks/set-state-in-effect; fuente intacta respecto a HEAD |
| Auditoría de Git | Pasa | Sin patrones de secretos detectados, rutas sensibles excluidas, plantillas/migraciones necesarias no excluidas; índice vacío |
| Navegador operativo | Pasa smoke de lectura | Productos, Compras, Ventas, Inventario y Reportes cargan; Excel descarga; cero solicitudes de escritura |
| Inicio administrado | Gestor listo | ownsExpress y ownsReact true; no se reiniciaron servicios del propietario |
| PostgreSQL | Lectura y huellas pasan | 28 tablas operativas, 21 de restauración y 28 de ensayo; contenido idéntico antes/después |
| Archivos protegidos | 478/478 sin cambios | Comparación SHA-256 de archivos previos, no solamente conteos |
| Respaldo programado | Habilitado, listo, último resultado 0 | Última ejecución 31/10/2026 a las 02:00; no se modificó ni ejecutó la tarea |
| Android: inicio, sincronización, litros y pesos | Pasa | Copia QA con claves nuevas; API Express real con servicio en memoria |
| Android: borrador tras reinicio | Pasa | Los dos renglones sintéticos y su estado reaparecen idénticos |
| Android: envío desde Expo Go | No completado | Error de ejecución «Cannot read property reload of undefined»; no se cambió la lógica para ocultarlo |
| Express: venta móvil sintética | Pasa | Endpoint móvil y regla real confirman una venta en memoria; no PostgreSQL |
| Android: ticket PNG | Pasa | Pantalla original en arnés aislado: PNG 1080×2068, 206610 bytes, menú compartir abierto sin envío |
| Android: ticket PDF | Pasa | Pantalla original: PDF 1.4 de una página, 1085571 bytes, menú compartir abierto sin envío |
| Integración PostgreSQL con escritura / restauración | No ejecutada | Conservación absoluta de las bases existentes; no se ejecutó DROP ni restore |
| APK nueva, instalación o firma | No ejecutada | Se preservan las APK y AsyncStorage existentes |

El arnés temporal solo cambia en una copia las claves QA de AsyncStorage/SecureStore, el puerto de prueba y, para exportar, la entrada que muestra un recibo sintético confirmado por el endpoint de Express. No altera los archivos del móvil. La prueba de ticket no equivale a aprobar el envío completo desde Expo Go. Los menús de compartir se cerraron sin elegir destinatario; se retiraron solo los puertos temporales 8117/3117 y se cerraron los servidores QA. No se borró almacenamiento Android.

Los fallos de entorno se diagnosticaron sin borrar paquetes ni aplicar cambios comerciales. El único error del lint de fuentes está presente en HEAD; no es consecuencia de la limpieza y no se ocultó desactivando la regla. Las exclusiones ESLint nuevas afectan únicamente evidencias y artefactos.

## 9. Pendientes de autorización expresa

1. Decidir retiro de los tres componentes/utilidades anteriores de Admin y actualizar sus pruebas relacionadas.
2. Revisar conjuntamente las 17 fuentes anteriores del móvil, incluyendo recuperación, exportación/importación y catálogo fijo, antes de autorizar cualquier eliminación.
3. Decidir archivo o retiro de copias y scripts de publicación de integration; revisar sus operaciones sobre Admin antes de volver a ejecutarlos.
4. Revisar @react-native-picker/picker y expo-document-picker con autolinking y build Android comparables; mover herramientas de formato solo si se autoriza.
5. Elegir, si procede, AAB o APK específicas por arquitectura conservando compatibilidad con los dispositivos usados.
6. Investigar aparte el error de envío nativo de Expo Go y el error previo de lint de SalesPage.jsx.
7. Consolidar colecciones Postman solo después de comprobar sus importaciones y referencias.

Esta lista es una propuesta concreta para revisión. Ninguno de esos retiros se ejecutó y no se solicita autorización para borrar información protegida.

## 10. Riesgos y entrega para revisión

Los scripts antiguos de integración pueden reintroducir versiones anteriores de Admin si se ejecutan sin revisar; se conservaron precisamente porque son código B y no archivos temporales. Los duplicados de dominio entre ambos proyectos requieren pruebas de paridad antes de cualquier consolidación. El logo en base64 aumenta los bundles, pero permite tickets HTML/PDF sin red y coincide con el original: no se optimizó de forma destructiva. Los cachés npm conservados favorecen la recuperación sin red.

Los documentos y tickets de output están rastreados, pero identificados como muestras sintéticas por output/README.md; las reglas nuevas no los retiran del índice. No se encontraron credenciales reales rastreadas en las comprobaciones realizadas. La inspección de patrones y valores privados conocidos no demuestra ausencia universal de secretos: requiere revisión humana antes de un commit.

Cambios para revisión: Admin .gitignore, eslint.config.js, scripts/vite-cache.mjs, scripts/audit-git.mjs, tests/vite-cache.test.js, docs/GIT_INICIO_RESPALDOS.md y este informe; móvil únicamente .gitignore y .easignore. Las borradas son cachés ignoradas en Git. Los package.json, lockfiles, código comercial, API, migraciones, ramas, HEAD e índice permanecen intactos.

Evidencia detallada local y excluida de Git: artifacts/cleanup/ contiene inventarios por archivo antes/después, plan previo de borrado con hashes, resultado de borrados, huellas protegidas y de bases de datos, registros de pruebas, análisis ZIP de APK y tickets exclusivamente sintéticos. No se adjuntan ni publican archivos privados del negocio.
