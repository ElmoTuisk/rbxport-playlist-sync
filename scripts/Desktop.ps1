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
function Get-PlaylistSyncPackagedRbxport {
    if (-not (Get-Command Get-AppxPackage -ErrorAction SilentlyContinue)) { return }
    try {
        $packages = @(Get-AppxPackage -Name 'TRIODE.rbxport' -ErrorAction Stop | Where-Object { $_.PackageFamilyName -eq 'TRIODE.rbxport_0bxvsfj6epqjp' -and $_.InstallLocation -and [Version]$_.Version -ge [Version]'1.9.0' } | Sort-Object { [Version]$_.Version } -Descending)
        foreach ($package in $packages) {
            $executable = Join-Path $package.InstallLocation 'rbxport.exe'
            if (Test-Path -LiteralPath $executable -PathType Leaf) { return $executable }
        }
    } catch { return }
}

function Find-PlaylistSyncRbxport {
    param([string]$Preferred)
    if ($Preferred) {
        if (Test-Path -LiteralPath $Preferred -PathType Leaf) { return $Preferred }
        throw 'The specified rbxport executable was not found. Check -RbxportPath.'
    }
    # Resolve eligible packages on each launch: Store updates move their
    # versioned directory. Older Store builds lack the library identity API.
    $packaged = Get-PlaylistSyncPackagedRbxport
    if ($packaged) { return $packaged }
    $candidates = @("$env:ProgramFiles\rbxport\rbxport.exe", "$env:LOCALAPPDATA\Programs\rbxport\rbxport.exe", "$env:LOCALAPPDATA\rbxport\rbxport.exe")
    foreach ($candidate in $candidates) { if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate } }
    foreach ($registryRoot in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall')) {
        Get-ChildItem -LiteralPath $registryRoot -ErrorAction SilentlyContinue | ForEach-Object {
            $entry = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction SilentlyContinue
            if ($entry.DisplayName -eq 'rbxport' -and $entry.InstallLocation) { $candidates += Join-Path $entry.InstallLocation.Trim('"') 'rbxport.exe' }
        }
    }
    foreach ($candidate in $candidates) { if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate } }
    throw 'Playlist Sync needs a compatible rbxport installation (tested with 1.9.0). Older Store builds such as 0.19.3 lack its required library commands. Install rbxport 1.9.0 or later, then open Playlist Sync. For a custom location use -RbxportPath.'
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

function Connect-PlaylistSyncHost {
    param([string]$LaunchUrl)
    if ($LaunchUrl -notmatch '^http://127\.0\.0\.1:43821/#[a-f0-9]{64}$') { throw 'Invalid local launch URL' }
    $hostFailure = ''
    for ($attempt = 0; $attempt -lt 15; $attempt++) {
        try {
            $connection = Invoke-RestMethod -Uri 'http://127.0.0.1:43821/api/action' -Method Post -Headers @{Authorization = ('Bearer ' + $LaunchUrl.Split('#')[1])} -ContentType 'application/json' -Body '{"action":"connect","args":{}}' -TimeoutSec 15
            if (-not $connection.ready) { throw 'The Playlist Sync sidebar button has not appeared in rbxport.' }
            return $connection
        } catch {
            $hostFailure = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
            if ($hostFailure -match 'lacks the library API') { throw $hostFailure }
            if ($attempt -lt 14) { Start-Sleep -Milliseconds 500 }
        }
    }
    throw "Playlist Sync started, but could not attach its sidebar button to rbxport. Close rbxport normally and open Playlist Sync again. Details: $hostFailure"
}
function Test-PlaylistSyncServiceListening {
    $client = New-Object Net.Sockets.TcpClient
    try {
        $pending = $client.ConnectAsync('127.0.0.1',43821)
        return ($pending.Wait(500) -and $client.Connected)
    } catch { return $false } finally { $client.Dispose() }
}
function Get-PlaylistSyncHostProcess([string]$Executable) {
    $matches = @(Get-Process -Name rbxport -ErrorAction SilentlyContinue | Where-Object { $_.Path -and [IO.Path]::GetFullPath($_.Path) -eq [IO.Path]::GetFullPath($Executable) })
    if ($matches.Count -gt 1) { throw 'More than one compatible rbxport process is running. Close the extra copy before opening Playlist Sync.' }
    if ($matches.Count -eq 1) { return $matches[0] }
}
