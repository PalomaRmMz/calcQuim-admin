param([ValidatePattern('^\d{2}:\d{2}$')][string]$Hora = '02:00', [switch]$Registrar)
$ErrorActionPreference = 'Stop'
if ([int]$Hora.Substring(0,2) -gt 23 -or [int]$Hora.Substring(3,2) -gt 59) { throw 'Hora fuera de rango.' }
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskName = 'CalcQuim-Respaldo-Diario'
$scriptPath = Join-Path $PSScriptRoot 'Backup-Diario.ps1'
$powershellPath = Join-Path $PSHOME 'powershell.exe'
$escape = { param($value) [System.Security.SecurityElement]::Escape($value) }
$commandXml = & $escape $powershellPath
$npmPath = (Get-Command npm.cmd -ErrorAction Stop).Source
$nodeDirectory = Split-Path -Parent (Get-Command node.exe -ErrorAction Stop).Source
$argumentsXml = & $escape ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $scriptPath + '" -NpmPath "' + $npmPath + '" -NodeDirectory "' + $nodeDirectory + '"')
$directoryXml = & $escape $projectRoot
$userSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$boundary = (Get-Date -Format 'yyyy-MM-dd') + 'T' + $Hora + ':00'
$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>CalcQuim: respaldo local con integridad y retencion informativa. Sin claves.</Description></RegistrationInfo>
  <Triggers><CalendarTrigger><StartBoundary>$boundary</StartBoundary><Enabled>true</Enabled><ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay></CalendarTrigger></Triggers>
  <Principals><Principal id="Author"><UserId>$userSid</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>true</StartWhenAvailable><AllowStartOnDemand>true</AllowStartOnDemand><Enabled>true</Enabled><WakeToRun>false</WakeToRun><ExecutionTimeLimit>PT20M</ExecutionTimeLimit></Settings>
  <Actions Context="Author"><Exec><Command>$commandXml</Command><Arguments>$argumentsXml</Arguments><WorkingDirectory>$directoryXml</WorkingDirectory></Exec></Actions>
</Task>
"@
$privateDirectory = Join-Path $projectRoot 'server\artifacts\scheduler'
New-Item -ItemType Directory -Path $privateDirectory -Force | Out-Null
$xmlPath = Join-Path $privateDirectory ('daily-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.xml')
if (Test-Path -LiteralPath $xmlPath) { throw 'La propuesta ya existe; no se sobrescribe.' }
[System.IO.File]::WriteAllText($xmlPath, $xml, [System.Text.Encoding]::Unicode)
if ($Registrar) {
    # Usar este switch solo despues de autorizacion expresa; nunca /F.
    $queryInfo = New-Object System.Diagnostics.ProcessStartInfo
    $queryInfo.FileName = 'schtasks.exe'
    $queryInfo.Arguments = '/Query /TN "' + $taskName + '"'
    $queryInfo.UseShellExecute = $false
    $queryInfo.CreateNoWindow = $true
    $queryInfo.RedirectStandardOutput = $true
    $queryInfo.RedirectStandardError = $true
    $queryProcess = [System.Diagnostics.Process]::Start($queryInfo)
    $queryProcess.StandardOutput.ReadToEnd() | Out-Null
    $queryProcess.StandardError.ReadToEnd() | Out-Null
    $queryProcess.WaitForExit()
    if ($queryProcess.ExitCode -eq 0) { throw 'La tarea ya existe; no se reemplaza.' }
    & schtasks.exe /Create /TN $taskName /XML $xmlPath
    if ($LASTEXITCODE -ne 0) { throw 'No se registro la tarea.' }
} else { Write-Output 'Propuesta XML privada creada. No se registro ninguna tarea. Hora local; requiere sesion Windows iniciada.' }
