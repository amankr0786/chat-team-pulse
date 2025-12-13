// Background service worker for automatic team sync
const SUPABASE_URL = 'https://cpmtbnsujfdumwdmsdrc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwbXRibnN1amZkdW13ZG1zZHJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0NzY5MTUsImV4cCI6MjA4MTA1MjkxNX0.cScM225BLKI760VUscW4r5a_LuWjEffo95125eCd1Ss';

// Pattern to match ChatGPT admin members page
const ADMIN_MEMBERS_PATTERN = /^https:\/\/chatgpt\.com\/admin\/[^\/]+\/members/;

// Track tabs that have been synced to avoid duplicate syncs
const syncedTabs = new Set();

console.log('[Background] Service worker initialized at', new Date().toISOString());

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ping') {
    console.log('[Background] Received ping from popup');
    sendResponse({ status: 'ok', timestamp: new Date().toISOString() });
  }
  return true;
});

// Listen for tab updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only proceed when the page has finished loading
  if (changeInfo.status !== 'complete') return;
  
  // Check if we're on a ChatGPT admin members page
  if (!tab.url || !ADMIN_MEMBERS_PATTERN.test(tab.url)) return;
  
  // Avoid duplicate syncs for the same tab
  const tabKey = `${tabId}-${tab.url}`;
  if (syncedTabs.has(tabKey)) {
    console.log('[Background] Tab already synced, skipping:', tabKey);
    return;
  }
  
  console.log('[Background] Detected admin members page:', tab.url);
  syncedTabs.add(tabKey);
  
  // Wait a bit for the page to fully render
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  try {
    // Update badge to show syncing
    chrome.action.setBadgeText({ text: '...' });
    chrome.action.setBadgeBackgroundColor({ color: '#FFA500' });
    
    console.log('[Background] Starting auto-sync for tab:', tabId);
    
    // Extract team data from the page
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractTeamData
    });
    
    if (!results || !results[0] || !results[0].result) {
      throw new Error('Failed to extract team data from page');
    }
    
    const { teamName, members } = results[0].result;
    
    console.log('[Background] Extracted data:', { teamName, memberCount: members.length });
    console.log('[Background] Members:', JSON.stringify(members, null, 2));
    
    if (!teamName) {
      throw new Error('Could not detect team name');
    }
    
    if (members.length === 0) {
      throw new Error('No members found on page');
    }
    
    // Send to Supabase edge function
    console.log('[Background] Sending data to sync-team edge function...');
    
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
      throw new Error(`Sync failed: ${response.status} - ${responseText}`);
    }
    
    const data = JSON.parse(responseText);
    
    if (data.success) {
      console.log('[Background] Sync successful!', data);
      chrome.action.setBadgeText({ text: '✓' });
      chrome.action.setBadgeBackgroundColor({ color: '#22C55E' });
      
      // Store last sync info
      chrome.storage.local.set({
        lastSync: {
          teamName,
          memberCount: members.length,
          timestamp: new Date().toISOString(),
          tabUrl: tab.url
        }
      });
      
      // Clear badge after 5 seconds
      setTimeout(() => {
        chrome.action.setBadgeText({ text: '' });
      }, 5000);
    } else {
      throw new Error(data.error || 'Unknown sync error');
    }
    
  } catch (error) {
    console.error('[Background] Auto-sync error:', error);
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
    
    // Store error info
    chrome.storage.local.set({
      lastError: {
        message: error.message,
        timestamp: new Date().toISOString(),
        tabUrl: tab.url
      }
    });
  }
});

// Clean up synced tabs when they're closed
chrome.tabs.onRemoved.addListener((tabId) => {
  // Remove all entries for this tab
  for (const key of syncedTabs) {
    if (key.startsWith(`${tabId}-`)) {
      syncedTabs.delete(key);
    }
  }
});

// Function to extract team data from the page (injected into the tab)
function extractTeamData() {
  console.log('[Content] Extracting team data from page...');
  
  // Try to get team name from page title or heading
  let teamName = '';
  
  // Method 1: Look for team name in the page heading
  const headings = document.querySelectorAll('h1, h2, [class*="title"], [class*="heading"]');
  for (const heading of headings) {
    const text = heading.textContent?.trim();
    if (text && text.length > 0 && text.length < 100 && !text.toLowerCase().includes('member')) {
      teamName = text;
      break;
    }
  }
  
  // Method 2: Extract from URL if heading not found
  if (!teamName) {
    const urlMatch = window.location.pathname.match(/\/admin\/([^\/]+)\//);
    if (urlMatch) {
      teamName = decodeURIComponent(urlMatch[1]).replace(/-/g, ' ');
    }
  }
  
  // Method 3: Look for workspace name in breadcrumbs or nav
  if (!teamName) {
    const breadcrumbs = document.querySelectorAll('[class*="breadcrumb"] a, nav a');
    for (const crumb of breadcrumbs) {
      const text = crumb.textContent?.trim();
      if (text && text.length > 0 && text.length < 50) {
        teamName = text;
        break;
      }
    }
  }
  
  console.log('[Content] Detected team name:', teamName);
  
  // Extract member information
  const members = [];
  
  // Look for member rows in the page
  // Try multiple selectors to find member elements
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
      console.log('[Content] Found members using selector:', selector, 'Count:', elements.length);
      break;
    }
  }
  
  // If no structured elements found, look for email patterns in the entire page
  if (memberElements.length === 0) {
    console.log('[Content] No structured member elements found, searching for emails in page text...');
    const pageText = document.body.innerText;
    const emailRegex = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
    const emails = pageText.match(emailRegex) || [];
    
    for (const email of emails) {
      // Skip common non-member emails
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
      
      // Find email in the element
      const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      if (!emailMatch) continue;
      
      const email = emailMatch[0].toLowerCase();
      
      // Skip header rows or non-member rows
      if (email.includes('openai.com') || email.includes('chatgpt.com')) continue;
      
      // Try to extract name
      let name = '';
      const nameElement = element.querySelector('[class*="name"], [class*="user"] span, td:first-child');
      if (nameElement) {
        name = nameElement.textContent?.trim() || '';
      }
      
      // If no name found, derive from email
      if (!name || name === email) {
        name = email.split('@')[0]
          .replace(/[._-]/g, ' ')
          .split(' ')
          .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
          .join(' ');
      }
      
      // Try to extract role
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
  
  console.log('[Content] Extracted members:', uniqueMembers);
  
  return {
    teamName,
    members: uniqueMembers
  };
}
