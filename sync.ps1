# Backs up the Domin8te website, client dashboard and agency console to GitHub
# (private repo Karanveer252/domin8te-media). Run after every change:
#
#   & C:\Work\domin8te-git\sync.ps1 -Message "what changed"
#
# site/   = C:\Work\domin8te-media   (the live website, incl. the built /dashboard and /console pages)
# build/  = C:\Work\domin8te-build   (sources: portal/ = dashboard + console + Supabase, deploy and pack scripts)
# Heavy render scratch (video, 3D, gauntlet screenshots) and node_modules stay out.
# Secrets never live in these folders: the Hostinger token is read from C:\Work\skills\generate-skill\.env.

param([string]$Message = 'Update')
$ErrorActionPreference = 'Stop'
$repo = 'C:\Work\domin8te-git'

# flag3d's render, test and deliver folders are the flag film's frames and outputs (the finished films live in v2\site)
# dash-integration\work holds scratch copies of the whole site (with its clips), merged and long since in site/: a full path, so no other folder named "work" is dropped
$skipDirs = @('node_modules', '.git', 'video', 'cloche3d', 'sky3d', 'gauntlet', 'phone-gauntlet', 'cards', 'shots', 'concepts', 'C:\Work\domin8te-build\dash-integration\work', 'C:\Work\domin8te-build\flag3d\render', 'C:\Work\domin8te-build\flag3d\test', 'C:\Work\domin8te-build\flag3d\deliver', 'C:\Work\domin8te-build\flag3d\deliver-phone', 'C:\Work\domin8te-build\day3d\render', 'C:\Work\domin8te-build\day3d\test', 'C:\Work\domin8te-build\day3d\deliver', 'C:\Work\domin8te-build\day3d\deliver-phone', 'C:\Work\domin8te-build\day3d\old-grade', 'C:\Work\domin8te-build\daysky\out', 'C:\Work\domin8te-build\daysky\seq', 'C:\Work\domin8te-build\daysky\test', 'C:\Work\domin8te-build\daysky\cy', 'C:\Work\domin8te-build\daysky\deliver')
$skipFiles = @('*.zip', '.env', '.env.*', 'send.php')  # send.php: contact-form mail settings, kept off GitHub

robocopy 'C:\Work\domin8te-media' "$repo\site" /MIR /XD .git node_modules /XF $skipFiles /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy site failed ($LASTEXITCODE)" }
robocopy 'C:\Work\domin8te-build' "$repo\build" /MIR /XD $skipDirs /XF $skipFiles /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy build failed ($LASTEXITCODE)" }
$global:LASTEXITCODE = 0

Set-Location $repo
git add -A
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) { Write-Output 'Nothing changed; GitHub is up to date.'; exit 0 }
git commit -q -m $Message
git push -q origin HEAD
Write-Output "Pushed: $Message"
