param([string]$Destination)
$ErrorActionPreference = 'Stop'
$version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid package version.' }
if (-not $Destination) { $Destination = Join-Path $PSScriptRoot "dist\playlist-sync-$version-windows-setup.exe" }
$Destination = [IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $Destination) { throw 'Choose a new output path; an installer already exists there.' }
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Build on Windows x64 with .NET Framework 4 installed.' }
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('playlist-sync-build-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporary | Out-Null
try {
    $payload = Join-Path $temporary 'payload.zip'
    & (Join-Path $PSScriptRoot 'Package-Addon.ps1') -Destination $payload
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($payload)
    try {
        foreach ($entry in $archive.Entries) {
            if ($entry.FullName -match '(?i)(\.local-data|\.tools|\.runtime|\.sqlite|\.dpapi|launch-url|cookies|installed\.json|LOCAL_WORKSPACE|\.(mp3|m4a|flac|opus|wav|exe|log)$)' -or $entry.FullName -match '(^|[\\/])\.\.([\\/]|$)') { throw 'Private or executable payload entry refused.' }
        }
    } finally { $archive.Dispose() }
    $hash = (Get-FileHash -LiteralPath $payload -Algorithm SHA256).Hash.ToLowerInvariant()
    $versionSource = Join-Path $temporary 'Version.cs'
    ('using System.Reflection; [assembly:AssemblyVersion("' + $version + '.0")] [assembly:AssemblyFileVersion("' + $version + '.0")] internal static class Build { internal const string PayloadHash="' + $hash + '"; internal const string Version="' + $version + '"; }') | Set-Content -LiteralPath $versionSource -Encoding UTF8
    New-Item -ItemType Directory -Force -Path (Split-Path $Destination -Parent) | Out-Null
    & $compiler /nologo /target:winexe /platform:x64 /optimize+ ('/out:' + $Destination) '/reference:System.Windows.Forms.dll' '/reference:System.Drawing.dll' '/reference:System.IO.Compression.dll' '/reference:System.IO.Compression.FileSystem.dll' ('/resource:' + $payload + ',Payload.zip') (Join-Path $PSScriptRoot 'installer\Setup.cs') $versionSource
    if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed.' }
    $verification = Start-Process -FilePath $Destination -ArgumentList '--verify-payload' -WindowStyle Hidden -PassThru -Wait
    if ($verification.ExitCode -ne 0) { throw 'Built installer payload verification failed.' }
    Write-Output "Created single-file setup: $Destination"
} finally {
    $resolved = [IO.Path]::GetFullPath($temporary)
    $tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if (-not $resolved.StartsWith($tempBase,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolved -Leaf) -notmatch '^playlist-sync-build-[a-f0-9]{32}$') { throw 'Unsafe build cleanup path.' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
