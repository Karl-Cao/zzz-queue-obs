$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'))
    $elevated = Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList $arguments -Wait -PassThru
    exit $elevated.ExitCode
}
$runtimeFile = Join-Path $PSScriptRoot 'data\runtime.json'
if (-not (Test-Path -LiteralPath $runtimeFile)) { throw 'Start the application first.' }
$runtime = Get-Content -LiteralPath $runtimeFile -Raw | ConvertFrom-Json
$port = [int]$runtime.port
if ($port -lt 1024 -or $port -gt 65535) { throw 'Invalid application port.' }
$ruleName = 'OBS Queue LAN ' + $runtime.instance
$portableNode = Join-Path $PSScriptRoot 'runtime\node.exe'
$nodePath = if (Test-Path -LiteralPath $portableNode) { $portableNode } else { (Get-Command node.exe).Source }
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if (-not $existing) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port -RemoteAddress LocalSubnet -Program $nodePath -Profile Any | Out-Null
} else {
    $existing | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -Protocol TCP -LocalPort $port | Out-Null
    $existing | Get-NetFirewallApplicationFilter | Set-NetFirewallApplicationFilter -Program $nodePath | Out-Null
    $existing | Enable-NetFirewallRule
}
Write-Host ('LAN access enabled on TCP ' + $port + ', local subnet only.')
