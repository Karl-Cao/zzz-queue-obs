param([string]$Python='', [switch]$Release)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
if(-not $Python){$Python=Join-Path $root '.venv\Scripts\python.exe'}
$version=(Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
$assets=Join-Path $root 'release-assets'
$output=Join-Path $root $(if($Release){'releases'}else{'test-builds'})
$trayBuild=Join-Path $root 'data\tray-build-client'
$nodeArchive=Join-Path $assets 'node-v22.23.2-win-x64.zip'
$bridge=Join-Path $root 'vendor\leb-server-windows-x64.exe'
$bridgeSource=Join-Path $assets 'laplace-event-bridge-0.3.20-source.zip'
foreach($file in @($Python,$nodeArchive,$bridge,$bridgeSource)) { if(-not(Test-Path -LiteralPath $file)){throw "Missing build dependency: $file"} }
$env:PYTHONNOUSERSITE='1'
$env:PYINSTALLER_CONFIG_DIR=Join-Path $trayBuild 'config'
& $Python (Join-Path $PSScriptRoot 'build-user-guide.py')
if($LASTEXITCODE -ne 0){throw 'User guide rendering failed'}
& $Python -m PyInstaller --noconfirm --clean --windowed --onedir --name 'ZZZ Queue' --icon (Join-Path $root 'assets\app.ico') --distpath (Join-Path $trayBuild 'dist') --workpath (Join-Path $trayBuild 'work') --specpath $trayBuild (Join-Path $root 'queue_tray.py')
if($LASTEXITCODE -ne 0){throw 'Tray EXE build failed'}
& $Python (Join-Path $PSScriptRoot 'collect-python-licenses.py') (Join-Path $trayBuild 'licenses')
if($LASTEXITCODE -ne 0){throw 'License collection failed'}
New-Item -ItemType Directory -Force -Path $output | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$nodeZip=[IO.Compression.ZipFile]::OpenRead($nodeArchive)
$sourceZip=[IO.Compression.ZipFile]::OpenRead($bridgeSource)
try {
    foreach($edition in @('exe','python')) {
        $name=if($Release){"obs-queue-$version-windows-x64-$edition"}else{"obs-queue-$version-windows-x64-client-$edition"}
        $destination=Join-Path $output $name
        $zipPath="$destination.zip"
        if((Test-Path -LiteralPath $destination) -or (Test-Path -LiteralPath $zipPath)){throw "Test build already exists: $name"}
        New-Item -ItemType Directory -Force -Path $destination,(Join-Path $destination 'runtime'),(Join-Path $destination 'licenses'),(Join-Path $destination 'scripts'),(Join-Path $destination 'vendor'),(Join-Path $destination 'third-party-source') | Out-Null
        foreach($folder in @('server','public','desktop','assets','docs')) { Copy-Item -LiteralPath (Join-Path $root $folder) -Destination $destination -Recurse }
        foreach($file in @('package.json','README.md','README.en.md','LICENSE','THIRD-PARTY-NOTICES.md','CLIENT-TEST.zh-CN.md','start.cmd','start-python.cmd','queue_tray.py','requirements.txt','desktop.cmd','desktop-en.cmd','stop.cmd','enable-lan.cmd','enable-lan.ps1')) { Copy-Item -LiteralPath (Join-Path $root $file) -Destination $destination }
        foreach($file in @('start.mjs','ports.mjs','launcher-lock.mjs','stop-owned.ps1')) { Copy-Item -LiteralPath (Join-Path (Join-Path $root 'scripts') $file) -Destination (Join-Path $destination 'scripts') }
        [IO.File]::WriteAllText((Join-Path $destination 'edition.json'),(@{id='client';name='Shared QQ client';launcher=$edition}|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
        [IO.Compression.ZipFileExtensions]::ExtractToFile($nodeZip.GetEntry('node-v22.23.2-win-x64/node.exe'),(Join-Path $destination 'runtime\node.exe'))
        [IO.Compression.ZipFileExtensions]::ExtractToFile($nodeZip.GetEntry('node-v22.23.2-win-x64/LICENSE'),(Join-Path $destination 'licenses\Node.js-LICENSE.txt'))
        Copy-Item -LiteralPath $bridge -Destination (Join-Path $destination 'vendor')
        Copy-Item -LiteralPath $bridgeSource -Destination (Join-Path $destination 'third-party-source')
        $license=$sourceZip.Entries|Where-Object{$_.FullName -match '/packages/server/LICENSE$'}|Select-Object -First 1
        $build=$sourceZip.Entries|Where-Object{$_.FullName -match '/packages/server/README.md$'}|Select-Object -First 1
        [IO.Compression.ZipFileExtensions]::ExtractToFile($license,(Join-Path $destination 'licenses\Event-Bridge-AGPL-3.0.txt'))
        [IO.Compression.ZipFileExtensions]::ExtractToFile($build,(Join-Path $destination 'licenses\Event-Bridge-BUILD.md'))
        if($edition -eq 'exe') {
            Copy-Item -Path (Join-Path $trayBuild 'dist\ZZZ Queue\*') -Destination $destination -Recurse
            Copy-Item -Path (Join-Path $trayBuild 'licenses\*') -Destination (Join-Path $destination 'licenses') -Recurse
        }
        [IO.Compression.ZipFile]::CreateFromDirectory($destination,$zipPath,[IO.Compression.CompressionLevel]::Optimal,$true)
        $hash=(Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
        ($hash+'  '+(Split-Path -Leaf $zipPath))|Set-Content -LiteralPath ($zipPath+'.sha256') -Encoding ascii
        Write-Output $zipPath
    }
} finally { $nodeZip.Dispose(); $sourceZip.Dispose() }
