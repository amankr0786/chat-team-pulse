# ChatGPT Team Sync - Automation Setup Guide

This guide explains how to set up automated syncing of your ChatGPT teams using Windows Server with Chrome profiles.

## Prerequisites

- Windows Server (or any Windows machine running 24/7)
- Chrome browser installed
- PowerShell 5.1 or later
- The ChatGPT Team Sync browser extension

## Step 1: Create Chrome Profiles with Extension

Run this PowerShell script to create 10 Chrome profiles with the extension pre-installed:

```powershell
# create-profiles.ps1
$ExtensionPath = "C:\ChatGPT-Sync\browser-extension"
$ProfilesPath = "C:\ChatGPT-Sync\Profiles"

# Create base directories
New-Item -ItemType Directory -Force -Path $ProfilesPath
New-Item -ItemType Directory -Force -Path "C:\ChatGPT-Sync\logs"

for ($i = 1; $i -le 10; $i++) {
    $ProfileDir = "$ProfilesPath\Profile$i"
    
    # Create profile directory
    New-Item -ItemType Directory -Force -Path $ProfileDir
    
    # Launch Chrome with profile to initialize it with the extension
    Start-Process "chrome.exe" -ArgumentList `
        "--user-data-dir=$ProfileDir",
        "--load-extension=$ExtensionPath",
        "--no-first-run",
        "--disable-default-apps",
        "--disable-sync"
    
    Write-Host "Launched Profile$i - Please login to ChatGPT in this window"
    Write-Host "Press any key after you've logged in..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    
    # Close Chrome
    Stop-Process -Name "chrome" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    
    Write-Host "Profile$i created and saved!`n"
}

Write-Host "`nAll 10 profiles created! Each profile is now logged into a different ChatGPT account."
```

## Step 2: Configure Team URLs

Create a configuration file with your team admin URLs:

```powershell
# Save this as C:\ChatGPT-Sync\team-config.json
{
  "profiles": [
    {
      "profileNumber": 1,
      "teamName": "Team Alpha",
      "adminUrl": "https://chatgpt.com/admin/org-xxx1/members"
    },
    {
      "profileNumber": 2,
      "teamName": "Team Beta",
      "adminUrl": "https://chatgpt.com/admin/org-xxx2/members"
    }
    // Add more profiles as needed...
  ]
}
```

## Step 3: Main Sync Script

This is the main automation script that runs daily:

```powershell
# sync-teams.ps1
param(
    [int]$WaitMinutesMin = 5,
    [int]$WaitMinutesMax = 8
)

$ProfilesPath = "C:\ChatGPT-Sync\Profiles"
$ConfigPath = "C:\ChatGPT-Sync\team-config.json"
$LogFile = "C:\ChatGPT-Sync\logs\sync-$(Get-Date -Format 'yyyy-MM-dd').txt"
$ApiUrl = "https://cpmtbnsujfdumwdmsdrc.supabase.co/functions/v1/update-scheduler-status"

function Log($message) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp - $message" | Tee-Object -Append -FilePath $LogFile
}

# Load configuration
$config = Get-Content $ConfigPath | ConvertFrom-Json

$StartTime = Get-Date
Log "========================================="
Log "Starting sync cycle"
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
    $TeamUrl = $profile.adminUrl
    $TeamName = $profile.teamName
    
    Log "----------------------------------------"
    Log "Processing Profile$ProfileNum ($TeamName)"
    
    if (-not (Test-Path $ProfileDir)) {
        Log "ERROR: Profile directory not found: $ProfileDir"
        $FailedProfiles += $ProfileNum
        continue
    }
    
    try {
        # Open Chrome with profile and navigate to team admin page
        Log "Opening Chrome..."
        $chromeProcess = Start-Process "chrome.exe" -ArgumentList `
            "--user-data-dir=$ProfileDir",
            "--start-maximized",
            "--disable-sync",
            $TeamUrl -PassThru
        
        # Wait random time between min and max minutes
        $WaitMinutes = Get-Random -Minimum $WaitMinutesMin -Maximum ($WaitMinutesMax + 1)
        Log "Waiting $WaitMinutes minutes for auto-sync to complete..."
        Start-Sleep -Seconds ($WaitMinutes * 60)
        
        # Close Chrome gracefully
        Log "Closing Chrome..."
        Stop-Process -Name "chrome" -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 5  # Wait for Chrome to fully close
        
        $ProfilesSynced++
        Log "Profile$ProfileNum completed successfully"
        
        # Update dashboard with progress
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
        Stop-Process -Name "chrome" -Force -ErrorAction SilentlyContinue
    }
    
    # Brief pause between profiles
    Start-Sleep -Seconds 10
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
