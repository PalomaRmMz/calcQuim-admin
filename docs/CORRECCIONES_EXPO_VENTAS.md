# Correcciones de Expo Go y detalle de ventas

31 de octubre de 2026. Seguimiento de `DEPURACION_CALCQUIM_APK_WEB.md`.

## 1. Causa comprobada del error de Expo

La reproducción con el código móvil original y una copia de almacenamiento QA produjo esta traza:

```text
TypeError: Cannot read property 'reload' of undefined
  at registerBundleEntryPoints (.../index.bundle:76203:29)
  at registerBundle (.../index.bundle:76041:32)
```

`src/domain/submission.mjs` comienza con `await import('./sale.mjs')`. En desarrollo, Metro registra ese punto de entrada dinámico. El proxy de diagnóstico utilizado en la auditoría anterior reenviaba HTTP mediante `fetch`, pero no tenía manejador de `upgrade` WebSocket. Además, la petición ascendente cambiaba Host a `[::1]`. El emulador podía descargar el bundle inicial gracias a una sustitución parcial de URLs, mientras la conexión Metro/HMR seguía incompleta.

En la versión instalada de Expo, `node_modules/expo/src/async-require/hmr.ts`, `registerBundleEntryPoints()` ejecuta `window.location.reload()` cuando `hmrUnavailableReason` está definido. `window.location` no existe en Android. Por tanto, el error visible era un camino defectuoso de recuperación del runtime de desarrollo, activado por el transporte incompleto del arnés. No era un rechazo de la API, un cálculo comercial ni un error de UUID de la aplicación.

La comparación A/B fue concluyente: el mismo código móvil y la misma API sintética fallaron con el proxy HTTP y enviaron correctamente después de conservar HTTP, Host y WebSocket. No se reemplazó el import dinámico, no se simuló `window.location`, no se parcheó Expo en `node_modules` y no se sustituyó la generación segura de UUID.

