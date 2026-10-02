# Build the deploy archive for domin8temedia.com.
#
# Two things this exists to get right, both of which Compress-Archive gets
# wrong on Windows PowerShell 5.1:
#
#   1. Path separators. The ZIP spec says entry names use forward slashes.
#      Compress-Archive writes the Windows backslash, and an extractor that
#      follows the spec then creates a file literally named "assets\site.css"
#      at the root instead of site.css inside assets. The whole site loses
#      its stylesheets and scripts.
#
#   2. What goes in. The site folder also holds working material that must
#      never reach the public web: the .impeccable folder of design critiques
#      and review screenshots, and the internal DESIGN.md and PRODUCT.md.
#      Compress-Archive -Path * takes all of it.
#
# So entries are written by hand through .NET's ZipArchive, with the name
# spelled out, and anything on the deny list is left behind. The script
# prints every entry it wrote so the result can be read before it ships.
#
#   usage: powershell -File pack.ps1 [-Version v14] [-Also path,path]   (-Also leaves more files out, this once)

param([string]$Version = 'v14', [string[]]$Also = @())

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$src = 'C:\Work\domin8te-media'
$out = "C:\Work\domin8te-$Version.zip"

# working material, never published. Matched against the path relative to $src.
# .claude holds the local preview settings (paths on this machine), never published either.
$deny = @('.impeccable', '.claude', '.gitignore', 'DESIGN.md', 'PRODUCT.md') + $Also

function IsDenied($rel) {
    foreach ($d in $deny) {
        if ($rel -eq $d -or $rel.StartsWith($d + '/')) { return $true }
    }
    return $false
}

if (Test-Path $out) { Remove-Item $out -Force }

$zip = [System.IO.Compression.ZipFile]::Open($out, 'Create')
try {
    $kept = 0
    $skipped = @()
    foreach ($f in (Get-ChildItem $src -Recurse -File -Force | Sort-Object FullName)) {
        $rel = $f.FullName.Substring($src.Length + 1).Replace('\', '/')
        if (IsDenied $rel) { $skipped += $rel; continue }
        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip, $f.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal)
        $kept++
    }
} finally {
    $zip.Dispose()
}

Write-Output "wrote $out"
Write-Output ("{0} entries, {1} MB" -f $kept, [math]::Round((Get-Item $out).Length / 1MB, 1))
Write-Output ""
Write-Output "left out ($($skipped.Count)):"
$skipped | ForEach-Object { Write-Output "  $_" }
Write-Output ""
Write-Output "shipped:"
$z = [System.IO.Compression.ZipFile]::OpenRead($out)
$z.Entries | ForEach-Object { Write-Output "  $($_.FullName)" }
$z.Dispose()
