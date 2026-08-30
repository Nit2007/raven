/**
 * Server Adapter — strict, versioned contract between the extension and backend.
 *
 * Three concerns:
 *   1. buildOutboundPayload()  — shapes sanitized data into FastAPI AgentRequest contract
 *   2. sendToServer()          — fetch() wrapper with timeout, retry, MOCK_MODE toggle & Outbound Privacy Gate
 *   3. receiveServerCommand()  — validates incoming server response and emits RAVEN command
 *
 * Configuration is read from ServerAdapter.config and can be overridden at runtime.
 */

// eslint-disable-next-line no-unused-vars
var ServerAdapter = (function () {
  'use strict';

  var SCHEMA_VERSION = '1.0.0';

  // Valid action types the client is allowed to accept & execute
  var VALID_ACTIONS = new Set(['CLICK', 'TYPE', 'SCROLL', 'SELECT', 'NONE']);

  var config = {
    MOCK_MODE: false,
    ENDPOINT_URL: 'http://localhost:8000/agent/act',
    TIMEOUT_MS: 15000,
    URL_MODE: 'domain',  // 'domain' sends only hostname, 'hash' sends SHA-256 hash of full URL
    SESSION_ID: generateSessionId()
  };

  function generateSessionId() {
    return 'ss-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 6);
  }

  function hashUrl(url) {
    var hash = 0x811c9dc5;
    for (var i = 0; i < url.length; i++) {
      hash ^= url.charCodeAt(i);
      hash = (hash * 0x01000193) >>> 0;
    }
    return 'urlhash-' + hash.toString(16);
  }

  function safeUrlIdentifier(url) {
    if (config.URL_MODE === 'hash') return hashUrl(url);
    try { return new URL(url).hostname; } catch (_) { return 'unknown'; }
  }

  // --- 1. Build outbound payload (FastAPI AgentRequest contract) ---

  function buildOutboundPayload(sanitizedPayload, taskContext) {
    var rawElements = sanitizedPayload.elements || [];
    var redactionCount = 0;
    var categorySet = {};

    var formattedElements = rawElements.map(function (el, idx) {
      if (el.redacted) {
        redactionCount++;
        var catKey = el.ruleCategory || 'PII';
        categorySet[catKey] = (categorySet[catKey] || 0) + 1;
      }

      var bbox = [0, 0, 0, 0];
      if (el.boundingBox) {
        var x1 = Math.round(el.boundingBox.x || 0);
        var y1 = Math.round(el.boundingBox.y || 0);
        var w = Math.round(el.boundingBox.width || 0);
        var h = Math.round(el.boundingBox.height || 0);
        bbox = [x1, y1, x1 + w, y1 + h];
      }

      var elementId = el.id || el.name || ('el_' + idx);
      var textVal = [el.visibleText, el.value, el.labelText, el.placeholder].filter(Boolean).join(' ').trim();
      var selector = el.id ? ('#' + el.id) : (el.name ? ('[name="' + el.name + '"]') : (el.tag || 'div'));

      return {
        id: String(elementId),
        type: String(el.type || el.tag || 'element'),
        bbox: bbox,
        text: textVal || '[ELEMENT]',
        dom_selector: String(selector)
      };
    });

    return {
      session_id: config.SESSION_ID,
      goal: taskContext || 'Analyze page and perform requested task',
      screen_state: {
        elements: formattedElements
      },
      action_history: [],
      // Client privacy metadata preserved
      url_domain: safeUrlIdentifier(sanitizedPayload.url || ''),
      redactionSummary: {
        count: redactionCount,
        categories: categorySet
      }
    };
  }

  // --- 2. Send to server ---

  function sendToServer(payload, overrides) {
    var opts = Object.assign({}, config, overrides || {});

    // AUTHORITATIVE CLIENT OUTBOUND PRIVACY GATE CHECK
    var gateCheck = (typeof Sanitizer !== 'undefined' && Sanitizer.outboundCheck)
      ? Sanitizer.outboundCheck(payload)
      : { safe: true, leaks: [] };

    if (!gateCheck.safe) {
      console.error('[SafeScreen ServerAdapter] CRITICAL: Transmission BLOCKED by Outbound Privacy Gate. Leaks detected:', gateCheck.leaks);
      return Promise.resolve({
        status: 403,
        ok: false,
        body: {
          error: 'TRANSMISSION_BLOCKED: Sensitive PII detected in outbound payload',
          leaks: gateCheck.leaks,
          action: { action_type: 'none', reasoning: 'Transmission blocked by privacy gate' },
          task_status: 'blocked'
        }
      });
    }

    if (opts.MOCK_MODE) {
      console.group('[SafeScreen] Mock server send (MOCK_MODE=true)');
      console.log('Endpoint:', opts.ENDPOINT_URL);
      console.log('Payload size:', JSON.stringify(payload).length, 'bytes');
      console.log('Payload:', payload);
      console.groupEnd();

      return Promise.resolve({
        status: 200,
        ok: true,
        body: {
          session_id: payload.session_id || opts.SESSION_ID,
          action: {
            action_type: 'none',
            target_element_id: null,
            value: null,
            reasoning: 'Mock mode — no real request sent'
          },
          task_status: 'in_progress'
        }
      });
    }

    var controller = new AbortController();
    var timeoutId = setTimeout(function () { controller.abort(); }, opts.TIMEOUT_MS);

    return fetch(opts.ENDPOINT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    })
    .then(function (res) {
      clearTimeout(timeoutId);
      return res.json().then(function (body) {
        return { status: res.status, ok: res.ok, body: body };
      });
    })
    .catch(function (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        console.warn('[SafeScreen] Request timed out after', opts.TIMEOUT_MS, 'ms — retrying once');
      } else {
        console.warn('[SafeScreen] Request failed:', err.message, '— retrying once');
      }

      var retryController = new AbortController();
      var retryTimeout = setTimeout(function () { retryController.abort(); }, opts.TIMEOUT_MS);

      return fetch(opts.ENDPOINT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: retryController.signal
      })
      .then(function (res) {
        clearTimeout(retryTimeout);
        return res.json().then(function (body) {
          return { status: res.status, ok: res.ok, body: body };
        });
      })
      .catch(function (retryErr) {
        clearTimeout(retryTimeout);
        console.error('[SafeScreen] Server request failed:', retryErr.message);
        return {
          status: 0,
          ok: false,
          body: {
            error: retryErr.message,
            action: { action_type: 'none', reasoning: 'Server unavailable: ' + retryErr.message },
            task_status: 'error'
          }
        };
      });
    });
  }

  // --- 3. Receive + validate server command ---

  function receiveServerCommand(response, sentElements) {
    var body = response.body || response;
    var errors = [];

    var actionObj = body.action || {};
    var rawActionType = (actionObj.action_type || body.action || 'none').toUpperCase();

    // Map FastAPI action types to client vocabulary
    if (rawActionType === 'WAIT' || rawActionType === 'DONE' || rawActionType === 'NONE') {
      rawActionType = 'NONE';
    }

    if (!VALID_ACTIONS.has(rawActionType)) {
      errors.push('Unknown action type: "' + rawActionType + '". Expected one of: ' + Array.from(VALID_ACTIONS).join(', '));
    }

    var targetId = actionObj.target_element_id || body.targetSelector || null;

    // Target validation (anti-hallucination check)
    if (rawActionType !== 'NONE' && targetId) {
      if (sentElements && Array.isArray(sentElements)) {
        var found = sentElements.some(function(el) {
          return String(el.id) === String(targetId) || String(el.dom_selector) === String(targetId);
        });
        if (!found) {
          errors.push('Hallucinated target element ID: "' + targetId + '" is not in current screen elements');
        }
      }
    }

    if (errors.length > 0) {
      console.warn('[SafeScreen] Malformed or hallucinated server command rejected:', errors);
      return {
        valid: false,
        errors: errors,
        command: {
          action: 'NONE',
          targetSelector: null,
          confidence: 0,
          reasoning: 'Rejected unsafe/hallucinated command: ' + errors.join('; ')
        }
      };
    }

    var command = {
      action: rawActionType,
      targetSelector: targetId,
      value: actionObj.value || body.value || null,
      confidence: 1.0,
      reasoning: actionObj.reasoning || body.reasoning || '',
      task_status: body.task_status || 'in_progress'
    };

    try {
      var event = new CustomEvent('agentCommandReceived', {
        detail: command,
        bubbles: true
      });
      document.dispatchEvent(event);
    } catch (_) {}

    return { valid: true, errors: [], command: command };
  }

  return {
    config: config,
    buildOutboundPayload: buildOutboundPayload,
    sendToServer: sendToServer,
    receiveServerCommand: receiveServerCommand,
    SCHEMA_VERSION: SCHEMA_VERSION,
    VALID_ACTIONS: VALID_ACTIONS
  };
})();
