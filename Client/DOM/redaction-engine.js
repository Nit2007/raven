/**
 * Redaction Engine — applies privacy policy to classified elements.
 * Produces a redacted COPY of the DOM snapshot.
 *
 * Policy:
 *   HIGH_CONFIDENCE_PII → REDACT / ABSTRACT (Specific placeholder)
 *   LOW_CONFIDENCE_PII  → REDACT / ABSTRACT (Generalized placeholder)
 *   SAFE                → KEEP
 */

var RedactionEngine = (function () {
  'use strict';

  var POLICY = {
    'HIGH_CONFIDENCE_PII': 'REDACT',
    'LOW_CONFIDENCE_PII': 'REDACT',
    'SAFE': 'KEEP'
  };

  var FALLBACK_RULES = [
    { regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, token: '[EMAIL]' },
    { regex: /(?:\+?\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}/g, token: '[PHONE]' },
    { regex: /\b(?:\d[\s\-]?){13,19}\b/g, token: '[CARD]' },
    { regex: /\b\d{3}[\s\-]\d{2}[\s\-]\d{4}\b/g, token: '[SSN]' }
  ];

  function getAbstractionRules() {
    if (typeof SensitivityDetector !== 'undefined' && SensitivityDetector.getTextPatterns) {
      var patterns = SensitivityDetector.getTextPatterns();
      if (patterns.length > 0) return patterns;
    }
    return FALLBACK_RULES;
  }

  function abstractText(text) {
    if (!text || typeof text !== 'string') return text;
    var rules = getAbstractionRules();
    var result = text;
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      rule.regex.lastIndex = 0;
      result = result.replace(rule.regex, rule.token);
    }
    result = result.replace(/\b([A-Z][a-z]{2,})\s([A-Z][a-z]{2,})\b/g, '[PERSON_NAME]');
    return result;
  }

  function redactElements(classifiedElements) {
    return classifiedElements.map(function (el) {
      var action = POLICY[el.sensitivity] || 'KEEP';
      var out = JSON.parse(JSON.stringify(el, function (key, val) {
        if (key === '_element') return undefined;
        return val;
      }));
      out.policyAction = action;

      if (action === 'REDACT') {
        var rawToken = el.ruleToken || 'PII';
        var tokenName = rawToken.replace(/[\[\]]/g, '');

        if (el.sensitivity === 'LOW_CONFIDENCE_PII') {
          if (tokenName !== 'PERSON_NAME' && tokenName !== 'LOCATION' && tokenName !== 'CLUSTERED_DATA' && tokenName !== 'EMAIL' && tokenName !== 'PHONE' && tokenName !== 'CARD') {
            tokenName = 'PERSONAL_DATA';
          }
        }

        var customMask = '{' + tokenName + '}';
        if (tokenName === 'FACE' || el.tag === 'visual-face') customMask = '[FACE_REGION]';
        else if (el.tag === 'visual-document') customMask = el.visibleText || '[SENSITIVE_DOCUMENT]';

        // 1. Mandatory Value Redaction for ALL Redacted Elements
        if (out.value !== undefined && out.value !== null) {
          out.value = customMask;
        }

        // 2. Mandatory Visible Text Redaction
        if (out.visibleText !== undefined && out.visibleText !== null) {
          if (el.tag === 'input' || el.tag === 'textarea' || el.tag === 'select' || el.tag.indexOf('visual-') === 0) {
            out.visibleText = customMask;
          } else {
            out.visibleText = abstractText(out.visibleText);
          }
        }

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
