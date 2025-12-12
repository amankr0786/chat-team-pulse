const API_URL = 'https://cpmtbnsujfdumwdmsdrc.supabase.co/functions/v1/sync-team';

const statusEl = document.getElementById('status');
const syncBtn = document.getElementById('syncBtn');
const teamNameInput = document.getElementById('teamName');
const membersPreview = document.getElementById('membersPreview');
const autoSyncToggle = document.getElementById('autoSyncToggle');
const autoCloseToggle = document.getElementById('autoCloseToggle');

// Load saved settings
chrome.storage.local.get(['autoSync', 'autoClose'], (result) => {
  if (autoSyncToggle) autoSyncToggle.checked = result.autoSync || false;
  if (autoCloseToggle) autoCloseToggle.checked = result.autoClose || false;
});

// Save settings when changed
if (autoSyncToggle) {
  autoSyncToggle.addEventListener('change', () => {
    chrome.storage.local.set({ autoSync: autoSyncToggle.checked });
  });
}

if (autoCloseToggle) {
  autoCloseToggle.addEventListener('change', () => {
    chrome.storage.local.set({ autoClose: autoCloseToggle.checked });
  });
}

function setStatus(message, type = 'info') {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function capitalizeRole(role) {
  if (!role) return 'Member';
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

function showMembers(members) {
  if (members.length === 0) {
    membersPreview.style.display = 'none';
    return;
  }
  
  membersPreview.innerHTML = members.map(m => `
    <div class="member-item">
      <span class="member-name">${m.name || 'Unknown'}</span>
      <span class="member-role">${capitalizeRole(m.role)}</span>
      <div class="member-email">${m.email}</div>
    </div>
  `).join('');
  membersPreview.style.display = 'block';
}

function updateBadge(success) {
  chrome.action.setBadgeText({ text: success ? '✓' : '!' });
  chrome.action.setBadgeBackgroundColor({ color: success ? '#22c55e' : '#ef4444' });
  
  // Clear badge after 5 seconds
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
  }, 5000);
}

async function scanPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab.url?.includes('chatgpt.com/admin')) {
    setStatus('Please navigate to ChatGPT Admin → Members page first.', 'warning');
    return null;
  }
  
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      // Extract team/workspace name from page - try multiple selectors
      let pageTeamName = '';
      
      // Method 1: Look for workspace name in navigation/header
      const navItems = document.querySelectorAll('nav a, [role="navigation"] a, header a');
      navItems.forEach(el => {
        const text = el.textContent?.trim();
        if (text && text.length > 2 && text.length < 50 && !text.includes('@') && 
            !['Settings', 'Members', 'Billing', 'Home', 'Admin', 'Workspaces'].includes(text)) {
          if (!pageTeamName) pageTeamName = text;
        }
      });
      
      // Method 2: Look for heading elements
      if (!pageTeamName) {
        const headings = document.querySelectorAll('h1, h2, [class*="title"], [class*="workspace"]');
        headings.forEach(el => {
          const text = el.textContent?.trim();
          if (text && text.length > 2 && text.length < 50 && !text.includes('@') &&
              !text.toLowerCase().includes('member') && !text.toLowerCase().includes('setting')) {
            if (!pageTeamName) pageTeamName = text;
          }
        });
      }
      
      // Method 3: Look in page title
      if (!pageTeamName && document.title) {
        const titleParts = document.title.split(/[|\-–—]/);
        if (titleParts.length > 1) {
          const potentialName = titleParts[0].trim();
          if (potentialName.length > 2 && potentialName.length < 50) {
            pageTeamName = potentialName;
          }
        }
      }
      
      // Find all email elements on the page
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const pageText = document.body.innerText;
      const emails = [...new Set(pageText.match(emailRegex) || [])];
      
      // Try to get member details from table rows or list items
      const members = [];
      
      // Method 1: Look for table rows with member data
      const rows = document.querySelectorAll('tr, [role="row"]');
      rows.forEach(row => {
        const text = row.innerText;
        const emailMatch = text.match(emailRegex);
        if (emailMatch) {
          const email = emailMatch[0];
          const cells = row.querySelectorAll('td, [role="cell"], div');
          let name = '';
          let role = 'member';
          
          // Look for name in cells - typically the first non-email text
          cells.forEach(cell => {
            const cellText = cell.innerText?.trim();
            if (!cellText) return;
            
            // Skip if it contains email
            if (cellText.includes('@')) return;
            
            // Check for role indicators
            const lowerText = cellText.toLowerCase();
            if (lowerText === 'owner' || lowerText.includes('owner')) {
              role = 'owner';
            } else if (lowerText === 'admin' || lowerText.includes('admin')) {
              role = 'admin';
            }
            
            // Look for name - usually a cell with just a name (2-50 chars, no special keywords)
            if (!name && cellText.length >= 2 && cellText.length <= 50) {
              // Skip common non-name values
              const skipWords = ['owner', 'admin', 'member', 'pending', 'active', 'invited', 'edit', 'remove', 'delete'];
              if (!skipWords.some(w => lowerText === w || lowerText.includes(w))) {
                // Check if it looks like a name (contains letters, may have spaces)
                if (/^[a-zA-Z\s\-'.]+$/.test(cellText) || /^[\p{L}\s\-'.]+$/u.test(cellText)) {
                  name = cellText;
                }
              }
            }
          });
          
          // If no name found, try to extract from avatar/initials or use email prefix
          if (!name) {
            const avatarEl = row.querySelector('[class*="avatar"], [class*="initial"]');
            if (avatarEl) {
              const avatarText = avatarEl.textContent?.trim();
              if (avatarText && avatarText.length <= 3) {
                // These are initials, expand them from email if possible
                const emailParts = email.split('@')[0].split(/[._-]/);
                name = emailParts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
              }
            }
          }
          
          // Final fallback: derive name from email
          if (!name) {
            const emailPrefix = email.split('@')[0];
            // Convert email prefix to name format (john.doe -> John Doe)
            name = emailPrefix
              .split(/[._-]/)
              .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
              .join(' ');
          }
          
          // Check if this email is already added
          if (!members.find(m => m.email === email)) {
            members.push({ email, name, role });
          }
        }
      });
      
      // Method 2: If no rows found, use email list
      if (members.length === 0 && emails.length > 0) {
        emails.forEach(email => {
          // Determine role from surrounding text
          const surrounding = pageText.split(email);
          let role = 'member';
          const context = (surrounding[0]?.slice(-100) || '') + email + (surrounding[1]?.slice(0, 100) || '');
          if (context.toLowerCase().includes('owner')) role = 'owner';
          else if (context.toLowerCase().includes('admin')) role = 'admin';
          
          // Derive name from email
          const emailPrefix = email.split('@')[0];
          const name = emailPrefix
            .split(/[._-]/)
            .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
            .join(' ');
          
          members.push({ email, name, role });
        });
      }
      
      return { pageTeamName, members };
    }
  });
  
  return results[0]?.result;
}

