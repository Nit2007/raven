/**
 * Content Script — orchestrates the full pipeline:
 *   loadPiiPatterns → analyzeDOM → classifyElements → redactElements → sanitizeContext → outboundCheck → send
 *
 * Listens for messages from the popup/dashboard to trigger analysis and return results.
 * Also supports a visual-overlay demo mode (toggle redaction boxes on live page).
 *
 * Initializes PII patterns once at load time, then caches them in memory.
 * Sets up MutationObserver for SPA dynamic content detection.
 */

(function () {
  'use strict';

  var overlayActive = false;
  var overlayElements = [];
  var patternsLoaded = false;
  var autoRedactActive = false;

  // Load PII patterns once at init
  SensitivityDetector.loadPiiPatterns(function () {
    patternsLoaded = true;
    console.log('[SafeScreen] PII patterns ready');

    // Check initial auto-redact state
    chrome.storage.local.get(['autoRedactActive'], function (res) {
      if (res.autoRedactActive) {
        autoRedactActive = true;
        executePipeline(function (result) {
          showOverlays(result._classified);
        });
      }
    });

    // Start MutationObserver for SPA content
    DOMAnalyzer.startObserving(document, function () {
      console.log('[SafeScreen] New form elements detected via MutationObserver');
      if (autoRedactActive) {
        runPipeline(function (result) {
          showOverlays(result._classified);
        });
      }
    });

    // Listen for input events for lively placeholder updates
    document.addEventListener('input', function (e) {
      if (!autoRedactActive) return;
      var tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
        if (window._ssInputDebounce) clearTimeout(window._ssInputDebounce);
        window._ssInputDebounce = setTimeout(function () {
          runPipeline(function (result) {
            showOverlays(result._classified);
          });
        }, 200);
      }
    }, true);
  });

  function runPipeline(callback) {
    if (!patternsLoaded) {
      // Patterns still loading — wait briefly
      SensitivityDetector.loadPiiPatterns(function () {
        patternsLoaded = true;
        executePipeline(callback);
      });
      return;
    }
    executePipeline(callback);
  }

  function executePipeline(callback) {
    // 1. Analyze
    var analyzerOutput = DOMAnalyzer.analyzeDOM(document);
    var rawElements = [];
    analyzerOutput.registry.forEach(function(node) {
      if (node.type !== 'opaque-region') {
        rawElements.push(node);
      }
    });

    // 2. Classify (with cache)
    SensitivityDetector.classifyElementsWithCache(rawElements, function (classified, cacheStats) {
      // 3. Redact
      var redacted = RedactionEngine.redactElements(classified);

      // 4. Sanitize
      var payload = Sanitizer.sanitizeContext(redacted);

      // 5. Outbound check
      var check = Sanitizer.outboundCheck(payload);

      // 6. Stats
      var stats = {
        total: rawElements.length,
        sensitive: classified.filter(function (e) { return e.sensitivity !== 'SAFE'; }).length,
        redacted: redacted.filter(function (e) { return e.redacted; }).length,
        cacheHits: cacheStats.hits,
        cacheMisses: cacheStats.misses
      };

      // 7. Build server payload via adapter
      var serverPayload = ServerAdapter.buildOutboundPayload(payload, '');

      // 8. Send (mock or real, based on config)
      var serverPromise;
      if (check.safe) {
        serverPromise = ServerAdapter.sendToServer(serverPayload);
      } else {
        console.warn('[SafeScreen] OUTBOUND CHECK FAILED — payload blocked. Leaks:', check.leaks);
        serverPromise = Promise.resolve(null);
      }

      serverPromise.then(function (serverResponse) {
        // Validate server response if we got one
        var commandResult = null;
        if (serverResponse && serverResponse.body) {
          commandResult = ServerAdapter.receiveServerCommand(serverResponse);
        }

        callback({
          raw: classified.map(function (el) {
            var copy = Object.assign({}, el);
            delete copy._element;
            return copy;
          }),
          redacted: redacted,
          payload: payload,
          check: check,
          stats: stats,
          serverResponse: serverResponse,
          commandResult: commandResult,
          _classified: classified
        });
      });
    });
  }

  // --- Visual overlay: black boxes over sensitive fields ---

  function showOverlays(classified) {
    clearOverlays();
    classified.forEach(function (el) {
      if (el.sensitivity === 'SAFE' || !el._element) return;
      var rect;
      try { rect = el._element.getBoundingClientRect(); } catch (_) { return; }
      if (rect.width === 0 || rect.height === 0) return;

      var box = document.createElement('div');
      box.className = 'safescreen-overlay';
      box.style.cssText = [
        'position:absolute',
        'z-index:2147483647',
        'pointer-events:none',
        'border:2px solid #ff3b30',
        'background:rgba(0,0,0,0.75)',
        'border-radius:3px',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'color:#ff3b30',
        'font:bold 11px/1 -apple-system,sans-serif',
        'text-transform:uppercase',
        'letter-spacing:0.5px',
        'left:' + (rect.left + window.scrollX) + 'px',
        'top:' + (rect.top + window.scrollY) + 'px',
        'width:' + rect.width + 'px',
        'height:' + rect.height + 'px'
      ].join(';');
      
      if (el.sensitivity === 'SENSITIVE_FIELD') {
        var tokenName = (el.ruleToken || el.ruleCategory || 'FIELD').replace(/[\[\]]/g, '');
        var isEmpty = !(el.value && el.value.trim().length > 0) && !(el.visibleText && el.visibleText.trim().length > 0);
        box.textContent = isEmpty ? '{empty ' + tokenName + '}' : '{' + tokenName + ' filled}';
      } else {
        box.textContent = 'ABSTRACTED';
      }
      document.body.appendChild(box);
      overlayElements.push(box);
    });
    overlayActive = true;
  }

  function clearOverlays() {
    overlayElements.forEach(function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    overlayElements = [];
    overlayActive = false;
  }

  // --- Message listener for popup/dashboard ---

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.action === 'setAutoRedact') {
      autoRedactActive = msg.value;
      if (autoRedactActive) {
        runPipeline(function (result) {
          showOverlays(result._classified);
          sendResponse({ success: true });
        });
      } else {
        clearOverlays();
        sendResponse({ success: true });
      }
    } else if (msg.action === 'analyze') {
      try {
        runPipeline(function (result) {
          sendResponse({
            success: true,
            raw: result.raw,
            redacted: result.redacted,
            payload: result.payload,
            check: result.check,
            stats: result.stats,
            serverResponse: result.serverResponse,
            commandResult: result.commandResult
          });
          if (msg.overlay) {
            showOverlays(result._classified);
          }
        });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    } else if (msg.action === 'toggleOverlay') {
      if (overlayActive) {
        clearOverlays();
        sendResponse({ overlayActive: overlayActive });
      } else {
        runPipeline(function (result) {
          showOverlays(result._classified);
          sendResponse({ overlayActive: overlayActive });
        });
      }
    } else if (msg.action === 'clearOverlay') {
      clearOverlays();
      sendResponse({ overlayActive: false });
    } else if (msg.action === 'clearCache') {
      SensitivityDetector.clearCache(function () {
        sendResponse({ success: true });
      });
    }
    return true; // keep message channel open for async sendResponse
  });

  console.log('[SafeScreen] Content script loaded — pipeline ready.');
})();
