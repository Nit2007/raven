/**
 * Redaction Engine — applies privacy policy to classified elements.
 * Produces a redacted COPY of the DOM snapshot (never mutates the live page).
 *
 * Policy table:
 *   SENSITIVE_FIELD → REDACT  (mask value entirely, preserve element metadata for layout reasoning)
 *   SENSITIVE_TEXT  → ABSTRACT (regex-replace only matched PII substrings with placeholder tokens)
 *   SAFE           → KEEP     (pass through unchanged)
 *
 * Pure function: redactElements(classifiedElements) -> RedactedElement[]
 *
 * Abstraction rules are sourced from SensitivityDetector.getTextPatterns() (data-driven)
 * so they stay in sync with pii-patterns.json automatically.
 */

// eslint-disable-next-line no-unused-vars
var RedactionEngine = (function () {
  'use strict';

  var POLICY = {
    'SENSITIVE_FIELD': 'REDACT',
    'SENSITIVE_TEXT': 'ABSTRACT',
    'SAFE': 'KEEP'
  };

  var MASK = '████████';

  // Fallback patterns if SensitivityDetector hasn't loaded yet (shouldn't happen in normal flow)
  var FALLBACK_RULES = [
    { regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, token: '[EMAIL]' },
    { regex: /(?:\+?\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}/g, token: '[PHONE]' },
    { regex: /\b(?:\d[\s\-]?){13,19}\b/g, token: '[CARD]' },
    { regex: /\b\d{3}[\s\-]\d{2}[\s\-]\d{4}\b/g, token: '[SSN]' },
    { regex: /\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/g, token: '[AADHAAR]' }
  ];

  function getAbstractionRules() {
    if (typeof SensitivityDetector !== 'undefined' && SensitivityDetector.getTextPatterns) {
      var patterns = SensitivityDetector.getTextPatterns();
      if (patterns.length > 0) return patterns;
    }
    return FALLBACK_RULES;
  }

  function abstractText(text) {
    var rules = getAbstractionRules();
    var result = text;
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      rule.regex.lastIndex = 0;
      result = result.replace(rule.regex, rule.token);
    }
    return result;
  }

  function redactElements(classifiedElements) {
    return classifiedElements.map(function (el) {
      var action = POLICY[el.sensitivity] || 'KEEP';
      // Deep-copy to avoid mutating the classified input
      var out = JSON.parse(JSON.stringify(el, function (key, val) {
        // strip the live DOM reference — can't serialize it, and we don't want it in output
        if (key === '_element') return undefined;
        return val;
      }));
      out.policyAction = action;

      if (action === 'REDACT') {
        var tokenName = (el.ruleToken || el.ruleCategory || 'FIELD').replace(/[\[\]]/g, '');
        var isEmpty = !(el.value && el.value.trim().length > 0) && !(el.visibleText && el.visibleText.trim().length > 0);
        var customMask = isEmpty ? '{empty ' + tokenName + '}' : '{' + tokenName + ' filled}';
        
        out.value = customMask;
        out.visibleText = out.visibleText ? customMask : '';
        out.redacted = true;
      } else if (action === 'ABSTRACT') {
        out.visibleText = abstractText(out.visibleText);
        out.value = abstractText(out.value);
        out.redacted = true;
      } else {
        out.redacted = false;
      }
      return out;
    });
  }

  return {
    redactElements: redactElements,
    POLICY: POLICY
  };
})();