async function syncToServer(teamName, members) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ teamName, members })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Server error: ${response.status} - ${errorText}`);
  }
  
  return response.json();
}

async function performSync(autoTriggered = false) {
  if (syncBtn) syncBtn.disabled = true;
  setStatus('Scanning page...', 'info');
  
  try {
    const data = await scanPage();
    
    if (!data) {
      if (syncBtn) syncBtn.disabled = false;
      updateBadge(false);
      return false;
    }
    
    if (data.members.length === 0) {
      setStatus('No members found. Make sure you are on the Members page.', 'error');
      if (syncBtn) syncBtn.disabled = false;
      updateBadge(false);
      return false;
    }
    
    showMembers(data.members);
    
    // Use custom team name if provided, otherwise use detected name
    const teamName = (teamNameInput?.value?.trim()) || data.pageTeamName || `Team ${new Date().toISOString().split('T')[0]}`;
    
    // Update input with the team name being used
    if (teamNameInput && !teamNameInput.value?.trim()) {
      teamNameInput.value = teamName;
    }
    
    setStatus(`Found ${data.members.length} members. Syncing...`, 'info');
    
    const result = await syncToServer(teamName, data.members);
    
    setStatus(`✓ Synced ${data.members.length} members to "${teamName}"`, 'success');
    updateBadge(true);
    
    // Check if auto-close is enabled
    const settings = await chrome.storage.local.get(['autoClose']);
    if (autoTriggered && settings.autoClose) {
      setTimeout(async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          chrome.tabs.remove(tab.id);
        }
      }, 2000); // Wait 2 seconds before closing
    }
    
    return true;
    
  } catch (error) {
    console.error('Sync error:', error);
    setStatus(`Error: ${error.message}`, 'error');
    updateBadge(false);
    return false;
  } finally {
    if (syncBtn) syncBtn.disabled = false;
  }
}

// Manual sync button click
if (syncBtn) {
  syncBtn.addEventListener('click', () => performSync(false));
}

// Auto-scan when popup opens
scanPage().then(data => {
  if (data) {
    // Always set team name if detected
    if (data.pageTeamName && teamNameInput) {
      teamNameInput.value = data.pageTeamName;
    }
    
    if (data.members?.length > 0) {
      showMembers(data.members);
      setStatus(`Found ${data.members.length} members. Click Sync to upload.`, 'info');
      
      // Check if auto-sync is enabled
      chrome.storage.local.get(['autoSync'], async (result) => {
        if (result.autoSync) {
          setStatus('Auto-sync enabled. Syncing...', 'info');
          await performSync(true);
        }
      });
    }
  }
}).catch(() => {});