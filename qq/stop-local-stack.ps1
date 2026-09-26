$ErrorActionPreference = 'Stop'
$startupMutex = [Threading.Mutex]::new($false, 'Local\ZZZQueueQQStack')
try { $lockAcquired = $startupMutex.WaitOne(300000) }
catch [Threading.AbandonedMutexException] { $lockAcquired = $true }
if (-not $lockAcquired) { throw '等待 QQ 服务完成启动超时。' }
try {
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pidFile = Join-Path $projectRoot 'data\qq-runtime\pids.json'
if (-not (Test-Path -LiteralPath $pidFile)) { return }
$records = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
$remaining = @{}
foreach ($name in @('nonebot','core')) {
    $item = $records.$name
    if (-not $item) { continue }
    $process = Get-Process -Id ([int]$item.pid) -ErrorAction SilentlyContinue
    if (-not $process) { continue }
    $expectedExe = [string]$item.exe
    if (-not $expectedExe.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { continue }
    try {
        $samePath = [string]::Equals($process.Path, $expectedExe, [StringComparison]::OrdinalIgnoreCase)
        $sameStart = $process.StartTime.ToUniversalTime().Ticks -eq [long]$item.startedUtcTicks
        if ($samePath -and $sameStart) {
            & taskkill.exe /PID ([int]$item.pid) /T /F | Out-Null
            if ($LASTEXITCODE -ne 0) { $remaining[$name] = $item }
        }
    } catch { $remaining[$name] = $item }
}
if ($remaining.Count -eq 0) {
    Remove-Item -LiteralPath $pidFile -Force
} else {
    $remaining | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $pidFile -Encoding utf8
    throw '未能关闭所有由本安装目录启动的 QQ 服务，请查看占用进程。'
}
} finally {
    $startupMutex.ReleaseMutex()
    $startupMutex.Dispose()
}
