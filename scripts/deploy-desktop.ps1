# Deploy ONE DreamWrite launcher to the Desktop; archive everything else.
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File scripts/deploy-desktop.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/deploy-desktop.ps1 -SkipBuild
param(
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not (Test-Path (Join-Path $RepoRoot "package.json"))) {
  $RepoRoot = Get-Location
}

$Desktop = [Environment]::GetFolderPath("Desktop")
$Archive = Join-Path $Desktop "DreamWrite-Archive"
$Dist = Join-Path $RepoRoot "dist"
$Pkg = Get-Content (Join-Path $RepoRoot "package.json") -Raw | ConvertFrom-Json
$Version = $Pkg.version

Write-Host "[deploy] DreamWrite v$Version -> Desktop (single portable + shortcut)"
Write-Host "[deploy] repo: $RepoRoot"

Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.ProcessName -match 'DreamWrite|Platen|electron' } |
  ForEach-Object {
    Write-Host "[deploy] stopping $($_.ProcessName) ($($_.Id))"
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
  }
Start-Sleep -Milliseconds 400

if (-not $SkipBuild) {
  Push-Location $RepoRoot
  try {
    $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
    Write-Host "[deploy] building icons + Windows packages..."
    npm run build:icons 2>$null
    npm run pack:win
    if ($LASTEXITCODE -ne 0) { throw "pack:win failed with exit $LASTEXITCODE" }
  } finally {
    Pop-Location
  }
}

$PortableSrc = Join-Path $Dist "DreamWrite-Portable-$Version.exe"
if (-not (Test-Path $PortableSrc)) {
  $found = Get-ChildItem $Dist -Filter "DreamWrite-Portable-*.exe" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($found) { $PortableSrc = $found.FullName }
}
if (-not $PortableSrc -or -not (Test-Path $PortableSrc)) {
  throw "No portable found in dist/. Run without -SkipBuild."
}
if ($PortableSrc -match 'DreamWrite-Portable-(.+)\.exe$') {
  $Version = $Matches[1]
}

New-Item -ItemType Directory -Force -Path $Archive | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

function Move-ToArchive {
  param([System.IO.FileInfo]$File)
  if (-not $File -or -not $File.Exists) { return }
  $destName = "{0}__{1}" -f $stamp, $File.Name
  $dest = Join-Path $Archive $destName
  Write-Host "[deploy] archive $($File.Name) -> DreamWrite-Archive\$destName"
  Move-Item -Force -Path $File.FullName -Destination $dest
}

# Keep only: DreamWrite.exe, DreamWrite.lnk, DreamWrite-icon.ico
$keepNames = @(
  "DreamWrite.exe",
  "DreamWrite.lnk",
  "DreamWrite-icon.ico"
)

Get-ChildItem $Desktop -Force -ErrorAction SilentlyContinue |
  Where-Object {
    (-not $_.PSIsContainer) -and
    ($_.Name -match '^(DreamWrite|Platen)') -and
    ($_.Name -notmatch '^DreamWrite-Archive$') -and
    ($keepNames -notcontains $_.Name)
  } |
  ForEach-Object { Move-ToArchive -File $_ }

foreach ($pat in @(
  "DreamWrite-Setup*.exe",
  "DreamWrite-Portable*.exe",
  "DreamWrite-Setup.exe",
  "DreamWrite-Portable.exe"
)) {
  Get-ChildItem $Desktop -Filter $pat -ErrorAction SilentlyContinue |
    Where-Object { $keepNames -notcontains $_.Name } |
    ForEach-Object { Move-ToArchive -File $_ }
}

$staleDist = Join-Path $Dist "DreamWrite.exe"
if (Test-Path $staleDist) {
  $archDist = Join-Path $Archive ("{0}__dist-DreamWrite.exe" -f $stamp)
  Write-Host "[deploy] archive dist/DreamWrite.exe"
  Move-Item -Force $staleDist $archDist
}

$portableDest = Join-Path $Desktop "DreamWrite.exe"
$icoSrc = Join-Path $RepoRoot "assets\icon.ico"
$icoDest = Join-Path $Desktop "DreamWrite-icon.ico"

Copy-Item -Force $PortableSrc $portableDest
if (Test-Path $icoSrc) {
  Copy-Item -Force $icoSrc $icoDest
}

# Shortcut -> the single binary
$Wsh = New-Object -ComObject WScript.Shell
$lnkPath = Join-Path $Desktop "DreamWrite.lnk"
$sc = $Wsh.CreateShortcut($lnkPath)
$sc.TargetPath = $portableDest
$sc.WorkingDirectory = $Desktop
if (Test-Path $icoDest) {
  $sc.IconLocation = "$icoDest,0"
}
$sc.Description = "DreamWrite $Version"
$sc.Save()

$oldArchives = Get-ChildItem $Archive -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 10
foreach ($o in $oldArchives) {
  Write-Host "[deploy] prune archive $($o.Name)"
  Remove-Item -Force $o.FullName
}

Write-Host ""
Write-Host "[deploy] Desktop DreamWrite launchers (expect: one .exe + .lnk + icon):"
Get-ChildItem $Desktop -Force -ErrorAction SilentlyContinue |
  Where-Object { (-not $_.PSIsContainer) -and ($_.Name -match '^DreamWrite') } |
  Select-Object Name, @{N = 'MB'; E = { [math]::Round($_.Length / 1MB, 1) } }, LastWriteTime |
  Format-Table -AutoSize | Out-String | Write-Host

$exeCount = @(Get-ChildItem $Desktop -Filter "DreamWrite*.exe" -ErrorAction SilentlyContinue).Count
if ($exeCount -ne 1) {
  Write-Warning "[deploy] Expected exactly 1 DreamWrite*.exe on Desktop, found $exeCount"
} else {
  Write-Host "[deploy] OK - single DreamWrite.exe on Desktop"
}

Write-Host "[deploy] Older builds: $Archive"
Write-Host "[deploy] Done - v$Version - open via DreamWrite.lnk or DreamWrite.exe"
