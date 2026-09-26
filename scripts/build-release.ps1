param([string]$Python='')
$ErrorActionPreference='Stop'
# Release packages contain the streamer client only, never the public bot host.
& (Join-Path $PSScriptRoot 'build-client-test.ps1') -Python $Python -Release
