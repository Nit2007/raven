/**
 * Server Adapter — strict, versioned contract between the extension and any backend.
 *
 * Three concerns:
 *   1. buildOutboundPayload()  — shapes sanitized data into the wire format
 *   2. sendToServer()          — real fetch() wrapper with timeout, retry, and MOCK_MODE toggle
 *   3. receiveServerCommand()  — validates incoming server responses and emits events
 *
 * Configuration is read from ServerAdapter.config and can be overridden at runtime.
 * When config.MOCK_MODE is true, sendToServer logs + returns a canned response (no network).
 */

// eslint-disable-next-line no-unused-vars
var ServerAdapter = (function () {
  'use strict';

  var SCHEMA_VERSION = '1.0.0';

  // Valid action types the server is allowed to send
  var VALID_ACTIONS = new Set(['CLICK', 'TYPE', 'SCROLL', 'SELECT', 'NONE']);

  var config = {
    MOCK_MODE: true,
    ENDPOINT_URL: 'http://localhost:8080/api/agent/context',
    TIMEOUT_MS: 10000,
    URL_MODE: 'domain',  // 'domain' sends only hostname, 'hash' sends SHA-256 hash of full URL
    SESSION_ID: generateSessionId()
  };

  function generateSessionId() {
    return 'ss-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 6);
  }

  // --- URL privacy: never leak raw query strings ---

  function hashUrl(url) {
    // Simple FNV-1a 32-bit hash — no crypto dependency needed, this isn't security-critical,
    // it just needs to be a non-reversible identifier for the page
    var hash = 0x811c9dc5;
    for (var i = 0; i < url.length; i++) {
      hash ^= url.charCodeAt(i);
      hash = (hash * 0x01000193) >>> 0;
    }
    return 'urlhash-' + hash.toString(16);
  }

  function safeUrlIdentifier(url) {
    if (config.URL_MODE === 'hash') return hashUrl(url);
    // Default: domain-only
    try { return new URL(url).hostname; } catch (_) { return 'unknown'; }
  }

  // --- 1. Build outbound payload ---

  function buildOutboundPayload(sanitizedPayload, taskContext) {
    var redactionCount = 0;
    var categorySet = {};
    var elements = (sanitizedPayload.elements || []).map(function (el) {
      if (el.redacted) {
        redactionCount++;
        if (el.ruleCategory) categorySet[el.ruleCategory] = (categorySet[el.ruleCategory] || 0) + 1;
      }
      return {
        tag: el.tag,
        role: el.role,
        type: el.type,
        name: el.name,
        id: el.id,
        placeholder: el.placeholder,
        labelText: el.labelText,
        visibleText: el.visibleText,
        value: el.value,
        boundingBox: el.boundingBox,
        interactive: el.interactive,
        sensitivity: el.sensitivity,
        policyAction: el.policyAction,
        redacted: el.redacted,
        ruleId: el.ruleId || '',
        ruleCategory: el.ruleCategory || ''
      };
    });

    return {
      version: SCHEMA_VERSION,
      sessionId: config.SESSION_ID,
      timestamp: new Date().toISOString(),
      url_hash: safeUrlIdentifier(sanitizedPayload.url || ''),
      task: taskContext || '',
      elements: elements,
      redactionSummary: {
        count: redactionCount,
        categories: categorySet
      }
    };
  }

  // --- 2. Send to server ---

  function sendToServer(payload, overrides) {
    var opts = Object.assign({}, config, overrides || {});

    if (opts.MOCK_MODE) {
      console.group('[SafeScreen] Mock server send (MOCK_MODE=true)');
      console.log('Endpoint:', opts.ENDPOINT_URL);
      console.log('Payload size:', JSON.stringify(payload).length, 'bytes');
      console.log('Elements:', payload.elements ? payload.elements.length : 0);
      console.log('Payload:', payload);
      console.groupEnd();

      return Promise.resolve({
        status: 200,
        ok: true,
        body: {
          requestId: 'mock-' + Date.now(),
          action: 'NONE',
          targetSelector: null,
          confidence: 0,
          message: 'Mock mode — no real request sent'
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
      // Retry once on failure (network error or timeout)
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
        console.error('[SafeScreen] Retry also failed:', retryErr.message);
        return {
          status: 0,
          ok: false,
          body: { error: retryErr.message, action: 'NONE', targetSelector: null, confidence: 0 }
        };
      });
    });
  }

  // --- 3. Receive + validate server command ---

  function receiveServerCommand(response) {
    var body = response.body || response;
    var errors = [];

    // Validate required fields
    if (!body.action || typeof body.action !== 'string') {
      errors.push('Missing or invalid "action" field');
    } else if (!VALID_ACTIONS.has(body.action)) {
      errors.push('Unknown action type: "' + body.action + '". Expected one of: ' + Array.from(VALID_ACTIONS).join(', '));
    }

    if (body.action && body.action !== 'NONE') {
      if (!body.targetSelector || typeof body.targetSelector !== 'string') {
        errors.push('Action "' + body.action + '" requires a "targetSelector" string');
      }
    }

    if (body.confidence !== undefined && (typeof body.confidence !== 'number' || body.confidence < 0 || body.confidence > 1)) {
      errors.push('"confidence" must be a number between 0 and 1');
    }

    if (errors.length > 0) {
      console.warn('[SafeScreen] Malformed server command rejected:', errors);
      return { valid: false, errors: errors, command: null };
    }

    var command = {
      action: body.action,
      targetSelector: body.targetSelector || null,
      confidence: (typeof body.confidence === 'number') ? body.confidence : 0,
      metadata: body.metadata || null
    };

    // Emit custom event for other modules to consume — NO execution here
    try {
      var event = new CustomEvent('agentCommandReceived', {
        detail: command,
        bubbles: true
      });
      document.dispatchEvent(event);
    } catch (_) {
      // CustomEvent not available in some contexts (service workers)
    }

    return { valid: true, errors: [], command: command };
  }

  // --- Public API ---

  return {
    config: config,
    buildOutboundPayload: buildOutboundPayload,
    sendToServer: sendToServer,
    receiveServerCommand: receiveServerCommand,
    SCHEMA_VERSION: SCHEMA_VERSION,
    VALID_ACTIONS: VALID_ACTIONS
  };
})();
