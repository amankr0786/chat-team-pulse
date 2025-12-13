// Background service worker for automatic team sync
const SUPABASE_URL = 'https://cpmtbnsujfdumwdmsdrc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwbXRibnN1amZkdW13ZG1zZHJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0NzY5MTUsImV4cCI6MjA4MTA1MjkxNX0.cScM225BLKI760VUscW4r5a_LuWjEffo95125eCd1Ss';

// Pattern to match ChatGPT admin members page
const ADMIN_MEMBERS_PATTERN = /^https:\/\/chatgpt\.com\/admin\/members/;

// Track tabs that have been synced to avoid duplicate syncs
const syncedTabs = new Set();

console.log('[Background] ========================================');
console.log('[Background] Service worker initialized');
console.log('[Background] Time:', new Date().toISOString());
console.log('[Background] ========================================');

// Keep service worker alive
const keepAlive = () => {
  console.log('[Background] Heartbeat:', new Date().toISOString());
};
setInterval(keepAlive, 25000);

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Received message:', message.type, 'from:', sender.tab?.url || 'popup');
  
  if (message.type === 'triggerSync' && sender.tab) {
    console.log('[Background] Processing triggerSync from content script');
    handleTabSync(sender.tab.id, sender.tab);
    sendResponse({ status: 'ok', message: 'Sync started' });
  }
  
  if (message.type === 'ping') {
    console.log('[Background] Responding to ping');
    sendResponse({ status: 'ok', timestamp: new Date().toISOString() });
  }
  
  if (message.type === 'wakeup') {
    console.log('[Background] Wakeup received');
    sendResponse({ status: 'awake', timestamp: new Date().toISOString() });
  }
  
  return true;
});

// Listen for tab updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url) return;
  
  console.log('[Background] Tab updated:', { tabId, url: tab.url, status: changeInfo.status });
  
  // Check if we're on a ChatGPT admin members page
  const isMatch = ADMIN_MEMBERS_PATTERN.test(tab.url);
  console.log('[Background] URL match check:', { url: tab.url, pattern: ADMIN_MEMBERS_PATTERN.toString(), isMatch });
  
  if (!isMatch) return;
  
  console.log('[Background] Admin page detected, waiting for content script to trigger sync...');
  // The content script will trigger the sync via message, but also set a fallback
  setTimeout(async () => {
    const tabKey = `${tabId}-${tab.url}`;
    if (!syncedTabs.has(tabKey)) {
      console.log('[Background] Fallback: Content script did not trigger, initiating sync from background');
      await handleTabSync(tabId, tab);
    }
  }, 20000); // 20 second fallback
});

// Check existing tabs on service worker startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('[Background] Runtime startup - checking existing tabs');
  const tabs = await chrome.tabs.query({ url: 'https://chatgpt.com/admin/members*' });
  console.log('[Background] Found', tabs.length, 'existing admin tabs');
  for (const tab of tabs) {
    console.log('[Background] Processing existing tab:', tab.url);
    await handleTabSync(tab.id, tab);
  }
});

// Also check on install/update
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Background] Extension installed/updated:', details.reason);
  const tabs = await chrome.tabs.query({ url: 'https://chatgpt.com/admin/members*' });
  for (const tab of tabs) {
    await handleTabSync(tab.id, tab);
  }
});

