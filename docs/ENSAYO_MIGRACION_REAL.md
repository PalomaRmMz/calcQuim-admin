# Ensayo aislado de importación real

El procedimiento reutiliza las migraciones, el importador y los cálculos de CalcQuim. No inicia React ni Express, no lee el navegador y no activa el almacenamiento principal.

Desde `server/`:

```powershell
npm.cmd run migration:rehearse-real
```

Requiere la intervención administrativa descrita en `scripts/prepare-real-rehearsal.psql` y credenciales privadas en `.env.migration`, según `migration.env.example`. No ejecutar nuevamente el script administrativo sobre bases ya preparadas.

El ejecutor admite exclusivamente `calcquim_migration_check` y `calcquim_migration_restore`, con el rol restringido `calcquim_migration_app` y host `127.0.0.1`. No utiliza las configuraciones de desarrollo o pruebas.

Verifica las dos rutas originales, tamaño y SHA-256 autorizados antes de crear una copia privada. Valida formato, versiones y claves antes de cargar. Conserva el archivo original completo, distingue ausencia y nulos, y comprueba identificadores, tipos, campos, columnas relacionales, historial y hashes de tickets. Compara también cálculos, comparador, reportes y datos de exportación para fechas fijas.

La importación repetida comprueba que el estado completo siga idéntico. Un estado incompatible detiene el procedimiento; no se corrige ni reemplaza automáticamente.

Genera un `pg_dump` de la base aislada. La primera restauración usa una transacción y una lista explícita que incluye la creación del esquema y todos sus objetos. No usa `--clean`. Si el esquema de restauración ya existe, únicamente lo valida, sin reemplazarlo. Las evidencias indican si la restauración fue ejecutada o si se verificó una anterior.

Las copias, dumps, índices de restauración y evidencias se conservan en `server/artifacts/`, excluido de Git. Los archivos son sensibles: no adjuntarlos a incidencias ni incorporarlos al repositorio. Los diagnósticos muestran códigos, conteos y hashes; no registros del negocio.

Para verificar el código sin modificar `calcquim_test`, ejecutar `npm.cmd test` y `npm.cmd run lint` en `server/`. Las pruebas generales de integración usan esa base y deben ejecutarse solamente fuera de este ensayo y bajo su alcance correspondiente.

Una conciliación correcta demuestra la fidelidad del respaldo histórico importado. No demuestra que el navegador actual permanezca igual. Antes del cambio definitivo se debe confirmar el estado vigente, conciliar cualquier respaldo actualizado mediante un nuevo ensayo y preparar una activación explícita con recuperación verificada.
