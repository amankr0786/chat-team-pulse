// Content script that runs on ChatGPT admin members page
// Uses MutationObserver to wait for member data to load before triggering sync

console.log('[Content Script] Loaded on:', window.location.href);

let syncTriggered = false;

// Wait for page to be fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', waitForMembersAndSync);
} else {
  waitForMembersAndSync();
}

function waitForMembersAndSync() {
  console.log('[Content Script] Waiting for member data to load...');
  
  // Check if members are already visible
  if (checkForMembers()) {
    console.log('[Content Script] Members already visible, triggering sync...');
    triggerSync();
    return;
  }
  
  // Set up MutationObserver to watch for member data
  const observer = new MutationObserver((mutations, obs) => {
    if (syncTriggered) {
      obs.disconnect();
      return;
    }
    
    if (checkForMembers()) {
      console.log('[Content Script] Members loaded via MutationObserver, triggering sync...');
      obs.disconnect();
      triggerSync();
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Fallback: trigger sync after 8 seconds regardless
  setTimeout(() => {
    if (!syncTriggered) {
      console.log('[Content Script] Fallback timeout reached, triggering sync...');
      observer.disconnect();
      triggerSync();
    }
  }, 8000);
}

function checkForMembers() {
  // Look for common patterns that indicate member data is loaded
  const pageText = document.body.innerText || '';
  
  // Check for email patterns (most reliable indicator)
  const emailPattern = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
  const emails = pageText.match(emailPattern) || [];
  
  // Filter out system emails
  const memberEmails = emails.filter(email => 
    !email.includes('openai.com') && 
    !email.includes('chatgpt.com')
  );
  
  if (memberEmails.length > 0) {
    console.log('[Content Script] Found', memberEmails.length, 'member emails on page');
    return true;
  }
  
  // Also check for table rows or member list elements
  const memberElements = document.querySelectorAll('table tbody tr, [class*="member"], [role="row"]');
  if (memberElements.length > 1) { // More than just header row
    console.log('[Content Script] Found', memberElements.length, 'member elements on page');
    return true;
  }
  
  return false;
}

function triggerSync() {
  if (syncTriggered) {
    console.log('[Content Script] Sync already triggered, skipping');
    return;
  }
  
  syncTriggered = true;
  console.log('[Content Script] Notifying background to trigger sync...');
  
  chrome.runtime.sendMessage({ type: 'triggerSync' }, (response) => {
    if (chrome.runtime.lastError) {
      console.log('[Content Script] Error sending message:', chrome.runtime.lastError.message);
      // Reset flag to allow retry
      syncTriggered = false;
    } else {
      console.log('[Content Script] Background response:', response);
    }
  });
}
