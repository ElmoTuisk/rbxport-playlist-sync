$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\scripts\Desktop.ps1')
function Assert-Desktop($Condition, $Message) { if (-not $Condition) { throw $Message } }
$token = 'a' * 64
$arguments = @(Get-PlaylistSyncWindowArguments "http://127.0.0.1:43821/#$token" 'C:\Test Folder\profile')
Assert-Desktop ($arguments.Count -eq 5) 'App arguments must stay separate when paths contain spaces'
Assert-Desktop ($arguments[0] -eq ('--app="http://127.0.0.1:43821/?window=1#' + $token + '"')) 'Must use an app window with a paired local URL'
Assert-Desktop ($arguments[1] -eq '--user-data-dir="C:\Test Folder\profile"') 'Must use a separate app profile'
Assert-Desktop ($arguments[2] -eq '--window-size=430,500') 'Fallback window size must be small'
foreach ($invalid in @('https://evil.test/#token', 'http://localhost:43821/#token', 'http://127.0.0.1:43821/#short')) {
    $rejected = $false
    try { $null = Get-PlaylistSyncWindowArguments $invalid 'C:\Test' } catch { $rejected = $true }
    Assert-Desktop $rejected 'Non-local or unpaired URL accepted'
}
$root = Join-Path ([IO.Path]::GetTempPath()) ('playlist-sync-desktop-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
try {
    New-Item -ItemType File -Path (Join-Path $root 'rbxport.exe') | Out-Null
    $packageVersion = '0.19.3.0'
    function Get-AppxPackage { param($Name,$ErrorAction); return [PSCustomObject]@{ PackageFamilyName='TRIODE.rbxport_0bxvsfj6epqjp'; Version=$packageVersion; InstallLocation=$root } }
    Assert-Desktop (-not (Get-PlaylistSyncPackagedRbxport)) 'Old Store builds lacking the library API must not replace a compatible install'
    $packageVersion = '1.9.0.0'
    Assert-Desktop ((Get-PlaylistSyncPackagedRbxport) -eq (Join-Path $root 'rbxport.exe')) 'Compatible registered package not found'
    $packagedExecutable = Join-Path $root 'packaged-rbxport.exe'
    $preferredExecutable = Join-Path $root 'preferred-rbxport.exe'
    New-Item -ItemType File -Path $packagedExecutable,$preferredExecutable | Out-Null
    function Get-PlaylistSyncPackagedRbxport { return $packagedExecutable }
    Assert-Desktop ((Find-PlaylistSyncRbxport) -eq $packagedExecutable) 'Eligible registered package must be selected'
    Assert-Desktop ((Find-PlaylistSyncRbxport $preferredExecutable) -eq $preferredExecutable) 'Explicit executable must take precedence over Store detection'
    $rejected = $false
    try { $null = Find-PlaylistSyncRbxport (Join-Path $root 'not-installed.exe') } catch { $rejected = $true }
    Assert-Desktop $rejected 'An invalid explicit executable must not silently launch another installation'
    Assert-Desktop ((Get-PlaylistSyncDataDirectory $root) -eq (Join-Path $root '.local-data')) 'Portable data path changed'
    @{ dataDirectory = (Join-Path $root 'saved data') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'installed.json')
    Assert-Desktop ((Get-PlaylistSyncDataDirectory $root) -eq (Join-Path $root 'saved data')) 'Installed data must survive app-folder changes'
    @{ dataDirectory = 'relative' } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'installed.json')
    $rejected = $false
    try { $null = Get-PlaylistSyncDataDirectory $root } catch { $rejected = $true }
    Assert-Desktop $rejected 'Relative installed data path accepted'
    $script:connectCalls = 0
    $script:connectMode = 'loading'
    function Start-Sleep { param($Milliseconds) }
    function Invoke-RestMethod {
        param($Uri,$Method,$Headers,$ContentType,$Body,$TimeoutSec)
        $script:connectCalls++
        Assert-Desktop ($Uri -eq 'http://127.0.0.1:43821/api/action') 'Connection check must stay local'
        if ($script:connectMode -eq 'unsupported') { throw 'This rbxport build lacks the library API required by Playlist Sync.' }
        if ($script:connectMode -eq 'missing' -or $script:connectCalls -eq 1) { return @{ready=$false} }
        return @{ready=$true}
    }
    Assert-Desktop ((Connect-PlaylistSyncHost "http://127.0.0.1:43821/#$token").ready) 'A loading window should recover when its button appears'
    Assert-Desktop ($script:connectCalls -eq 2) 'Launcher must wait for the button rather than only HTTP availability'
    foreach ($mode in @('missing','unsupported')) {
        $script:connectMode=$mode; $script:connectCalls=0; $rejected=$false
        try { $null=Connect-PlaylistSyncHost "http://127.0.0.1:43821/#$token" } catch { $rejected=$true }
        Assert-Desktop $rejected 'An absent/incompatible sidebar must never report successful startup'
        Assert-Desktop ($script:connectCalls -eq $(if($mode -eq 'unsupported'){1}else{15})) 'Retry count must be bounded and incompatible builds must fail promptly'
    }
} finally {
    # The exact temporary directory was created above and stays under the system temp directory.
    $resolvedRoot = [IO.Path]::GetFullPath($root)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    Assert-Desktop ($resolvedRoot.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) 'Unexpected cleanup location'
    Assert-Desktop ((Split-Path $resolvedRoot -Leaf) -match '^playlist-sync-desktop-[a-f0-9]{32}$') 'Unexpected cleanup name'
    Remove-Item -LiteralPath $resolvedRoot -Recurse -Force
}
Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '..') -Filter '*.ps1' | ForEach-Object {
    $parseErrors = $null
    $null = [Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$null, [ref]$parseErrors)
    Assert-Desktop (-not $parseErrors) "PowerShell syntax error in $($_.Name): $parseErrors"
}
Write-Output 'Desktop launcher checks passed'
