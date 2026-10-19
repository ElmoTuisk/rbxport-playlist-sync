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
    Assert-Desktop ((Get-PlaylistSyncDataDirectory $root) -eq (Join-Path $root '.local-data')) 'Portable data path changed'
    @{ dataDirectory = (Join-Path $root 'saved data') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'installed.json')
    Assert-Desktop ((Get-PlaylistSyncDataDirectory $root) -eq (Join-Path $root 'saved data')) 'Installed data must survive app-folder changes'
    @{ dataDirectory = 'relative' } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'installed.json')
    $rejected = $false
    try { $null = Get-PlaylistSyncDataDirectory $root } catch { $rejected = $true }
    Assert-Desktop $rejected 'Relative installed data path accepted'
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
