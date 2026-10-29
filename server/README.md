# CalcQuim local — Fase 2

**Modo operativo local:** ver [inicio, respaldo y comprobación de persistencia](../docs/POSTGRESQL_OPERATIVO.md). Cuando existe la activación privada validada, `npm.cmd start` utiliza exclusivamente la configuración operativa. La información de fases anteriores que sigue abajo describe el funcionamiento previo.

**Actualización: persistencia de ensayo implementada.** Ver [inicio, API, Postman,
respaldos e importación segura](../docs/PERSISTENCIA_POSTGRESQL_IMPLEMENTADA.md).
El inicio habitual sigue siendo health-only; `npm.cmd run start:sandbox` habilita
la API sintética y requiere `npm.cmd run migrate`. Las instrucciones de Fase 2
conservadas abajo describen la preparación inicial, no el alcance actual completo.

Infraestructura aislada del frontend. Solo implementa `GET /api/v1/health/live` y `GET /api/v1/health/ready`. No hay migraciones, tablas de negocio, rutas móviles, importaciones ni cambios en localStorage. Parte de [la auditoría del 20 de octubre](../docs/AUDITORIA_POSTGRESQL_FASE_1.md).

## Iniciar, probar y detener

Desde PowerShell:

```powershell
Set-Location D:\ReactApps\calcQuim-admin\server
npm.cmd ci
npm.cmd start
```

El backend puede arrancar sin PostgreSQL ni credenciales: live responde 200, ready responde 503. `npm.cmd dev` activa reinicio al cambiar archivos. Detener con **Ctrl+C**; se cierra el listener y el pool. Ante cierre bloqueado hay un límite de 5 segundos. No se instala ni inicia un servicio Windows.

En otra terminal:

```powershell
Set-Location D:\ReactApps\calcQuim-admin\server
npm.cmd test
npm.cmd run lint
```

`npm.cmd` evita el bloqueo de `npm.ps1` por la política actual de PowerShell, sin cambiar dicha política. El frontend conserva sus comandos y package-lock propios. Los archivos del backend usan `.mjs` y configuración ESLint propia para entorno Node.

## Configuración privada y separación de entornos

No se generaron contraseñas ni archivos privados. Copiar manualmente `.env.example` a **un archivo nuevo** `.env.development`, solo si no existe, y completar las credenciales elegidas por el usuario. No sobrescribir archivos privados existentes. El archivo de ejemplo no contiene una contraseña de prueba funcional.

| Variable | Desarrollo | Prueba manual contra PostgreSQL |
|---|---|---|
| `NODE_ENV` | `development` por defecto | `test`, establecer en la terminal antes de iniciar |
| Archivo leído | `server/.env.development` | `server/.env.test` |
| `PORT` | `3001` | `3002` |
| `PGHOST` | `127.0.0.1` obligatorio | `127.0.0.1` obligatorio |
| `PGPORT` | `5432` | `5432` u otro puerto local explícito |
| `PGDATABASE` | `calcquim_dev` | `calcquim_test`, se exige sufijo `_test` |
| `PGUSER` | `calcquim_app`, completar | `calcquim_app_test`, completar |
| `PGPASSWORD` | Privada, elegida manualmente | Otra contraseña privada |
| `PGCONNECT_TIMEOUT_MS` | 1500 | 1500 |
| `PGQUERY_TIMEOUT_MS` | 1500 | 1500 |

Variables de proceso tienen precedencia sobre el archivo, conforme al cargador de Node. **No reutilizar en esa terminal variables PG de otra aplicación**. Solo se admiten `development` y `test` en esta fase. La elección del archivo se realiza antes de cargarlo: escribir `NODE_ENV=test` dentro de `.env.test` por sí solo no selecciona ese archivo. El backend no carga `.env` genérico ni archivos del frontend, y no interpreta `DATABASE_URL`.

El host HTTP está fijado en código a `127.0.0.1`: no es una opción para habilitar LAN. `HOST` y `PGHOST` remotos se rechazan. Se rechaza el usuario `postgres`; el administrador debe comprobar además que el rol elegido no tenga privilegios administrativos. El pool es perezoso y solo existe con usuario y contraseña completos; sin ellos readiness falla de forma segura sin intentar credenciales implícitas. No usar variables `VITE_*` para secretos.

Los archivos `.env`, `.env.*` privados, node_modules, caché npm, logs y dumps están excluidos por `server/.gitignore`. Solo `.env.example` es público. Comprobar antes de agregar archivos:

```powershell
git check-ignore -v server/.env.development server/.env.test server/.env
git ls-files -- 'server/.env' 'server/.env.*'
```

Ejecutar esas comprobaciones desde la raíz. `git ls-files` no debe mostrar secretos; puede mostrar `.env.example` cuando se agregue voluntariamente. Ignorar un archivo no retira un secreto ya rastreado.