`expo-crypto` está incluido en Expo Go para SDK 56 según la [documentación de Crypto de SDK 56](https://docs.expo.dev/versions/v56.0.0/sdk/crypto/). Su compatibilidad documental no fue la única prueba: Android generó claves reales y completó el envío. No se demostró una limitación de Expo Go que exija un development build para este flujo.

## 2. Corrección del transporte de diagnóstico

Nuevo archivo móvil: `integration/metro-loopback.mjs`. Solo usa módulos estándar de Node y escucha en `127.0.0.1`.

- Conserva método, ruta, cuerpo y encabezado Host al reenviar HTTP hacia Metro en `::1`.
- Reenvía el handshake de upgrade, sus bytes iniciales y el tráfico bidireccional WebSocket.
- Cierra sus propios sockets y falla de forma explícita si el puerto está ocupado. No termina servicios ajenos.
- Es una herramienta local de desarrollo; `integration/` ya está fuera de EAS. No cambia la API ni la APK comercial.

Uso cuando Metro en Windows escucha únicamente por IPv6 y `adb reverse` necesita IPv4:

```powershell
# Terminal 1: proyecto/copia de pruebas, con claves QA nuevas y API sintética.
npx.cmd expo start --localhost --port 8081

# Terminal 2: solo si 127.0.0.1:8081 está libre y Metro responde en [::1]:8081.
node integration/metro-loopback.mjs 8081

# Emulador dedicado: reenviar también el puerto de la API sintética elegida.
adb -s emulator-5554 reverse tcp:8081 tcp:8081
```

Si Metro ya atiende directamente IPv4, no hace falta el puente y su arranque falla si ese puerto está ocupado. El transporte no utiliza credenciales operativas ni almacena ventas.

La nueva prueba `tests/metro-loopback.test.mjs` comprueba Host y URL de HTTP, handshake WebSocket y bytes bidireccionales, incluyendo datos que llegan junto al upgrade. Está incluida en `npm test` del móvil. Se corrigió también el cierre del servidor sintético de esa prueba para no dejar sockets abiertos.

## 3. Envío completo desde Android

Se ejecutó la aplicación completa en Expo Go, en una copia temporal del código. Solamente esa copia cambió las claves QA de AsyncStorage/SecureStore y la URL de la API. La instrumentación diagnóstica conservó la traza de excepción; las funciones comerciales fueron las originales. No se borró almacenamiento ni se reinstaló la aplicación habitual.

La API aislada usó el router móvil y `createMobileSale` reales de Express con un repositorio exclusivamente en memoria, sin conexión PostgreSQL. La prueba no se limitó a llamar a Express desde Node:

1. Android sincronizó el catálogo sintético y preparó dos conceptos: 3 litros a $20 y una captura por $50.
2. El error inicial se reprodujo desde Android antes de corregir el transporte.
3. Con HTTP/WebSocket correctos, Android creó el intento, guardó su clave, consultó el estado, envió la venta y recibió el recibo confirmado por $110.
4. En una segunda venta se pulsó el botón original **Registrar venta** del emulador. La app navegó automáticamente al ticket confirmado.
5. Al reiniciar Expo Go reaparecieron el mismo recibo y la misma clave de intento. El número de recibos no creció al reiniciar: no hubo duplicación.
6. Se repitió la venta desde el botón Android utilizando el módulo definitivo `integration/metro-loopback.mjs`; volvió a confirmar por $110 sin error. Se realizaron tres ventas sintéticas controladas en total.

Los estados Android observados contienen `draft.status = confirmed`, recibo `status = confirmed`, total 110, revisión del servidor y el recibo en el historial local. La prueba del botón no usó un recibo inyectado ni una pantalla de ticket aislada.

## 4. ESLint de SalesPage

El efecto anterior buscaba la venta actual y llamaba a `setSelected()` después de cada cambio del snapshot. Esto provocaba la infracción `react-hooks/set-state-in-effect` y una actualización adicional después del commit.

Ahora el detalle resuelve la venta vigente directamente desde `sales`. Una actualización local, condicionada por identidad, recuerda la última versión conocida durante el render; React reinicia ese render antes de hacer commit. Es importante conservar esa memoria: si el registro deja de aparecer en otro snapshot, el comportamiento anterior mantenía la última versión mostrada, no la versión inicial ni un modal vacío. No hay efecto de sincronización ni un ciclo de actualizaciones porque la condición deja de cumplirse cuando la referencia coincide.

No se cambió ninguna regla de pago, precio, cantidad, estado, anulación, corrección o inventario. Las reglas ESLint permanecen activas, incluida `set-state-in-render`, y el lint global de Admin pasa.

Regresión de navegador: `server/browser/sales-detail-refresh.mjs`, con datos de `tests/fixtures/sales-detail-refresh.*`. Abre el detalle, reemplaza el snapshot y verifica cantidad 3, total 60, historial actualizado, conservación de la última versión cuando se omite la venta y cierre del modal. No permite llamadas a la API en el fixture.

## 5. Lint móvil

El móvil no tenía script ni configuración ESLint propia y no tenía instalado ESLint. Para analizarlo se reutilizó la instalación de desarrollo existente de Admin con una configuración temporal `@eslint/js` recommended, parser JSX y globals de React Native/Node; no se descargaron paquetes ni se desactivaron reglas.

Se encontraron cinco identificadores sin uso: `saleUnit` en ResultBox, `salesList` en AddSaleScreen y CalculatorScreen, `iconColor` en HomeScreen y el import `TextInput` en ConnectionScreen. Se retiraron solamente esas vinculaciones no leídas. Los archivos y sus funciones permanecen; no se eliminó ninguno de los 17 archivos antiguos.

Comando utilizado, desde el directorio móvil:

```powershell
node D:\ReactApps\calcQuim-admin\node_modules\eslint\bin\eslint.js --config D:\ReactApps\calcQuim-admin\artifacts\fixes\mobile-lint.config.mjs App.js src integration/metro-loopback.mjs tests/metro-loopback.test.mjs
```

El resultado final fue salida 0. Esta configuración temporal no equivale a afirmar que el móvil ya tiene una configuración permanente de lint con plugins específicos de hooks; se conserva la distinción entre este análisis y el lint de React de Admin.

## 6. Resultados

| Comprobación | Resultado |
|---|---|
| Admin `node --test tests/*.test.js` | 244/244 pasan |
| Backend `node --test server/tests/*.test.mjs` | 35/35 pasan |
| Admin `npm run lint` | Pasa sin desactivar reglas |
| Backend `npm --prefix server run lint` | Pasa |
| Admin `npm run build` | Pasa; permanece el aviso de tamaño de chunk |
| Móvil `npm test` | 25/25 pasan, incluido transporte Metro |
| Lint móvil recomendado sobre App, src y nuevos archivos | Pasa |
| Móvil `expo export --platform android` | Pasa: bundle Hermes y assets de producción |
| Detalle de venta: snapshot nuevo, historial, respaldo y cierre | Pasa en navegador con datos sintéticos |
| Android: envío desde botón y confirmación | Pasa con API aislada y transporte corregido |
| Android: confirmación tras reinicio | Mismo recibo, misma clave, sin duplicación |
| Archivos protegidos y bases existentes | Huellas iguales antes/después |

El build móvil es una exportación de producción Android/Hermes en la copia temporal, no una APK nativa nueva ni una firma. Para el build se desactivó la instrumentación QA. Se mantuvieron el mismo código de envío, las dependencias y los lockfiles.

## 7. Development build opcional y conservación de datos

Este error quedó resuelto en Expo Go; no fue necesario instalar un development build. Si se desea contrastar un fallo nativo en una compilación propia, preparar otra copia de pruebas con `expo-dev-client`, un identificador Android nuevo distinto del original y de `.pruebas`, claves nuevas de AsyncStorage/SecureStore y la API sintética. Compilar e instalar únicamente ese paquete de diagnóstico en un emulador dedicado. No usar `pm clear`, desinstalación ni `adb install -r` contra los paquetes habituales. Mantener el puente Metro completo o una conexión directa que permita WebSocket.

No se ejecutó esa instalación opcional ni se afirma que exista un APK development nuevo. Se evitaron operaciones de EAS, cambios de credenciales de firma y compilaciones remotas.

## 8. Límites y evidencia

No se modificó PostgreSQL: se compararon huellas de las 28 tablas operativas, 21 de restauración y 28 de ensayo accesibles. También se comprobaron 580 archivos protegidos previos; todos conservaron su SHA-256. Las comprobaciones SQL fueron de solo lectura.

No se borraron AsyncStorage, SecureStore, datos Android, APK, respaldos, los 17 archivos antiguos, los tres componentes de Admin ni scripts de integración. No hubo commits ni pushes. Se preservaron los cambios de la depuración anterior.

La evidencia detallada y exclusivamente sintética está en `artifacts/fixes/`: traza del fallo reproducido, estados Android antes/después del reinicio, estados obtenidos al usar el puente definitivo, logs de pruebas/lint/build y huellas protegidas. Las rutas de producción y credenciales no se incluyen en los fixtures públicos.
