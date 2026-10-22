# Wrap only the standard per-user rbxport shortcuts; preserve their original bytes.
function Set-PlaylistSyncHostShortcuts {
    param([string]$Root,[switch]$Disable,[string]$ProgramsDirectory=[Environment]::GetFolderPath('Programs'),[string]$DesktopDirectory=[Environment]::GetFolderPath('Desktop'),[string]$StateDirectory=(Join-Path $env:LOCALAPPDATA 'rbxport-addons'),[string]$RbxportPath)
    . (Join-Path $PSScriptRoot 'Desktop.ps1')
    . (Join-Path $PSScriptRoot 'Installation.ps1')
    $rootPath=Assert-PlaylistSyncPlainPath $Root
    $recordPath=Join-Path $StateDirectory 'sync-host-shortcuts.json'
    $paths=@((Join-Path $ProgramsDirectory 'rbxport.lnk'),(Join-Path $DesktopDirectory 'rbxport.lnk')) | Select-Object -Unique
    $saved=if(Test-Path -LiteralPath $recordPath) { Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json } else { $null }
    if($saved -and ($saved.schema -ne 1 -or $saved.root -ne $rootPath)) { throw 'Another Playlist Sync copy owns the rbxport shortcuts. Disable its integration first.' }
    $shell=New-Object -ComObject WScript.Shell
    $scriptPath=Join-Path $rootPath 'Start-Playlist-Sync.ps1'
    $arguments='-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$scriptPath+'" -HostOnly'
    if($Disable) {
        foreach($entry in $saved.entries) {
            if($entry.path -notin $paths -or -not (Test-Path -LiteralPath $entry.path)) { continue }
            $null=Assert-PlaylistSyncPlainPath $entry.path
            $current=$shell.CreateShortcut($entry.path)
            if($current.Arguments -ne $arguments -or (Get-PlaylistSyncFileHash $entry.path) -ne $entry.hash) { continue }
            if($entry.original) { [IO.File]::WriteAllBytes($entry.path,[Convert]::FromBase64String($entry.original)) }
            else { Remove-Item -LiteralPath $entry.path }
        }
        if($saved) { Remove-Item -LiteralPath $recordPath }
        return
    }
    $hostExecutable=Find-PlaylistSyncRbxport $RbxportPath
    $plans=@()
    foreach($path in $paths) {
        $null=Assert-PlaylistSyncPlainPath $path
        $old=@($saved.entries | Where-Object path -eq $path) | Select-Object -First 1
        $original=$null
        if(Test-Path -LiteralPath $path) {
            $current=$shell.CreateShortcut($path)
            if($old -and $current.Arguments -eq $arguments -and (Get-PlaylistSyncFileHash $path) -eq $old.hash) { $original=$old.original }
            elseif($current.TargetPath -eq $hostExecutable -and -not $current.Arguments) { $original=[Convert]::ToBase64String([IO.File]::ReadAllBytes($path)) }
            else { throw 'A customized rbxport shortcut was left unchanged. Use the Playlist Sync shortcut, or restore the ordinary rbxport shortcut before enabling integration.' }
        }
        $plans+=@{path=$path;original=$original}
    }
    foreach($entry in $plans) {
        New-Item -ItemType Directory -Path (Split-Path $entry.path -Parent) -Force | Out-Null
        $link=$shell.CreateShortcut($entry.path)
        $link.TargetPath=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
        $link.Arguments=$arguments; $link.WorkingDirectory=$rootPath; $link.WindowStyle=7
        $link.IconLocation=$hostExecutable+',0'; $link.Description='Open rbxport with Playlist Sync; both close together'
        $link.Save(); $entry.hash=Get-PlaylistSyncFileHash $entry.path
    }
    New-Item -ItemType Directory -Path $StateDirectory -Force | Out-Null
    @{schema=1;root=$rootPath;entries=$plans} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $recordPath -Encoding UTF8
}
