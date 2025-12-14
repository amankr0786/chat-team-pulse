// Background service worker for automatic team sync
const SUPABASE_URL = 'https://cpmtbnsujfdumwdmsdrc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwbXRibnN1amZkdW13ZG1zZHJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU0NzY5MTUsImV4cCI6MjA4MTA1MjkxNX0.cScM225BLKI760VUscW4r5a_LuWjEffo95125eCd1Ss';

// Pattern to match ChatGPT admin members page (both /admin/members and /admin/*/members)
const ADMIN_MEMBERS_PATTERN = /^https:\/\/chatgpt\.com\/admin\/(members|[^\/]+\/members)/;

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

// Helper function for sleep
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Extract workspace info from https://chatgpt.com/admin
function extractAdminWorkspaceData() {
  console.log('[Injected-Admin] === extractAdminWorkspaceData ===');
  console.log('[Injected-Admin] URL:', window.location.href);

  let workspaceId = null;
  let organizationId = null;
  let teamName = '';

  // 1) Try Next.js __NEXT_DATA__ JSON
  const nextEl = document.querySelector('script#__NEXT_DATA__');
  if (nextEl && nextEl.textContent) {
    try {
      const data = JSON.parse(nextEl.textContent);

      const seen = new Set();
      function walk(obj) {
        if (!obj || typeof obj !== 'object' || seen.has(obj)) return;
        seen.add(obj);

        if ('workspaceId' in obj && obj.workspaceId) {
          workspaceId = String(obj.workspaceId);
        }
        if ('workspace_id' in obj && obj.workspace_id) {
          workspaceId = String(obj.workspace_id);
        }
        if ('organizationId' in obj && obj.organizationId) {
          organizationId = String(obj.organizationId);
        }
        if ('organization_id' in obj && obj.organization_id) {
          organizationId = String(obj.organization_id);
        }
        if (!teamName) {
          if ('workspaceName' in obj && obj.workspaceName) {
            teamName = String(obj.workspaceName);
          } else if ('teamName' in obj && obj.teamName) {
            teamName = String(obj.teamName);
          } else if ('organizationName' in obj && obj.organizationName) {
            teamName = String(obj.organizationName);
          }
        }

        for (const v of Object.values(obj)) {
          if (v && typeof v === 'object') walk(v);
        }
      }

      walk(data);
    } catch (e) {
      console.log('[Injected-Admin] Failed to parse __NEXT_DATA__:', e);
    }
  }

  // 2) Fallback: visible heading in sidebar/admin UI
  function normalize(s) {
    return (s || '').replace(/\s+/g, ' ').trim();
  }

  if (!teamName) {
    const root =
      document.querySelector('aside') ||
      document.querySelector('[role="navigation"]') ||
      document.body;

    const UI_BLACKLIST = new Set([
      'Back to chat',
      'General',
      'Members',
      'Permissions & roles',
      'Billing',
      'GPTs',
      'Apps & Connectors',
      'Groups',
      'User analytics',
      'Identity & access',
      'Invite member',
      'Account type',
      'Date added',
      'Name',
    ]);

    const els = Array.from(root.querySelectorAll('h1,h2,h3,div,span,p,a,button'))
      .slice(0, 1200);

    let best = { text: '', score: -1 };

    for (const el of els) {
      const text = normalize(el.textContent);
      if (!text) continue;
      if (text.length < 2 || text.length > 60) continue;
      if (UI_BLACKLIST.has(text)) continue;
      if (/members?/i.test(text)) continue;
      if (/chatgpt|openai/i.test(text)) continue;

      const r = el.getBoundingClientRect?.() || { top: 9999, left: 9999 };
      let score = 0;
      const tag = (el.tagName || '').toLowerCase();
      if (tag === 'h1') score += 80;
      if (tag === 'h2') score += 60;
      if (tag === 'h3') score += 40;

      const fs = parseFloat(getComputedStyle(el).fontSize || '0');
      score += Math.min(40, fs);
      score += Math.max(0, 400 - r.top) / 8;
      score += Math.max(0, 400 - r.left) / 8;

      if (score > best.score) best = { text, score };
    }

    teamName = best.text || teamName;
  }

  console.log('[Injected-Admin] teamName:', teamName);
  console.log('[Injected-Admin] workspaceId:', workspaceId);
  console.log('[Injected-Admin] organizationId:', organizationId);

  return { teamName, workspaceId, organizationId };
}

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
  const tabs = await chrome.tabs.query({});
  console.log('[Background] Checking', tabs.length, 'tabs for admin pages');
  for (const tab of tabs) {
    if (tab.url && ADMIN_MEMBERS_PATTERN.test(tab.url)) {
      console.log('[Background] Found admin tab:', tab.url);
      await handleTabSync(tab.id, tab);
    }
  }
});

// Also check on install/update
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Background] Extension installed/updated:', details.reason);
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.url && ADMIN_MEMBERS_PATTERN.test(tab.url)) {
      console.log('[Background] Found admin tab on install:', tab.url);
      await handleTabSync(tab.id, tab);
    }
  }
});

