/**
 * SafeScreen Background Service Worker
 *
 * Hosts the on-device NER pipeline using @xenova/transformers so that
 * content scripts can call it via chrome.runtime.sendMessage.
 *
 * Model: dslim/distilbert-base-NER (DistilBERT fine-tuned on CoNLL-2003)
 *   - F1: 91.4% on CoNLL-2003
 *   - Quantized int8: ~65 MB first load, cached in browser Cache API
 *   - Labels: PER, ORG, LOC, MISC
 *   - Inference: 30-120 ms on modern CPU
 *
 * IMPORTANT: Transformers.js is imported dynamically (not at top-level)
 * so the service worker registers and stays alive even before the model
 * loads. This ensures chrome.storage writes from content scripts always
 * succeed regardless of NER readiness.
 */

let nerPipeline   = null;
let pipelineReady = false;
let pipelineError = null;
const pendingQueue = [];

async function initPipeline() {
  try {
    await chrome.storage.local.set({ ss_ner_status: { state: 'loading', progress: 0 } });

    // Dynamic import using a local copy (from node_modules) to comply with MV3 CSP
    const { pipeline, env } = await import(
      './node_modules/@xenova/transformers/dist/transformers.min.js'
    );
    env.allowRemoteModels  = true;
    env.useBrowserCache    = true;
    env.backends.onnx.wasm.numThreads = 1; // single-threaded to avoid CPU spike on page load
    env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('node_modules/@xenova/transformers/dist/');

    nerPipeline = await pipeline(
      'token-classification',
      'Xenova/dslim-distilbert-NER',
      {
        quantized: true,
        progress_callback: function(p) {
          if (p.status === 'progress') {
            var pct = Math.round((p.loaded / p.total) * 100) || 0;
            chrome.storage.local.set({ ss_ner_status: { state: 'loading', progress: pct, file: p.file } });
          }
        }
      }
    );

    pipelineReady = true;
    await chrome.storage.local.set({ ss_ner_status: { state: 'ready' } });
    console.log('[SafeScreen NER] Pipeline ready — dslim/distilbert-base-NER loaded');

    // Drain any requests that arrived while loading
    for (var i = 0; i < pendingQueue.length; i++) {
      pendingQueue[i].resolve(await runNer(pendingQueue[i].text));
    }
    pendingQueue.length = 0;
  } catch (err) {
    console.error('[SafeScreen NER] Pipeline init failed:', err.message);
    await chrome.storage.local.set({ ss_ner_status: { state: 'error', message: err.message } });
    pipelineError = err;
    // Drain queue with empty results so callers don't hang
    for (var i = 0; i < pendingQueue.length; i++) {
      pendingQueue[i].resolve([]);
    }
    pendingQueue.length = 0;
  }
}

/**
 * Run NER on a text string.
 * Aggregates word-piece B-/I- tokens back into full entity spans using the
 * built-in `aggregation_strategy: 'simple'` option.
 *
 * Returns: Array<{ entity_group: 'PER'|'ORG'|'LOC'|'MISC', word: string, score: number }>
 */
async function runNer(text) {
  if (!nerPipeline) return [];
  // Truncate to 512 tokens (model limit) — fine for a single DOM element's text
  var truncated = text.slice(0, 1800);
  var results = await nerPipeline(truncated, { aggregation_strategy: 'simple' });
  return (results || []).map(function(e) {
    return { entity_group: e.entity_group, word: e.word, score: e.score };
  });
}

// Message router
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.action === 'save_scan') {
    var tabId = sender.tab ? sender.tab.id : 'unknown';
    var key = 'safescreen:scans:' + tabId;
    var scanData = msg.snapshot;
    scanData.tabId = tabId;

    // Save the scan and update the active tabs list
    chrome.storage.local.get(['safescreen:activeTabs'], function(res) {
      var activeTabs = res['safescreen:activeTabs'] || [];
      if (activeTabs.indexOf(tabId) === -1) {
        activeTabs.push(tabId);
      }
      var updates = {};
      updates[key] = scanData;
      updates['safescreen:activeTabs'] = activeTabs;
      chrome.storage.local.set(updates);
    });

    sendResponse({ success: true });
    return false; // synchronous response
  }

  if (msg.action !== 'ner_classify') return false;

  var text = msg.text || '';

  if (pipelineReady) {
    runNer(text).then(sendResponse);
  } else if (pipelineError) {
    // Pipeline failed to initialize, resolve immediately so we don't hang the content script
    sendResponse([]);
  } else {
    // Queue the request; it will be resolved once the pipeline finishes loading
    pendingQueue.push({ text: text, resolve: sendResponse });
  }

  return true; // Keep message channel open for async response
});

// Clean up closed tabs
chrome.tabs.onRemoved.addListener(function(tabId) {
  chrome.storage.local.get(['safescreen:activeTabs'], function(res) {
    var activeTabs = res['safescreen:activeTabs'] || [];
    var idx = activeTabs.indexOf(tabId);
    if (idx !== -1) {
      activeTabs.splice(idx, 1);
      chrome.storage.local.remove('safescreen:scans:' + tabId);
      chrome.storage.local.set({ 'safescreen:activeTabs': activeTabs });
    }
  });
});

// Auto-inject content scripts into existing tabs on reload/install
chrome.runtime.onInstalled.addListener(function() {
  var scripts = [
    "dom-analyzer.js",
    "sensitivity-detector.js",
    "redaction-engine.js",
    "sanitizer.js",
    "server-adapter.js",
    "content-script.js"
  ];
  chrome.tabs.query({ url: ['http://*/*', 'https://*/*', 'file://*/*'] }, function(tabs) {
    tabs.forEach(function(tab) {
      // Never inject into our own debug viewer — scanning it creates a
      // scan -> broadcast -> re-render -> mutation -> re-scan feedback loop.
      if (tab.url && tab.url.indexOf('localhost:3001') !== -1) return;

      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: scripts
      }).catch(function() {
        // ignore errors on restricted tabs
      });
    });
  });
});

initPipeline();