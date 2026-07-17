# DreamWrite desktop update system
# ---------------------------------
# ONE install location + ONE desktop shortcut. No loose exes, no Fixed folders,
# no archive piles on the Desktop.
#
# Install:  %LOCALAPPDATA%\Programs\DreamWrite\DreamWrite.exe
# Shortcut: %USERPROFILE%\Desktop\DreamWrite.lnk  (only)
# Archive:  %LOCALAPPDATA%\DreamWrite\archive\   (not on Desktop)
#
# Usage (from repo root):
#   npm run deploy:desktop
#   npm run deploy:desktop:quick   # SkipBuild
param(
  [switch]$SkipBuild,
  [switch]$CleanOnly
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not (Test-Path (Join-Path $RepoRoot "package.json"))) {
  $RepoRoot = (Get-Location).Path
}

$Desktop = [Environment]::GetFolderPath("Desktop")
$PublicDesktop = [Environment]::GetFolderPath("CommonDesktopDirectory")
$InstallRoot = Join-Path $env:LOCALAPPDATA "Programs\DreamWrite"
$InstallExe = Join-Path $InstallRoot "DreamWrite.exe"
$InstallIco = Join-Path $InstallRoot "DreamWrite.ico"
$ArchiveRoot = Join-Path $env:LOCALAPPDATA "DreamWrite\archive"
$StateFile = Join-Path $InstallRoot "install.json"
$Pkg = Get-Content (Join-Path $RepoRoot "package.json") -Raw | ConvertFrom-Json
$Version = [string]$Pkg.version
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

Write-Host "[deploy] DreamWrite update system v$Version"
Write-Host "[deploy] install -> $InstallRoot"
Write-Host "[deploy] desktop -> single DreamWrite.lnk only"
Write-Host "[deploy] archive -> $ArchiveRoot (never Desktop)"

function Stop-DreamWriteProcesses {
  Get-Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.ProcessName -match '^(DreamWrite|Platen|electron)$' -or
      ($_.Path -and ($_.Path -match 'DreamWrite|Platen|ScriptDesk'))
    } |
    ForEach-Object {
      Write-Host "[deploy] stop $($_.ProcessName) pid=$($_.Id)"
      Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
  Start-Sleep -Milliseconds 500
}

function Ensure-Dir([string]$Path) {
  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  }
}

function Move-ToArchive([string]$Path) {
  if (-not (Test-Path $Path)) { return }
  Ensure-Dir $ArchiveRoot
  $name = Split-Path $Path -Leaf
  $dest = Join-Path $ArchiveRoot ("{0}__{1}" -f $stamp, $name)
  # avoid collisions
  $n = 1
  while (Test-Path $dest) {
    $dest = Join-Path $ArchiveRoot ("{0}__{1}__{2}" -f $stamp, $name, $n)
    $n++
  }
  Write-Host "[deploy] archive: $Path"
  Write-Host "         -> $dest"
  Move-Item -Force -LiteralPath $Path -Destination $dest
}

