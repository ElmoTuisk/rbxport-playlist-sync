param([string]$Destination = (Join-Path $PSScriptRoot 'playlist-sync-0.6.1-windows-setup.zip'))
$ErrorActionPreference = 'Stop'
$include = @('src', 'public', 'scripts', 'test', 'docs', '.github', 'README.md', 'CHANGELOG.md', 'LICENSE', 'package.json', 'manifest.json', 'dependencies.json', '.gitignore', 'Start-Playlist-Sync.ps1', 'Stop-Playlist-Sync.ps1', 'Launch-Playlist-Sync.cmd', 'Install-Playlist-Sync.cmd', 'Install-Playlist-Sync.ps1', 'Package-Addon.ps1')
$paths = $include | ForEach-Object { Join-Path $PSScriptRoot $_ }
foreach ($item in $paths) { if (-not (Test-Path -LiteralPath $item)) { throw "Missing package input: $item" } }
if (Test-Path -LiteralPath $Destination) { throw "Package already exists: $Destination. Choose another destination." }
Compress-Archive -LiteralPath $paths -DestinationPath $Destination
Write-Output "Created source-only package: $Destination"