// Main sync handler function
async function handleTabSync(tabId, tab) {
  const tabKey = `${tabId}-${tab.url}`;
  
  // Avoid duplicate syncs
  if (syncedTabs.has(tabKey)) {
    console.log('[Background] Tab already synced, skipping:', tabKey);
    return;
  }
  
  console.log('[Background] ========================================');
  console.log('[Background] Starting sync for tab:', tabId);
  console.log('[Background] URL:', tab.url);
  console.log('[Background] Time:', new Date().toISOString());
  console.log('[Background] ========================================');
  
  syncedTabs.add(tabKey);
  
  // Wait for page to fully render
  console.log('[Background] Waiting 8 seconds for page to fully load...');
  await new Promise(resolve => setTimeout(resolve, 8000));
  
  try {
    // Update badge to show syncing
    chrome.action.setBadgeText({ text: '...' });
    chrome.action.setBadgeBackgroundColor({ color: '#FFA500' });
    
    console.log('[Background] Extracting team data...');
    
    // Extract team data from the page
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractTeamData
    });
    
    console.log('[Background] Extraction results:', results);
    
    if (!results || !results[0] || !results[0].result) {
      throw new Error('Failed to extract team data - no results returned');
    }
    
    const { teamName, members } = results[0].result;
    
    console.log('[Background] ----------------------------------------');
    console.log('[Background] Team Name:', teamName);
    console.log('[Background] Member Count:', members.length);
    console.log('[Background] Members:', JSON.stringify(members, null, 2));
    console.log('[Background] ----------------------------------------');
    
    if (!teamName) {
      throw new Error('Could not detect team name from page');
    }
    
    if (members.length === 0) {
      throw new Error('No members found on page - page may not have loaded correctly');
    }
    
    // Send to Supabase edge function
    console.log('[Background] Calling sync-team edge function...');
    console.log('[Background] URL:', `${SUPABASE_URL}/functions/v1/sync-team`);
    console.log('[Background] Payload:', JSON.stringify({ teamName, members }));
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/sync-team`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ teamName, members })
    });
    
    const responseText = await response.text();
    console.log('[Background] Response status:', response.status);
    console.log('[Background] Response body:', responseText);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} - ${responseText}`);
    }
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      throw new Error(`Invalid JSON response: ${responseText}`);
    }
    
    if (data.success) {
      console.log('[Background] ✓ SYNC SUCCESSFUL!');
      console.log('[Background] Team ID:', data.teamId);
      console.log('[Background] Member count:', data.memberCount);
      
      chrome.action.setBadgeText({ text: '✓' });
      chrome.action.setBadgeBackgroundColor({ color: '#22C55E' });
      
      // Store sync log
      const syncLog = {
        teamName,
        memberCount: members.length,
        timestamp: new Date().toISOString(),
        tabUrl: tab.url,
        success: true,
        teamId: data.teamId
      };
      
      chrome.storage.local.get(['syncLogs'], (result) => {
        const logs = result.syncLogs || [];
        logs.unshift(syncLog);
        chrome.storage.local.set({
          lastSync: syncLog,
          syncLogs: logs.slice(0, 50)
        });
      });
      
      // Clear badge after 10 seconds
      setTimeout(() => {
        chrome.action.setBadgeText({ text: '' });
      }, 10000);
      
    } else {
      throw new Error(data.error || 'Sync returned success: false');
    }
    
  } catch (error) {
    console.error('[Background] ✗ SYNC FAILED:', error.message);
    console.error('[Background] Full error:', error);
    
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
    
    // Store error log
    const errorLog = {
      error: error.message,
      timestamp: new Date().toISOString(),
      tabUrl: tab.url,
      success: false
    };
    
    chrome.storage.local.get(['syncLogs'], (result) => {
      const logs = result.syncLogs || [];
      logs.unshift(errorLog);
      chrome.storage.local.set({
        lastError: errorLog,
        syncLogs: logs.slice(0, 50)
      });
    });
    
    // Remove from synced tabs to allow retry
    syncedTabs.delete(tabKey);
  }
}

// Clean up synced tabs when closed
chrome.tabs.onRemoved.addListener((tabId) => {
  for (const key of syncedTabs) {
    if (key.startsWith(`${tabId}-`)) {
      syncedTabs.delete(key);
    }
  }
});

