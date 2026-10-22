param(
    [string]$InstallDirectory = (Join-Path $env:LOCALAPPDATA 'Programs\rbxport-playlist-sync'),
    [string]$DataDirectory = (Join-Path $env:LOCALAPPDATA 'rbxport-playlist-sync'),
    [string]$CacheDirectory = (Join-Path $PSScriptRoot '.install-cache'),
    [string]$ShortcutRoot,
    [string]$ExistingDirectory,
    [string]$StatusFile,
    [string]$CancellationFile,
    [switch]$NoShortcuts,
    [switch]$NoLaunch,
    [switch]$StartWithRbxport,
    [switch]$NoRegistry
)
$ErrorActionPreference = 'Stop'
function Set-SetupStatus([string]$State,[string]$Message) {
    if($StatusFile) { [IO.File]::WriteAllText($StatusFile,($State+"`n"+$Message),(New-Object Text.UTF8Encoding($false))) }
    Write-Host $Message
}
function Test-SetupCancellation {
    if($CancellationFile -and (Test-Path -LiteralPath $CancellationFile)) { throw [OperationCanceledException]::new('Setup cancelled. Your existing installation and saved data were kept.') }
}
try {
Test-SetupCancellation
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
. (Join-Path $PSScriptRoot 'scripts\Desktop.ps1')
. (Join-Path $PSScriptRoot 'scripts\Installation.ps1')
$version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Raw | ConvertFrom-Json).version
$selection = @{DefaultRoot=$InstallDirectory;DefaultData=$DataDirectory}
if ($ExistingDirectory) { $selection.ExplicitRoot=$ExistingDirectory; $selection.RequireExisting=$true }
elseif ($PSBoundParameters.ContainsKey('InstallDirectory')) { $selection.ExplicitRoot=$InstallDirectory }
else { $selection.RegisteredRoots=@(Get-PlaylistSyncRegisteredRoots -NoRegistry:$NoRegistry) }
if ($PSBoundParameters.ContainsKey('DataDirectory')) { $selection.ExplicitData=$DataDirectory }
$selected = Resolve-PlaylistSyncInstall @selection
$InstallDirectory = $selected.root
$DataDirectory = $selected.dataDirectory
if ($selected.version -and [Version]$selected.version -gt [Version]$version) { throw 'A newer Playlist Sync version is already installed. Download the latest setup to update it.' }
Stop-PlaylistSyncForUpdate $InstallDirectory $DataDirectory
if ($selected.version) { Write-Host "Updating Playlist Sync $($selected.version) in $InstallDirectory. Keeping the existing saved-data folder." }
if (-not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { throw 'This installer supports Windows x64. ARM64 is not yet supported.' }
$null = Find-PlaylistSyncRbxport
foreach ($path in @($InstallDirectory, $DataDirectory, $CacheDirectory)) {
    if (-not [IO.Path]::IsPathRooted($path)) { throw 'Installation, data and cache paths must be absolute.' }
    $null = Assert-PlaylistSyncPlainPath $path
    New-Item -ItemType Directory -Force -Path $path | Out-Null
}
$InstallDirectory = [IO.Path]::GetFullPath($InstallDirectory)
if ($InstallDirectory.TrimEnd('\') -eq $PSScriptRoot.TrimEnd('\')) { throw 'Choose an installation folder separate from the downloaded setup folder.' }
$servicePid = Join-Path $DataDirectory 'service.pid'
if (Test-Path -LiteralPath $servicePid) {
    $serviceInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$([int](Get-Content -LiteralPath $servicePid -Raw))"
    if ($serviceInfo -and $serviceInfo.Name -eq 'node.exe' -and $serviceInfo.CommandLine.Contains((Join-Path $InstallDirectory 'src\server.mjs'))) { throw 'Stop Playlist Sync before installing an update. Your saved data will be kept.' }
}
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'dependencies.json') -Raw | ConvertFrom-Json
function Get-VerifiedDownload {
    param([string]$Url, [string]$Hash, [string]$Filename)
    $uri = [Uri]$Url
    if ($uri.Scheme -ne 'https' -or $uri.Host -notin @('nodejs.org', 'github.com', 'www.gyan.dev')) { throw 'Unexpected download source' }
    if ($Hash -notmatch '^[a-f0-9]{64}$') { throw 'Invalid dependency checksum' }
    $destination = Join-Path $CacheDirectory $Filename
    if ((Test-Path -LiteralPath $destination) -and (Get-PlaylistSyncFileHash $destination) -eq $Hash) { return $destination }
    $temporary = "$destination.partial"
    Test-SetupCancellation
    Set-SetupStatus 'working' "Downloading $Filename ..."
    $client = New-Object Net.WebClient
    try {
        $download=$client.DownloadFileTaskAsync($Url,$temporary)
        $deadline=[DateTime]::UtcNow.AddMinutes(10)
        while(-not $download.IsCompleted) {
            if($CancellationFile -and (Test-Path -LiteralPath $CancellationFile)) { $client.CancelAsync(); Test-SetupCancellation }
            if([DateTime]::UtcNow -gt $deadline) { $client.CancelAsync(); throw 'Download timed out. Check your connection and retry setup.' }
            Start-Sleep -Milliseconds 100
        }
        $download.GetAwaiter().GetResult()
    } finally { $client.Dispose() }
    if ((Get-PlaylistSyncFileHash $temporary) -ne $Hash) { throw "Checksum verification failed for $Filename. Nothing from this download will be executed." }
    Move-Item -LiteralPath $temporary -Destination $destination -Force
    return $destination
}
Set-SetupStatus 'working' "Preparing Playlist Sync $version ..."
$nodeDownload = Get-VerifiedDownload $manifest.node.url $manifest.node.sha256 'node.exe'
$ytdlpDownload = Get-VerifiedDownload $manifest.ytdlp.url $manifest.ytdlp.sha256 'yt-dlp.exe'
$ffmpegDownload = Get-VerifiedDownload $manifest.ffmpeg.url $manifest.ffmpeg.sha256 'ffmpeg-essentials.zip'
Test-SetupCancellation
Set-SetupStatus 'installing' 'Installing verified files. Closing setup will finish this step safely.'
$runtime = Join-Path $InstallDirectory '.runtime'
$tools = Join-Path $runtime 'tools'
$include = @('src', 'public', 'scripts', 'docs', 'README.md', 'PROJECT_OVERVIEW.md', 'AGENTS.md', 'CHANGELOG.md', 'LICENSE', 'package.json', 'manifest.json', 'dependencies.json', 'Start-Playlist-Sync.ps1', 'Stop-Playlist-Sync.ps1', 'Launch-Playlist-Sync.cmd', 'Configure-Rbxport-Startup.ps1', 'Uninstall-Playlist-Sync.ps1')
$ownedFiles = @('.runtime\node.exe','.runtime\tools\yt-dlp.exe','.runtime\tools\ffmpeg.exe','.runtime\tools\ffprobe.exe')
foreach ($item in $include) {
    $source = Join-Path $PSScriptRoot $item
    if ((Get-Item -LiteralPath $source).PSIsContainer) {
        $ownedFiles += @(Get-ChildItem -LiteralPath $source -Recurse -File -Force | ForEach-Object { $_.FullName.Substring($PSScriptRoot.Length + 1) })
    } else { $ownedFiles += $item }
}
# Reject linked program destinations before overwriting any existing file.
foreach ($relative in $ownedFiles) { $null = Get-PlaylistSyncOwnedFile $InstallDirectory $relative }
New-Item -ItemType Directory -Force -Path $tools | Out-Null
Copy-Item -LiteralPath $nodeDownload -Destination (Join-Path $runtime 'node.exe') -Force
Copy-Item -LiteralPath $ytdlpDownload -Destination (Join-Path $tools 'yt-dlp.exe') -Force
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($ffmpegDownload)
try {
    foreach ($item in @(@('ffmpeg.exe', $manifest.ffmpeg.ffmpegSha256), @('ffprobe.exe', $manifest.ffmpeg.ffprobeSha256))) {
        $entries = @($archive.Entries | Where-Object { $_.FullName -match ('/bin/' + [Regex]::Escape($item[0]) + '$') })
        if ($entries.Count -ne 1) { throw "Cannot identify $($item[0]) in the verified FFmpeg archive" }
        $destination = Join-Path $tools $item[0]
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entries[0], $destination, $true)
        if ((Get-PlaylistSyncFileHash $destination) -ne $item[1]) { throw "Extracted checksum failed: $($item[0])" }
    }
} finally { $archive.Dispose() }
foreach ($item in $include) {
    $source = Join-Path $PSScriptRoot $item
    if ((Get-Item -LiteralPath $source).PSIsContainer) {
        $target = Join-Path $InstallDirectory $item
        New-Item -ItemType Directory -Force -Path $target | Out-Null
        Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $target -Recurse -Force
    } else { Copy-Item -LiteralPath $source -Destination $InstallDirectory -Force }
}
$ownedShortcuts = @()
Write-PlaylistSyncInstallRecord -Root $InstallDirectory -DataDirectory $DataDirectory -Version $version -Files $ownedFiles -NoRegistry:$NoRegistry
& (Join-Path $runtime 'node.exe') --version
if ($LASTEXITCODE -ne 0) { throw 'The private runtime did not start.' }
if (-not $NoShortcuts -and -not $StartWithRbxport) {
    $shell = New-Object -ComObject WScript.Shell
    $menuDirectory = if ($ShortcutRoot) { Join-Path $ShortcutRoot 'Start Menu\Playlist Sync' } else { Join-Path ([Environment]::GetFolderPath('Programs')) 'Playlist Sync' }
    $desktopDirectory = if ($ShortcutRoot) { Join-Path $ShortcutRoot 'Desktop' } else { [Environment]::GetFolderPath('Desktop') }
    New-Item -ItemType Directory -Force -Path $menuDirectory | Out-Null
    New-Item -ItemType Directory -Force -Path $desktopDirectory | Out-Null
    $shortcutPaths = @((Join-Path $menuDirectory 'Playlist Sync.lnk'), (Join-Path $desktopDirectory 'Playlist Sync.lnk'))
    foreach ($shortcutPath in $shortcutPaths) {
        $shortcut = $shell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
        $shortcut.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $InstallDirectory 'Start-Playlist-Sync.ps1') + '"'
        $shortcut.WorkingDirectory = $InstallDirectory
        $shortcut.Description = 'Open Playlist Sync for rbxport'
        $shortcut.IconLocation = (Find-PlaylistSyncRbxport) + ',0'
        $shortcut.Save()
        $ownedShortcuts += $shortcutPath
    }
    $stopPath=Join-Path $menuDirectory 'Stop Playlist Sync.lnk'
    if(Test-Path -LiteralPath $stopPath) {
        $stop=$shell.CreateShortcut($stopPath)
        if($stop.Arguments.Contains('"'+(Join-Path $InstallDirectory 'Stop-Playlist-Sync.ps1')+'"')) { Remove-Item -LiteralPath $stopPath }
    }
}
Write-PlaylistSyncInstallRecord -Root $InstallDirectory -DataDirectory $DataDirectory -Version $version -Files $ownedFiles -Shortcuts $ownedShortcuts -NoRegistry:$NoRegistry
Write-Host "Installed successfully in $InstallDirectory. Open the Playlist Sync shortcut whenever you need it."
if ($StartWithRbxport) { & (Join-Path $InstallDirectory 'Configure-Rbxport-Startup.ps1') -NoStart }
if (-not $NoLaunch) {
    $launcher=if($StartWithRbxport) { Join-Path $env:LOCALAPPDATA 'rbxport-addons\Start-Rbxport.ps1' } else { Join-Path $InstallDirectory 'Start-Playlist-Sync.ps1' }
    Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -WindowStyle Hidden -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $launcher + '"'))
}
Set-SetupStatus 'complete' 'Installed. Playlist Sync will start and close with rbxport.'
} catch {
    $state=if($_.Exception -is [OperationCanceledException]) { 'cancelled' } else { 'error' }
    Set-SetupStatus $state $_.Exception.Message
    throw
}
