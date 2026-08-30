/**
 * Sensitivity Detector — Fuses regex/keyword rules with real on-device NER.
 *
 * NER model: dslim/distilbert-base-NER (Transformers.js, quantized int8 ~65MB)
 * Running in background.js service worker; queried via chrome.runtime.sendMessage.
 *
 * Confidence tiers:
 *   HIGH_CONFIDENCE_PII  — regex/pattern match, confidence >= 0.8
 *   LOW_CONFIDENCE_PII   — NER match or weak heuristic (0.4–0.79)
 *   SAFE
 */

var SensitivityDetector = (function () {
  'use strict';

  var piiData       = null;
  var compiledRules = null;

  // --- NER bridge: delegates to background.js service worker ---
  var NER = {
    classify: function(text) {
      if (!text || typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        return Promise.resolve([]);
      }
      return new Promise(function(resolve) {
        try {
          chrome.runtime.sendMessage({ action: 'ner_classify', text: text }, function(entities) {
            if (chrome.runtime.lastError) {
              console.warn('[SensitivityDetector] NER unavailable:', chrome.runtime.lastError.message);
              resolve([]);
            } else {
              resolve(entities || []);
            }
          });
        } catch(e) {
          resolve([]);
        }
      });
    },
    toInternalToken: function(entity_group) {
      switch (entity_group) {
        case 'PER':  return '[PERSON_NAME]';
        case 'LOC':  return '[LOCATION]';
        case 'ORG':  return '[ORGANIZATION]';
        case 'MISC': return '[PERSONAL_DATA]';
        default:     return '[PERSONAL_DATA]';
      }
    }
  };

  // --- Rule loading ---
  function loadPiiPatterns(callback) {
    if (piiData) { callback(); return; }
    var url = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
      ? chrome.runtime.getURL('data/pii-patterns.json')
      : 'data/pii-patterns.json';

    fetch(url)
      .then(function(res) { return res.json(); })
      .then(function(data) {
        piiData = data;
        compiledRules = compileRules(data);
        console.log('[SensitivityDetector] Loaded', compiledRules.fieldRules.length,
          'field rules and', compiledRules.textRules.length, 'text rules');
        callback();
      })
      .catch(function(err) {
        console.error('[SensitivityDetector] CRITICAL: Failed to load pii-patterns.json:', err.message || err);
        console.error('[SensitivityDetector] Protection is DEGRADED — falling back to empty ruleset');
        piiData = { categories: {} };
        compiledRules = { fieldRules: [], textRules: [] };
        callback();
      });
  }

  function compileRules(data) {
    var fieldRules = [], textRules = [];
    for (var catKey in data.categories) {
      var cat   = data.categories[catKey];
      var rules = cat.rules || [];
      for (var i = 0; i < rules.length; i++) {
        var rule     = rules[i];
        var compiled = {
          id: rule.id, description: rule.description, category: catKey,
          categoryLabel: cat.label, confidence: rule.confidence,
          token: rule.token, scope: rule.scope
        };
        if (rule.scope === 'field') {
          compiled.keywords          = (rule.keywords || []).map(function(k) { return k.toLowerCase(); });
          compiled.autocompleteHints = (rule.autocompleteHints || []).map(function(h) { return h.toLowerCase(); });
          compiled.inputTypeMatch    = rule.match ? rule.match.inputType || null : null;
          fieldRules.push(compiled);
        } else if (rule.scope === 'text' && rule.regex) {
          compiled.regex = new RegExp(rule.regex, rule.regexFlags || 'g');
          textRules.push(compiled);
        }
      }
    }
    return { fieldRules: fieldRules, textRules: textRules };
  }

  // --- Synchronous regex/keyword layers ---

  function classifyField(el) {
    if (el.tag !== 'input' && el.tag !== 'select' && el.tag !== 'textarea') return null;
    var bestMatch = null, bestConfidence = 0;
    for (var i = 0; i < compiledRules.fieldRules.length; i++) {
      var rule = compiledRules.fieldRules[i];
      if (rule.inputTypeMatch && el.tag === 'input' && el.type === rule.inputTypeMatch) {
        if (rule.confidence > bestConfidence) { bestConfidence = rule.confidence; bestMatch = rule; }
      }
      if (el.autocomplete) {
        var ac = el.autocomplete.toLowerCase();
        for (var j = 0; j < rule.autocompleteHints.length; j++) {
          if (ac.indexOf(rule.autocompleteHints[j]) !== -1 && rule.confidence > bestConfidence) {
            bestConfidence = rule.confidence; bestMatch = rule;
          }
        }
      }
      if (rule.keywords.length > 0) {
        var haystack   = [el.name, el.id, el.placeholder, el.labelText].join(' ').toLowerCase();
        var normalized = haystack.replace(/[-_\s]+/g, '');
        for (var k = 0; k < rule.keywords.length; k++) {
          var kw = rule.keywords[k].replace(/[-_\s]+/g, '');
          if ((normalized.indexOf(kw) !== -1 || haystack.indexOf(rule.keywords[k]) !== -1) && rule.confidence > bestConfidence) {
            bestConfidence = rule.confidence; bestMatch = rule;
          }
        }
      }
    }
    if (bestMatch) return { source: 'REGEX', ruleToken: bestMatch.token, confidence: bestConfidence, reason: bestMatch.description };
    var loose = [el.name, el.id, el.labelText].join(' ').toLowerCase();
    if (loose.includes('address') || loose.includes('personal') || loose.includes('bio')) {
      return { source: 'HEURISTIC', ruleToken: '[PERSONAL_DATA]', confidence: 0.4, reason: 'Suspicious field context' };
    }
    return null;
  }

  function classifyTextRegex(el) {
    var text = ((el.visibleText || '') + ' ' + (el.value || '')).trim();
    if (!text) return [];
    var hits = [];
    for (var i = 0; i < compiledRules.textRules.length; i++) {
      var rule = compiledRules.textRules[i];
      rule.regex.lastIndex = 0;
      if (rule.regex.test(text)) {
        hits.push({ source: 'REGEX', ruleToken: rule.token, confidence: rule.confidence, reason: rule.description });
      }
    }
    return hits;
  }

  function scoreElement(el, nerHits) {
    var fieldHit  = classifyField(el);
    var regexHits = classifyTextRegex(el);
    var allHits   = (fieldHit ? [fieldHit] : []).concat(regexHits).concat(nerHits || []);
    if (allHits.length === 0) return { sensitivity: 'SAFE', confidence: 0, ruleToken: null, source: null };
    var max  = allHits.reduce(function(a, b) { return a.confidence > b.confidence ? a : b; });
    var tier = max.confidence >= 0.8 ? 'HIGH_CONFIDENCE_PII' : 'LOW_CONFIDENCE_PII';
    return { sensitivity: tier, confidence: max.confidence, ruleToken: max.ruleToken, source: max.source, reason: max.reason, allHits: allHits };
  }

  // --- Contextual clustering ---
  function applyContextualClustering(elements) {
    var clusters = {};
    elements.forEach(function(el) {
      var parts = (el.stableRef || '').split(' > ');
      if (parts.length > 1) {
        var cid = parts.slice(0, -1).join(' > ');
        if (!clusters[cid]) clusters[cid] = [];
        clusters[cid].push(el);
      }
    });
    for (var cid in clusters) {
      var group        = clusters[cid];
      var hasSensitive = group.some(function(e) { return e.sensitivity && e.sensitivity !== 'SAFE'; });
      if (hasSensitive) {
        group.forEach(function(e) {
          if (e.tag === 'input' && e.sensitivity === 'SAFE') {
            e.sensitivity = 'LOW_CONFIDENCE_PII'; e.ruleToken = '[CLUSTERED_DATA]';
            e.reason = 'Clustered near sensitive fields'; e.source = 'CONTEXT'; e.confidence = 0.5;
          }
        });
      }
    }
  }

  // --- Public async API ---

  /**
   * Main classification entry point.
   * Returns a Promise<Array> in extension context (NER enabled),
   * or a plain Array in benchmark/test context (NER unavailable).
   */
  function classifyElements(elements) {
    // Sync fast path: no chrome.runtime — benchmark / unit test env
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      var syncResults = elements.map(function(el) { return Object.assign({}, el, scoreElement(el, [])); });
      applyContextualClustering(syncResults);
      return syncResults;
    }

    // Async path: NER per element, all in parallel
    var nerPromises = elements.map(function(el) {
      var text = ((el.visibleText || '') + ' ' + (el.value || '') + ' ' + (el.labelText || '')).trim();
      return text ? NER.classify(text) : Promise.resolve([]);
    });

    return Promise.all(nerPromises).then(function(nerPerEl) {
      var results = elements.map(function(el, i) {
        var nerHits = (nerPerEl[i] || [])
          .filter(function(e) { return e.score >= 0.7; }) // reject low-confidence tokens
          .map(function(e) {
            return {
              source:     'NER',
              ruleToken:  NER.toInternalToken(e.entity_group),
              confidence: Math.min(0.79, e.score), // NER capped at LOW tier; regex stays HIGH
              reason:     'NER ' + e.entity_group + ' "' + (e.word || '') + '" (' + e.score.toFixed(2) + ')'
            };
          });
        return Object.assign({}, el, scoreElement(el, nerHits));
      });
      applyContextualClustering(results);
      return results;
    });
  }

  function classifyElementsWithCache(elements, callback) {
    var result = classifyElements(elements);
    // Handle both sync (Array) and async (Promise) return
    if (result && typeof result.then === 'function') {
      result.then(function(r) { callback(r, { hits: 0, misses: elements.length }); });
    } else {
      callback(result, { hits: 0, misses: elements.length });
    }
  }

  function getTextPatterns() {
    if (!compiledRules) return [];
    return compiledRules.textRules.map(function(r) {
      return { regex: new RegExp(r.regex.source, r.regex.flags), token: r.token };
    });
  }

  function clearCache(callback) { callback(); }

  return {
    loadPiiPatterns:           loadPiiPatterns,
    classifyElements:          classifyElements,
    classifyElementsWithCache: classifyElementsWithCache,
    getTextPatterns:           getTextPatterns,
    clearCache:                clearCache,
    get TEXT_PATTERNS() { return getTextPatterns(); }
  };
})();