// Function to extract team data from the page (injected into the tab)
function extractTeamData() {
  console.log('[Injected] ========================================');
  console.log('[Injected] Starting data extraction');
  console.log('[Injected] URL:', window.location.href);
  console.log('[Injected] ========================================');
  
  // Try to get team name from page
  let teamName = '';
  
  // Method 1: Look for team name in headings
  const headings = document.querySelectorAll('h1, h2, [class*="title"], [class*="heading"]');
  console.log('[Injected] Found', headings.length, 'heading elements');
  
  for (const heading of headings) {
    const text = heading.textContent?.trim();
    if (text && text.length > 0 && text.length < 100 && !text.toLowerCase().includes('member')) {
      teamName = text;
      console.log('[Injected] Found team name in heading:', teamName);
      break;
    }
  }
  
  // Method 2: Extract from URL
  if (!teamName) {
    const urlMatch = window.location.pathname.match(/\/admin\/([^\/]+)\//);
    if (urlMatch) {
      teamName = decodeURIComponent(urlMatch[1]).replace(/-/g, ' ');
      console.log('[Injected] Found team name in URL:', teamName);
    }
  }
  
  // Method 3: Look for workspace name in breadcrumbs
  if (!teamName) {
    const breadcrumbs = document.querySelectorAll('[class*="breadcrumb"] a, nav a');
    for (const crumb of breadcrumbs) {
      const text = crumb.textContent?.trim();
      if (text && text.length > 0 && text.length < 50) {
        teamName = text;
        console.log('[Injected] Found team name in breadcrumb:', teamName);
        break;
      }
    }
  }
  
  // Method 4: Use a default if nothing found
  if (!teamName) {
    teamName = 'Unknown Team';
    console.log('[Injected] Using default team name');
  }
  
  console.log('[Injected] Final team name:', teamName);
  
  // Extract member information
  const members = [];
  
  // Try multiple selectors
  const selectors = [
    'table tbody tr',
    '[class*="member"]',
    '[class*="user-row"]',
    '[role="row"]',
    '[class*="list-item"]'
  ];
  
  let memberElements = [];
  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      memberElements = Array.from(elements);
      console.log('[Injected] Found', elements.length, 'elements with selector:', selector);
      break;
    }
  }
  
  // Fallback: search for emails in entire page
  if (memberElements.length === 0) {
    console.log('[Injected] No structured elements, searching page text for emails...');
    const pageText = document.body.innerText;
    const emailRegex = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
    const emails = pageText.match(emailRegex) || [];
    console.log('[Injected] Found', emails.length, 'emails in page text');
    
    for (const email of emails) {
      if (email.includes('openai.com') || email.includes('chatgpt.com')) continue;
      
      const name = email.split('@')[0]
        .replace(/[._-]/g, ' ')
        .split(' ')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
      
      members.push({
        email: email.toLowerCase(),
        name,
        role: 'Member'
      });
    }
  } else {
    // Extract from structured elements
    for (const element of memberElements) {
      const text = element.textContent || '';
      
      const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      if (!emailMatch) continue;
      
      const email = emailMatch[0].toLowerCase();
      if (email.includes('openai.com') || email.includes('chatgpt.com')) continue;
      
      let name = '';
      const nameElement = element.querySelector('[class*="name"], [class*="user"] span, td:first-child');
      if (nameElement) {
        name = nameElement.textContent?.trim() || '';
      }
      
      if (!name || name === email) {
        name = email.split('@')[0]
          .replace(/[._-]/g, ' ')
          .split(' ')
          .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
          .join(' ');
      }
      
      let role = 'Member';
      const roleMatch = text.match(/\b(owner|admin|member)\b/i);
      if (roleMatch) {
        role = roleMatch[1].charAt(0).toUpperCase() + roleMatch[1].slice(1).toLowerCase();
      }
      
      members.push({ email, name, role });
    }
  }
  
  // Remove duplicates
  const uniqueMembers = members.filter((member, index, self) =>
    index === self.findIndex(m => m.email === member.email)
  );
  
  console.log('[Injected] ----------------------------------------');
  console.log('[Injected] Extraction complete');
  console.log('[Injected] Team:', teamName);
  console.log('[Injected] Members:', uniqueMembers.length);
  console.log('[Injected] Data:', JSON.stringify(uniqueMembers, null, 2));
  console.log('[Injected] ----------------------------------------');
  
  return {
    teamName,
    members: uniqueMembers
  };
}
