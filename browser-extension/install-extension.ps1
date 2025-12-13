# ChatGPT Team Sync - Extension Installation Helper
# Run this script to set up the extension properly

$ExtensionPath = "C:\ChatGPT-Sync\browser-extension"

Write-Host "=== ChatGPT Team Sync Extension Installer ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check if extension folder exists
if (-not (Test-Path $ExtensionPath)) {
    Write-Host "[ERROR] Extension folder not found at: $ExtensionPath" -ForegroundColor Red
    Write-Host "Please create the folder and copy the extension files there." -ForegroundColor Yellow
    exit 1
}

# Step 2: List files
Write-Host "[INFO] Files in extension folder:" -ForegroundColor Green
Get-ChildItem $ExtensionPath | ForEach-Object { Write-Host "  - $($_.Name) ($($_.Length) bytes)" }
Write-Host ""

# Step 3: Remove invalid icon files (they cause silent load failures)
Write-Host "[INFO] Removing potentially invalid icon files..." -ForegroundColor Yellow
$iconFiles = @("icon16.png", "icon48.png", "icon128.png")
foreach ($icon in $iconFiles) {
    $iconPath = Join-Path $ExtensionPath $icon
    if (Test-Path $iconPath) {
        Remove-Item $iconPath -Force
        Write-Host "  Removed: $icon" -ForegroundColor Gray
    }
}

# Step 4: Update manifest.json to remove icon references
Write-Host "[INFO] Updating manifest.json to remove icon requirements..." -ForegroundColor Yellow
$manifestPath = Join-Path $ExtensionPath "manifest.json"
$manifest = @{
    manifest_version = 3
    name = "ChatGPT Team Sync"
    version = "1.3.0"
    description = "Automatically sync ChatGPT Team members to your dashboard"
    permissions = @("activeTab", "scripting", "storage", "tabs")
    host_permissions = @("https://chatgpt.com/*", "https://cpmtbnsujfdumwdmsdrc.supabase.co/*")
    background = @{
        service_worker = "background.js"
    }
    content_scripts = @(
        @{
            matches = @("https://chatgpt.com/admin/members*", "https://chatgpt.com/admin/*/members*")
            js = @("content.js")
            run_at = "document_idle"
        }
    )
    action = @{
        default_popup = "popup.html"
    }
}
$manifest | ConvertTo-Json -Depth 4 | Set-Content $manifestPath -Encoding UTF8
Write-Host "  manifest.json updated successfully" -ForegroundColor Green
Write-Host ""

# Step 5: Instructions
Write-Host "=== MANUAL STEPS REQUIRED ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Open Chrome and go to: chrome://extensions" -ForegroundColor White
Write-Host "2. Enable 'Developer mode' (toggle in top-right corner)" -ForegroundColor White
Write-Host "3. Click 'Load unpacked'" -ForegroundColor White
Write-Host "4. Browse to: $ExtensionPath" -ForegroundColor Yellow
Write-Host "5. Click 'Select Folder'" -ForegroundColor White
Write-Host ""
Write-Host "The extension should now appear in your extensions list!" -ForegroundColor Green
Write-Host ""
Write-Host "If it still doesn't appear:" -ForegroundColor Yellow
Write-Host "  - Check Chrome console (F12) for errors" -ForegroundColor Gray
Write-Host "  - Try restarting Chrome completely" -ForegroundColor Gray
Write-Host "  - Make sure you're using a recent Chrome version" -ForegroundColor Gray
Write-Host ""

# Open Chrome extensions page
$openChrome = Read-Host "Open Chrome extensions page now? (Y/N)"
if ($openChrome -eq "Y" -or $openChrome -eq "y") {
    Start-Process "chrome.exe" -ArgumentList "chrome://extensions"
}