// Main sync handler function - two-step workflow: /admin -> /admin/members
async function handleTabSync(tabId, tab) {
  const tabKey = `${tabId}-${tab.url}`;

  // Avoid duplicate syncs
  if (syncedTabs.has(tabKey)) {
    console.log('[Background] Tab already synced, skipping:', tabKey);
    return;
  }

  console.log('[Background] ========================================');
  console.log('[Background] Starting sync for tab:', tabId);
  console.log('[Background] Initial URL:', tab.url);
  console.log('[Background] Time:', new Date().toISOString());
  console.log('[Background] ========================================');

  syncedTabs.add(tabKey);

  try {
    chrome.action.setBadgeText({ text: '...' });
    chrome.action.setBadgeBackgroundColor({ color: '#FFA500' });

    // 1) Go to /admin and extract workspace/org/teamName
    console.log('[Background] Navigating to /admin for workspace info...');
    await chrome.tabs.update(tabId, { url: 'https://chatgpt.com/admin' });
    await sleep(10000); // wait 10 seconds

    const adminResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractAdminWorkspaceData,
    });

    if (!adminResults || !adminResults[0] || !adminResults[0].result) {
      throw new Error('Failed to extract workspace info from /admin');
    }

    const adminInfo = adminResults[0].result;
    console.log('[Background] Admin info:', adminInfo);

    if (!adminInfo.teamName && !adminInfo.workspaceId) {
      console.warn('[Background] No teamName/workspaceId from /admin, will still continue with members');
    }

    // 2) Go to /admin/members and extract members (we ignore its teamName)
    console.log('[Background] Navigating to /admin/members for members...');
    await chrome.tabs.update(tabId, { url: 'https://chatgpt.com/admin/members' });
    await sleep(10000); // wait 10 seconds

    console.log('[Background] Extracting team members...');
    const memberResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractTeamData, // existing v2 extractor
    });

    if (!memberResults || !memberResults[0] || !memberResults[0].result) {
      throw new Error('Failed to extract team members from /admin/members');
    }

    const membersResult = memberResults[0].result;
    const members = membersResult.members || [];

    console.log('[Background] Members extracted:', members.length);
    if (members.length === 0) {
      throw new Error('No members found on members page');
    }

    // Determine owner email from members
    const owner = members.find((m) => m.role === 'owner' || m.role === 'Owner');
    const ownerEmail = owner?.email || null;

    const teamName =
      adminInfo.teamName ||
      membersResult.teamName || // fallback only
      'Unknown Team';

    const payload = {
      teamName,
      workspaceId: adminInfo.workspaceId || null,
      organizationId: adminInfo.organizationId || null,
      ownerEmail,
      members,
    };

    console.log('[Background] Payload to sync-team:', JSON.stringify(payload, null, 2));

    const response = await fetch(`${SUPABASE_URL}/functions/v1/sync-team`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(payload),
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

    if (!data.success) {
      throw new Error(data.error || 'Sync returned success: false');
    }

    console.log('[Background] ✓ SYNC SUCCESSFUL!');
    console.log('[Background] Team ID:', data.teamId);
    console.log('[Background] Member count:', data.memberCount);

    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#22C55E' });

    const syncLog = {
      teamName,
      memberCount: members.length,
      timestamp: new Date().toISOString(),
      tabUrl: 'https://chatgpt.com/admin/members',
      success: true,
      teamId: data.teamId,
      workspaceId: adminInfo.workspaceId || null,
      organizationId: adminInfo.organizationId || null,
      ownerEmail,
    };

    chrome.storage.local.get(['syncLogs'], (result) => {
      const logs = result.syncLogs || [];
      logs.unshift(syncLog);
      chrome.storage.local.set({
        lastSync: syncLog,
        syncLogs: logs.slice(0, 50),
      });
    });

    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 10000);
  } catch (error) {
    console.error('[Background] ✗ SYNC FAILED:', error.message);
    console.error('[Background] Full error:', error);

    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });

    const errorLog = {
      error: error.message,
      timestamp: new Date().toISOString(),
      tabUrl: tab.url,
      success: false,
    };

    chrome.storage.local.get(['syncLogs'], (result) => {
      const logs = result.syncLogs || [];
      logs.unshift(errorLog);
      chrome.storage.local.set({
        lastError: errorLog,
        syncLogs: logs.slice(0, 50),
      });
    });

    // Allow retry next time
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
        role: 'Member',
        joined_at: null
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
      
      // Extract joined_at date
      let joined_at = null;
      const dateMatch = text.match(/(\w{3}\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        const d = new Date(dateMatch[1]);
        if (!Number.isNaN(d.getTime())) {
          // Store as date-only UTC midnight to prevent timezone drift
          const y = d.getFullYear();
          const m = d.getMonth();
          const day = d.getDate();
          joined_at = new Date(Date.UTC(y, m, day)).toISOString();
        }
      }
      
      members.push({ email, name, role, joined_at });
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
