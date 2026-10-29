# Fase 2 — Infraestructura local de CalcQuim

Fecha: 28 de octubre de 2026. Referencia: [auditoría de Fase 1](AUDITORIA_POSTGRESQL_FASE_1.md).

## Estado inicial y alcance

Rama `dev`, sin cambios en archivos rastreados al comenzar. Único pendiente: `docs/AUDITORIA_POSTGRESQL_FASE_1.md`, generado en la fase anterior y aún sin rastrear. No se modificó. No se hizo fetch, commit ni push.

Se añadió `server/` aislado. No se modificaron fuentes, configuración, package.json ni lockfile de React. El build regeneró `dist/`, que ya está ignorado. No se abrió la aplicación ni se leyó localStorage habitual o respaldo JSON.

## Archivos añadidos

- `server/package.json`, `server/package-lock.json`: proyecto npm independiente con versiones fijadas.
- `server/.gitignore`, `server/.env.example`, `server/eslint.config.mjs`: exclusiones, plantilla sin secretos y lint Node.
- `server/src/config.mjs`, `app.mjs`, `runtime.mjs`, `server.mjs`: configuración y ciclo de vida.
- `server/src/db/pool.mjs`, `services/health.mjs`, `controllers/health.mjs`, `routes/health.mjs`: conexión y dos endpoints de salud.
- `server/tests/config.test.mjs`, `server/tests/health.test.mjs`: pruebas sintéticas.
- `server/scripts/check-postgres.mjs`: comprobación manual opt-in contra la base de prueba.
- `server/postman/CalcQuim-health.postman_collection.json`: colección sin credenciales.
- `server/README.md` y este documento: instrucciones y resultados.

No se crearon archivos `.env` privados. Dependencias y caché instaladas dentro de `server/` están ignoradas. No hay tablas, migraciones ni datos de negocio.

## Versiones comprobadas

Node v22.22.3; npm 10.9.8; Express 5.3.0; pg 8.23.1; ESLint backend 10.13.0; @eslint/js 10.0.1; globals 17.13.0. Vite del frontend reportó 8.2.2 durante build. Dependencias nuevas fijadas en lockfile independiente; no se actualizó Node/npm global ni frontend. La instalación npm final informó cero vulnerabilidades, sin que esto sustituya revisiones futuras.

## PostgreSQL y servidor

No se detectaron psql, pg_dump, postgres o pg_ctl en PATH, servicio PostgreSQL, carpeta estándar `C:\Program Files\PostgreSQL`, ni entradas habituales del Registro consultadas. Esto no excluye instalación portátil/WSL/contenedor. No se instaló PostgreSQL ni se definieron contraseñas, roles, bases o configuraciones del sistema.

[README del backend](../server/README.md) incluye instalación interactiva oficial recomendada de PostgreSQL 18.x estable, roles no administradores, bases vacías separadas, credenciales privadas y verificaciones loopback. La conexión PostgreSQL exitosa queda **pendiente de intervención manual**. No se afirma que una base real esté lista.

Express se inició con `npm.cmd start` en `127.0.0.1:3001`. Peticiones HTTP reales verificaron live 200 y ready 503 sin configuración de DB. `netstat -ano -p tcp` confirmó `127.0.0.1:3001 LISTENING`; sin listener en todas las interfaces. La inspección alternativa con Get-NetTCPConnection fue denegada por el entorno; se usó netstat y también `server.address()` en pruebas. El proceso de verificación se detuvo al terminar; no queda instalado como servicio.

## Resultados de validación

| Validación | Resultado |
|---|---|
| `npm.cmd test` en server | 11 pruebas pasadas, 0 fallos |
| `npm.cmd run lint` en server | Pasó |
| `npm.cmd run lint` en raíz | Pasó después de corregir el middleware de error nuevo |
| `npm.cmd test` en raíz | 233 pruebas pasadas, 0 fallos |
| `npm.cmd run build` en raíz | Pasó |
| Exclusión de secretos | `git check-ignore` confirmó .env, .env.development, .env.test y .env.production ignorados; node_modules y caché también |
| Archivos privados rastreados | Ninguno en las rutas .env consultadas; plantilla pública permitida |
| HTTP y listener | Live 200, ready 503; solo 127.0.0.1:3001 |
| Conexión PostgreSQL real exitosa | Pendiente: no hay instalación/credenciales confirmadas |

Las pruebas React emitieron advertencias de escaneo de Vite por `virtual:comparator-legacy` del benchmark, pero todas finalizaron correctamente. No se cambió ese código ajeno al alcance. La primera descarga npm tuvo EACCES por restricciones de red/cache del entorno; el reintento autorizado con caché local completó la instalación. No se cambió la política de ejecución de PowerShell.

Los tests HTTP cubren éxito, PostgreSQL fallando sin filtración de errores, recuperación de readiness, ausencia de rutas de negocio, falta de credenciales, pool pg ante cierre de transporte, puertos ocupados y cierre de recursos; los de configuración rechazan interfaces remotas, usuario postgres, puertos inválidos y uso cruzado de bases. El caso saludable usa dependencia simulada, no una base real. Los tests no contactan el PostgreSQL habitual.

## Continuar manualmente

1. Seguir instalación y verificación en `server/README.md`, sin exposición LAN ni cambios de firewall.
2. Elegir personalmente contraseñas y crear los archivos privados nuevos de desarrollo/prueba.
3. Ejecutar `npm.cmd run test:postgres` en server, luego iniciar el backend y esperar ready 200.
4. Importar la colección Postman local; usar expectedReadyStatus=503 ahora y 200 al completar conexión.
5. Detener backend con Ctrl+C. Ningún paso de esta entrega autoriza todavía migrar datos reales o conectar el celular.

Readiness 200 solo demostrará conexión y SELECT 1. Quedan para futuras fases el esquema operativo, permisos sobre tablas, autenticación de operaciones, migración, respaldo PostgreSQL probado y acceso LAN. React continúa usando exactamente su persistencia previa.
