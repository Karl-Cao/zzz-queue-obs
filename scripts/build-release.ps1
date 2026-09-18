$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseRoot = Join-Path $projectRoot 'releases'
$assetsRoot = Join-Path $projectRoot 'release-assets'
$version = (Get-Content (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
$nodeArchive = Join-Path $assetsRoot 'node-v22.23.2-win-x64.zip'
$bridge = Join-Path $projectRoot 'vendor\leb-server-windows-x64.exe'
$bridgeSource = Join-Path $assetsRoot 'laplace-event-bridge-0.3.20-source.zip'
foreach ($item in @(@($nodeArchive, '1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97'), @($bridge, '759d6a64497391594e10a27692f2f37221bd96103d84c427a789dbcff0227012'), @($bridgeSource, '61724c9e8f4eda82a5b434c18f5ee8890ae8924e9c1a292c619dd48fe281fa3a'))) {
    if ((Get-FileHash -LiteralPath $item[0] -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item[1]) { throw ('Dependency checksum mismatch: ' + $item[0]) }
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$nodeZip = [IO.Compression.ZipFile]::OpenRead($nodeArchive)
$sourceZip = [IO.Compression.ZipFile]::OpenRead($bridgeSource)
try {
    foreach ($edition in @('bridge')) {
        $name = 'obs-queue-' + $version + '-windows-x64'
        $destination = Join-Path $releaseRoot $name
        if (Test-Path -LiteralPath $destination) { throw ('Build folder already exists; use a new version or a fresh releases directory: ' + $destination) }
        New-Item -ItemType Directory -Force $destination,(Join-Path $destination 'runtime'),(Join-Path $destination 'licenses') | Out-Null
        foreach ($folder in @('server','public','scripts','tests','desktop')) { Copy-Item -LiteralPath (Join-Path $projectRoot $folder) -Destination $destination -Recurse }
        foreach ($file in @('package.json','README.md','README.en.md','LICENSE','THIRD-PARTY-NOTICES.md','start.cmd','desktop.cmd','desktop-en.cmd','stop.cmd','enable-lan.cmd','enable-lan.ps1')) { Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination $destination }
        $editionName = 'Event Bridge'
        [IO.File]::WriteAllText((Join-Path $destination 'edition.json'),(@{id=$edition;name=$editionName} | ConvertTo-Json),[Text.UTF8Encoding]::new($false))
        [IO.Compression.ZipFileExtensions]::ExtractToFile($nodeZip.GetEntry('node-v22.23.2-win-x64/node.exe'),(Join-Path $destination 'runtime\node.exe'))
        [IO.Compression.ZipFileExtensions]::ExtractToFile($nodeZip.GetEntry('node-v22.23.2-win-x64/LICENSE'),(Join-Path $destination 'licenses\Node.js-LICENSE.txt'))
        if ($edition -eq 'bridge') {
            New-Item -ItemType Directory (Join-Path $destination 'vendor'),(Join-Path $destination 'third-party-source') | Out-Null
            Copy-Item -LiteralPath $bridge -Destination (Join-Path $destination 'vendor')
            Copy-Item -LiteralPath $bridgeSource -Destination (Join-Path $destination 'third-party-source')
            $license = $sourceZip.Entries | Where-Object { $_.FullName -match '/packages/server/LICENSE$' } | Select-Object -First 1
            $build = $sourceZip.Entries | Where-Object { $_.FullName -match '/packages/server/README.md$' } | Select-Object -First 1
            [IO.Compression.ZipFileExtensions]::ExtractToFile($license,(Join-Path $destination 'licenses\Event-Bridge-AGPL-3.0.txt'))
            [IO.Compression.ZipFileExtensions]::ExtractToFile($build,(Join-Path $destination 'licenses\Event-Bridge-BUILD.md'))
        }
        $zipPath = Join-Path $releaseRoot ($name + '.zip')
        [IO.Compression.ZipFile]::CreateFromDirectory($destination,$zipPath,[IO.Compression.CompressionLevel]::Optimal,$true)
        $hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
        ($hash + '  ' + (Split-Path -Leaf $zipPath)) | Set-Content -LiteralPath ($zipPath + '.sha256') -Encoding ascii
        Write-Host $zipPath
    }
} finally { $nodeZip.Dispose(); $sourceZip.Dispose() }
