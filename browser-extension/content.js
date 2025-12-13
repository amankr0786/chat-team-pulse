// Content script that runs on ChatGPT admin members page
// Uses MutationObserver with aggressive retries to ensure sync triggers

console.log('[Content Script] ========================================');
console.log('[Content Script] Loaded at:', new Date().toISOString());
console.log('[Content Script] URL:', window.location.href);
console.log('[Content Script] ========================================');

let syncTriggered = false;
let retryCount = 0;
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

// Start immediately
init();

function init() {
  console.log('[Content Script] Initializing...');
  
  // First, ping the background to ensure it's awake
  chrome.runtime.sendMessage({ type: 'ping' }, (response) => {
    if (chrome.runtime.lastError) {
      console.log('[Content Script] Background not responding, will retry...');
      setTimeout(init, 1000);
      return;
    }
    console.log('[Content Script] Background is awake:', response);
    waitForMembersAndSync();
  });
}

function waitForMembersAndSync() {
  console.log('[Content Script] Waiting for member data to load...');
  
  // Check if members are already visible
  const memberCheck = checkForMembers();
  if (memberCheck.found) {
    console.log('[Content Script] Members already visible:', memberCheck.details);
    triggerSyncWithRetry();
    return;
  }
  
  console.log('[Content Script] Members not found yet, setting up observer...');
  
  // Set up MutationObserver to watch for member data
  const observer = new MutationObserver((mutations, obs) => {
    if (syncTriggered) {
      obs.disconnect();
      return;
    }
    
    const memberCheck = checkForMembers();
    if (memberCheck.found) {
      console.log('[Content Script] Members loaded via MutationObserver:', memberCheck.details);
      obs.disconnect();
      triggerSyncWithRetry();
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
  
  // Fallback: trigger sync after 10 seconds regardless
  setTimeout(() => {
    if (!syncTriggered) {
      console.log('[Content Script] Fallback timeout (10s) reached, triggering sync...');
      observer.disconnect();
      triggerSyncWithRetry();
    }
  }, 10000);
  
  // Second fallback at 15 seconds
  setTimeout(() => {
    if (!syncTriggered) {
      console.log('[Content Script] Second fallback timeout (15s) reached, forcing sync...');
      observer.disconnect();
      triggerSyncWithRetry();
    }
  }, 15000);
}

function checkForMembers() {
  const pageText = document.body.innerText || '';
  
  // Check for email patterns (most reliable indicator)
  const emailPattern = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
  const emails = pageText.match(emailPattern) || [];
  
  // Filter out system emails
  const memberEmails = emails.filter(email => 
    !email.includes('openai.com') && 
    !email.includes('chatgpt.com') &&
    !email.includes('example.com')
  );
  
  if (memberEmails.length > 0) {
    return {
      found: true,
      details: `Found ${memberEmails.length} member emails: ${memberEmails.slice(0, 3).join(', ')}${memberEmails.length > 3 ? '...' : ''}`
    };
  }
  
  // Also check for table rows or member list elements
  const memberElements = document.querySelectorAll('table tbody tr, [class*="member"], [role="row"]');
  const filteredElements = Array.from(memberElements).filter(el => {
    const text = el.textContent || '';
    return text.includes('@') && !text.includes('openai.com');
  });
  
  if (filteredElements.length > 0) {
    return {
      found: true,
      details: `Found ${filteredElements.length} member elements in DOM`
    };
  }
  
  return {
    found: false,
    details: `No members found. Page text length: ${pageText.length}, Total emails: ${emails.length}`
  };
}

function triggerSyncWithRetry() {
  if (syncTriggered && retryCount === 0) {
    console.log('[Content Script] Sync already triggered successfully, skipping');
    return;
  }
  
  retryCount++;
  console.log(`[Content Script] Triggering sync (attempt ${retryCount}/${MAX_RETRIES})...`);
  
  chrome.runtime.sendMessage({ type: 'triggerSync' }, (response) => {
    if (chrome.runtime.lastError) {
      console.log('[Content Script] Error sending message:', chrome.runtime.lastError.message);
      
      if (retryCount < MAX_RETRIES) {
        console.log(`[Content Script] Will retry in ${RETRY_DELAY_MS}ms...`);
        setTimeout(triggerSyncWithRetry, RETRY_DELAY_MS);
      } else {
        console.log('[Content Script] Max retries reached, giving up');
        showSyncStatus('error', 'Sync failed after max retries');
      }
      return;
    }
    
    console.log('[Content Script] Sync triggered successfully:', response);
    syncTriggered = true;
    showSyncStatus('success', 'Sync triggered');
  });
}

function showSyncStatus(status, message) {
  // Create a visual indicator on the page
  const existingIndicator = document.getElementById('chatgpt-sync-indicator');
  if (existingIndicator) {
    existingIndicator.remove();
  }
  
  const indicator = document.createElement('div');
  indicator.id = 'chatgpt-sync-indicator';
  indicator.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 8px;
    font-family: system-ui, sans-serif;
    font-size: 14px;
    font-weight: 500;
    z-index: 999999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    transition: opacity 0.3s ease;
    ${status === 'success' ? 'background: #22c55e; color: white;' : 'background: #ef4444; color: white;'}
  `;
  indicator.textContent = message;
  document.body.appendChild(indicator);
  
  // Remove after 5 seconds
  setTimeout(() => {
    indicator.style.opacity = '0';
    setTimeout(() => indicator.remove(), 300);
  }, 5000);
}

// Also listen for page visibility changes to re-trigger if needed
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !syncTriggered) {
    console.log('[Content Script] Page became visible, checking for members...');
    setTimeout(waitForMembersAndSync, 1000);
  }
});

console.log('[Content Script] Setup complete, waiting for members...');
