param(
    [Parameter(Mandatory = $true)]
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$extensionRoot = $PSScriptRoot
$manifestPath = Join-Path $extensionRoot 'manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.manifest_version -ne 3 -or $manifest.description.Length -gt 132) {
    throw 'The extension manifest is not valid for this release.'
}

# Keep the public key in the source manifest for the existing unpacked ID.
# The Web Store upload manifest must omit it; the Store assigns the item ID.
$manifest.PSObject.Properties.Remove('key')
$uploadManifestBytes = [Text.UTF8Encoding]::new($false).GetBytes(
    ($manifest | ConvertTo-Json -Depth 20) + "`n"
)

# Use an explicit runtime allowlist. Tests, packaging tools, unused fonts,
# source artwork, credentials and repository metadata never enter the ZIP.
$runtimeFiles = @(
    'manifest.json', 'auth-config.js', 'auth.js', 'settings.js', 'protocol.js',
    'image-optimization.js', 'retry-policy.js', 'service-worker.js',
    'zone-selector.js', 'popup.js', 'popup.html', 'popup.css',
    'instruction.js', 'instruction.html', 'instruction.css'
)
$iconFiles = Get-ChildItem -LiteralPath (Join-Path $extensionRoot 'icons') -File |
    Where-Object { $_.Name -match '^(default|processing|result-(a|b|c|d|e|error|inconclusive|multi-[2-5]))(16|32|48|128)\.png$' } |
    ForEach-Object { 'icons/' + $_.Name }
$files = @($runtimeFiles) + @($iconFiles)
foreach ($file in $files) {
    if (-not (Test-Path -LiteralPath (Join-Path $extensionRoot $file) -PathType Leaf)) {
        throw "Required extension asset is missing: $file"
    }
}
if ($iconFiles.Count -ne 52) { throw 'Expected all 52 toolbar/icon assets.' }

$zipPath = [IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $zipPath) { throw 'Choose a new output ZIP path; existing files are not overwritten.' }
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($zipPath)) | Out-Null
Add-Type -AssemblyName System.IO.Compression
$stream = [IO.File]::Open($zipPath, [IO.FileMode]::CreateNew)
$archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $false)
try {
    foreach ($file in $files | Sort-Object) {
        $entry = $archive.CreateEntry($file, [IO.Compression.CompressionLevel]::Optimal)
        $entryStream = $entry.Open()
        try {
            if ($file -eq 'manifest.json') {
                $entryStream.Write($uploadManifestBytes, 0, $uploadManifestBytes.Length)
            } else {
                $sourceStream = [IO.File]::OpenRead((Join-Path $extensionRoot $file))
                try { $sourceStream.CopyTo($entryStream) }
                finally { $sourceStream.Dispose() }
            }
        }
        finally { $entryStream.Dispose() }
    }
}
finally { $archive.Dispose(); $stream.Dispose() }

$hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
[pscustomobject]@{ Version = $manifest.version; Files = $files.Count; Package = $zipPath; SHA256 = $hash } |
    ConvertTo-Json -Compress
