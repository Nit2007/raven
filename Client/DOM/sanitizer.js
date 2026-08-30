/**
 * Sanitizer + Outbound Gate
 *
 * sanitizeContext(redactedElements) -> payload
 *   Builds the final JSON payload that would be sent to the server.
 *   Strips internal fields (_element, matchedPatterns internals) and keeps only
 *   the structure + redacted content — no raw sensitive values anywhere.
 *
 * outboundCheck(payload) -> { safe: boolean, leaks: string[] }
 *   Re-scans the STRINGIFIED payload for any leftover PII regex matches.
 *   This is the safety-net: if redaction missed something, this blocks it.
 *
 * mockSendToServer(payload) -> canned response
 *   Logs to console. No real networking.
 */

// eslint-disable-next-line no-unused-vars
var Sanitizer = (function () {
  'use strict';

  // Fallback leak patterns if SensitivityDetector isn't loaded
  var FALLBACK_LEAK_PATTERNS = [
    { regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, label: 'email address' },
    { regex: /(?:\+?\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}/g, label: 'phone number' },
    { regex: /\b(?:\d[\s\-]?){13,19}\b/g, label: 'credit card number' },
    { regex: /\b\d{3}[\s\-]\d{2}[\s\-]\d{4}\b/g, label: 'SSN' }
  ];

  function getLeakPatterns() {
    if (typeof SensitivityDetector !== 'undefined' && SensitivityDetector.getTextPatterns) {
      var patterns = SensitivityDetector.getTextPatterns();
      if (patterns.length > 0) {
        return patterns.map(function (p) {
          return { regex: p.regex, label: p.reason || p.token };
        });
      }
    }
    return FALLBACK_LEAK_PATTERNS;
  }

  // Collect all known tokens for the safe-token allowlist dynamically
  function getSafeTokens() {
    if (typeof SensitivityDetector !== 'undefined' && SensitivityDetector.getTextPatterns) {
      var patterns = SensitivityDetector.getTextPatterns();
      if (patterns.length > 0) {
        var tokens = patterns.map(function (p) { return p.token; });
        // Deduplicate
        var seen = {};
        return tokens.filter(function (t) {
          if (seen[t]) return false;
          seen[t] = true;
          return true;
        });
      }
    }
    return ['[EMAIL]', '[PHONE]', '[CARD]', '[SSN]', '[AADHAAR]'];
  }

  function sanitizeContext(redactedElements) {
    var payload = {
      timestamp: new Date().toISOString(),
      url: window.location.href,
      title: document.title,
      elementCount: redactedElements.length,
      elements: redactedElements.map(function (el) {
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
          // New fields from data-driven detector
          ruleId: el.ruleId || '',
          ruleCategory: el.ruleCategory || ''
        };
      })
    };
    return payload;
  }

  function outboundCheck(payload) {
    var raw = JSON.stringify(payload);
    var safeTokens = getSafeTokens();
    var scrubbed = raw;
    safeTokens.forEach(function (tok) {
      scrubbed = scrubbed.split(tok).join('');
    });

    var leakPatterns = getLeakPatterns();
    var leaks = [];
    leakPatterns.forEach(function (pat) {
      pat.regex.lastIndex = 0;
      var match;
      while ((match = pat.regex.exec(scrubbed)) !== null) {
        leaks.push(pat.label + ': "' + match[0] + '"');
      }
    });

    return {
      safe: leaks.length === 0,
      leaks: leaks
    };
  }

  function mockSendToServer(payload) {
    console.group('[SafeScreen] Mock server send');
    console.log('Payload size:', JSON.stringify(payload).length, 'bytes');
    console.log('Elements:', payload.elementCount);
    console.log('Payload:', payload);
    console.groupEnd();
    return {
      status: 200,
      message: 'OK (mocked)',
      requestId: 'mock-' + Date.now(),
      actionsReceived: payload.elementCount
    };
  }

  return {
    sanitizeContext: sanitizeContext,
    outboundCheck: outboundCheck,
    mockSendToServer: mockSendToServer
  };
})();
