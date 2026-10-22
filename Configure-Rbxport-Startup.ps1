param([switch]$Disable, [switch]$NoStart, [switch]$PauseAutomatic)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts\Startup.ps1')
Set-RbxportAddonStartup -Root $PSScriptRoot -Disable:$Disable
if ($Disable) { Write-Output 'Automatic attachment disabled for this add-on. Its running service can be stopped separately.'; return }
if (-not $NoStart) {
    $name = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Raw | ConvertFrom-Json).name
    $launcher = if ($name -eq 'rbxport-playlist-sync-addon') { 'Start-Playlist-Sync.ps1' } else { 'Start-Playlist-Wizard.ps1' }
    & (Join-Path $PSScriptRoot $launcher) -Background -NoWindow -PauseAutomatic:$PauseAutomatic
}
Write-Output 'rbxport shortcuts are configured. Playlist Sync starts and closes with rbxport.'
