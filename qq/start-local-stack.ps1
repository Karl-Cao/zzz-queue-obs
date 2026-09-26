param([switch]$SkipTray)
$ErrorActionPreference = 'Stop'
$startupMutex = [Threading.Mutex]::new($false, 'Local\ZZZQueueQQStack')
try { $lockAcquired = $startupMutex.WaitOne(120000) }
catch [Threading.AbandonedMutexException] { $lockAcquired = $true }
if (-not $lockAcquired) { throw 'QQ 服务启动等待超时。' }
try {

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$userRuntime = Join-Path $projectRoot 'data\qq-runtime'
$officialCredentials = Join-Path $userRuntime 'official-bot.json'
$legacyEnv = Join-Path $userRuntime 'nonebot-app\.env'
if (-not (Test-Path -LiteralPath $officialCredentials) -and -not (Test-Path -LiteralPath $legacyEnv)) {
    throw '请先在排队助手控制台保存 QQ 官方机器人 AppID 和 AppSecret。'
}
$bundle = Join-Path $projectRoot 'qq\runtime'
$bundled = (Test-Path -LiteralPath (Join-Path $bundle 'python\python.exe')) -and
    (Test-Path -LiteralPath (Join-Path $bundle 'source\gsuid_core\__init__.py')) -and
    (Test-Path -LiteralPath (Join-Path $bundle 'core-venv\Scripts\python.exe'))
$runtime = if ($bundled) { $bundle } else { $userRuntime }
$logDirectory = Join-Path $userRuntime 'startup-logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$env:ZZZ_QUEUE_QQ_CONFIG = Join-Path $userRuntime 'gsuid_queue\settings.json'

if ($bundled) {
    $pythonHome = Join-Path $bundle 'python'
    foreach ($name in @('core-venv','nonebot-venv')) {
        $cfg = Join-Path $bundle ($name + '\pyvenv.cfg')
        @("home = $pythonHome", 'include-system-site-packages = false', 'version = 3.13.5', "executable = $(Join-Path $pythonHome 'python.exe')") |
            Set-Content -LiteralPath $cfg -Encoding ascii
    }
    (Join-Path $bundle 'source') | Set-Content -LiteralPath (Join-Path $bundle 'core-venv\Lib\site-packages\gsuid_core.pth') -Encoding utf8
    $coreRoot = Join-Path $userRuntime 'gsuid_core'
    $nonebotRoot = Join-Path $userRuntime 'nonebot-app'
    New-Item -ItemType Directory -Path $coreRoot,$nonebotRoot -Force | Out-Null
    $env:ZZZ_QUEUE_GSUID_DATA_PATH = Join-Path $coreRoot 'data'
    $env:ZZZ_QUEUE_SKIP_AUTO_RESOURCES = '1'
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'nonebot_bot.py') -Destination (Join-Path $nonebotRoot 'bot.py') -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'mention_gate.py') -Destination $nonebotRoot -Force
    $env:PYTHONPATH = Join-Path $bundle 'source'
} else {
    $coreRoot = Join-Path $runtime 'gsuid_core'
    $nonebotRoot = Join-Path $runtime 'nonebot-app'
}

$nonebotEnv = Join-Path $nonebotRoot '.env'
if (Test-Path -LiteralPath $officialCredentials) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'nonebot_bot.py') -Destination (Join-Path $nonebotRoot 'bot.py') -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'official_queue.py') -Destination $nonebotRoot -Force
    $credentials = Get-Content -LiteralPath $officialCredentials -Raw | ConvertFrom-Json
    $bots = ConvertTo-Json -InputObject @(@{ id = [string]$credentials.appId; token = [string]$credentials.secret; secret = [string]$credentials.secret; intent = @{
        guilds = $false; guild_members = $false; guild_messages = $false
        guild_message_reactions = $false; direct_message = $false
        open_forum_event = $false; audio_live_member = $false
        group_members = $false; c2c_group_at_messages = $true
        interaction = $false; message_audit = $false; forum_event = $false
        audio_action = $false; at_messages = $false
    } }) -Depth 4 -Compress
    @('DRIVER=~fastapi+~httpx+~websockets','HOST=127.0.0.1','PORT=18080','SUPERUSERS=[]',("QQ_BOTS='$bots'"),'GSUID_CORE_HOST=127.0.0.1','GSUID_CORE_PORT=8765') |
        Set-Content -LiteralPath $nonebotEnv -Encoding utf8
    $env:ZZZ_QUEUE_QQ_OFFICIAL = '1'
} elseif (-not (Test-Path -LiteralPath $nonebotEnv)) {
    throw '请先在排队助手控制台保存 QQ 官方机器人 AppID 和 AppSecret。'
}

