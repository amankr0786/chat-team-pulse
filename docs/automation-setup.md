# ChatGPT Team Sync - Automation Setup Guide

This guide explains how to set up automated syncing of your ChatGPT teams using Windows Server with Chrome profiles.

## Prerequisites

- Windows Server (or any Windows machine running 24/7)
- Chrome browser installed
- PowerShell 5.1 or later
- The ChatGPT Team Sync browser extension

## Step 1: Create Chrome Profiles with Extension

**IMPORTANT**: Chrome's `--load-extension` flag loads extensions temporarily - they only work while Chrome is running with that flag. This is by design and is the correct behavior. The extension will load every time sync-teams.ps1 runs.

First, run the install-extension.ps1 script to prepare the extension files (removes invalid icons that cause silent failures):

```powershell
# Run this FIRST in the extension folder
cd C:\ChatGPT-Sync\browser-extension
.\install-extension.ps1
```

Then run this PowerShell script to create Chrome profiles:

```powershell
# create-profiles.ps1
$ExtensionPath = "C:\ChatGPT-Sync\browser-extension"
$ProfilesPath = "C:\ChatGPT-Sync\Profiles"

# Verify extension files exist
if (-not (Test-Path "$ExtensionPath\manifest.json")) {
    Write-Host "[ERROR] Extension not found at: $ExtensionPath" -ForegroundColor Red
    Write-Host "Please copy the browser-extension files to this location first." -ForegroundColor Yellow
    exit 1
}

# Create base directories
New-Item -ItemType Directory -Force -Path $ProfilesPath
New-Item -ItemType Directory -Force -Path "C:\ChatGPT-Sync\logs"

# Configure number of profiles
$ProfileCount = 2  # Change this to the number of profiles you need

for ($i = 1; $i -le $ProfileCount; $i++) {
    $ProfileDir = "$ProfilesPath\Profile$i"
    
    # Create profile directory
    New-Item -ItemType Directory -Force -Path $ProfileDir
    
    Write-Host "`n=== Setting up Profile$i ===" -ForegroundColor Cyan
    
    # Launch Chrome with profile and extension
    # Extension is loaded via --load-extension flag
    $chrome = Start-Process "chrome.exe" -ArgumentList `
        "--user-data-dir=`"$ProfileDir`"",
        "--load-extension=`"$ExtensionPath`"",
        "--no-first-run",
        "--disable-default-apps",
        "--disable-sync",
        "chrome://extensions" `
        -PassThru
    
    Write-Host "Chrome opened for Profile$i" -ForegroundColor Green
    Write-Host ""
    Write-Host "VERIFY THESE STEPS:" -ForegroundColor Yellow
    Write-Host "  1. Check chrome://extensions shows 'ChatGPT Team Sync' extension" -ForegroundColor White
    Write-Host "  2. Enable 'Developer mode' toggle (top right)" -ForegroundColor White
    Write-Host "  3. Navigate to https://chatgpt.com and login with Team $i account" -ForegroundColor White
    Write-Host ""
    Write-Host "Press any key AFTER you've verified extension AND logged in..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    
    # Close Chrome
    Stop-Process -Name "chrome" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 5
    
    Write-Host "Profile$i setup complete!" -ForegroundColor Green
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "All $ProfileCount profiles created!" -ForegroundColor Green
Write-Host ""
Write-Host "IMPORTANT: The extension loads via --load-extension flag each time."
Write-Host "This is correct behavior - sync-teams.ps1 uses this flag automatically."
Write-Host "========================================" -ForegroundColor Cyan
```

## Step 2: Configure Team URLs

Create a configuration file with your team admin URLs:

**IMPORTANT**: ChatGPT Team uses a single URL `https://chatgpt.com/admin/members` for all teams. Each Chrome profile is logged into a different team account, so the URL is the same but the team shown depends on which account is logged in.

```powershell
# Save this as C:\ChatGPT-Sync\team-config.json
{
  "profiles": [
    {
      "profileNumber": 1,
      "teamName": "Team Alpha",
      "adminUrl": "https://chatgpt.com/admin/members"
    },
    {
      "profileNumber": 2,
      "teamName": "Team Beta",
      "adminUrl": "https://chatgpt.com/admin/members"
    }
    // Add more profiles as needed...
  ]
}
```

## Step 3: Main Sync Script

Create the main sync script (`sync-teams.ps1`):

