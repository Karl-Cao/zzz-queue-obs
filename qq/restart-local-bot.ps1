$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$listener = Get-NetTCPConnection -State Listen -LocalPort 18080 -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalAddress -in @('127.0.0.1','::1') } | Select-Object -First 1
if ($listener) {
    $processId = [int]$listener.OwningProcess
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$processId"
    $command = [string]$processInfo.CommandLine
    $trusted = $false
    try {
        $identity = Invoke-RestMethod 'http://127.0.0.1:18080/zzz-queue/status' -TimeoutSec 3
        $trusted = $identity.app -eq 'zzz-queue-qq'
    } catch {
        # Existing local installations predate the status endpoint.
        $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($processInfo.ParentProcessId)"
        $trusted = [string]$parent.CommandLine -like ('*' + (Join-Path $projectRoot 'data\qq-runtime\nonebot-venv') + '*')
    }
    if (-not $trusted -or -not $command.Contains('bot.py')) {
        throw "Port 18080 is used by an unrelated process; refusing to stop PID $processId"
    }
    & taskkill.exe /PID $processId /T /F | Out-Null
    for ($i=0; $i -lt 15; $i++) {
        Start-Sleep -Seconds 1
        $stillListening = Get-NetTCPConnection -State Listen -LocalPort 18080 -ErrorAction SilentlyContinue
        if (-not $stillListening) { break }
    }
    if (Get-NetTCPConnection -State Listen -LocalPort 18080 -ErrorAction SilentlyContinue) {
        throw 'NoneBot2 did not stop; port 18080 is still in use.'
    }
    Start-Sleep -Milliseconds 500
}
& (Join-Path $PSScriptRoot 'start-local-stack.ps1') -SkipTray