Las pruebas automatizadas usan configuración explícita y dependencias sintéticas; **no cargan archivos .env ni conectan al PostgreSQL habitual**. Se prueba `pg` real contra un servidor TCP efímero que rechaza conexiones, sin contenido de negocio. La respuesta healthy se prueba con dependencia inyectada; no demuestra una conexión real exitosa.

### Verificar la instalación existente

Para la instalación local ya creada, utilizar `calcquim_app` en `.env.development`.
Guardar la contraseña exclusivamente en ese archivo ignorado, sin enviarla al chat
ni incluirla en argumentos de consola. Usar comillas dobles alrededor del valor si
contiene `#`; no imprimir el archivo. `test.env.example` es la plantilla pública
para una nueva `.env.test` con base y usuario de pruebas independientes.

```powershell
npm.cmd run verify:postgres:dev
npm.cmd run verify:postgres:test
```

Ambos comandos usan el backend existente en un puerto HTTP efímero y solo leen
metadatos de conexión y ejecutan la comprobación de salud. Verifican la identidad,
readiness 200, privilegios directos del rol e interfaces PostgreSQL. Cierran sus
conexiones al terminar; no crean tablas ni modifican datos. Los errores solo
muestran etapa/código seguro, nunca mensajes del driver o contraseñas.

Si las variables PG heredadas de la terminal no coinciden con el archivo,
el verificador rechaza la identidad esperada. Usar una terminal nueva o retirar
esas variables privadas sin imprimirlas. Para preparar pruebas en pgAdmin, crear
`calcquim_app_test` con LOGIN y sin privilegios administrativos, elegir su propia
contraseña y crear `calcquim_test` como base vacía; conceder CONNECT a ese rol.
No reutilizar ni restaurar `calcquim_dev` para ese fin. Si no se dispone de acceso
administrativo, esta creación queda pendiente del administrador.

Como alternativa a las pantallas de pgAdmin, desde `server/` ejecutar manualmente:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -h 127.0.0.1 -p 5432 -U postgres -d postgres -W -f scripts/prepare-test.psql
```

Primero se pide la contraseña del administrador; después, dos veces la nueva
contraseña del rol de pruebas, sin mostrarlas. El script no lleva contraseñas ni
crea tablas. Se detiene sin modificar nada si el rol o base ya existen; no elimina
objetos. No se ejecuta automáticamente. Completar luego `.env.test` con la nueva
contraseña elegida y ejecutar `npm.cmd run verify:postgres:test`.

Si también se necesita fijar la escucha local, usar en su lugar
`-f scripts/configure-local.psql`: guarda `listen_addresses=127.0.0.1`, recarga
la configuración y llama al mismo preparador de pruebas. Es necesaria la
intervención manual del administrador y reiniciar después el servicio
`postgresql-x64-18`. No modifica firewall ni reglas de autenticación.

## PostgreSQL en Windows: intervención manual pendiente

En la revisión del 28 de octubre de 2026 no se detectaron ejecutables en PATH, servicio PostgreSQL, carpeta estándar o entradas habituales del Registro. No se instaló nada ni se abrió una base existente. Una instalación portátil/WSL/contenedor podría requerir una comprobación específica.

Se recomienda **PostgreSQL 18.x estable de 64 bits, con el último parche disponible de esa rama**, compatible con la infraestructura Node/pg preparada. Verificar el parche al descargar en la [política oficial de versiones](https://www.postgresql.org/support/versioning/); no elegir beta o RC. La [página oficial para Windows](https://www.postgresql.org/download/windows/) enlaza al instalador interactivo EDB.

Pasos manuales, no ejecutados:

1. Descargar desde ese enlace oficial el instalador de PostgreSQL 18 para Windows x64. Confirmar compatibilidad del instalador con tu Windows.
2. Seleccionar PostgreSQL Server y Command Line Tools; pgAdmin es opcional y Stack Builder no es necesario. Elegir ubicación y directorio de datos locales.
3. Elegir personalmente la contraseña del administrador `postgres` y guardarla fuera del repositorio. No enviarla por chat ni incluirla en comandos compartidos. Usar 5432 solo si está libre.
4. No abrir puertos del router, no habilitar LAN, no aceptar cambios de firewall para redes externas. Si el instalador o Windows ofrece exposición de red, rechazarla. Esta fase no autoriza conexiones desde celular.
5. Antes de usar el clúster, verificar `postgresql.conf`: `listen_addresses = '127.0.0.1'`. En `pg_hba.conf`, permitir únicamente reglas necesarias de loopback; para estos roles usar entradas específicas con `scram-sha-256`. No añadir `0.0.0.0/0`, direcciones LAN ni `trust`. Revisar y retirar permisos remotos preexistentes con conocimiento del administrador. No cambiar la configuración de una instalación compartida sin revisar sus dependencias.
6. Reiniciar el servicio después de cambiar la interfaz de escucha. Confirmar mediante las verificaciones de abajo que no escucha en 0.0.0.0, :: o IP de red. Estas son instrucciones; ningún archivo del sistema fue editado por esta entrega.
7. Crear manualmente roles y bases vacías independientes según el bloque siguiente, sin tablas ni datos operativos.

Abrir SQL Shell (psql) como administrador local de PostgreSQL, o usar su ruta instalada:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -h 127.0.0.1 -U postgres -d postgres -W
```