function Test-LocalPort([int]$port) {
    $client = [Net.Sockets.TcpClient]::new()
    try {
        $result = $client.BeginConnect('127.0.0.1', $port, $null, $null)
        return $result.AsyncWaitHandle.WaitOne(1000) -and $client.Connected
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

function Wait-LocalPort([int]$port, [int]$seconds = 60) {
    for ($i = 0; $i -lt $seconds; $i++) {
        if (Test-LocalPort $port) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

if (-not $SkipTray) {
    $trayPython = Join-Path $projectRoot '.venv\Scripts\pythonw.exe'
    $trayExe = Join-Path $projectRoot 'ZZZ Queue.exe'
    if (Test-Path -LiteralPath $trayExe) {
        Start-Process -FilePath $trayExe -WorkingDirectory $projectRoot -WindowStyle Hidden
    } elseif (Test-Path -LiteralPath $trayPython) {
        # The tray application has its own single-instance lock and starts the queue service.
        Start-Process -FilePath $trayPython -ArgumentList (Join-Path $projectRoot 'queue_tray.py') -WorkingDirectory $projectRoot -WindowStyle Hidden
    } else {
        Add-Content (Join-Path $logDirectory 'startup-errors.log') 'Queue tray Python is missing.'
    }
}

$env:PYTHONIOENCODING = 'utf-8'
function Save-StartedPid([string]$name, $process, [string]$exe) {
    $pidFile = Join-Path $userRuntime 'pids.json'
    $records = @{}
    if (Test-Path -LiteralPath $pidFile) {
        try {
            $previous = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
            foreach ($existingName in @('core','nonebot')) {
                if ($previous.$existingName) { $records[$existingName] = $previous.$existingName }
            }
        } catch { }
    }
    $records[$name] = @{ pid = $process.Id; exe = $exe; startedUtcTicks = $process.StartTime.ToUniversalTime().Ticks }
    $records | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $pidFile -Encoding utf8
}
$coreExe = if ($bundled) { Join-Path $runtime 'core-venv\Scripts\python.exe' } else { Join-Path $runtime 'core-venv\Scripts\core.exe' }
$coreArguments = if ($bundled) { @('-m', 'gsuid_core.core', '--host', '127.0.0.1', '--port', '8765') } else { @('--host', '127.0.0.1', '--port', '8765') }
if (-not (Test-LocalPort 8765)) {
    $coreProcess = Start-Process -FilePath $coreExe -ArgumentList $coreArguments `
        -WorkingDirectory $coreRoot -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logDirectory 'core.log') `
        -RedirectStandardError (Join-Path $logDirectory 'core-error.log') -PassThru
    Save-StartedPid 'core' $coreProcess $coreExe
}
if (-not (Wait-LocalPort 8765)) {
    Add-Content (Join-Path $logDirectory 'startup-errors.log') 'gsuid_core did not open port 8765.'
    throw 'gsuid_core did not open port 8765.'
}

$nonebotPython = Join-Path $runtime 'nonebot-venv\Scripts\python.exe'
if (-not (Test-LocalPort 18080)) {
    $nonebotProcess = Start-Process -FilePath $nonebotPython -ArgumentList 'bot.py' `
        -WorkingDirectory $nonebotRoot -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logDirectory 'nonebot.log') `
        -RedirectStandardError (Join-Path $logDirectory 'nonebot-error.log') -PassThru
    Save-StartedPid 'nonebot' $nonebotProcess $nonebotPython
}
if (-not (Wait-LocalPort 18080)) {
    Add-Content (Join-Path $logDirectory 'startup-errors.log') 'NoneBot2 did not open port 18080.'
    throw 'NoneBot2 did not open port 18080.'
}

# The official adapter connects outbound; legacy NapCat uses its reverse WebSocket.
} finally {
    $startupMutex.ReleaseMutex()
    $startupMutex.Dispose()
}