```powershell
# sync-teams.ps1
# IMPORTANT: Use at least 2-3 minutes wait time for reliable syncs
param(
    [int]$WaitMinutesMin = 2,  # Minimum 2 minutes recommended
    [int]$WaitMinutesMax = 3   # Maximum 3 minutes recommended
)

$ProfilesPath   = "C:\ChatGPT-Sync\Profiles"
$ConfigPath     = "C:\ChatGPT-Sync\team-config.json"
$ExtensionPath  = "C:\ChatGPT-Sync\browser-extension"
$LogFile        = "C:\ChatGPT-Sync\logs\sync-$(Get-Date -Format 'yyyy-MM-dd').txt"
$ApiUrl         = "https://cpmtbnsujfdumwdmsdrc.supabase.co/functions/v1/update-scheduler-status"

function Log($message) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp - $message" | Tee-Object -Append -FilePath $LogFile
}

# Find Chrome path
$ChromePath = (Get-Command chrome.exe -ErrorAction SilentlyContinue).Source
if (-not $ChromePath) {
    $c1 = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
    $c2 = "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe"
    if (Test-Path $c1) { $ChromePath = $c1 }
    elseif (Test-Path $c2) { $ChromePath = $c2 }
}
if (-not $ChromePath) { throw "Chrome not found. Install Google Chrome first." }

# Validate required paths
if (-not (Test-Path $ConfigPath)) { throw "Missing config: $ConfigPath" }
if (-not (Test-Path "$ExtensionPath\manifest.json")) { throw "Missing extension manifest.json in: $ExtensionPath" }

# Load configuration
$config = (Get-Content $ConfigPath -Raw) | ConvertFrom-Json

$StartTime = Get-Date
Log "========================================="
Log "Starting sync cycle"
Log "Wait time: $WaitMinutesMin - $WaitMinutesMax minutes per profile"
Log "Total profiles in config: $($config.profiles.Count)"
Log "========================================="

# Notify dashboard that sync started
try {
    $body = @{
        status = "running"
        profiles_synced = 0
        total_profiles = $config.profiles.Count
    } | ConvertTo-Json

    Invoke-RestMethod -Uri $ApiUrl -Method POST -Body $body -ContentType "application/json"
    Log "Dashboard notified: sync started"
} catch {
    Log "Warning: Could not notify dashboard - $_"
}

$ProfilesSynced = 0
$FailedProfiles = @()

foreach ($profile in $config.profiles) {
    $ProfileNum = $profile.profileNumber
    $ProfileDir = "$ProfilesPath\Profile$ProfileNum"
    $TeamUrl    = $profile.adminUrl
    $TeamName   = $profile.teamName

    Log "----------------------------------------"
    Log "Processing Profile$ProfileNum ($TeamName)"
    Log "URL: $TeamUrl"

    if (-not (Test-Path $ProfileDir)) {
        Log "ERROR: Profile directory not found: $ProfileDir"
        $FailedProfiles += $ProfileNum
        continue
    }

    try {
        # Kill any existing Chrome processes for this profile
        Get-Process chrome -ErrorAction SilentlyContinue | Where-Object {
            $_.CommandLine -like "*$ProfileDir*"
        } | Stop-Process -Force -ErrorAction SilentlyContinue
        
        Start-Sleep -Seconds 3
        
        Log "Opening Chrome with extension..."
        $chromeProcess = Start-Process $ChromePath -ArgumentList `
            "--user-data-dir=`"$ProfileDir`"",
            "--start-maximized",
            "--disable-sync",
            "--no-first-run",
            "--disable-default-apps",
            "--disable-extensions-except=`"$ExtensionPath`"",
            "--load-extension=`"$ExtensionPath`"",
            "`"$TeamUrl`"" -PassThru

        # Random wait between min and max minutes
        $WaitMinutes = Get-Random -Minimum $WaitMinutesMin -Maximum ($WaitMinutesMax + 1)
        $WaitSeconds = $WaitMinutes * 60
        Log "Waiting $WaitMinutes minute(s) ($WaitSeconds seconds) for extension to sync..."
        
        # Wait with progress updates
        $elapsed = 0
        while ($elapsed -lt $WaitSeconds) {
            Start-Sleep -Seconds 30
            $elapsed += 30
            $remaining = $WaitSeconds - $elapsed
            if ($remaining -gt 0) {
                Log "  ... $([math]::Round($remaining/60, 1)) minutes remaining"
            }
        }

        Log "Closing Chrome for Profile$ProfileNum..."
        
        # Try graceful close first
        try {
            $chromeProcess.CloseMainWindow() | Out-Null
            Start-Sleep -Seconds 5
        } catch {}
        
        # Force kill if still running
        if (-not $chromeProcess.HasExited) {
            Stop-Process -Id $chromeProcess.Id -Force -ErrorAction SilentlyContinue
        }
        
        Start-Sleep -Seconds 5

        $ProfilesSynced++
        Log "Profile$ProfileNum completed"

        # Update dashboard progress
        try {
            $progressBody = @{
                status = "running"
                profiles_synced = $ProfilesSynced
                total_profiles = $config.profiles.Count
            } | ConvertTo-Json

            Invoke-RestMethod -Uri $ApiUrl -Method POST -Body $progressBody -ContentType "application/json"
        } catch {}

    } catch {
        Log "ERROR processing Profile$ProfileNum - $_"
        $FailedProfiles += $ProfileNum
        try { 
            Stop-Process -Id $chromeProcess.Id -Force -ErrorAction SilentlyContinue 
        } catch {}
    }

    # Pause between profiles
    Log "Pausing 15 seconds before next profile..."
    Start-Sleep -Seconds 15
}

