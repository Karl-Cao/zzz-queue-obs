param([ValidateSet('StartRelay','StartBot','StopBot','StopRelay','Status','Stop')][string]$Action='Status')
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$folder=Join-Path $root 'data\public-qq-host'
$recordPath=Join-Path $folder 'processes.json'
$tokenPath=Join-Path $folder 'bot-token.txt'
$relayDir=Join-Path $folder 'relay'
$node=(Get-Command node -ErrorAction Stop).Source
$python=Join-Path $root 'data\qq-runtime\nonebot-venv\Scripts\python.exe'
$coreExe=Join-Path $root 'data\qq-runtime\core-venv\Scripts\core.exe'
$coreRoot=Join-Path $root 'data\qq-runtime\gsuid_core'
$nonebotRoot=Join-Path $root 'data\qq-runtime\nonebot-app'
$cloudflared=Join-Path $root 'runtime\cloudflared.exe'
$tunnelConfig=Join-Path $folder 'tunnel.yml'
New-Item -ItemType Directory -Force -Path $folder,$relayDir | Out-Null

function Read-Records {
    if (Test-Path -LiteralPath $recordPath) {
        $parsed=Get-Content -LiteralPath $recordPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $result=@{}
        foreach ($entry in $parsed.PSObject.Properties) { $result[$entry.Name]=$entry.Value }
        return $result
    }
    return @{}
}
function Save-Records($records) {
    $tmp="$recordPath.tmp"
    [IO.File]::WriteAllText($tmp,($records | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $tmp -Destination $recordPath -Force
}
function Owned($record) {
    if (-not $record) { return $false }
    $process=Get-Process -Id ([int]$record.pid) -ErrorAction SilentlyContinue
    if (-not $process) { return $false }
    try {
        return [string]::Equals($process.Path,[string]$record.exe,[StringComparison]::OrdinalIgnoreCase) -and
            $process.StartTime.ToUniversalTime().Ticks -eq [long]$record.startedUtcTicks
    } catch { return $false }
}
function Launch($name,$exe,$arguments,$workingDirectory=$root) {
    $records=Read-Records
    if (Owned $records[$name]) { Write-Output "$name already running"; return }
    $out=Join-Path $folder "$name.log"
    $err=Join-Path $folder "$name-error.log"
    $process=Start-Process -FilePath $exe -ArgumentList $arguments -WorkingDirectory $workingDirectory -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
    Start-Sleep -Milliseconds 300
    if ($process.HasExited) { throw "$name exited immediately; inspect $err" }
    $records[$name]=@{pid=$process.Id;exe=$exe;startedUtcTicks=$process.StartTime.ToUniversalTime().Ticks}
    Save-Records $records
    Write-Output "$name started (PID $($process.Id))"
}
function Token {
    if (-not (Test-Path -LiteralPath $tokenPath)) {
        $bytes=[byte[]]::new(32)
        $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        [IO.File]::WriteAllText($tokenPath,([BitConverter]::ToString($bytes)).Replace('-','').ToLowerInvariant(),[Text.UTF8Encoding]::new($false))
    }
    return [IO.File]::ReadAllText($tokenPath).Trim()
}
function Test-LocalPort([int]$port) {
    $client=[Net.Sockets.TcpClient]::new()
    try {
        $pending=$client.BeginConnect('127.0.0.1',$port,$null,$null)
        return $pending.AsyncWaitHandle.WaitOne(1000) -and $client.Connected
    } catch { return $false }
    finally { $client.Dispose() }
}

if ($Action -eq 'StartRelay') {
    if (-not (Test-Path -LiteralPath $cloudflared) -or -not (Test-Path -LiteralPath $tunnelConfig)) { throw 'Cloudflare Tunnel is not configured' }
    $env:PUBLIC_QQ_DATA_DIR=$relayDir
    $env:PUBLIC_QQ_HOST='127.0.0.1'
    $env:PUBLIC_QQ_PORT='8787'
    $env:PUBLIC_QQ_BOT_TOKEN=Token
    try { Launch 'relay' $node ('"'+(Join-Path $root 'public_bot\relay-server.mjs')+'"') }
    finally { Remove-Item Env:\PUBLIC_QQ_BOT_TOKEN,Env:\PUBLIC_QQ_DATA_DIR,Env:\PUBLIC_QQ_HOST,Env:\PUBLIC_QQ_PORT -ErrorAction SilentlyContinue }
    Launch 'tunnel' $cloudflared ('tunnel --config "'+$tunnelConfig+'" run zzz-queue-home')
}
elseif ($Action -eq 'StartBot') {
    if (-not (Owned (Read-Records)['relay'])) { throw 'StartRelay first' }
    $creds=Get-Content -LiteralPath (Join-Path $root 'data\qq-runtime\official-bot.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $creds.appId -or -not $creds.secret -or -not (Test-Path -LiteralPath $python) -or -not (Test-Path -LiteralPath $coreExe)) { throw 'Official QQ credentials or query runtime are missing' }
    if (-not (Test-LocalPort 8765)) {
        Launch 'core' $coreExe '--host 127.0.0.1 --port 8765' $coreRoot
        for ($i=0; $i -lt 60 -and -not (Test-LocalPort 8765); $i++) { Start-Sleep -Seconds 1 }
        if (-not (Test-LocalPort 8765)) { throw 'gsuid-core did not open port 8765' }
    }
    $env:PUBLIC_QQ_APP_ID=[string]$creds.appId
    $env:PUBLIC_QQ_APP_SECRET=[string]$creds.secret
    $env:PUBLIC_QQ_BOT_TOKEN=Token
    $env:PYTHONIOENCODING='utf-8'
    $env:PYTHONUTF8='1'
    $env:GSUID_CORE_PATH=$coreRoot
    $env:GSUID_CORE_HOST='127.0.0.1'
    $env:GSUID_CORE_PORT='8765'
    $env:PUBLIC_QQ_ENABLE_ZZZ='1'
    try { Launch 'bot' $python ('"'+(Join-Path $root 'public_bot\start_bot.py')+'"') $nonebotRoot }
    finally { Remove-Item Env:\PUBLIC_QQ_APP_ID,Env:\PUBLIC_QQ_APP_SECRET,Env:\PUBLIC_QQ_BOT_TOKEN,Env:\PUBLIC_QQ_ENABLE_ZZZ,Env:\PYTHONIOENCODING,Env:\PYTHONUTF8,Env:\GSUID_CORE_PATH,Env:\GSUID_CORE_HOST,Env:\GSUID_CORE_PORT -ErrorAction SilentlyContinue }
}
elseif ($Action -in @('StopBot','StopRelay')) {
    $serviceName=if($Action -eq 'StopBot'){'bot'}else{'relay'}
    $records=Read-Records
    if (Owned $records[$serviceName]) {
        & taskkill.exe /PID ([int]$records[$serviceName].pid) /T /F | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Could not stop $serviceName" }
        Write-Output "$serviceName stopped"
    }
    $records.Remove($serviceName)
    Save-Records $records
}
elseif ($Action -eq 'Stop') {
    $records=Read-Records
    foreach ($name in @('bot','core','tunnel','relay')) {
        if (Owned $records[$name]) {
            & taskkill.exe /PID ([int]$records[$name].pid) /T /F | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "Could not stop $name" }
            Write-Output "$name stopped"
        }
        $records.Remove($name)
    }
    Save-Records $records
}
else {
    $records=Read-Records
    foreach ($name in @('relay','tunnel','core','bot')) {
        $state=if (Owned $records[$name]) { 'running' } elseif ($name -eq 'core' -and (Test-LocalPort 8765)) { 'available (already running)' } else { 'stopped' }
        Write-Output ('{0}: {1}' -f $name,$state)
    }
}
