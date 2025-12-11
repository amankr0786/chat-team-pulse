const API_URL = 'https://cpmtbnsujfdumwdmsdrc.supabase.co/functions/v1/sync-team';

const statusEl = document.getElementById('status');
const syncBtn = document.getElementById('syncBtn');
const teamNameInput = document.getElementById('teamName');
const membersPreview = document.getElementById('membersPreview');

function setStatus(message, type = 'info') {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function showMembers(members) {
  if (members.length === 0) {
    membersPreview.style.display = 'none';
    return;
  }
  
  membersPreview.innerHTML = members.map(m => `
    <div class="member-item">
      <span class="member-name">${m.name || 'Unknown'}</span>
      <span class="member-role">${m.role}</span>
      <div class="member-email">${m.email}</div>
    </div>
  `).join('');
  membersPreview.style.display = 'block';
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
      // Extract team name from page
      const teamNameEl = document.querySelector('[class*="workspace-name"]') || 
                         document.querySelector('h1') ||
                         document.querySelector('[data-testid="workspace-name"]');
      const pageTeamName = teamNameEl?.textContent?.trim() || '';
      
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
          // Try to extract name (usually before email or in a specific cell)
          const cells = row.querySelectorAll('td, [role="cell"]');
          let name = '';
          let role = 'member';
          
          cells.forEach(cell => {
            const cellText = cell.innerText.trim();
            if (!cellText.includes('@') && cellText.length > 0 && cellText.length < 50 && !name) {
              name = cellText;
            }
            if (cellText.toLowerCase().includes('owner') || cellText.toLowerCase().includes('admin')) {
              role = cellText.toLowerCase().includes('owner') ? 'owner' : 'admin';
            }
          });
          
          // Check if this email is already added
          if (!members.find(m => m.email === email)) {
            members.push({
              email,
              name: name || email.split('@')[0],
              role
            });
          }
        }
      });
      
      // Method 2: If no rows found, use email list
      if (members.length === 0 && emails.length > 0) {
        emails.forEach(email => {
          // Try to find surrounding text for name
          const surrounding = pageText.split(email);
          let name = '';
          
          // Look for initials or name before email
          if (surrounding[0]) {
            const words = surrounding[0].trim().split(/\s+/);
            const lastWord = words[words.length - 1];
            if (lastWord && lastWord.length <= 30 && !lastWord.includes('@')) {
              name = lastWord;
            }
          }
          
          // Determine role from surrounding text
          let role = 'member';
          const context = (surrounding[0]?.slice(-100) || '') + email + (surrounding[1]?.slice(0, 100) || '');
          if (context.toLowerCase().includes('owner')) role = 'owner';
          else if (context.toLowerCase().includes('admin')) role = 'admin';
          
          members.push({
            email,
            name: name || email.split('@')[0],
            role
          });
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

syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true;
  setStatus('Scanning page...', 'info');
  
  try {
    const data = await scanPage();
    
    if (!data) {
      syncBtn.disabled = false;
      return;
    }
    
    if (data.members.length === 0) {
      setStatus('No members found. Make sure you are on the Members page.', 'error');
      syncBtn.disabled = false;
      return;
    }
    
    showMembers(data.members);
    
    // Use custom team name or detected name or default
    const teamName = teamNameInput.value.trim() || 
                     data.pageTeamName || 
                     `ChatGPT Team ${new Date().toISOString().split('T')[0]}`;
    
    teamNameInput.value = teamName;
    
    setStatus(`Found ${data.members.length} members. Syncing...`, 'info');
    
    const result = await syncToServer(teamName, data.members);
    
    setStatus(`✓ Synced ${data.members.length} members to "${teamName}"`, 'success');
    
  } catch (error) {
    console.error('Sync error:', error);
    setStatus(`Error: ${error.message}`, 'error');
  }
  
  syncBtn.disabled = false;
});

// Auto-scan when popup opens
scanPage().then(data => {
  if (data?.members?.length > 0) {
    showMembers(data.members);
    if (data.pageTeamName) {
      teamNameInput.value = data.pageTeamName;
    }
    setStatus(`Found ${data.members.length} members. Click Sync to upload.`, 'info');
  }
}).catch(() => {});
