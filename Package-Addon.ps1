param([string]$Destination)
$ErrorActionPreference = 'Stop'
if (-not $Destination) {
    $version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Raw | ConvertFrom-Json).version
    $Destination = Join-Path $PSScriptRoot "playlist-sync-$version-source.zip"
}
$include = @('src', 'public', 'scripts', 'installer', 'test', 'docs', '.github', 'README.md', 'PROJECT_OVERVIEW.md', 'AGENTS.md', 'CHANGELOG.md', 'LICENSE', 'package.json', 'manifest.json', 'dependencies.json', '.gitignore', 'Start-Playlist-Sync.ps1', 'Stop-Playlist-Sync.ps1', 'Launch-Playlist-Sync.cmd', 'Install-Playlist-Sync.cmd', 'Install-Playlist-Sync.ps1', 'Uninstall-Playlist-Sync.ps1', 'Build-Installer.ps1', 'Build-ReleasePayload.ps1', 'release-signing.json', 'Package-Addon.ps1', 'Configure-Rbxport-Startup.ps1')
$paths = $include | ForEach-Object { Join-Path $PSScriptRoot $_ }
foreach ($item in $paths) { if (-not (Test-Path -LiteralPath $item)) { throw "Missing package input: $item" } }
if (Test-Path -LiteralPath $Destination) { throw "Package already exists: $Destination. Choose another destination." }
Compress-Archive -LiteralPath $paths -DestinationPath $Destination
Write-Output "Created source-only package: $Destination"
