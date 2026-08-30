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
    var rules = getAbstractionRules();
    var result = text;
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      rule.regex.lastIndex = 0;
      result = result.replace(rule.regex, rule.token);
    }
    // NER fallback for text abstraction
    if (typeof SensitivityDetector !== 'undefined') {
       // Since text abstraction is tricky to generalize without full NLP pass, 
       // rely on the classification pass. 
       // In a real implementation, we'd replace NER hits directly in the text node.
       result = result.replace(/\b([A-Z][a-z]{2,})\s([A-Z][a-z]{2,})\b/g, '[PERSON_NAME]');
    }
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
        var tokenName = (el.ruleToken || 'FIELD').replace(/[\[\]]/g, '');
        
        // Generalize placeholder if confidence is low
        if (el.sensitivity === 'LOW_CONFIDENCE_PII') {
           if (tokenName !== 'PERSON_NAME' && tokenName !== 'LOCATION' && tokenName !== 'CLUSTERED_DATA') {
             tokenName = 'PERSONAL_DATA';
           }
        }
        
        var isEmpty = !(el.value && el.value.trim().length > 0) && !(el.visibleText && el.visibleText.trim().length > 0);
        var customMask = isEmpty ? '{empty ' + tokenName + '}' : '{' + tokenName + ' filled}';
        
        // Apply masking to fields, or abstract text if it's a text node (not an input)
        if (el.tag === 'input' || el.tag === 'textarea' || el.tag === 'select') {
          out.value = customMask;
          if (out.visibleText) out.visibleText = customMask;
        } else {
          // It's a text node flagged by NER or Regex
          out.visibleText = abstractText(out.visibleText);
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
