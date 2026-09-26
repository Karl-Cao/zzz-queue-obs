$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$bundle = Join-Path $projectRoot 'qq\runtime'
$python = Join-Path $bundle 'core-venv\Scripts\python.exe'
$source = Join-Path $bundle 'source'
if (-not (Test-Path -LiteralPath $python) -or -not (Test-Path -LiteralPath (Join-Path $source 'gsuid_core\__init__.py'))) {
    throw 'Portable QQ runtime is missing. Download a release with QQ support first.'
}
$pythonHome = Join-Path $bundle 'python'
@("home = $pythonHome", 'include-system-site-packages = false', 'version = 3.13.5', "executable = $(Join-Path $pythonHome 'python.exe')") |
    Set-Content -LiteralPath (Join-Path $bundle 'core-venv\pyvenv.cfg') -Encoding ascii
$source | Set-Content -LiteralPath (Join-Path $bundle 'core-venv\Lib\site-packages\gsuid_core.pth') -Encoding utf8
$coreRoot = Join-Path $projectRoot 'data\qq-runtime\gsuid_core'
New-Item -ItemType Directory -Path $coreRoot -Force | Out-Null
$env:PYTHONPATH = $source
$env:ZZZ_QUEUE_GSUID_DATA_PATH = Join-Path $coreRoot 'data'
$env:ZZZ_QUEUE_SKIP_AUTO_RESOURCES = '1'
$env:PYTHONIOENCODING = 'utf-8'
Push-Location $coreRoot
try {
    & $python (Join-Path $PSScriptRoot 'download-resources.py')
    if ($LASTEXITCODE -ne 0) { throw "Resource download failed with code $LASTEXITCODE" }
} finally { Pop-Location }
