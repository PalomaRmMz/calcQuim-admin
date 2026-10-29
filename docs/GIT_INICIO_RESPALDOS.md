# Git, inicio local y respaldos

La propuesta de commit se prepara sin `git add`, sin modificar el índice y sin ejecutar commit ni push. La rama activa es `dev`. El resumen automático privado contiene la lista completa de candidatos, los grupos de archivos, los hallazgos y el estado del índice.

## Revisar antes de autorizar el commit

```powershell
node scripts/audit-git.mjs
git status --short
git diff --stat
git diff --cached --stat
```

La auditoría examina archivos rastreados, nuevos candidatos y contenido del índice. Detecta rutas privadas, asignaciones de contraseña, patrones de tokens, claves privadas, cadenas PostgreSQL con contraseña, imágenes incrustadas y dumps SQL. Compara también valores privados conocidos contra los archivos candidatos, sin mostrarlos. Los archivos de ejemplo deben tener credenciales vacías.

Es una comprobación automática complementaria a la revisión del código; no garantiza detectar cualquier secreto imaginable. Si aparecen hallazgos, no preparar ni confirmar el commit hasta resolverlos.

Se versionan React, Express, migraciones SQL up/down, scripts psql administrativos sin credenciales, importadores, pruebas sintéticas, lockfiles, colecciones portables Postman y documentación. Los IDs locales del workspace Postman quedan fuera. Los documentos de fases anteriores son históricos: el modo actual se explica en `POSTGRESQL_OPERATIVO.md`.

Quedan fuera las configuraciones privadas, copias de plantillas, respaldos originales, tickets, uploads, dumps, evidencias, logs, cachés, dependencias y builds. Las reglas no excluyen todos los archivos SQL o JSON. Los archivos rastreados se comprueban por separado porque `.gitignore` no los protege retroactivamente. Si se detectara uno privado, preparar su exclusión del índice y obtener autorización antes de cualquier operación de Git que retire archivos; nunca eliminarlo del disco ni reescribir el historial automáticamente.

Mensaje propuesto:

```text
feat: activar PostgreSQL local con persistencia segura, inicio y respaldos
```

## Abrir y cerrar CalcQuim

Hacer doble clic en `Iniciar-CalcQuim.cmd`. Requiere Node en PATH y las dependencias existentes. Abre `http://127.0.0.1:5173`. El gestor usa el puerto local 3099 y conserva únicamente su estado técnico privado en `server/artifacts/launcher/`.

Detecta Express y Vite existentes, verifica el dataset operativo y el modo servido por React y los reutiliza. Si un puerto corresponde a un servicio incompatible, se detiene. No mata procesos para liberar puertos. El inicio se mantiene oculto; PostgreSQL continúa como servicio Windows, sin modificarlo.

`Detener-CalcQuim.cmd` solicita cierre ordenado al gestor mediante un token local. Solo cierra recursos que creó el gestor. Los servidores que ya estaban iniciados desde otras terminales siguen abiertos y se detienen allí con Ctrl+C. El script no puede cerrar ordenadamente un proceso ajeno solo por ocupar un puerto.

Estado:

```powershell
node scripts/local-system.mjs status
```

No eliminar el marcador de activación para solucionar un error ni abrir el modo antiguo para guardar por otra vía.

## Respaldo diario propuesto

Horario: **02:00, hora local de Windows**. Tarea `CalcQuim-Respaldo-Diario`, usuario actual, sin privilegios elevados ni contraseña guardada en la definición. Requiere sesión Windows iniciada; si se omite la hora, se ejecuta cuando esté disponible. No despierta la computadora. No superpone ejecuciones; límite de 20 minutos.

Preparar el XML privado sin registrar:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Preparar-Tarea-Respaldo.ps1
```

Únicamente tras autorización expresa, registrar sin reemplazar tareas existentes:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Preparar-Tarea-Respaldo.ps1 -Registrar
```

La tarea ejecuta `scripts/Backup-Diario.ps1`, que reutiliza `npm.cmd run backup:operational`. Las contraseñas se cargan del archivo privado existente; no forman parte del XML, argumentos, logs o manifiestos. Las políticas de ejecución se limitan al proceso del script; no se cambia la configuración del sistema.

Cada ejecución usa una transacción de lectura con snapshot exportado y pasa ese mismo snapshot a `pg_dump`. Guarda un hash del estado lógico para una conciliación posterior. Comprueba la lectura/descompresión completa mediante `pg_restore` sin conectar a una base y genera SHA-256, tamaño y manifiesto. Esta lectura no equivale a una restauración probada.

Los archivos nuevos son únicos y no reemplazan copias anteriores. Un bloqueo impide respaldos concurrentes. Si hay un cierre abrupto, un bloqueo persistente requiere verificar que no hay un respaldo en curso antes de retirarlo manualmente. Los errores se registran con códigos técnicos privados y código de salida no cero; no se imprime stderr de PostgreSQL.

Retención propuesta: 30 días. **Solo genera una lista de candidatos antiguos; no elimina nada.** No existe limpieza automática habilitada. Antes de autorizar una política de borrado, exigir al menos una recuperación verificada reciente y una segunda copia íntegra, y revisar expresamente los archivos afectados.

## Segunda copia

Copiar `server/backup.policy.example.json` a `server/.backup.private.json`, sin reemplazar un archivo existente. Elegir una ruta absoluta local fuera del proyecto en `secondaryDirectory`; por ejemplo un disco externo. Mantener `null` hasta elegirla. No contiene contraseñas, pero sigue siendo configuración privada.

La copia secundaria se crea sin sobrescribir y se vuelve a verificar por hash. Si se configura y el disco no está disponible, el respaldo diario se considera fallido aunque conserve su archivo primario para diagnóstico. La configuración nunca elimina respaldos.

## Recuperación verificada

1. Elegir un dump y su manifiesto privado del mismo nombre. Conservar ambos originales.
2. El propietario crea una base nueva y vacía con nombre `calcquim_recovery_AAAAMMDD_codigo`, propietario `postgres`; revoca CONNECT/TEMPORARY a PUBLIC y concede CONNECT/CREATE a `calcquim_operational_app`. No reutilizar las bases operativa, dev, test ni ensayos existentes. El código debe tener 4 a 20 letras minúsculas o números.
3. Ejecutar desde `server/`, con rutas locales elegidas:

```powershell
node scripts/verify-operational-restore.mjs --database=calcquim_recovery_AAAAMMDD_codigo "--dump=D:\ruta-privada\postgres-fecha.dump"
```

El verificador exige SHA-256, tamaño y referencia del snapshot, comprueba que el destino esté vacío, restaura todo el esquema operativo en una transacción sin `--clean` y compara el snapshot completo y las columnas relacionales. Genera evidencia privada aparte y conserva la base recuperada. Si falla, no promueve ni elimina nada. Los dumps anteriores sin referencia de snapshot se conservan, pero requieren el procedimiento de conciliación de su ensayo original.

4. Revisar la evidencia y ensayar la apertura de la recuperación por separado antes de decidir una sustitución operativa. Ningún script cambia la configuración real, la base principal ni el navegador automáticamente.

La restauración real previa a la activación ya cuenta con evidencia. No se repite la migración histórica durante esta revisión de Git. La suite `test:activation` prueba backups/restauración con datos sintéticos en su base independiente.
