param([switch]$CompileOnly,[ValidateSet('zh','en')][string]$Language='zh')
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$source=Join-Path $PSScriptRoot 'QueueDesktop.cs'
$hash=(Get-FileHash $source -Algorithm SHA256).Hash.Substring(0,12)
$cache=Join-Path $root 'data\desktop-runtime'
New-Item -ItemType Directory -Force $cache | Out-Null
$exe=Join-Path $cache ("QueueDesktop-$hash.exe")
if(!(Test-Path $exe)){Add-Type -Path $source -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Net.Http,System.Web.Extensions -OutputAssembly $exe -OutputType WindowsApplication}
if($CompileOnly){'Desktop overlay compiled';exit}
$runtime=Get-Content (Join-Path $root 'data\runtime.json') -Raw | ConvertFrom-Json
$mutex=[Threading.Mutex]::new($false,('Local\ZZZQueueDesktop-'+$runtime.instance))
if(!$mutex.WaitOne(0)){exit}
try{Start-Process -FilePath $exe -ArgumentList @([string]$runtime.port,$Language) -Wait}finally{$mutex.ReleaseMutex();$mutex.Dispose()}
