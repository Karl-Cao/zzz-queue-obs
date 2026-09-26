$ErrorActionPreference = 'Stop'

$webuiPath = 'C:\ProgramData\NapCatQQ Desktop\components\NapCatQQ\config\webui.json'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envPath = Join-Path $projectRoot 'data\qq-runtime\nonebot-app\.env'
$webui = Get-Content -LiteralPath $webuiPath -Raw | ConvertFrom-Json
$envText = Get-Content -LiteralPath $envPath -Raw
$match = [regex]::Match($envText, '(?m)^ONEBOT_ACCESS_TOKEN\s*=\s*([^\r\n]+)')
if (-not $match.Success) { throw 'ONEBOT_ACCESS_TOKEN missing from NoneBot .env' }
$onebotToken = $match.Groups[1].Value.Trim().Trim('"', "'")

$base = "http://127.0.0.1:$($webui.port)/api"
$secret = [Text.Encoding]::UTF8.GetBytes($webui.token + '.napcat')
$hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($secret)).ToLowerInvariant()
$login = Invoke-RestMethod "$base/auth/login" -Method Post -ContentType 'application/json' -Body (@{ hash = $hash } | ConvertTo-Json)
if ($login.code -ne 0 -or -not $login.data.Credential) { throw "NapCat WebUI login failed: $($login.message)" }
$headers = @{ Authorization = 'Bearer ' + $login.data.Credential }
$status = Invoke-RestMethod "$base/QQLogin/CheckLoginStatus" -Method Post -Headers $headers -ContentType 'application/json' -Body '{}'
if (-not $status.data.isLogin) { throw "NapCat Bot not logged in: $($status.data.loginError)" }

$response = Invoke-RestMethod "$base/OB11Config/GetConfig" -Method Post -Headers $headers -ContentType 'application/json' -Body '{}'
if ($response.code -ne 0) { throw "NapCat config read failed: $($response.message)" }
$config = $response.data
$target = 'ws://127.0.0.1:18080/onebot/v11/ws'
$clients = @($config.network.websocketClients | Where-Object { $_.name -ne 'ZZZ Queue NoneBot2' })
$clients += [pscustomobject]@{
    name = 'ZZZ Queue NoneBot2'
    enable = $true
    url = $target
    messagePostFormat = 'array'
    reportSelfMessage = $false
    reconnectInterval = 5000
    token = $onebotToken
    debug = $false
    heartInterval = 30000
}
$config.network.websocketClients = $clients
$payload = @{ config = ($config | ConvertTo-Json -Depth 20 -Compress) } | ConvertTo-Json -Depth 20
$saved = Invoke-RestMethod "$base/OB11Config/SetConfig" -Method Post -Headers $headers -ContentType 'application/json' -Body $payload
if ($saved.code -ne 0) { throw "NapCat config save failed: $($saved.message)" }
Write-Output "NapCat reverse WebSocket configured: $target"
