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

  // Never run the pipeline on our own debug dashboard — this is what caused
  // the scan -> broadcast -> re-render -> mutation -> re-scan feedback loop.
  // (background.js also skips injecting here; this is a second layer of
  // protection in case the script ever gets injected another way.)
  if (location.hostname === 'localhost' && location.port === '3001') {
    console.log('[SafeScreen] Skipping — this tab is the SafeScreen debug viewer, not a target page.');
    return;
  }

  var overlayActive = false;
  var overlayElements = [];
  var patternsLoaded = false;
  var autoRedactActive = false;
  var stableTabId = Date.now() + '-' + Math.floor(Math.random() * 1000); // stable per page load

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
          broadcastResult(result);
        });
      }
    });

    // Start MutationObserver for SPA content
    DOMAnalyzer.startObserving(document, function () {
      console.log('[SafeScreen] New form elements detected via MutationObserver');
      if (autoRedactActive) {
        runPipeline(function (result) {
          showOverlays(result._classified);
          broadcastResult(result);
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
            broadcastResult(result);
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
      var isField = (el.tag === 'input' || el.tag === 'select' || el.tag === 'textarea');
      if (!isField) return; // Do not draw giant boxes over text paragraphs, only over actual form fields

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
        'overflow:hidden',
        'white-space:nowrap',
        'text-overflow:ellipsis',
        'padding:0 4px',
        'left:' + (rect.left + window.scrollX) + 'px',
        'top:' + (rect.top + window.scrollY) + 'px',
        'width:' + rect.width + 'px',
        'height:' + rect.height + 'px'
      ].join(';');

      var isField = (el.tag === 'input' || el.tag === 'select' || el.tag === 'textarea');
      if ((el.sensitivity === 'HIGH_CONFIDENCE_PII' || el.sensitivity === 'LOW_CONFIDENCE_PII') && isField) {
        var tokenName = (el.ruleToken || el.ruleCategory || 'FIELD').replace(/[\[\]]/g, '');
        if (el.sensitivity === 'LOW_CONFIDENCE_PII' && tokenName !== 'PERSON_NAME' && tokenName !== 'LOCATION' && tokenName !== 'CLUSTERED_DATA') {
           tokenName = 'PERSONAL_DATA';
        }
        var isEmpty = !(el.value && el.value.trim().length > 0) && !(el.visibleText && el.visibleText.trim().length > 0);
        box.textContent = isEmpty ? '{empty ' + tokenName + '}' : '{' + tokenName + ' filled}';
      } else {
        box.textContent = 'ABSTRACTED TEXT';
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

  // --- Broadcast results to viewer page via storage ---
  function broadcastResult(result) {
    try {
      // Build the prompt string
      var llmPrompt = '';
      if (result.payload && result.payload.elements) {
        var lines = [];
        lines.push('PAGE CONTEXT:');
        lines.push('  Title: ' + document.title);
        lines.push('  Total elements: ' + result.payload.elements.length);
        lines.push('');
        lines.push('INTERACTIVE ELEMENTS (agent action plan):');
        result.payload.elements.forEach(function(el, i) {
          lines.push('  [' + (i + 1) + '] <' + el.tag + (el.type ? ' type="' + el.type + '"' : '') + ' ' + (el.id ? 'id="' + el.id + '"' : el.name ? 'name="' + el.name + '"' : '') + '>');
          var label = el.labelText || el.visibleText || el.name || el.id || '?';
          lines.push('       label  : ' + label.slice(0, 60));
          lines.push('       value  : ' + (el.value || el.visibleText || '(empty)'));
          lines.push('       action : ' + (el.interactive ? 'CLICKABLE / TYPEABLE' : 'READ-ONLY'));
          lines.push('');
        });
        llmPrompt = lines.join('\n');
      }

      var snapshot = {
        url: window.location.href,
        timestamp: Date.now(),
        tabId: stableTabId,
        summary: {
          totalElements: result.stats.total,
          sensitiveCount: result.stats.sensitive,
          safeCount: (result.stats.total || 0) - (result.stats.sensitive || 0),
          gateDecision: result.check && result.check.safe ? 'PASS' : 'FAIL'
        },
        classifiedElements: (result._classified || []).map(function(el) {
          var copy = Object.assign({}, el);
          delete copy._element;
          return copy;
        }),
        llmPrompt: llmPrompt,
        rawPayload: result.payload
      };

      // Alternative implementation: POST directly to a local development server via HTTP.
      // DEV-ONLY OBSERVABILITY HOOK:
      // Note that `snapshot.rawPayload` (which is `result.payload`) is the EXACT same
      // sanitized object that passed the final firewall check in `Sanitizer.outboundCheck`
      // and is consumed by `ServerAdapter.buildOutboundPayload` for the real server request.
      // This is not a parallel DOM capture, ensuring absolute demo integrity.
      fetch('http://localhost:3001/log-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot)
      }).catch(function(err) {
        console.warn('[SafeScreen] Failed to send scan to local viewer server:', err.message);
      });

    } catch (_) {}
  }

  // --- Message listener for popup/dashboard ---

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.action === 'setAutoRedact') {
      autoRedactActive = msg.value;
      if (autoRedactActive) {
        runPipeline(function (result) {
          showOverlays(result._classified);
          broadcastResult(result);
          sendResponse({ success: true });
        });
      } else {
        clearOverlays();
        sendResponse({ success: true });
      }
    } else if (msg.action === 'analyze') {
      try {
        runPipeline(function (result) {
          broadcastResult(result);
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
          broadcastResult(result);
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