$EndTime = Get-Date
$Duration = [int]($EndTime - $StartTime).TotalSeconds
$NextRun = $StartTime.AddHours(24)

Log "========================================="
Log "Sync cycle complete!"
Log "Profiles synced: $ProfilesSynced / $($config.profiles.Count)"
Log "Duration: $([math]::Round($Duration / 60, 1)) minutes"
Log "Next run: $($NextRun.ToString('yyyy-MM-dd HH:mm'))"
if ($FailedProfiles.Count -gt 0) {
    Log "Failed profiles: $($FailedProfiles -join ', ')"
}
Log "========================================="

# Notify dashboard that sync completed
$status = if ($FailedProfiles.Count -eq 0) { "completed" } else { "failed" }
try {
    $body = @{
        status = $status
        last_run_at = $EndTime.ToString("o")
        next_run_at = $NextRun.ToString("o")
        profiles_synced = $ProfilesSynced
        total_profiles = $config.profiles.Count
        run_duration_seconds = $Duration
    } | ConvertTo-Json
    
    Invoke-RestMethod -Uri $ApiUrl -Method POST -Body $body -ContentType "application/json"
    Log "Dashboard notified: sync completed"
} catch {
    Log "Warning: Could not notify dashboard - $_"
}
```

## Step 4: Schedule the Task

Run this script once to set up the Windows Task Scheduler:

```powershell
# schedule-task.ps1
param(
    [string]$SyncTime = "03:00"  # Default: 3:00 AM
)

$TaskName = "ChatGPT-Team-Sync"
$ScriptPath = "C:\ChatGPT-Sync\sync-teams.ps1"

# Remove existing task if it exists
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$Action = New-ScheduledTaskAction `
    -Execute "PowerShell.exe" `
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`""

$Trigger = New-ScheduledTaskTrigger `
    -Daily `
    -At $SyncTime

$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 10) `
    -ExecutionTimeLimit (New-TimeSpan -Hours 3)

$Principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Highest

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Description "Syncs all ChatGPT team members every 24 hours"

Write-Host "`n✓ Task '$TaskName' scheduled successfully!"
Write-Host "  Schedule: Daily at $SyncTime"
Write-Host "  Script: $ScriptPath"
Write-Host "`nTo run manually: Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "To view status: Get-ScheduledTask -TaskName '$TaskName' | Get-ScheduledTaskInfo"
```

## Step 5: Extension Configuration

Make sure the browser extension has these settings enabled:

1. **Auto-sync on load**: ✓ Enabled
2. **Auto-close tab**: ✓ Enabled (optional, for cleaner automation)

These settings are persisted per Chrome profile.

## Directory Structure

```
C:\ChatGPT-Sync\
├── browser-extension\     # Extension files (copy from project)
│   ├── manifest.json
│   ├── popup.html
│   └── popup.js
├── Profiles\              # Chrome user data directories
│   ├── Profile1\
│   ├── Profile2\
│   └── ...
├── logs\                  # Sync logs
│   └── sync-2025-01-15.txt
├── team-config.json       # Team URLs configuration
├── create-profiles.ps1    # One-time profile setup
├── sync-teams.ps1         # Main sync script
└── schedule-task.ps1      # Task scheduler setup
```

## Troubleshooting

### Chrome won't start
- Ensure Chrome is installed and in your PATH
- Check if another Chrome process is running

### Sync not working
- Verify the extension is installed in each profile
- Check if auto-sync is enabled in extension settings
- Review logs in `C:\ChatGPT-Sync\logs\`

### Session expired
- Re-run the profile creation script for that specific profile
- Login again to ChatGPT

### Task not running
```powershell
# Check task status
Get-ScheduledTask -TaskName "ChatGPT-Team-Sync" | Get-ScheduledTaskInfo

# View task history
Get-WinEvent -LogName 'Microsoft-Windows-TaskScheduler/Operational' -MaxEvents 50 |
  Where-Object { $_.Message -like '*ChatGPT*' }
```

## Time Estimates

| Profiles | Wait Time (min) | Total Duration |
|----------|-----------------|----------------|
| 5        | 5-8 min each    | ~35-50 min     |
| 10       | 5-8 min each    | ~60-90 min     |
| 15       | 5-8 min each    | ~90-130 min    |

The script runs once every 24 hours automatically.
