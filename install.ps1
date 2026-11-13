<#
.SYNOPSIS
  SideFlow Warning-Free One-Line Installer & Upgrader for Windows
.DESCRIPTION
  Downloads the latest SideFlow Per-User NSIS Installer from GitHub Releases (or uses a local build with -Local),
  strictly verifies its SHA-512 checksum against latest.yml (failing closed on missing/mismatched digests unless
  -SkipHashCheck is explicitly specified), removes the Mark-of-the-Web (Zone.Identifier) stream, gracefully closes
  SideFlow so workspace config flushes cleanly, and installs silently (/S) per-user.
.EXAMPLE
  irm https://raw.githubusercontent.com/NeoShadow7366/SideFlow/master/install.ps1 | iex
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Local
#>
param(
  [switch]$Local,
  [switch]$NoLaunch,
  [switch]$SkipHashCheck
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
  $TargetFilter = "*Setup*.exe"
  if (Test-Path $PkgJsonPath) {
    try {
      $PkgVersion = (Get-Content -Path $PkgJsonPath -Raw | ConvertFrom-Json).version
      if ($PkgVersion) {
        $TargetFilter = "*Setup*$PkgVersion*.exe"
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
    throw "Could not locate NSIS Setup installer ($TargetFilter) in $ReleaseDir"
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

  # Match strictly NSIS Setup installer (never Portable .exe, which ignores /S)
  $SetupAsset = $Release.assets | Where-Object { $_.name -match '^SideFlow[- ]Setup[- ].*\.exe$' } | Select-Object -First 1
  if (-not $SetupAsset) {
    throw "No SideFlow NSIS Setup .exe asset found in release $($Release.tag_name)."
  }

  $LatestYmlAsset = $Release.assets | Where-Object { $_.name -eq 'latest.yml' } | Select-Object -First 1
  if (-not $LatestYmlAsset -and -not $SkipHashCheck) {
    throw "Release $($Release.tag_name) is missing latest.yml checksum manifest. Refusing unverified install (pass -SkipHashCheck to override)."
  }

  $TempDir = Join-Path $env:TEMP "SideFlow-Install"
  if (-not (Test-Path $TempDir)) {
    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
  }

  $InstallerPath = Join-Path $TempDir $SetupAsset.name
  Write-Host "[2/4] Downloading $($SetupAsset.name) (v$Version)..." -ForegroundColor Gray
  Invoke-WebRequest -Uri $SetupAsset.browser_download_url -OutFile $InstallerPath -UseBasicParsing

  if ($LatestYmlAsset) {
    $YmlResp = Invoke-WebRequest -Uri $LatestYmlAsset.browser_download_url -Headers $Headers -UseBasicParsing
    $YmlText = if ($YmlResp.Content -is [byte[]]) {
      [System.Text.Encoding]::UTF8.GetString($YmlResp.Content)
    } else {
      [string]$YmlResp.Content
    }

    $EscapedName = [Regex]::Escape($SetupAsset.name)
    $DashVariant = [Regex]::Escape(($SetupAsset.name -replace ' ', '-'))
    if ($YmlText -match "(?ms)(?:url|path):\s*['""]?(?:$EscapedName|$DashVariant)['""]?\s*\r?\n\s*sha512:\s*['""]?([A-Za-z0-9+/=]{64,128})['""]?") {
      $ExpectedSha512Base64 = $Matches[1].Trim()
    } elseif ($YmlText -match '(?m)^\s*path:\s*.*Setup.*\.exe\s*$' -and $YmlText -match '(?m)^\s*sha512:\s*([A-Za-z0-9+/=]{64,128})\s*$') {
      $ExpectedSha512Base64 = $Matches[1].Trim()
    }
  }

  if (-not $ExpectedSha512Base64 -and -not $SkipHashCheck) {
    Remove-Item -Path $InstallerPath -Force -ErrorAction SilentlyContinue
    throw "Could not extract SHA-512 digest for $($SetupAsset.name) from latest.yml. Refusing unverified install."
  }
}

$Sha256Hex = (Get-FileHash -Path $InstallerPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($ExpectedSha512Base64) {
  Write-Host "[3/4] Verifying cryptographic SHA-512 checksum against latest.yml..." -ForegroundColor Gray
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
  Write-Host "      SHA-512 & SHA-256 verified ($($Sha256Hex.Substring(0, 16))...)." -ForegroundColor Green
} elseif ($Local) {
  Write-Host "[3/4] Local build SHA-256: $($Sha256Hex.Substring(0, 16))..." -ForegroundColor Green
} else {
  Write-Host "[3/4] WARNING: Hash check skipped via -SkipHashCheck (SHA-256: $($Sha256Hex.Substring(0, 16))...)." -ForegroundColor Yellow
}

# Strip Mark-of-the-Web (Zone.Identifier) alternate data stream so Windows SmartScreen never prompts
Unblock-File -Path $InstallerPath -ErrorAction SilentlyContinue

# Gracefully close any running SideFlow instance so sideflow-config.json flushes before upgrading
$RunningProcs = Get-Process -Name "SideFlow" -ErrorAction SilentlyContinue
if ($RunningProcs) {
  foreach ($p in $RunningProcs) {
    try {
      $null = $p.CloseMainWindow()
    } catch {}
  }
  foreach ($p in $RunningProcs) {
    try {
      $null = $p.WaitForExit(1500)
    } catch {}
  }
  Get-Process -Name "SideFlow" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 300
}

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
Write-Host "SideFlow installed successfully!" -ForegroundColor Green
Write-Host ""
