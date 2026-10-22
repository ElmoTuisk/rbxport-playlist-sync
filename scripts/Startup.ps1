# Shared connection setup only. Each add-on keeps its own process and saved data.
function Get-RbxportUserPort { return [Environment]::GetEnvironmentVariable('RBXPORT_DEVTOOLS_PORT', 'User') }
function Set-RbxportUserPort($Value) { [Environment]::SetEnvironmentVariable('RBXPORT_DEVTOOLS_PORT', $Value, 'User') }
function Send-RbxportEnvironmentChanged {
    if (-not ('RbxportEnvironmentNotice' -as [type])) {
        Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class RbxportEnvironmentNotice {
    [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern IntPtr SendMessageTimeout(IntPtr window, uint message, UIntPtr wparam,
        string lparam, uint flags, uint timeout, out UIntPtr result);
}
'@
    }
    $noticeResult = [UIntPtr]::Zero
    $null = [RbxportEnvironmentNotice]::SendMessageTimeout([IntPtr]0xffff, 0x001a, [UIntPtr]::Zero, 'Environment', 2, 3000, [ref]$noticeResult)
}

function Set-RbxportAddonStartup {
    param(
        [Parameter(Mandatory=$true)][string]$Root,
        [switch]$Disable,
        [string]$StartupDirectory = [Environment]::GetFolderPath('Startup'),
        [string]$StateDirectory = (Join-Path $env:LOCALAPPDATA 'rbxport-addons')
    )
    $packageName = (Get-Content -LiteralPath (Join-Path $Root 'package.json') -Raw | ConvertFrom-Json).name
    $addon = switch ($packageName) {
        'rbxport-playlist-sync-addon' { 'Playlist-Sync' }
        'rbxport-playlist-wizard-addon' { 'Playlist-Wizard' }
        default { throw 'Unknown rbxport add-on. Startup was not changed.' }
    }
    $startScript = Join-Path $Root ("Start-$addon.ps1")
    if (-not (Test-Path -LiteralPath $startScript -PathType Leaf) -or $Root.Contains('"')) { throw 'Invalid installed launcher.' }
    $linkPath = Join-Path $StartupDirectory ("rbxport-$addon.lnk")
    $statePath = Join-Path $StateDirectory 'startup.json'
    $mutex = New-Object Threading.Mutex($false, 'Local\rbxport-addons-startup')
    $locked = $false
    try {
        $locked = $mutex.WaitOne(10000)
        if (-not $locked) { throw 'Another add-on is configuring startup. Try again shortly.' }
        $saved = if (Test-Path -LiteralPath $statePath) { Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json } else { $null }
        $previous = if ($saved) { $saved.previousPort } else { Get-RbxportUserPort }
        $registrations = @($saved.addons | Where-Object { $_ -and $_.id -ne $addon })
        if ($Disable) {
            if (Test-Path -LiteralPath $linkPath) { Remove-Item -LiteralPath $linkPath }
            if (-not $registrations.Count) {
                # Do not undo a later, independently configured port.
                if ($saved -and (Get-RbxportUserPort) -eq '43822') { Set-RbxportUserPort $previous; Send-RbxportEnvironmentChanged }
                if (Test-Path -LiteralPath $statePath) { Remove-Item -LiteralPath $statePath }
                return
            }
        } else {
            $currentPort = Get-RbxportUserPort
            if ($currentPort -and $currentPort -ne '43822') { throw 'rbxport already uses another automation port. Startup was not changed.' }
            New-Item -ItemType Directory -Force -Path $StartupDirectory | Out-Null
            $shell = New-Object -ComObject WScript.Shell
            $link = $shell.CreateShortcut($linkPath)
            $link.TargetPath = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
            $link.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $startScript + '" -Background -NoWindow'
            $link.WorkingDirectory = $Root
            $link.WindowStyle = 7
            $link.Description = "Attach $($addon.Replace('-', ' ')) when rbxport opens"
            $link.Save()
            $registrations += [pscustomobject]@{id=$addon;root=$Root}
        }
        New-Item -ItemType Directory -Force -Path $StateDirectory | Out-Null
        @{version=1;previousPort=$previous;addons=$registrations} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath ($statePath + '.tmp') -Encoding UTF8
        Move-Item -LiteralPath ($statePath + '.tmp') -Destination $statePath -Force
        if (-not $Disable) { Set-RbxportUserPort '43822'; Send-RbxportEnvironmentChanged }
    } finally {
        if ($locked) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }
}
