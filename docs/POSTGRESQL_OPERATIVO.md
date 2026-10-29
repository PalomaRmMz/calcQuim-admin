# CalcQuim con PostgreSQL local

Para el inicio con doble clic y la propuesta de respaldos diarios, ver [Git, inicio y respaldos](GIT_INICIO_RESPALDOS.md).

La base operativa es `calcquim_operational`, esquema `calcquim_operational`. El rol restringido es `calcquim_operational_app`. Las credenciales están exclusivamente en `server/.env.operational`, fuera de Git. Express y PostgreSQL utilizan loopback.

## Iniciar y detener

En una terminal PowerShell:

```powershell
Set-Location D:\ReactApps\calcQuim-admin\server
npm.cmd start
```

En otra terminal:

```powershell
Set-Location D:\ReactApps\calcQuim-admin
npm.cmd run dev
```

Abrir `http://127.0.0.1:5173`. El encabezado indica **PostgreSQL local · Guardado exclusivo en el servidor**. Detener cada proceso con Ctrl+C. El puerto Express figura en `.env.operational` y en la evidencia privada de activación; el ejemplo usa 3003. No ejecutar varias instancias simultáneas.

El inicio normal detecta `server/artifacts/operational/activation.private.json`. Ese archivo se genera únicamente después de validar importación, restauración, pruebas sintéticas y lectura HTTP tras reiniciar Express. Conservarlo junto con la configuración privada. Una configuración de activación inválida detiene el inicio; no corregirla eliminando el archivo para volver al almacenamiento anterior.

React usa el adaptador API para los datos del negocio. Un fallo de PostgreSQL muestra un error y no guarda en localStorage. Las claves de idempotencia técnicas pueden conservarse en sessionStorage para reintentar solicitudes cuya respuesta se perdió. El localStorage anterior queda como copia histórica y no se sincroniza.

## Respaldo y recuperación

Desde `server/`:

```powershell
npm.cmd run backup:operational
```

Los dumps completos y sus hashes se guardan en `server/artifacts/operational/backups/`. Contienen datos privados. Una copia nueva no queda marcada como restauración verificada hasta ensayarla en otra base vacía autorizada. La copia previa a la activación y su prueba de restauración están en `server/artifacts/operational/validation-*.private.json` y sus archivos asociados.

La copia lógica descargable y Excel son herramientas complementarias; el dump PostgreSQL conserva también el estado de idempotencia y la información técnica. No restaurar automáticamente sobre la base operativa, ni usar `--clean`. Preparar una nueva base aislada para cualquier recuperación.

No repetir `operational:prepare` después de comenzar a trabajar: el importador detectará diferencias con el respaldo original y detendrá el procedimiento. No elimina ni reemplaza operaciones posteriores.

## Comprobar una compra futura

Cuando exista una compra auténtica que registrar, guardarla una sola vez, comprobar que aparece en el historial y cerrar React y Express. Iniciar ambos de nuevo y abrir el historial: la misma compra debe conservar ID, fecha, renglones, total y ticket. Actualizar la página debe conservarla igualmente. No registrar compras ficticias en esta base.

Esta comprobación ya se automatiza con datos sintéticos en `calcquim_activation_test`; sobre la base real solo se realizan lecturas de verificación.

## Pruebas aisladas

```powershell
npm.cmd test --prefix server
npm.cmd run test:activation --prefix server
npm.cmd run lint --prefix server
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

La suite de activación usa exclusivamente `calcquim_activation_test`, con un esquema temporal de nombre aleatorio que crea y elimina. No utiliza `calcquim_test` ni la base operativa. La colección Postman sintética conserva su alcance de ensayo: no apuntarla a la base operativa para crear compras o ventas de prueba.
