$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$dependencies = @(
    @('release-assets/node-v22.23.2-win-x64.zip', 'https://nodejs.org/dist/v22.23.2/node-v22.23.2-win-x64.zip', '1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97'),
    @('vendor/leb-server-windows-x64.exe', 'https://github.com/laplace-live/event-bridge/releases/download/%40laplace.live/event-bridge-server%400.3.20/leb-server-windows-x64.exe', '759d6a64497391594e10a27692f2f37221bd96103d84c427a789dbcff0227012'),
    @('release-assets/laplace-event-bridge-0.3.20-source.zip', 'https://api.github.com/repos/laplace-live/event-bridge/zipball/@laplace.live/event-bridge-server@0.3.20', '61724c9e8f4eda82a5b434c18f5ee8890ae8924e9c1a292c619dd48fe281fa3a')
)
foreach ($dependency in $dependencies) {
    $target = Join-Path $projectRoot $dependency[0]
    New-Item -ItemType Directory -Force (Split-Path -Parent $target) | Out-Null
    if (Test-Path -LiteralPath $target) {
        if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -eq $dependency[2]) { continue }
        throw ('Existing dependency checksum mismatch: ' + $target)
    }
    $partial = $target + '.download'
    Invoke-WebRequest -UseBasicParsing -Uri $dependency[1] -OutFile $partial
    if ((Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant() -ne $dependency[2]) { throw ('Downloaded dependency checksum mismatch: ' + $partial) }
    Move-Item -LiteralPath $partial -Destination $target
    Write-Host ('Verified: ' + $dependency[0])
}
