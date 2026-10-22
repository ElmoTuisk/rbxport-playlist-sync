param([string]$NodePath, [string]$RbxportPath, [Alias('NoBrowser')][switch]$NoWindow, [switch]$Detached, [switch]$Background, [switch]$PauseAutomatic)
$ErrorActionPreference = 'Stop'
trap {
    if (-not $NoWindow -and -not $Background) {
        Add-Type -AssemblyName System.Windows.Forms
        [Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Playlist Sync', 'OK', 'Error') | Out-Null
    } else { Write-Error $_ -ErrorAction Continue }
    exit 1
}
$addonRoot = $PSScriptRoot
. (Join-Path $addonRoot 'scripts\Desktop.ps1')
$stateDirectory = Get-PlaylistSyncDataDirectory $addonRoot
New-Item -ItemType Directory -Force -Path $stateDirectory | Out-Null
if (-not $NodePath) {
    $privateNode = Join-Path $addonRoot '.runtime\node.exe'
    $NodePath = if (Test-Path -LiteralPath $privateNode) { $privateNode } else { 'node' }
}
$nodeVersion = & $NodePath --version
if ($LASTEXITCODE -ne 0 -or [int]($nodeVersion.TrimStart('v').Split('.')[0]) -lt 24) { throw 'Run Install-Playlist-Sync.cmd to set up the private runtime.' }
if (-not $Background) {
$RbxportPath = Find-PlaylistSyncRbxport $RbxportPath
if ($Detached -and -not $NoWindow) { $browserPath = Find-PlaylistSyncBrowser }
$automationReady = $false
try { $null = Invoke-RestMethod -Uri 'http://127.0.0.1:43822/json/version' -TimeoutSec 2; $automationReady = $true } catch { }
if (-not $automationReady) {
    if (Get-Process -Name rbxport -ErrorAction SilentlyContinue) { throw 'Close rbxport normally, then open Playlist Sync again. The add-on will start rbxport with its local connection enabled.' }
    $oldPort = $env:RBXPORT_DEVTOOLS_PORT
    try { $env:RBXPORT_DEVTOOLS_PORT = '43822'; Start-Process -FilePath $RbxportPath -WindowStyle Hidden }
    finally { if ($null -eq $oldPort) { Remove-Item Env:RBXPORT_DEVTOOLS_PORT -ErrorAction SilentlyContinue } else { $env:RBXPORT_DEVTOOLS_PORT = $oldPort } }
}
}
$serviceReady = $false
try { $null = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:43821/' -TimeoutSec 2; $serviceReady = $true } catch { }
$launchFile = Join-Path $stateDirectory 'launch-url.txt'
if ($serviceReady -and -not (Test-Path -LiteralPath $launchFile)) { throw 'A different Playlist Sync installation is running. Stop it before opening this installation.' }
if (-not $serviceReady) {
    $entry = Join-Path $addonRoot 'src\server.mjs'
    $processArgs = @(('"' + $entry + '"'), '--data-dir', ('"' + $stateDirectory + '"'))
    if ($PauseAutomatic) { $processArgs += '--pause-automatic' }
    $service = Start-Process -FilePath $NodePath -ArgumentList $processArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $stateDirectory 'service.log') -RedirectStandardError (Join-Path $stateDirectory 'service-error.log')
    Set-Content -LiteralPath (Join-Path $stateDirectory 'service.pid') -Value $service.Id
}
$serviceReady = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try { $null = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:43821/' -TimeoutSec 1; if (Test-Path -LiteralPath $launchFile) { $serviceReady = $true; break } } catch { }
    Start-Sleep -Milliseconds 250
}
if (-not $serviceReady) { throw "The service did not start. See $stateDirectory\service-error.log" }
if ($Background) { Write-Output 'Playlist Sync is waiting in the background for rbxport.'; return }
$launchUrl = (Get-Content -LiteralPath $launchFile -Raw).Trim()
$windowArguments = Get-PlaylistSyncWindowArguments $launchUrl (Join-Path $stateDirectory 'window-profile')
$hostConnection = Connect-PlaylistSyncHost $launchUrl
if (-not $NoWindow) {
    if ($Detached) { Start-Process -FilePath $browserPath -ArgumentList $windowArguments }
    else {
        $pairingCode = $launchUrl.Split('#')[1]
        $opened = $false
        for ($attempt = 0; $attempt -lt 15; $attempt++) {
            try {
                $null = Invoke-RestMethod -Uri 'http://127.0.0.1:43821/api/ui/open' -Method Post -Headers @{Authorization = "Bearer $pairingCode"} -ContentType 'application/json' -Body '{}' -TimeoutSec 10
                $opened = $true
                break
            } catch { Start-Sleep -Milliseconds 500 }
        }
        if (-not $opened) { throw 'Could not attach Playlist Sync to rbxport. Close rbxport normally and open the Playlist Sync shortcut again.' }
    }
}
if ($hostConnection.libraryReady -eq $false) {
    Write-Warning ('Playlist Sync is visible, but syncing is paused. ' + $hostConnection.connectionError)
} else {
    Write-Output 'Playlist Sync is running. Open it under Tag List on the left in rbxport, or click the symbol beside a linked playlist.'
}
