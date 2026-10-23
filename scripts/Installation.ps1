# Managed installation records contain only program files, never saved data or music.
function Stop-PlaylistSyncForUpdate([string]$Root,[string]$DataDirectory) {
    if(-not (Test-PlaylistSyncServiceListening)) { return }
    $pidPath=Join-Path $DataDirectory 'service.pid'
    $launchPath=Join-Path $DataDirectory 'launch-url.txt'
    if(-not (Test-Path -LiteralPath $pidPath) -or -not (Test-Path -LiteralPath $launchPath)) { throw 'Stop the running Playlist Sync copy before updating: it does not belong to the selected installation. No files have been changed.' }
    $serviceId=[int](Get-Content -LiteralPath $pidPath -Raw)
    $service=Get-CimInstance Win32_Process -Filter "ProcessId=$serviceId"
    $entry=(Join-Path $Root 'src\server.mjs').Replace('/','\')
    if(-not $service -or $service.Name -ne 'node.exe' -or -not $service.CommandLine -or $service.CommandLine.Replace('/','\').IndexOf(('"'+$entry+'"'),[StringComparison]::OrdinalIgnoreCase) -lt 0) { throw 'The running process does not belong to this Playlist Sync copy. No files have been changed.' }
    $launch=(Get-Content -LiteralPath $launchPath -Raw).Trim()
    if($launch -notmatch '^http://127\.0\.0\.1:43821/#([a-f0-9]{64})$') { throw 'Cannot safely connect to the installed copy. No files have been changed.' }
    $headers=@{Authorization=('Bearer '+$Matches[1])}
    $panel=Invoke-RestMethod -Uri 'http://127.0.0.1:43821/api/panel' -Headers $headers -TimeoutSec 5
    if($panel.active) { throw 'Finish or cancel the current sync before updating. No files have been changed.' }
    if($panel.connected) { throw 'Close rbxport before updating. Setup will stop Playlist Sync for you.' }
    $null=Invoke-RestMethod -Uri 'http://127.0.0.1:43821/api/shutdown' -Method Post -Headers $headers -ContentType 'application/json' -Body '{"ifIdle":true}' -TimeoutSec 5
    for($attempt=0;$attempt -lt 40;$attempt++) {
        if(-not (Get-Process -Id $serviceId -ErrorAction SilentlyContinue) -and -not (Test-PlaylistSyncServiceListening)) { return }
        Start-Sleep -Milliseconds 250
    }
    throw 'Playlist Sync is still finishing its shutdown. Wait a moment, then retry. No files have been changed.'
}
function Get-PlaylistSyncExistingInstall([string]$Root) {
    if (-not $Root -or -not [IO.Path]::IsPathRooted($Root)) { throw 'Invalid existing installation folder.' }
    $full = (Assert-PlaylistSyncPlainPath $Root).TrimEnd('\','/')
    if (-not (Test-Path -LiteralPath $full)) { return $null }
    $packagePath = Join-Path $full 'package.json'
    if (-not (Test-Path -LiteralPath $packagePath)) { return $null }
    $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
    if ($package.name -ne 'rbxport-playlist-sync-addon') { return $null }
    foreach ($file in @('Start-Playlist-Sync.ps1','src\server.mjs')) {
        if (-not (Test-Path -LiteralPath (Join-Path $full $file) -PathType Leaf)) { throw 'Existing Playlist Sync is incomplete. Select its original installation folder.' }
    }
    $data = Join-Path $full '.local-data'
    $receiptPath = Join-Path $full 'installed.json'
    if (Test-Path -LiteralPath $receiptPath) {
        $receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
        # Older setup receipts contain just dataDirectory/version. Validate the package above too.
        if ($receipt.product -and ($receipt.product -ne 'rbxport-playlist-sync' -or $receipt.schema -ne 1 -or [IO.Path]::GetFullPath($receipt.installDirectory).TrimEnd('\','/') -ne $full)) { throw 'Existing installation receipt does not match this folder.' }
        if (-not $receipt.dataDirectory -or -not [IO.Path]::IsPathRooted($receipt.dataDirectory)) { throw 'Existing saved-data location is invalid. No files have been changed.' }
        $data = $receipt.dataDirectory
    }
    return @{root=$full;dataDirectory=(Assert-PlaylistSyncPlainPath $data);version=$package.version}
}
function Get-PlaylistSyncRegisteredRoots {
    param(
        [string]$StateFile = (Join-Path $env:LOCALAPPDATA 'rbxport-addons\startup.json'),
        [string[]]$ShortcutPaths = @((Join-Path ([Environment]::GetFolderPath('Programs')) 'Playlist Sync\Playlist Sync.lnk'),(Join-Path ([Environment]::GetFolderPath('Desktop')) 'Playlist Sync.lnk'),(Join-Path ([Environment]::GetFolderPath('Startup')) 'rbxport-Playlist-Sync.lnk')),
        [switch]$NoRegistry
    )
    if (-not $NoRegistry) {
        $entry = Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\rbxport-playlist-sync' -ErrorAction SilentlyContinue
        if ($entry.InstallLocation) { $entry.InstallLocation }
    }
    if (Test-Path -LiteralPath $StateFile) {
        $state = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
        foreach ($entry in $state.addons) { if ($entry.id -eq 'Playlist-Sync' -and $entry.root) { $entry.root } }
    }
    foreach ($path in $ShortcutPaths) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { continue }
        $shell = New-Object -ComObject WScript.Shell
        $link = $shell.CreateShortcut($path)
        if ($link.Arguments -match '(?i)(?:^|\s)-File\s+"([^"]+\\Start-Playlist-Sync\.ps1)"(?:\s|$)') { Split-Path $Matches[1] -Parent }
    }
}
function Resolve-PlaylistSyncInstall {
    param([string]$DefaultRoot,[string]$DefaultData,[string[]]$RegisteredRoots=@(),[string]$ExplicitRoot,[string]$ExplicitData,[switch]$RequireExisting)
    $found = @()
    $roots = if ($ExplicitRoot) { @($ExplicitRoot) } else { @($RegisteredRoots) + @($DefaultRoot) }
    foreach ($root in $roots) {
        $existing = Get-PlaylistSyncExistingInstall $root
        if ($existing -and -not @($found | Where-Object { $_.root -eq $existing.root }).Count) { $found += $existing }
    }
    if ($found.Count -gt 1) { throw 'More than one Playlist Sync copy was found. Use Choose existing folder in setup to select the copy to update.' }
    if ($RequireExisting -and $found.Count -ne 1) { throw 'The selected folder is not a Playlist Sync installation. Select the folder containing Start-Playlist-Sync.ps1.' }
    if ($found.Count -eq 1) {
        $selected = $found[0]
        if (Test-Path -LiteralPath (Join-Path $selected.root '.git')) { throw 'Setup cannot overwrite a source checkout. Update it with Git, or select an installed copy.' }
        if ($ExplicitData -and [IO.Path]::GetFullPath($ExplicitData) -ne $selected.dataDirectory) { throw 'An update must keep the existing saved-data folder. No files have been changed.' }
        return $selected
    }
    $root = if ($ExplicitRoot) { $ExplicitRoot } else { $DefaultRoot }
    if ((Test-Path -LiteralPath $root) -and @(Get-ChildItem -LiteralPath $root -Force).Count) { throw 'The target folder contains unrecognized files. Select an existing Playlist Sync installation or use an empty folder.' }
    $data = if ($ExplicitData) { $ExplicitData } else { $DefaultData }
    return @{root=(Assert-PlaylistSyncPlainPath $root);dataDirectory=(Assert-PlaylistSyncPlainPath $data);version=$null}
}
function Get-PlaylistSyncFileHash([string]$Path) {
    $stream = [IO.File]::OpenRead($Path)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLowerInvariant() }
    finally { $stream.Dispose(); $sha.Dispose() }
}
function Get-PlaylistSyncObsoleteFiles([string]$Root,[string[]]$KeepFiles,[string]$DataDirectory) {
    $full=Assert-PlaylistSyncPlainPath $Root
    $keep=@($KeepFiles | ForEach-Object { $_.Replace('\','/') })
    $candidates=@()
    $receiptPath=Join-Path $full 'installed.json'
    if(Test-Path -LiteralPath $receiptPath) {
        $receipt=Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
        if($receipt.product) {
            # Validate the entire previous record before planning a single deletion.
            $previous=Get-PlaylistSyncRemovalPlan $full
            foreach($entry in $previous.record.files) {
                if($entry.path.Replace('\','/') -notin $keep) { $candidates+=@{relative=$entry.path;sha256=$entry.sha256} }
            }
        }
    }
    $legacyPath=Join-Path $PSScriptRoot 'obsolete-program-files.json'
    if(Test-Path -LiteralPath $legacyPath) {
        $legacy=Get-Content -LiteralPath $legacyPath -Raw | ConvertFrom-Json
        if($legacy.schema -ne 1) { throw 'Invalid obsolete-program manifest.' }
        foreach($entry in $legacy.files.PSObject.Properties) {
            if($entry.Name.Replace('\','/') -in $keep) { continue }
            $path=Get-PlaylistSyncOwnedFile $full $entry.Name
            if(Test-Path -LiteralPath $path -PathType Leaf) {
                $hash=Get-PlaylistSyncFileHash $path
                if($hash -in $entry.Value) { $candidates+=@{relative=$entry.Name;sha256=$hash} }
            }
        }
    }
    $data=(Assert-PlaylistSyncPlainPath $DataDirectory).TrimEnd('\','/')+'\'
    foreach($entry in $candidates) {
        $path=Get-PlaylistSyncOwnedFile $full $entry.relative
        if($path.StartsWith($data,[StringComparison]::OrdinalIgnoreCase)) { continue }
        if($entry.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'Invalid obsolete-program checksum.' }
        if((Test-Path -LiteralPath $path -PathType Leaf) -and (Get-PlaylistSyncFileHash $path) -eq $entry.sha256) { @{root=$full;relative=$entry.relative;sha256=$entry.sha256} }
    }
}
function Remove-PlaylistSyncObsoleteFiles([object[]]$Files) {
    foreach($entry in $Files) {
        $path=Get-PlaylistSyncOwnedFile $entry.root $entry.relative
        # Recheck immediately before removal. A newly edited old file is retained.
        if((Test-Path -LiteralPath $path -PathType Leaf) -and (Get-PlaylistSyncFileHash $path) -eq $entry.sha256) { Remove-Item -LiteralPath $path -Force }
    }
}
function Assert-PlaylistSyncPlainPath([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    for ($part = $full; $part; $part = Split-Path $part -Parent) {
        if ((Test-Path -LiteralPath $part) -and ((Get-Item -LiteralPath $part -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Linked installation paths are not supported.' }
    }
    return $full
}
function Get-PlaylistSyncOwnedFile([string]$Root, [string]$Relative) {
    if (-not $Relative -or [IO.Path]::IsPathRooted($Relative) -or $Relative.Contains(':') -or $Relative -match '(^|[\\/])\.\.?([\\/]|$)') { throw 'Invalid installed file path.' }
    $portable = $Relative.Replace('\','/')
    if ($portable -notmatch '^(?:release/Start-Rbxport\.exe|scripts/RbxportLauncher\.cs|\.runtime/(?:node\.exe|tools/(?:yt-dlp|ffmpeg|ffprobe)\.exe)|(?:src|public|scripts|docs)/.+\.(?:mjs|js|html|css|ps1|md|json|png|svg|jpg|jpeg|txt)|(?:README|PROJECT_OVERVIEW|AGENTS|CHANGELOG)\.md|LICENSE|(?:package|manifest|dependencies|release-signing)\.json|(?:Start-Playlist-Sync|Stop-Playlist-Sync|Uninstall-Playlist-Sync|Configure-Rbxport-Startup|Install-Playlist-Sync|Package-Addon)\.ps1|(?:Launch|Install)-Playlist-Sync\.cmd)$') { throw 'This is not an owned program file. Music and saved data cannot be removed.' }
    $base = [IO.Path]::GetFullPath($Root).TrimEnd('\','/') + '\'
    $full = [IO.Path]::GetFullPath((Join-Path $Root $Relative))
    if (-not $full.StartsWith($base, [StringComparison]::OrdinalIgnoreCase)) { throw 'Installed file escaped its folder.' }
    $null = Assert-PlaylistSyncPlainPath $full
    return $full
}
function Write-PlaylistSyncInstallRecord {
    param([string]$Root, [string]$DataDirectory, [string]$Version, [string[]]$Files, [string[]]$Shortcuts = @(), [switch]$NoRegistry)
    $rootPath = Assert-PlaylistSyncPlainPath $Root
    $owned = foreach ($relative in ($Files | Sort-Object -Unique)) {
        $path = Get-PlaylistSyncOwnedFile $rootPath $relative
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Installed program file is missing.' }
        @{path=$relative;sha256=(Get-PlaylistSyncFileHash $path)}
    }
    @{product='rbxport-playlist-sync';schema=1;installDirectory=$rootPath;dataDirectory=$DataDirectory;version=$Version;files=@($owned);shortcuts=@($Shortcuts)} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $rootPath 'installed.json') -Encoding UTF8
    if (-not $NoRegistry) {
        $key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\rbxport-playlist-sync'
        New-Item -Path $key -Force | Out-Null
        $powershell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
        $values = @{DisplayName='Playlist Sync for rbxport';DisplayVersion=$Version;Publisher='Playlist Sync contributors';InstallLocation=$rootPath;UninstallString=('"' + $powershell + '" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $rootPath 'Uninstall-Playlist-Sync.ps1') + '"');URLInfoAbout='https://github.com/ElmoTuisk/rbxport-playlist-sync'}
        foreach ($name in $values.Keys) { New-ItemProperty -LiteralPath $key -Name $name -Value $values[$name] -PropertyType String -Force | Out-Null }
        foreach ($name in @('NoModify','NoRepair')) { New-ItemProperty -LiteralPath $key -Name $name -Value 1 -PropertyType DWord -Force | Out-Null }
    }
}
function Get-PlaylistSyncRemovalPlan([string]$Root) {
    $full = Assert-PlaylistSyncPlainPath $Root
    $record = Get-Content -LiteralPath (Join-Path $full 'installed.json') -Raw | ConvertFrom-Json
    if ($record.product -ne 'rbxport-playlist-sync' -or $record.schema -ne 1 -or [IO.Path]::GetFullPath($record.installDirectory) -ne $full) { throw 'This folder is not a managed Playlist Sync installation.' }
    $files = foreach ($entry in $record.files) {
        $path = Get-PlaylistSyncOwnedFile $full $entry.path
        # An edited or unexpected file is retained, even when listed in the receipt.
        if ($entry.sha256 -notmatch '^[a-f0-9]{64}$') { throw 'Invalid installation checksum.' }
        if ((Test-Path -LiteralPath $path -PathType Leaf) -and (Get-PlaylistSyncFileHash $path) -eq $entry.sha256) { $path }
    }
    return @{root=$full;record=$record;files=@($files)}
}
function Remove-PlaylistSyncProgramFiles($Plan) {
    # Resolve and revalidate the complete allowlist before the first deletion.
    $current = Get-PlaylistSyncRemovalPlan $Plan.root
    foreach ($path in $current.files) { Remove-Item -LiteralPath $path -Force }
    Remove-Item -LiteralPath (Join-Path $current.root 'installed.json') -Force
    # Only empty program directories are removed; unknown files and all saved data survive.
    $directories = @($current.files | ForEach-Object { Split-Path $_ -Parent } | Sort-Object -Unique | Sort-Object Length -Descending)
    foreach ($dir in $directories) {
        while ($dir -and $dir.StartsWith($current.root + '\', [StringComparison]::OrdinalIgnoreCase)) {
            if (-not (Test-Path -LiteralPath $dir) -or @(Get-ChildItem -LiteralPath $dir -Force).Count) { break }
            Remove-Item -LiteralPath $dir -Force
            $dir = Split-Path $dir -Parent
        }
    }
    if (-not @(Get-ChildItem -LiteralPath $current.root -Force).Count) { Remove-Item -LiteralPath $current.root -Force }
}