Introducir contraseñas solo en los prompts. En psql, ejecutar una sola vez después de comprobar que esos nombres no existen:

```sql
CREATE ROLE calcquim_app_dev LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
\password calcquim_app_dev
CREATE ROLE calcquim_app_test LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
\password calcquim_app_test
CREATE DATABASE calcquim_dev OWNER postgres;
CREATE DATABASE calcquim_test OWNER postgres;
REVOKE CONNECT, TEMPORARY ON DATABASE calcquim_dev FROM PUBLIC;
REVOKE CONNECT, TEMPORARY ON DATABASE calcquim_test FROM PUBLIC;
GRANT CONNECT ON DATABASE calcquim_dev TO calcquim_app_dev;
GRANT CONNECT ON DATABASE calcquim_test TO calcquim_app_test;
```

No dar propiedad de las bases ni permisos de migrador al rol de aplicación. Para `SELECT 1` basta con conexión; no se necesitan tablas ni privilegios de creación. No ejecutar DROP/ALTER sobre objetos existentes para adaptar este ejemplo. Una fase futura definirá permisos sobre tablas.

Ejemplos de reglas específicas para `pg_hba.conf` (revisar orden y reglas existentes, no pegar sin inspección):

```text
host  calcquim_dev   calcquim_app_dev   127.0.0.1/32  scram-sha-256
host  calcquim_test  calcquim_app_test  127.0.0.1/32  scram-sha-256
```

Conservar acceso administrativo seguro por loopback. Tras instalar, verificar versiones con `psql --version`, `pg_dump --version` y `pg_restore --version` o sus rutas completas. Como administrador, `SHOW listen_addresses;` confirma configuración. En PowerShell:

```powershell
netstat -ano -p tcp | Select-String ':5432\s'
netstat -ano -p tcp | Select-String ':3001\s'
```

En una línea LISTENING, la columna **Local Address** debe ser `127.0.0.1:puerto`. La columna remota `0.0.0.0:0` en esa línea no significa exposición. No cambiar reglas del firewall en esta fase.

Después de completar ambos archivos privados, verificar la base de pruebas desde `server/`:

```powershell
npm.cmd run test:postgres
```

Este comando selecciona explícitamente modo test, solo hace `SELECT 1` y devuelve error si no está listo. Para iniciar HTTP de pruebas:

```powershell
$env:NODE_ENV = 'test'
npm.cmd start
# Ctrl+C para detener. Luego, para volver al valor por defecto:
Remove-Item Env:NODE_ENV
```

## Endpoints y Postman

| Endpoint | Estado y cuerpo |
|---|---|
| `GET /api/v1/health/live` | 200 `{"status":"ok"}` incluso con PostgreSQL caído |
| `GET /api/v1/health/ready` con SELECT 1 exitoso | 200 `{"status":"ready","database":"up"}` |
| `GET /api/v1/health/ready` sin credenciales, DB caída, timeout o error | 503 `{"status":"not_ready","database":"unavailable"}` |

Ready solo comprueba conexión/consulta, **no** una versión de esquema ni preparación para migrar negocio. Ambas respuestas llevan `Cache-Control: no-store`; no incluyen credenciales, SQL ni detalles del driver. Timeouts de conexión y consulta acotan fallos. Live no depende de la DB. No se habilitó CORS, proxy de Vite, autenticación de negocio ni endpoints mutantes: solo hay salud local.

Importar [la colección](postman/CalcQuim-health.postman_collection.json) en Postman local, sin subir datos a un workspace compartido. Iniciar el backend; `baseUrl` por defecto es `http://127.0.0.1:3001` (3002 para modo test). Ejecutar las dos solicitudes o el Collection Runner. `expectedReadyStatus=503` es el estado actual; tras configurar y comprobar PostgreSQL, cambiarlo a `200`. La colección verifica código, cuerpo y liveness sin caché. No requiere contraseña ni token. No se ejecutó Postman GUI en esta entrega; se verificaron las respuestas por HTTP y pruebas automatizadas.

## Estructura

`src/config.mjs` valida y carga configuración; `src/db/pool.mjs` encapsula pg; `src/services/health.mjs`, `src/controllers/health.mjs` y `src/routes/health.mjs` separan reglas, HTTP y rutas. `src/app.mjs` compone Express; `runtime.mjs` controla listener/cierre y `server.mjs` el proceso. `tests/` cubre salud y fallos; `scripts/check-postgres.mjs` es la comprobación opt-in de una DB de pruebas.

Consultar el [acta de validación de esta fase](../docs/FASE_2_INFRAESTRUCTURA_LOCAL.md). No continuar a migración o exposición LAN sin una fase nueva.
