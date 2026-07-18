import { runFillEngine } from '../../scraper/src/fill-engine/index.ts';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'PING') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return false;
  }

  if (message?.type !== 'AUTOFILL') {
    return false;
  }

  (async () => {
    try {
      const summary = await runFillEngine(document, message.candidateData, {
        onLog: (msg, detail) => console.log('[JobPilot]', msg, detail ?? ''),
      });

      sendResponse({ ok: true, summary });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();

  return true;
});

console.log('[JobPilot] Content script ready on', window.location.hostname);
