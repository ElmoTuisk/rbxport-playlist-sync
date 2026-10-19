function Find-PlaylistSyncBrowser {
    foreach ($candidate in @(
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    )) { if (Test-Path -LiteralPath $candidate) { return $candidate } }
    throw 'Microsoft Edge or Google Chrome is required to display the add-on window. Install either browser, then launch Playlist Sync again.'
}

function Find-PlaylistSyncRbxport {
    param([string]$Preferred)
    $candidates = @($Preferred, "$env:ProgramFiles\rbxport\rbxport.exe", "$env:LOCALAPPDATA\Programs\rbxport\rbxport.exe", "$env:LOCALAPPDATA\rbxport\rbxport.exe")
    foreach ($candidate in $candidates) { if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate } }
    foreach ($registryRoot in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall')) {
        Get-ChildItem -LiteralPath $registryRoot -ErrorAction SilentlyContinue | ForEach-Object {
            $entry = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue
            if ($entry.DisplayName -eq 'rbxport' -and $entry.InstallLocation) { $candidates += Join-Path $entry.InstallLocation.Trim('"') 'rbxport.exe' }
        }
    }
    foreach ($candidate in $candidates) { if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate } }
    throw 'Install rbxport first, then run Playlist Sync again. For a custom location, launch Start-Playlist-Sync.ps1 with -RbxportPath.'
}

function Get-PlaylistSyncWindowArguments {
    param([string]$Url, [string]$ProfileDirectory)
    if ($Url -notmatch '^http://127\.0\.0\.1:43821/#[a-f0-9]{64}$') { throw 'Invalid local launch URL' }
    if ($ProfileDirectory.Contains('"')) { throw 'Invalid profile path' }
    $windowUrl = $Url.Replace('/#', '/?window=1#')
    return @(('--app="' + $windowUrl + '"'), ('--user-data-dir="' + $ProfileDirectory + '"'), '--window-size=430,500', '--no-first-run', '--no-default-browser-check')
}

function Get-PlaylistSyncDataDirectory {
    param([string]$Root)
    $installed = Join-Path $Root 'installed.json'
    if (Test-Path -LiteralPath $installed) {
        $configuration = Get-Content -LiteralPath $installed -Raw | ConvertFrom-Json
        if (-not [IO.Path]::IsPathRooted($configuration.dataDirectory)) { throw 'Invalid installed data directory' }
        return $configuration.dataDirectory
    }
    return Join-Path $Root '.local-data'
}
