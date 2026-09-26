param([string]$PythonHome='C:\Python313')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$installed = Join-Path $root 'data\qq-runtime'
$bundle = Join-Path $root 'qq\runtime'
$coreSource = Join-Path $installed 'gsuid_core'
$zzzSource = Join-Path $coreSource 'gsuid_core\plugins\ZZZeroUID'

foreach ($required in @(
    (Join-Path $PythonHome 'python.exe'),
    (Join-Path $installed 'core-venv\Scripts\core.exe'),
    (Join-Path $installed 'nonebot-venv\Scripts\python.exe'),
    (Join-Path $installed 'nonebot-venv\Lib\site-packages\httpx'),
    (Join-Path $installed 'nonebot-venv\Lib\site-packages\websockets'),
    (Join-Path $installed 'nonebot-venv\Lib\site-packages\nonebot\adapters\qq'),
    (Join-Path $zzzSource 'LICENSE')
)) { if (-not (Test-Path -LiteralPath $required)) { throw "QQ bundle prerequisite missing: $required" } }
if (Test-Path -LiteralPath $bundle) { throw "Remove or rename the previous QQ bundle before rebuilding: $bundle" }

New-Item -ItemType Directory -Path (Join-Path $bundle 'python') -Force | Out-Null
foreach ($folder in @('DLLs','Lib','tcl')) {
    Copy-Item -LiteralPath (Join-Path $PythonHome $folder) -Destination (Join-Path $bundle 'python') -Recurse
}
Get-ChildItem -LiteralPath $PythonHome -File | Where-Object { $_.Name -match '^(python.*\.exe|python.*\.dll|vcruntime.*\.dll|LICENSE\.txt)$' } | Copy-Item -Destination (Join-Path $bundle 'python')
foreach ($venv in @('core-venv','nonebot-venv')) {
    $from = Join-Path $installed $venv
    $to = Join-Path $bundle $venv
    New-Item -ItemType Directory -Path $to,(Join-Path $to 'Scripts'),(Join-Path $to 'Lib') -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $from 'Lib\site-packages') -Destination (Join-Path $to 'Lib') -Recurse
    foreach ($file in @('python.exe','pythonw.exe','core.exe')) {
        $source = Join-Path $from ('Scripts\'+$file)
        if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $to 'Scripts') }
    }
    Set-Content -LiteralPath (Join-Path $to 'pyvenv.cfg') -Value @('home = ../python','include-system-site-packages = false','version = 3.13.5') -Encoding ascii
}

$source = Join-Path $bundle 'source'
New-Item -ItemType Directory -Path (Join-Path $source 'gsuid_core') -Force | Out-Null
Get-ChildItem -LiteralPath (Join-Path $coreSource 'gsuid_core') -Force |
    Where-Object { $_.Name -ne 'plugins' } |
    Copy-Item -Destination (Join-Path $source 'gsuid_core') -Recurse
$plugins = Join-Path $source 'gsuid_core\plugins'
New-Item -ItemType Directory -Path $plugins -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $zzzSource 'ZZZeroUID') -Destination (Join-Path $plugins 'ZZZeroUID') -Recurse
Copy-Item -LiteralPath (Join-Path $root 'qq\gsuid_queue') -Destination $plugins -Recurse
Set-Content -LiteralPath (Join-Path $bundle 'core-venv\Lib\site-packages\gsuid_core.pth') -Value '__ZZZ_CORE_SOURCE__' -Encoding ascii

# Keep upstream art out of the installer. The streamer downloads it on demand.
$dataStore = Join-Path $source 'gsuid_core\data_store.py'
$dataStoreText = Get-Content -LiteralPath $dataStore -Raw
$dataStoreOriginal = 'gs_data_path = Path(__file__).parents[1] / "data"'
if (-not $dataStoreText.Contains($dataStoreOriginal)) { throw 'gsuid_core data path changed; review the bundle patch' }
$dataStoreText = $dataStoreText.Replace('from pathlib import Path', "import os`nfrom pathlib import Path")
$dataStoreText = $dataStoreText.Replace($dataStoreOriginal, 'gs_data_path = Path(os.environ.get("ZZZ_QUEUE_GSUID_DATA_PATH", Path(__file__).parents[1] / "data"))')
[IO.File]::WriteAllText($dataStore, $dataStoreText, [Text.UTF8Encoding]::new($false))
$resourceStart = Join-Path $plugins 'ZZZeroUID\zzzerouid_resource\__init__.py'
$resourceText = Get-Content -LiteralPath $resourceStart -Raw
$resourceOriginal = 'async def startup():'
if (-not $resourceText.Contains($resourceOriginal)) { throw 'ZZZeroUID startup changed; review the bundle patch' }
$resourceText = $resourceText.Replace($resourceOriginal, "async def startup():`n    if os.environ.get('ZZZ_QUEUE_SKIP_AUTO_RESOURCES') == '1':`n        logger.info('[资源文件下载] 已跳过自动下载；需要贴图时请手动下载')`n        return")
$resourceText = $resourceText.Replace('from gsuid_core.sv import SV', "import os`n`nfrom gsuid_core.sv import SV")
[IO.File]::WriteAllText($resourceStart, $resourceText, [Text.UTF8Encoding]::new($false))

$licenses = Join-Path $bundle 'licenses'
New-Item -ItemType Directory -Path $licenses -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $coreSource 'LICENSE') -Destination (Join-Path $licenses 'gsuid-core-GPL-3.0.txt')
Copy-Item -LiteralPath (Join-Path $zzzSource 'LICENSE') -Destination (Join-Path $licenses 'ZZZeroUID-AGPL-3.0.txt')
Copy-Item -LiteralPath (Join-Path $PythonHome 'LICENSE.txt') -Destination (Join-Path $licenses 'Python-LICENSE.txt')
Copy-Item -LiteralPath (Join-Path $root 'qq/licenses/NoneBot-QQ-Adapter-MIT.txt') -Destination $licenses
$genshinLicense = Get-ChildItem -LiteralPath (Join-Path $installed 'nonebot-venv/Lib/site-packages') -Directory -Filter 'nonebot_plugin_genshinuid-*.dist-info' | Select-Object -First 1
if (-not $genshinLicense) { throw 'GenshinUID license metadata is missing' }
Copy-Item -LiteralPath (Join-Path $genshinLicense.FullName 'licenses/LICENSE') -Destination (Join-Path $licenses 'GenshinUID-GPL-3.0.txt')

Write-Host "QQ runtime staged at $bundle"
