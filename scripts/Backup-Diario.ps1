param([string]$NpmPath = '', [string]$NodeDirectory = '')
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$logDirectory = Join-Path $projectRoot 'server\artifacts\operational\backups'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$backupExit = 1
Push-Location (Join-Path $projectRoot 'server')
try {
    if ($NodeDirectory) { $env:PATH = $NodeDirectory + ';' + $env:PATH }
    if (!$NpmPath) { $NpmPath = (Get-Command npm.cmd -ErrorAction Stop).Source }
    & $NpmPath run backup:operational
    $backupExit = $LASTEXITCODE
} catch {
    # No registrar mensajes de excepcion, argumentos privados ni stderr de PostgreSQL.
    $backupExit = 1
} finally { Pop-Location }
$statusCode = if ($backupExit -eq 0) { 'TASK_BACKUP_OK' } else { 'TASK_BACKUP_FAILED' }
$status = @{ code = $statusCode; at = [DateTime]::UtcNow.ToString('o'); exitCode = $backupExit }
$statusPath = Join-Path $logDirectory ('task-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.private.json')
$status | ConvertTo-Json | Set-Content -LiteralPath $statusPath -Encoding UTF8
exit $backupExit
