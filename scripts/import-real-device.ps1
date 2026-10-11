param([switch]$CheckOnly)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$inputFile=Join-Path $projectRoot 'data\oracle-deploy\real-device-input.json'
$python=Join-Path $projectRoot '.venv\Scripts\python.exe'
$helper=Join-Path $projectRoot 'data\oracle-deploy\ssh.ps1'
$serverScript=Join-Path $PSScriptRoot 'bind-real-device-server.py'
$validator=Join-Path $PSScriptRoot 'real_device_input.py'
& $python $serverScript --input $inputFile --uid 102823666 --requester A7F32B77A6836F8779ECBC20B19BD964 --check
if($LASTEXITCODE -ne 0) { throw 'Fill the local JSON with the real device headers first. Nothing was uploaded.' }
if($CheckOnly) { exit 0 }
$remoteInput='/home/ubuntu/zzz-real-device-'+[guid]::NewGuid().ToString('N')+'.json'
try {
    & $helper -Upload $serverScript
    if($LASTEXITCODE -ne 0) { throw 'Server tool upload failed.' }
    & $helper -Upload $validator
    if($LASTEXITCODE -ne 0) { throw 'Validator upload failed.' }
    & $helper -Upload $inputFile -Destination $remoteInput
    if($LASTEXITCODE -ne 0) { throw 'Device input upload failed.' }
    & $helper -Command ('chmod 600 '+$remoteInput+'; sudo /opt/gsuid-core-releases/87c06f1/.venv/bin/python /home/ubuntu/bind-real-device-server.py --input '+$remoteInput+' --uid 102823666 --requester A7F32B77A6836F8779ECBC20B19BD964')
    if($LASTEXITCODE -ne 0) { throw 'Import or query probe did not complete successfully. Check the sanitized result above.' }
} finally {
    & $helper -Command ('rm -f -- '+$remoteInput)
}
