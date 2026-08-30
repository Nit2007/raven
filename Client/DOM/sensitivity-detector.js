/**
 * Sensitivity Detector — classifies each ElementInfo as SAFE, SENSITIVE_FIELD, or SENSITIVE_TEXT.
 * Pure function: classifyElements(elements: ElementInfo[]) -> ClassifiedElement[]
 *
 * Detection is data-driven: rules loaded from data/pii-patterns.json at init time.
 * Each result includes category, matched rule ID, confidence, and reason for dashboard explainability.
 *
 * Classification cache: per-domain element signatures stored in chrome.storage.local
 * to skip re-classification of unchanged form structures on repeat visits (7-day TTL).
 */

// eslint-disable-next-line no-unused-vars
var SensitivityDetector = (function () {
  'use strict';

  var piiData = null;       // loaded once from JSON
  var compiledRules = null;  // { fieldRules: [], textRules: [] } with compiled RegExp objects
  var cacheStats = { hits: 0, misses: 0 };
  var CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  // --- Initialization: load pii-patterns.json ---

  function loadPiiPatterns(callback) {
    if (piiData) { callback(); return; }

    // In content-script context, use chrome.runtime.getURL for extension-bundled resources.
    // Fall back to fetch from relative path for standalone/test usage.
    var url;
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      url = chrome.runtime.getURL('data/pii-patterns.json');
    } else {
      url = 'data/pii-patterns.json';
    }

    fetch(url)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        piiData = data;
        compiledRules = compileRules(data);
        console.log('[SafeScreen] PII patterns loaded:', Object.keys(data.categories).length, 'categories');
        callback();
      })
      .catch(function (err) {
        console.warn('[SafeScreen] Failed to load pii-patterns.json, falling back to empty ruleset:', err.message);
        piiData = { categories: {}, confidenceThresholds: { SENSITIVE_FIELD: 0.6, SENSITIVE_TEXT: 0.5 } };
        compiledRules = { fieldRules: [], textRules: [] };
        callback();
      });
  }

  function compileRules(data) {
    var fieldRules = [];
    var textRules = [];

    var categories = data.categories;
    for (var catKey in categories) {
      if (!categories.hasOwnProperty(catKey)) continue;
      var cat = categories[catKey];
      var rules = cat.rules || [];
      for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        var compiled = {
          id: rule.id,
          description: rule.description,
          category: catKey,
          categoryLabel: cat.label,
          confidence: rule.confidence,
          token: rule.token,
          scope: rule.scope
        };

        if (rule.scope === 'field') {
          compiled.keywords = (rule.keywords || []).map(function (k) { return k.toLowerCase(); });
          compiled.autocompleteHints = (rule.autocompleteHints || []).map(function (h) { return h.toLowerCase(); });
          compiled.inputTypeMatch = rule.match ? rule.match.inputType || null : null;
          fieldRules.push(compiled);
        } else if (rule.scope === 'text' && rule.regex) {
          try {
            compiled.regex = new RegExp(rule.regex, rule.regexFlags || 'g');
          } catch (e) {
            console.warn('[SafeScreen] Bad regex in rule', rule.id, ':', e.message);
            continue;
          }
          textRules.push(compiled);
        }
      }
    }
    return { fieldRules: fieldRules, textRules: textRules };
  }

  // --- Element signature for cache keying ---

  function elementSignature(el) {
    return [el.tag, el.type, el.name, el.id, el.autocomplete, el.placeholder].join('|');
  }

  function domainKey() {
    try { return window.location.hostname; } catch (_) { return 'unknown'; }
  }

  // --- Cache: chrome.storage.local ---

  function getCachedClassifications(domain, signatures, callback) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      callback(null);
      return;
    }
    var storageKey = 'ss_cache_' + domain;
    chrome.storage.local.get(storageKey, function (result) {
      var cache = result[storageKey];
      if (!cache || !cache.entries) { callback(null); return; }
      // Check TTL
      if (Date.now() - cache.timestamp > CACHE_TTL_MS) {
        chrome.storage.local.remove(storageKey);
        callback(null);
        return;
      }
      var lookup = {};
      for (var i = 0; i < cache.entries.length; i++) {
        var e = cache.entries[i];
        lookup[e.sig] = e;
      }
      callback(lookup);
    });
  }

  function saveCachedClassifications(domain, entries) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    var storageKey = 'ss_cache_' + domain;
    var obj = {};
    obj[storageKey] = { timestamp: Date.now(), entries: entries };
    chrome.storage.local.set(obj);
  }

  // --- Classification logic ---

  function classifyFieldElement(el) {
    if (!compiledRules) return null;
    if (el.tag !== 'input' && el.tag !== 'select' && el.tag !== 'textarea') return null;

    var bestMatch = null;
    var bestConfidence = 0;

    for (var i = 0; i < compiledRules.fieldRules.length; i++) {
      var rule = compiledRules.fieldRules[i];

      // Check input type match (exact)
      if (rule.inputTypeMatch) {
        if (el.tag === 'input' && el.type === rule.inputTypeMatch) {
          if (rule.confidence > bestConfidence) {
            bestConfidence = rule.confidence;
            bestMatch = rule;
          }
          continue;
        }
      }

      // Check autocomplete hints
      if (rule.autocompleteHints.length > 0 && el.autocomplete) {
        var ac = el.autocomplete.toLowerCase();
        for (var j = 0; j < rule.autocompleteHints.length; j++) {
          if (ac.indexOf(rule.autocompleteHints[j]) !== -1) {
            if (rule.confidence > bestConfidence) {
              bestConfidence = rule.confidence;
              bestMatch = rule;
            }
            break;
          }
        }
      }

      // Check keywords against name/id/placeholder/labelText
      if (rule.keywords.length > 0) {
        var haystack = [el.name, el.id, el.placeholder, el.labelText].join(' ').toLowerCase();
        // Normalize separators so "card-number" matches "cardnumber" and "card_number"
        var normalized = haystack.replace(/[-_\s]+/g, '');
        for (var k = 0; k < rule.keywords.length; k++) {
          var kw = rule.keywords[k].replace(/[-_\s]+/g, '');
          if (normalized.indexOf(kw) !== -1 || haystack.indexOf(rule.keywords[k]) !== -1) {
            if (rule.confidence > bestConfidence) {
              bestConfidence = rule.confidence;
              bestMatch = rule;
            }
            break;
          }
        }
      }
    }

    var thresholds = (piiData && piiData.confidenceThresholds) || { SENSITIVE_FIELD: 0.6 };
    if (bestMatch && bestConfidence >= thresholds.SENSITIVE_FIELD) {
      return {
        sensitivity: 'SENSITIVE_FIELD',
        reason: bestMatch.description,
        ruleId: bestMatch.id,
        ruleCategory: bestMatch.categoryLabel,
        ruleToken: bestMatch.token,
        confidence: bestConfidence,
        matchedPatterns: []
      };
    }
    return null;
  }

  function classifyTextContent(el) {
    if (!compiledRules) return null;

    var textToScan = ((el.visibleText || '') + ' ' + (el.value || '')).trim();
    if (textToScan.length === 0) return null;

    var matchedPatterns = [];
    var thresholds = (piiData && piiData.confidenceThresholds) || { SENSITIVE_TEXT: 0.5 };

    for (var i = 0; i < compiledRules.textRules.length; i++) {
      var rule = compiledRules.textRules[i];
      rule.regex.lastIndex = 0;
      if (rule.regex.test(textToScan)) {
        if (rule.confidence >= thresholds.SENSITIVE_TEXT) {
          matchedPatterns.push({
            token: rule.token,
            reason: rule.description,
            ruleId: rule.id,
            ruleCategory: rule.categoryLabel,
            confidence: rule.confidence
          });
        }
      }
    }

    if (matchedPatterns.length > 0) {
      return {
        sensitivity: 'SENSITIVE_TEXT',
        reason: matchedPatterns.map(function (m) { return m.reason; }).join('; '),
        ruleId: matchedPatterns[0].ruleId,
        ruleCategory: matchedPatterns[0].ruleCategory,
        confidence: Math.max.apply(null, matchedPatterns.map(function (m) { return m.confidence; })),
        matchedPatterns: matchedPatterns
      };
    }
    return null;
  }

  function classifySingleElement(el) {
    // Field-level rules take priority over text-level
    var fieldResult = classifyFieldElement(el);
    if (fieldResult) return fieldResult;

    var textResult = classifyTextContent(el);
    if (textResult) return textResult;

    return {
      sensitivity: 'SAFE',
      reason: '',
      ruleId: '',
      ruleCategory: '',
      confidence: 0,
      matchedPatterns: []
    };
  }

  // --- Public API ---

  function classifyElements(elements) {
    return elements.map(function (el) {
      var classification = classifySingleElement(el);
      return Object.assign({}, el, classification);
    });
  }

  /**
   * Async version with cache. Checks chrome.storage.local for cached results first.
   * callback(classifiedElements, cacheStats)
   */
  function classifyElementsWithCache(elements, callback) {
    var domain = domainKey();
    var sigs = elements.map(elementSignature);

    getCachedClassifications(domain, sigs, function (lookup) {
      var newEntries = [];
      var results = elements.map(function (el, idx) {
        var sig = sigs[idx];

        // Only use cache for field elements (non-interactive text changes too often)
        if (lookup && lookup[sig] && el.interactive) {
          cacheStats.hits++;
          return Object.assign({}, el, lookup[sig].classification);
        }

        cacheStats.misses++;
        var classification = classifySingleElement(el);

        if (el.interactive) {
          newEntries.push({
            sig: sig,
            classification: {
              sensitivity: classification.sensitivity,
              reason: classification.reason,
              ruleId: classification.ruleId,
              ruleCategory: classification.ruleCategory,
              ruleToken: classification.ruleToken,
              confidence: classification.confidence,
              matchedPatterns: classification.matchedPatterns
            }
          });
        }

        return Object.assign({}, el, classification);
      });

      // Merge new entries into cache
      if (newEntries.length > 0) {
        var allEntries = newEntries;
        if (lookup) {
          for (var key in lookup) {
            if (lookup.hasOwnProperty(key)) allEntries.push(lookup[key]);
          }
        }
        saveCachedClassifications(domain, allEntries);
      }

      callback(results, { hits: cacheStats.hits, misses: cacheStats.misses });
    });
  }

  function clearCache(callback) {
    cacheStats = { hits: 0, misses: 0 };
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      if (callback) callback();
      return;
    }
    chrome.storage.local.get(null, function (items) {
      var keysToRemove = Object.keys(items).filter(function (k) { return k.indexOf('ss_cache_') === 0; });
      if (keysToRemove.length > 0) {
        chrome.storage.local.remove(keysToRemove, callback);
      } else {
        if (callback) callback();
      }
    });
  }

  function getCacheStats() {
    return { hits: cacheStats.hits, misses: cacheStats.misses };
  }

  // Build TEXT_PATTERNS dynamically from loaded rules for backward compat
  // (used by redaction-engine.js and sanitizer.js outbound check)
  function getTextPatterns() {
    if (!compiledRules) return [];
    return compiledRules.textRules.map(function (r) {
      return {
        regex: new RegExp(r.regex.source, r.regex.flags),
        token: r.token,
        reason: r.description
      };
    });
  }

  return {
    loadPiiPatterns: loadPiiPatterns,
    classifyElements: classifyElements,
    classifyElementsWithCache: classifyElementsWithCache,
    clearCache: clearCache,
    getCacheStats: getCacheStats,
    getTextPatterns: getTextPatterns,
    // Lazy accessor — modules that read TEXT_PATTERNS at init time get an empty array,
    // then after loadPiiPatterns() they get the real patterns via getTextPatterns()
    get TEXT_PATTERNS() { return getTextPatterns(); }
  };
})();