function Remove-ToArchive([string]$Path) {
  # Prefer move; if locked, force remove
  try {
    Move-ToArchive $Path
  } catch {
    Write-Host "[deploy] archive failed, deleting: $Path ($($_.Exception.Message))"
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# True if this Desktop path is DreamWrite launch clutter (not user project folders)
function Test-IsDreamWriteClutter([System.IO.FileSystemInfo]$Item) {
  $n = $Item.Name
  if ($n -eq 'desktop.ini') { return $false }
  # Never touch the real monorepo workspace
  if ($n -eq 'SYNTH-PROJECTS') { return $false }
  # Loose launchers / icons / shortcuts
  if ($n -match '^(DreamWrite|Platen|ScriptDesk)') { return $true }
  if ($Item.Extension -eq '.lnk') {
    try {
      $sh = New-Object -ComObject WScript.Shell
      $t = $sh.CreateShortcut($Item.FullName).TargetPath
      if ($t -and ($t -match 'DreamWrite|Platen|ScriptDesk')) { return $true }
    } catch { }
  }
  return $false
}

function Clear-DesktopLaunchClutter {
  param([string]$Root)
  if (-not $Root -or -not (Test-Path $Root)) { return }

  Write-Host "[deploy] scrubbing launch clutter: $Root"

  Get-ChildItem -LiteralPath $Root -Force -ErrorAction SilentlyContinue | ForEach-Object {
    if (Test-IsDreamWriteClutter $_) {
      # Special case: Desktop\DreamWrite full git clone -> archive whole tree
      Remove-ToArchive $_.FullName
    }
  }

  # Catch nested leftovers (e.g. old archive shortcut)
  Get-ChildItem -LiteralPath $Root -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^(DreamWrite|Platen)' } |
    ForEach-Object { Remove-ToArchive $_.FullName }
}

function Clear-StartMenuDuplicates {
  $roots = @(
    (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"),
    (Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs")
  )
  foreach ($r in $roots) {
    if (-not (Test-Path $r)) { continue }
    Get-ChildItem $r -Recurse -Force -ErrorAction SilentlyContinue |
      Where-Object {
        $_.Name -match 'DreamWrite|Platen|ScriptDesk' -and
        $_.Extension -eq '.lnk'
      } |
      ForEach-Object {
        Write-Host "[deploy] remove start-menu: $($_.FullName)"
        Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
      }
  }
}

function Write-InstallState {
  Ensure-Dir $InstallRoot
  $state = @{
    product = "DreamWrite"
    version = $Version
    installedAt = (Get-Date).ToString("o")
    exe = $InstallExe
    source = "deploy-desktop.ps1"
  } | ConvertTo-Json
  Set-Content -Path $StateFile -Value $state -Encoding UTF8
}

function Install-PortableBinary {
  $Dist = Join-Path $RepoRoot "dist"
  $PortableSrc = Join-Path $Dist "DreamWrite-Portable-$Version.exe"
  if (-not (Test-Path $PortableSrc)) {
    $found = Get-ChildItem $Dist -Filter "DreamWrite-Portable-*.exe" -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($found) {
      $PortableSrc = $found.FullName
      if ($PortableSrc -match 'DreamWrite-Portable-(.+)\.exe$') { $script:Version = $Matches[1] }
    }
  }
  if (-not (Test-Path $PortableSrc)) {
    throw "No portable build in dist/. Run without -SkipBuild."
  }

  Ensure-Dir $InstallRoot

  # Archive previous installed binary if version differs
  if (Test-Path $InstallExe) {
    $prev = Join-Path $ArchiveRoot ("{0}__DreamWrite-prev.exe" -f $stamp)
    Ensure-Dir $ArchiveRoot
    Write-Host "[deploy] archiving previous install binary"
    Copy-Item -Force $InstallExe $prev
  }

  Write-Host "[deploy] install binary: $PortableSrc"
  Copy-Item -Force $PortableSrc $InstallExe

  $icoSrc = Join-Path $RepoRoot "assets\icon.ico"
  if (Test-Path $icoSrc) {
    Copy-Item -Force $icoSrc $InstallIco
  }

  Write-InstallState
}

function Write-SingleDesktopShortcut {
  # Remove any remaining DreamWrite*.lnk on desktops first
  foreach ($root in @($Desktop, $PublicDesktop)) {
    if (-not (Test-Path $root)) { continue }
    Get-ChildItem $root -Filter "DreamWrite*.lnk" -Force -ErrorAction SilentlyContinue |
      ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue }
    Get-ChildItem $root -Filter "Platen*.lnk" -Force -ErrorAction SilentlyContinue |
      ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue }
  }

  $lnkPath = Join-Path $Desktop "DreamWrite.lnk"
  $Wsh = New-Object -ComObject WScript.Shell
  $sc = $Wsh.CreateShortcut($lnkPath)
  $sc.TargetPath = $InstallExe
  $sc.WorkingDirectory = $InstallRoot
  if (Test-Path $InstallIco) {
    $sc.IconLocation = "$InstallIco,0"
  } else {
    $sc.IconLocation = "$InstallExe,0"
  }
  $sc.Description = "DreamWrite $Version"
  $sc.Save()
  Write-Host "[deploy] shortcut: $lnkPath -> $InstallExe"
}

function Assert-DesktopClean {
  $problems = @()
  foreach ($root in @($Desktop, $PublicDesktop)) {
    if (-not (Test-Path $root)) { continue }
    Get-ChildItem $root -Force -ErrorAction SilentlyContinue | ForEach-Object {
      $n = $_.Name
      if ($n -eq 'SYNTH-PROJECTS') { return }
      if ($n -match '^(DreamWrite|Platen|ScriptDesk)') {
        # Only allowed: exactly DreamWrite.lnk
        if ($n -ne 'DreamWrite.lnk') {
          $problems += $_.FullName
        }
      }
    }
  }

  $lnkCount = @(Get-ChildItem $Desktop -Filter "DreamWrite*.lnk" -Force -ErrorAction SilentlyContinue).Count
  $exeCount = @(Get-ChildItem $Desktop -Filter "DreamWrite*.exe" -Force -ErrorAction SilentlyContinue).Count
  $dirCount = @(Get-ChildItem $Desktop -Directory -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^(DreamWrite|Platen)' }).Count

  Write-Host ""
  Write-Host "[deploy] verification:"
  Write-Host "  desktop DreamWrite*.lnk = $lnkCount (want 1)"
  Write-Host "  desktop DreamWrite*.exe = $exeCount (want 0)"
  Write-Host "  desktop DreamWrite* dirs = $dirCount (want 0)"
  Write-Host "  install exe exists     = $(Test-Path $InstallExe)"

  if ($lnkCount -ne 1 -or $exeCount -ne 0 -or $dirCount -ne 0 -or $problems.Count -gt 0) {
    Write-Host "[deploy] leftover paths:"
    $problems | ForEach-Object { Write-Host "   - $_" }
    throw "Desktop is not clean. Fix leftovers and re-run."
  }

  Write-Host "[deploy] OK - one shortcut, zero desktop binaries/folders"
}

# ---- main ----
Stop-DreamWriteProcesses
Ensure-Dir $ArchiveRoot
Ensure-Dir $InstallRoot

Clear-DesktopLaunchClutter -Root $Desktop
Clear-DesktopLaunchClutter -Root $PublicDesktop
Clear-StartMenuDuplicates

if ($CleanOnly) {
  Write-Host "[deploy] CleanOnly - not installing"
  exit 0
}

if (-not $SkipBuild) {
  Push-Location $RepoRoot
  try {
    $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
    Write-Host "[deploy] building portable..."
    npm run build:icons 2>$null
    # Portable only for updates - NSIS installer is optional / not auto-run
    npm run build:prod 2>$null
    if (Get-Command npx -ErrorAction SilentlyContinue) {
      npx --yes electron-builder --win portable --x64
    } else {
      npm run pack:win
    }
    if ($LASTEXITCODE -ne 0) { throw "build/pack failed exit $LASTEXITCODE" }
  } finally {
    Pop-Location
  }
}

Install-PortableBinary
Write-SingleDesktopShortcut

# Prune archive (keep last 8 items)
$old = Get-ChildItem $ArchiveRoot -Force -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 8
foreach ($o in $old) {
  Write-Host "[deploy] prune archive $($o.Name)"
  Remove-Item -LiteralPath $o.FullName -Recurse -Force -ErrorAction SilentlyContinue
}

Assert-DesktopClean
Write-Host "[deploy] Done. Launch: Desktop\DreamWrite.lnk"
Write-Host "[deploy] Binary: $InstallExe"
Write-Host "[deploy] WIP backups (if any): $env:LOCALAPPDATA\DreamWrite\preserved-wip-*"
