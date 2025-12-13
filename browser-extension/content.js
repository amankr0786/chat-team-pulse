// Content script that runs on ChatGPT admin members page
// Acts as a fallback trigger for the background service worker

console.log('[Content Script] Loaded on:', window.location.href);

// Wait for page to be fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', notifyBackground);
} else {
  // Small delay to ensure background worker is ready
  setTimeout(notifyBackground, 1000);
}

function notifyBackground() {
  console.log('[Content Script] Notifying background to trigger sync...');
  
  chrome.runtime.sendMessage({ type: 'triggerSync' }, (response) => {
    if (chrome.runtime.lastError) {
      console.log('[Content Script] Error sending message:', chrome.runtime.lastError.message);
    } else {
      console.log('[Content Script] Background response:', response);
    }
  });
}
