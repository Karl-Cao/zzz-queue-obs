param([int]$ProcessId,[string]$NodePath,[string]$EntryPath)
$ErrorActionPreference='Stop'
$process=Get-CimInstance Win32_Process -Filter ("ProcessId="+$ProcessId)
if(!$process){exit 0}
# A recorded PID alone is insufficient: it may have been reused by another app.
if(!$process.ExecutablePath -or ![string]::Equals($process.ExecutablePath,$NodePath,[StringComparison]::OrdinalIgnoreCase)){exit 0}
$escaped=[regex]::Escape($EntryPath.Replace('/','\'))
if($process.CommandLine.Replace('/','\') -notmatch ('(?i)^\s*(?:"[^"]+"|\S+)\s+(?:"'+$escaped+'"|'+$escaped+')\s*$')){exit 0}
& "$env:SystemRoot\System32\taskkill.exe" /PID $ProcessId /T /F | Out-Null
if($LASTEXITCODE -ne 0){throw 'Could not stop the verified queue process'}
