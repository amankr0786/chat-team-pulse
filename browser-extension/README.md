# ChatGPT Team Sync - Browser Extension

This Chrome extension syncs your ChatGPT Team members directly to your dashboard, bypassing CSP restrictions.

## Installation

1. **Download the extension folder**
   - Clone or download this repository
   - Locate the `browser-extension` folder

2. **Load in Chrome**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `browser-extension` folder

3. **Pin the extension**
   - Click the puzzle piece icon in Chrome toolbar
   - Pin "ChatGPT Team Sync" for easy access

## Usage

1. Navigate to any ChatGPT Team admin page:
   - `https://chatgpt.com/admin/members`

2. Click the extension icon in your toolbar

3. (Optional) Enter a custom team name

4. Click "Scan & Sync Members"

5. The extension will:
   - Scan the page for member emails
   - Extract names and roles
   - Sync directly to your dashboard

## Features

- ✅ One-click sync from ChatGPT admin pages
- ✅ Auto-detects team name
- ✅ Shows member preview before syncing
- ✅ Works across all your ChatGPT teams
- ✅ Bypasses CSP restrictions

## Troubleshooting

**"Please navigate to ChatGPT Admin page"**
- Make sure you're on `chatgpt.com/admin/members`

**"No members found"**
- Scroll down to load all members if the list is paginated
- Try refreshing the page

**Sync failed**
- Check your internet connection
- The dashboard server may be temporarily unavailable

## Creating Icons

The extension needs icon files. You can create simple icons or use these placeholder colors:

- `icon16.png` - 16x16 pixels
- `icon48.png` - 48x48 pixels  
- `icon128.png` - 128x128 pixels

Or use an online icon generator to create icons with a sync/refresh symbol.
