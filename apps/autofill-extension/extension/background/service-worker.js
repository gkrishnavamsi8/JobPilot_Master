/**
 * Background service worker — relays messages and can prefetch candidate data later.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'PING') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return false;
  }
  return false;
});
