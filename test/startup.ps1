$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path $PSScriptRoot -Parent
. (Join-Path $sourceRoot 'scripts\Startup.ps1')
function Assert-Startup($Condition, $Message) { if (-not $Condition) { throw $Message } }
# Fixtures replace environment access; the user's registry/environment is never touched.
$global:fixturePort = $null
function Get-RbxportUserPort { return $global:fixturePort }
function Set-RbxportUserPort($Value) { $global:fixturePort = $Value }
function Send-RbxportEnvironmentChanged { }
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('rbxport-startup-' + [Guid]::NewGuid().ToString('N'))
$startupDirectory = Join-Path $fixtureRoot 'Startup'
$stateDirectory = Join-Path $fixtureRoot 'Connection'
try {
    foreach ($addon in @('sync','wizard')) {
        $addonRoot = Join-Path $fixtureRoot $addon
        New-Item -ItemType Directory -Force -Path $addonRoot | Out-Null
        @{name="rbxport-playlist-$addon-addon"} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $addonRoot 'package.json')
        $title = if ($addon -eq 'sync') { 'Sync' } else { 'Wizard' }
        Set-Content -LiteralPath (Join-Path $addonRoot "Start-Playlist-$title.ps1") -Value '# fixture'
        Set-RbxportAddonStartup -Root $addonRoot -StartupDirectory $startupDirectory -StateDirectory $stateDirectory
    }
    Assert-Startup ($global:fixturePort -eq '43822') 'Regular launches need the user connection port'
    Assert-Startup (@(Get-ChildItem -LiteralPath $startupDirectory -Filter '*.lnk').Count -eq 2) 'Both independent add-ons must have startup entries'
    $shell = New-Object -ComObject WScript.Shell
    $link = $shell.CreateShortcut((Join-Path $startupDirectory 'rbxport-Playlist-Sync.lnk'))
    Assert-Startup ($link.Arguments.Contains('-Background -NoWindow') -and $link.Arguments.Contains('-WindowStyle Hidden')) 'Sign-in must start a hidden service without opening rbxport'
    Set-RbxportAddonStartup -Root (Join-Path $fixtureRoot 'sync') -StartupDirectory $startupDirectory -StateDirectory $stateDirectory
    $saved = Get-Content -LiteralPath (Join-Path $stateDirectory 'startup.json') -Raw | ConvertFrom-Json
    Assert-Startup ($saved.addons.Count -eq 2) 'Re-enabling must not duplicate registration'
    Set-RbxportAddonStartup -Root (Join-Path $fixtureRoot 'sync') -Disable -StartupDirectory $startupDirectory -StateDirectory $stateDirectory
    Assert-Startup ($global:fixturePort -eq '43822') 'Disabling Sync must not break Wizard'
    Assert-Startup (Test-Path -LiteralPath (Join-Path $startupDirectory 'rbxport-Playlist-Wizard.lnk')) 'Wizard startup entry must survive'
    Set-RbxportAddonStartup -Root (Join-Path $fixtureRoot 'wizard') -Disable -StartupDirectory $startupDirectory -StateDirectory $stateDirectory
    Assert-Startup (-not $global:fixturePort) 'The last registration must restore the previous absent port'
    $global:fixturePort = '45678'
    $rejected = $false
    try { Set-RbxportAddonStartup -Root (Join-Path $fixtureRoot 'sync') -StartupDirectory $startupDirectory -StateDirectory $stateDirectory } catch { $rejected = $true }
    Assert-Startup ($rejected -and $global:fixturePort -eq '45678') 'Conflicting user configuration must not be overwritten'
    $global:fixturePort = '43822'
    Set-RbxportAddonStartup -Root (Join-Path $fixtureRoot 'sync') -StartupDirectory $startupDirectory -StateDirectory $stateDirectory
    Set-RbxportAddonStartup -Root (Join-Path $fixtureRoot 'sync') -Disable -StartupDirectory $startupDirectory -StateDirectory $stateDirectory
    Assert-Startup ($global:fixturePort -eq '43822') 'An originally configured port must survive disable'
    $global:fixturePort = $null
    Set-RbxportAddonStartup -Root (Join-Path $fixtureRoot 'sync') -StartupDirectory $startupDirectory -StateDirectory $stateDirectory
    $global:fixturePort = '45678'
    Set-RbxportAddonStartup -Root (Join-Path $fixtureRoot 'sync') -Disable -StartupDirectory $startupDirectory -StateDirectory $stateDirectory
    Assert-Startup ($global:fixturePort -eq '45678') 'Disable must preserve a later independent port change'

    # Exercise the real background launchers against a fake local service/runtime.
    function Test-Node { $global:LASTEXITCODE=0; return 'v24.19.0' }
    function Get-Process { throw 'Background launch must not inspect or open the host' }
    function Invoke-RestMethod { throw 'Background launch must not connect to or open host UI' }
    function Invoke-WebRequest { param($Uri,$TimeoutSec,[switch]$UseBasicParsing); if (-not $global:fixtureServiceStarted) { throw 'not running' }; return @{StatusCode=200} }
    function Start-Process {
        param($FilePath,$ArgumentList,$WindowStyle,[switch]$PassThru,$RedirectStandardOutput,$RedirectStandardError)
        Assert-Startup ($FilePath -eq 'Test-Node' -and $WindowStyle -eq 'Hidden') 'Only the hidden add-on service may be started'
        $global:fixtureArguments = $ArgumentList
        $global:fixtureServiceStarted = $true
        return @{Id=123456}
    }
    foreach ($addon in @('sync','wizard')) {
        $title = if ($addon -eq 'sync') { 'Sync' } else { 'Wizard' }
        $actualRoot = if ($addon -eq 'sync') { $sourceRoot } else { Join-Path $sourceRoot 'playlist-wizard' }
        # In Wizard's independent checkout, use its own root for the fixture.
        if ((Get-Content -LiteralPath (Join-Path $sourceRoot 'package.json') -Raw | ConvertFrom-Json).name -eq 'rbxport-playlist-wizard-addon') {
            if ($addon -eq 'sync') { continue }
            $actualRoot = $sourceRoot
        }
        # Companion launchers belong to their own checkout, not the Sync release.
        if ($addon -eq 'wizard' -and -not (Test-Path -LiteralPath (Join-Path $actualRoot 'Start-Playlist-Wizard.ps1'))) { continue }
        $addonRoot = Join-Path $fixtureRoot $addon
        New-Item -ItemType Directory -Force -Path (Join-Path $addonRoot 'scripts'),(Join-Path $addonRoot 'data') | Out-Null
        Copy-Item -LiteralPath (Join-Path $actualRoot 'scripts\Desktop.ps1') -Destination (Join-Path $addonRoot 'scripts\Desktop.ps1')
        Copy-Item -LiteralPath (Join-Path $actualRoot "Start-Playlist-$title.ps1") -Destination (Join-Path $addonRoot "Start-Playlist-$title.ps1")
        @{dataDirectory=(Join-Path $addonRoot 'data')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $addonRoot 'installed.json')
        $port = if ($addon -eq 'sync') { '43821' } else { '43823' }
        Set-Content -LiteralPath (Join-Path $addonRoot 'data\launch-url.txt') -Value ("http://127.0.0.1:$port/#" + ('a' * 64))
        $global:fixtureServiceStarted = $false
        & (Join-Path $addonRoot "Start-Playlist-$title.ps1") -Background -NoWindow -PauseAutomatic -NodePath 'Test-Node'
        Assert-Startup $global:fixtureServiceStarted 'Background launch must start the missing service'
        if ($addon -eq 'sync') { Assert-Startup ($global:fixtureArguments -contains '--pause-automatic') 'Connection-only diagnostics must pause automatic sync' }
    }
} finally {
    $resolvedFixture = [IO.Path]::GetFullPath($fixtureRoot)
    $expectedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    Assert-Startup ($resolvedFixture.StartsWith($expectedTemp,[StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolvedFixture -Leaf) -match '^rbxport-startup-[a-f0-9]{32}$') 'Unsafe fixture cleanup'
    Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
}
foreach ($directory in @($sourceRoot,(Join-Path $sourceRoot 'scripts'))) {
    Get-ChildItem -LiteralPath $directory -Filter '*.ps1' | ForEach-Object {
        $parseErrors = $null
        $null = [Management.Automation.Language.Parser]::ParseFile($_.FullName,[ref]$null,[ref]$parseErrors)
        Assert-Startup (-not $parseErrors) "PowerShell syntax error: $($_.Name)"
    }
}
Write-Output 'Independent add-on startup checks passed'
