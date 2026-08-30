/**
 * Background Service Worker for Manifest V3 Extension
 * Manages Offscreen Document lifecycle and screenshot perception dispatch.
 */

let offscreenDocumentCreated = false;

async function ensureOffscreenDocumentExists(): Promise<void> {
  if (offscreenDocumentCreated) return;

  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT]
  });

  if (existingContexts.length > 0) {
    offscreenDocumentCreated = true;
    return;
  }

  await chrome.offscreen.createDocument({
    url: 'extension/offscreen/offscreen.html',
    reasons: [chrome.offscreen.Reason.BLOBS, chrome.offscreen.Reason.DOM_PARSER],
    justification: 'Runs client-side visual perception models (OCR, BlazeFace) in WebAssembly context'
  });

  offscreenDocumentCreated = true;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CAPTURE_AND_PERCEIVE') {
    (async () => {
      try {
        await ensureOffscreenDocumentExists();
        
        // Capture active tab screenshot
        const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' });
        
        // Dispatch to offscreen document for local perception
        chrome.runtime.sendMessage({
          type: 'RUN_LOCAL_PERCEPTION',
          dataUrl,
          viewport: message.viewport,
          timestamp: Date.now()
        }, (response) => {
          sendResponse({ success: true, detections: response?.detections || [] });
        });

      } catch (error) {
        console.error('Error during local perception capture:', error);
        sendResponse({ success: false, error: String(error) });
      }
    })();

    return true; // Keep message channel open for async response
  }
});
