param([switch]$CompileOnly,[ValidateSet('zh','en')][string]$Language='zh')
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$source=Join-Path $PSScriptRoot 'QueueDesktop.cs'
$sha=[Security.Cryptography.SHA256]::Create()
try{$hash=([BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($source)))).Replace('-','').Substring(0,12)}finally{$sha.Dispose()}
$cache=Join-Path $root 'data\desktop-runtime'
New-Item -ItemType Directory -Force $cache | Out-Null
$exe=Join-Path $cache ("QueueDesktop-$hash.exe")
if(!(Test-Path $exe)){Add-Type -Path $source -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Net.Http,System.Web.Extensions -OutputAssembly $exe -OutputType WindowsApplication}
if($CompileOnly){'Desktop overlay compiled';exit}
$runtime=Get-Content (Join-Path $root 'data\runtime.json') -Raw | ConvertFrom-Json
$mutex=[Threading.Mutex]::new($false,('Local\ZZZQueueDesktop-'+$runtime.instance))
if(!$mutex.WaitOne(0)){
    $show=$null
    for($i=0;$i -lt 20 -and !$show;$i++){
        try{$show=[Threading.EventWaitHandle]::OpenExisting('Local\ZZZQueueDesktopShow-'+$runtime.instance)}
        catch [Threading.WaitHandleCannotBeOpenedException] {Start-Sleep -Milliseconds 150}
    }
    if(!$show){$mutex.Dispose();throw 'Desktop overlay is starting but cannot receive the show command'}
    try{$show.Set() | Out-Null}finally{$show.Dispose();$mutex.Dispose()}
    exit
}
try{
    $process=Start-Process -FilePath $exe -ArgumentList @([string]$runtime.port,$Language,$runtime.instance,('"'+(Join-Path $root 'assets\overlay.ico')+'"')) -WindowStyle Normal -PassThru -Wait
    if($process.ExitCode -ne 0){throw "Desktop overlay exited with code $($process.ExitCode)"}
}catch{
    Add-Content -LiteralPath (Join-Path $cache 'start-error.log') -Value ("$(Get-Date -Format o): $_") -Encoding UTF8
    throw
}finally{$mutex.ReleaseMutex();$mutex.Dispose()}
