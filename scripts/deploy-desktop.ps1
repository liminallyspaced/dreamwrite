# Deploy latest DreamWrite build to the Desktop and archive older copies.
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

Write-Host "[deploy] DreamWrite v$Version -> Desktop"
Write-Host "[deploy] repo: $RepoRoot"

# Stop running app so files aren't locked
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

$SetupSrc = Join-Path $Dist "DreamWrite-Setup-$Version.exe"
$PortableSrc = Join-Path $Dist "DreamWrite-Portable-$Version.exe"

if (-not (Test-Path $SetupSrc)) {
  # fallback: newest Setup in dist
  $SetupSrc = Get-ChildItem $Dist -Filter "DreamWrite-Setup-*.exe" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not (Test-Path $PortableSrc)) {
  $PortableSrc = Get-ChildItem $Dist -Filter "DreamWrite-Portable-*.exe" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
}

if (-not $SetupSrc -or -not (Test-Path $SetupSrc)) {
  throw "No installer found in dist/. Run without -SkipBuild."
}
if (-not $PortableSrc -or -not (Test-Path $PortableSrc)) {
  throw "No portable found in dist/. Run without -SkipBuild."
}

# Infer version from filename if needed
if ($SetupSrc -match 'DreamWrite-Setup-(.+)\.exe$') { $Version = $Matches[1] }

New-Item -ItemType Directory -Force -Path $Archive | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

function Move-ToArchive([System.IO.FileInfo]$File) {
  if (-not $File -or -not $File.Exists) { return }
  $destName = "{0}__{1}" -f $stamp, $File.Name
  $dest = Join-Path $Archive $destName
  Write-Host "[deploy] archive $($File.Name) -> DreamWrite-Archive\$destName"
  Move-Item -Force -Path $File.FullName -Destination $dest
}

# Archive any older DreamWrite binaries / icons / broken stubs on Desktop
$keepNames = @(
  "DreamWrite-Setup-$Version.exe",
  "DreamWrite-Portable-$Version.exe",
  "DreamWrite-Setup.exe",          # stable "latest" names we refresh
  "DreamWrite-Portable.exe",
  "DreamWrite.lnk",
  "DreamWrite-icon.ico"
)

Get-ChildItem $Desktop -Force -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Name -match '^(DreamWrite|Platen)' -and
    $_.Name -notmatch '^DreamWrite-Archive$' -and
    $keepNames -notcontains $_.Name
  } |
  ForEach-Object {
    if ($_.PSIsContainer) { return }
    # Don't archive the archive folder
    Move-ToArchive $_
  }

# Also archive versioned copies that aren't the current version
Get-ChildItem $Desktop -Filter "DreamWrite-Setup-*.exe" -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -ne "DreamWrite-Setup-$Version.exe" } |
  ForEach-Object { Move-ToArchive $_ }

Get-ChildItem $Desktop -Filter "DreamWrite-Portable-*.exe" -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -ne "DreamWrite-Portable-$Version.exe" } |
  ForEach-Object { Move-ToArchive $_ }

# Clean stale dist stubs (old portable name without version)
$staleDist = Join-Path $Dist "DreamWrite.exe"
if (Test-Path $staleDist) {
  $archDist = Join-Path $Archive ("{0}__dist-DreamWrite.exe" -f $stamp)
  Write-Host "[deploy] archive dist/DreamWrite.exe"
  Move-Item -Force $staleDist $archDist
}

# Deploy current version (versioned + stable "latest" aliases)
$setupDestVer = Join-Path $Desktop "DreamWrite-Setup-$Version.exe"
$portableDestVer = Join-Path $Desktop "DreamWrite-Portable-$Version.exe"
$setupLatest = Join-Path $Desktop "DreamWrite-Setup.exe"
$portableLatest = Join-Path $Desktop "DreamWrite-Portable.exe"
$icoSrc = Join-Path $RepoRoot "assets\icon.ico"
$icoDest = Join-Path $Desktop "DreamWrite-icon.ico"

Copy-Item -Force $SetupSrc $setupDestVer
Copy-Item -Force $PortableSrc $portableDestVer
Copy-Item -Force $SetupSrc $setupLatest
Copy-Item -Force $PortableSrc $portableLatest
if (Test-Path $icoSrc) { Copy-Item -Force $icoSrc $icoDest }

# Shortcut → stable portable (always current after deploy)
$Wsh = New-Object -ComObject WScript.Shell
$lnkPath = Join-Path $Desktop "DreamWrite.lnk"
$sc = $Wsh.CreateShortcut($lnkPath)
$sc.TargetPath = $portableLatest
$sc.WorkingDirectory = $Desktop
if (Test-Path $icoDest) { $sc.IconLocation = "$icoDest,0" }
$sc.Description = "DreamWrite $Version"
$sc.Save()

# Optional: keep only last 5 archives
$oldArchives = Get-ChildItem $Archive -File -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 10
foreach ($o in $oldArchives) {
  Write-Host "[deploy] prune archive $($o.Name)"
  Remove-Item -Force $o.FullName
}

Write-Host ""
Write-Host "[deploy] Desktop is clean. Current:"
Get-ChildItem $Desktop -Filter "DreamWrite*" -ErrorAction SilentlyContinue |
  Where-Object { -not $_.PSIsContainer } |
  Select-Object Name, @{N = 'MB'; E = { [math]::Round($_.Length / 1MB, 1) } }, LastWriteTime |
  Format-Table -AutoSize | Out-String | Write-Host

Write-Host "[deploy] Older builds: $Archive"
Write-Host "[deploy] Done - v$Version"
