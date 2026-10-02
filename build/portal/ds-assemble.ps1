# Copies every finished direction (versions\v0N.html) into ds\project\components\<Name>\preview.html,
# checks the marker line and size, and prints the files map for the Artifact publish call.
$root = "C:\Work\domin8te-build\portal"
$names = @{ "18h" = "18H Scenes" }
$ok = @(); $missing = @()
foreach ($n in ($names.Keys | Sort-Object)) {
  $src = Join-Path $root ("versions\v" + $n + ".html")
  if (-not (Test-Path $src)) { $missing += $n; continue }
  $dir = Join-Path $root ("ds\project\components\" + $names[$n])
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
  $dst = Join-Path $dir "preview.html"
  Copy-Item -LiteralPath $src -Destination $dst -Force
  $first = (Get-Content -LiteralPath $dst -TotalCount 1 -Encoding UTF8)
  $size = (Get-Item -LiteralPath $dst).Length
  $marker = $first.StartsWith("<!-- @dsCard")
  $emdash = ([System.IO.File]::ReadAllText($dst, [System.Text.Encoding]::UTF8)).Contains([string][char]0x2014)
  $ok += [pscustomobject]@{ n = $n; name = $names[$n]; kb = [math]::Round($size / 1024, 1); marker = $marker; emdash = $emdash; readme = (Test-Path (Join-Path $dir "README.md")) }
}
$ok | Format-Table -AutoSize | Out-String -Width 200
if ($missing.Count) { Write-Output ("missing: " + ($missing -join ", ")) }
Write-Output "--- files map (project paths) ---"
$paths = @("project/tokens.json", "project/README.md", "project/directions.md", "project/assets/Logos/README.md", "project/components/Cover/preview.html")
foreach ($o in $ok) { $paths += ("project/components/" + $o.name + "/preview.html"); $paths += ("project/components/" + $o.name + "/README.md") }
$map = @{}
foreach ($p in $paths) { $map[$p] = $p }
$map | ConvertTo-Json -Compress
