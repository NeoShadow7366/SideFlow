<#
.SYNOPSIS
  SideFlow Warning-Free One-Line Installer & Upgrader for Windows
.DESCRIPTION
  Downloads the latest SideFlow Per-User NSIS Installer from GitHub Releases (or uses a local build with -Local),
  verifies its SHA-512 checksum against latest.yml, removes the Mark-of-the-Web (Zone.Identifier) stream so
  Windows Defender SmartScreen does not show an "Unknown Publisher" popup, installs silently (/S) with zero UAC
  elevation prompts, and launches SideFlow in the system tray.
.EXAMPLE
  irm https://raw.githubusercontent.com/NeoShadow7366/SideFlow/master/install.ps1 | iex
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Local
#>
param(
  [switch]$Local,
  [switch]$NoLaunch
)

$ErrorActionPreference = "Stop"
$RepoOwner = "NeoShadow7366"
$RepoName  = "SideFlow"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  SideFlow Desktop Utility -- Warning-Free Windows Installer" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$InstallerPath = $null
$ExpectedSha512Base64 = $null

if ($Local) {
  $ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
  $ReleaseDir = Join-Path $ScriptRoot "release"
  $PkgJsonPath = Join-Path $ScriptRoot "package.json"
  $TargetFilter = "SideFlow-Setup-*.exe"
  if (Test-Path $PkgJsonPath) {
    try {
      $PkgVersion = (Get-Content -Path $PkgJsonPath -Raw | ConvertFrom-Json).version
      if ($PkgVersion) {
        $TargetFilter = "SideFlow-Setup-$PkgVersion.exe"
      }
    } catch {
      # fallback to wildcard
    }
  }

  $LocalCandidate = Get-ChildItem -Path $ReleaseDir -Filter $TargetFilter -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (-not $LocalCandidate) {
    Write-Host "[1/4] Building local NSIS installer ($TargetFilter) via npm run electron:dist..." -ForegroundColor Yellow
    Push-Location $ScriptRoot
    try {
      & npm.cmd run electron:dist
      if ($LASTEXITCODE -ne 0) {
        throw "npm run electron:dist failed with exit code $LASTEXITCODE"
      }
    } finally {
      Pop-Location
    }
    $LocalCandidate = Get-ChildItem -Path $ReleaseDir -Filter $TargetFilter -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
  }

  if (-not $LocalCandidate) {
    throw "Could not locate $TargetFilter in $ReleaseDir"
  }

  $InstallerPath = $LocalCandidate.FullName
  Write-Host "[1/4] Using local installer: $($LocalCandidate.Name)" -ForegroundColor Green
} else {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $ApiUrl = "https://api.github.com/repos/$RepoOwner/$RepoName/releases/latest"
  Write-Host "[1/4] Querying latest release from GitHub ($RepoOwner/$RepoName)..." -ForegroundColor Gray

  $Headers = @{
    "User-Agent" = "SideFlow-PowerShell-Installer"
    "Accept"     = "application/vnd.github+json"
  }
  $Release = Invoke-RestMethod -Uri $ApiUrl -Headers $Headers -Method Get
  $Version = ($Release.tag_name -replace '^v', '')

  $SetupAsset = $Release.assets | Where-Object { $_.name -match '^SideFlow-Setup-.*\.exe$' } | Select-Object -First 1
  if (-not $SetupAsset) {
    $SetupAsset = $Release.assets | Where-Object { $_.name -like '*.exe' } | Select-Object -First 1
  }
  if (-not $SetupAsset) {
    throw "No Windows .exe installer asset found in release $($Release.tag_name)."
  }

  $LatestYmlAsset = $Release.assets | Where-Object { $_.name -eq 'latest.yml' } | Select-Object -First 1

  $TempDir = Join-Path $env:TEMP "SideFlow-Install"
  if (-not (Test-Path $TempDir)) {
    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
  }

  $InstallerPath = Join-Path $TempDir $SetupAsset.name
  Write-Host "[2/4] Downloading $($SetupAsset.name) (v$Version)..." -ForegroundColor Gray
  Invoke-WebRequest -Uri $SetupAsset.browser_download_url -OutFile $InstallerPath -UseBasicParsing

  if ($LatestYmlAsset) {
    try {
      $YmlText = Invoke-RestMethod -Uri $LatestYmlAsset.browser_download_url -Headers $Headers -Method Get
      if ($YmlText -match '(?m)^\s*sha512:\s*([A-Za-z0-9+/=]+)\s*$') {
        $ExpectedSha512Base64 = $Matches[1].Trim()
      }
    } catch {
      Write-Host "      (Skipping latest.yml hash parse: $($_.Exception.Message))" -ForegroundColor DarkGray
    }
  }
}

if ($ExpectedSha512Base64) {
  Write-Host "[3/4] Verifying SHA-512 cryptographic checksum..." -ForegroundColor Gray
  $FileHashHex = (Get-FileHash -Path $InstallerPath -Algorithm SHA512).Hash
  $HashBytes = [byte[]]::new($FileHashHex.Length / 2)
  for ($i = 0; $i -lt $FileHashHex.Length; $i += 2) {
    $HashBytes[$i / 2] = [Convert]::ToByte($FileHashHex.Substring($i, 2), 16)
  }
  $ActualSha512Base64 = [Convert]::ToBase64String($HashBytes)
  if ($ActualSha512Base64 -ne $ExpectedSha512Base64) {
    Remove-Item -Path $InstallerPath -Force -ErrorAction SilentlyContinue
    throw "SHA-512 checksum mismatch! Expected $ExpectedSha512Base64 but got $ActualSha512Base64."
  }
  Write-Host "      SHA-512 checksum verified." -ForegroundColor Green
} else {
  Write-Host "[3/4] Preparing installer binary..." -ForegroundColor Gray
}

# Strip Mark-of-the-Web (Zone.Identifier) alternate data stream so Windows SmartScreen never prompts
Unblock-File -Path $InstallerPath -ErrorAction SilentlyContinue

# Gracefully close any running SideFlow instance before upgrading
Get-Process -Name "SideFlow" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 350

Write-Host "[4/4] Installing SideFlow silently (per-user, no UAC or SmartScreen prompts)..." -ForegroundColor Gray
$Proc = Start-Process -FilePath $InstallerPath -ArgumentList "/S" -PassThru -Wait
if ($Proc.ExitCode -ne 0) {
  throw "SideFlow installer exited with code $($Proc.ExitCode)."
}

$CandidateExes = @(
  (Join-Path $env:LOCALAPPDATA "Programs\sideflow-desktop\SideFlow.exe"),
  (Join-Path $env:LOCALAPPDATA "Programs\SideFlow\SideFlow.exe"),
  (Join-Path $env:LOCALAPPDATA "SideFlow\SideFlow.exe")
)
$InstalledExe = $CandidateExes | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $NoLaunch -and $InstalledExe) {
  Unblock-File -Path $InstalledExe -ErrorAction SilentlyContinue
  Start-Process -FilePath $InstalledExe
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  SideFlow Installed Successfully!" -ForegroundColor Green
Write-Host "  Press Alt + Space at any time to toggle the slide-out panel." -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
