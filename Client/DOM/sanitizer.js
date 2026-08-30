/**
 * Sanitizer — Data minimization and internal ref stripping.
 *
 * Strips DOM element node references, non-serializable properties,
 * internal state trackers, and builds a clean structured context.
 */

// eslint-disable-next-line no-unused-vars
var Sanitizer = (function () {
  'use strict';

  function sanitizeContext(redactedElements) {
    var cleanElements = (redactedElements || []).map(function (el) {
      var bbox = null;
      if (el.boundingBox) {
        bbox = {
          x: Math.round(el.boundingBox.x || 0),
          y: Math.round(el.boundingBox.y || 0),
          width: Math.round(el.boundingBox.width || 0),
          height: Math.round(el.boundingBox.height || 0)
        };
      }

      return {
        tag: el.tag || 'unknown',
        role: el.role || null,
        type: el.type || null,
        name: el.name || null,
        id: el.id || null,
        placeholder: el.placeholder || null,
        labelText: el.labelText || null,
        visibleText: el.visibleText || null,
        value: el.value || null,
        boundingBox: bbox,
        interactive: Boolean(el.interactive),
        sensitivity: el.sensitivity || 'SAFE',
        policyAction: el.policyAction || 'KEEP',
        redacted: Boolean(el.redacted),
        ruleId: el.ruleId || '',
        ruleCategory: el.ruleCategory || ''
      };
    });

    return {
      timestamp: new Date().toISOString(),
      url: typeof window !== 'undefined' && window.location ? window.location.href : '',
      title: typeof document !== 'undefined' ? document.title : '',
      elementCount: cleanElements.length,
      elements: cleanElements
    };
  }

  function outboundCheck(payload) {
    var elements = payload.elements || (payload.screen_state ? payload.screen_state.elements : []) || [];
    var text = elements
      .map(function (e) { return [e.value, e.visibleText, e.text].filter(Boolean).join(' '); })
      .join(' ');

    var leakPatterns = [
      { regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/, label: 'email address' },
      { regex: /(?:\+?\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}/, label: 'phone number' },
      { regex: /\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b|\b\d{13,19}\b/, label: 'credit card number' }
    ];

    var leaks = [];
    for (var i = 0; i < leakPatterns.length; i++) {
      var pat = leakPatterns[i];
      var match = text.match(pat.regex);
      if (match) {
        leaks.push(pat.label + ': "' + match[0] + '"');
      }
    }
    return { safe: leaks.length === 0, leaks: leaks };
  }

  function mockSendToServer(payload) {
    var check = outboundCheck(payload);
    if (!check.safe) {
      console.error('[SafeScreen Sanitizer] Outbound Privacy Gate BLOCKED payload due to leaks:', check.leaks);
      return Promise.resolve({
        status: 403,
        ok: false,
        body: { error: 'TRANSMISSION_BLOCKED: Sensitive PII detected in outbound payload', leaks: check.leaks }
      });
    }

    console.log('[SafeScreen Sanitizer] Payload passed Outbound Privacy Gate cleanly.');
    return Promise.resolve({
      status: 200,
      ok: true,
      body: { requestId: 'mock-' + Date.now(), action: 'NONE', targetSelector: null }
    });
  }

  return {
    sanitizeContext: sanitizeContext,
    outboundCheck: outboundCheck,
    mockSendToServer: mockSendToServer
  };
})();