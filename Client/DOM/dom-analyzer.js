/**
 * DOM Analyzer — walks the visible DOM and extracts structured element info.
 * Pure function: analyzeDOM(document) -> Object (structural tree of ElementInfo)
 *
 * Hardened for real-world sites:
 *   - Incremental analysis via targeted re-walks
 *   - Robust visibility detection (zero size, opacity, clip, off-screen)
 *   - Stable element identity (stableRef selector generation)
 *   - Semantic role resolution
 *   - Handles cross-origin iframes and closed shadow roots as opaque regions
 *   - Performance bounded (depth, node count limits)
 */

var DOMAnalyzer = (function () {
  'use strict';

  var INTERACTIVE_TAGS = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'DETAILS', 'SUMMARY']);
  var INTERACTIVE_ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'tab', 'switch', 'menuitem', 'option', 'textbox', 'combobox', 'slider', 'spinbutton', 'searchbox', 'listbox']);
  var SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'PATH', 'META', 'LINK', 'HEAD', 'BR', 'HR']);

  var mutationObserver = null;
  var mutationDebounceTimer = null;
  var MUTATION_DEBOUNCE_MS = 300;
  var registry = new Map(); // stableRef -> node metadata

  var MAX_DEPTH = 40;
  var MAX_NODES = 5000;
  var SCAN_BUDGET_MS = 50;

  var stats = {
    lastScanDuration: 0,
    totalNodes: 0,
    scanCount: 0
  };

  // --- Robust Visibility Detection ---
  // Note: we assume getBoundingClientRect is batched in a single read phase
  // during the tree walk before any mutations happen.
  function isVisible(el, rect) {
    if (rect.width === 0 || rect.height === 0) return false;

    // Check off-screen
    if (rect.bottom < 0 || rect.right < 0 || rect.top > window.innerHeight || rect.left > window.innerWidth) {
      return false;
    }

    try {
      var style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      if (parseFloat(style.opacity) < 0.05) return false;
      if (style.clipPath !== 'none' || style.clip !== 'auto') {
        // Rough heuristic for heavily clipped elements
        if (style.clipPath.includes('circle(0)') || style.clipPath.includes('inset(100%)')) return false;
      }
    } catch (_) {
      return false; // detached or uncomputable
    }

    return true;
  }

  // --- Stable Element Identity ---
  function generateStableRef(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    var path = [];
    var current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE && current.tagName !== 'BODY' && current.tagName !== 'HTML') {
      var tag = current.tagName.toLowerCase();
      var nth = 1;
      var sibling = current.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === current.tagName) nth++;
        sibling = sibling.previousElementSibling;
      }
      path.unshift(tag + ':nth-of-type(' + nth + ')');
      current = current.parentElement;
    }
    return path.join(' > ');
  }

  function getSemanticRole(el) {
    var explicitRole = el.getAttribute('role');
    if (explicitRole) return explicitRole;

    var tag = el.tagName.toLowerCase();
    switch (tag) {
      case 'a': return el.hasAttribute('href') ? 'link' : null;
      case 'button': return 'button';
      case 'input': return el.type === 'checkbox' || el.type === 'radio' ? el.type : 'textbox';
      case 'select': return 'combobox';
      case 'textarea': return 'textbox';
      default: return null;
    }
  }

  function isInteractive(el, role) {
    if (INTERACTIVE_TAGS.has(el.tagName)) return true;
    if (role && INTERACTIVE_ROLES.has(role)) return true;
    if (el.hasAttribute('onclick') || el.hasAttribute('tabindex')) return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function getLabelText(el, root) {
    try {
      if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
      var labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        var ref = (root.getElementById ? root : document).getElementById(labelledBy);
        if (ref) return ref.textContent.trim();
      }
      if (el.id) {
        var queryRoot = (root.querySelector ? root : document);
        var label = queryRoot.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (label) return label.textContent.trim();
      }
      if (el.closest) {
        var parent = el.closest('label');
        if (parent) {
          var clone = parent.cloneNode(true);
          var nested = clone.querySelector(el.tagName.toLowerCase());
          if (nested) nested.remove();
          return clone.textContent.trim();
        }
      }
    } catch (_) {}
    return '';
  }

  function getDirectText(el) {
    var text = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === Node.TEXT_NODE) text += el.childNodes[i].textContent;
    }
    return text.trim();
  }

  function extractElementInfo(el, root, rect) {
    var role = getSemanticRole(el);
    var stableRef = el.dataset.ssRef || generateStableRef(el);
    el.dataset.ssRef = stableRef; // attach for future incremental scans

    var ariaHidden = el.getAttribute('aria-hidden') === 'true';

    var info = {
      tag: el.tagName.toLowerCase(),
      role: role,
      type: el.getAttribute('type') || '',
      name: el.getAttribute('name') || '',
      id: el.id || '',
      placeholder: el.getAttribute('placeholder') || '',
      autocomplete: el.getAttribute('autocomplete') || '',
      labelText: getLabelText(el, root),
      visibleText: getDirectText(el),
      value: (el.value !== undefined) ? el.value : '',
      boundingBox: rect,
      interactive: isInteractive(el, role),
      stableRef: stableRef,
      ariaHidden: ariaHidden,
      children: [], // For structural output
      _element: el
    };

    registry.set(stableRef, info);
    return info;
  }

  function walkNode(node, root, depth, state) {
    if (depth > MAX_DEPTH || state.nodeCount >= MAX_NODES) return null;

    // Check timeout budget
    if (performance.now() - state.startTime > SCAN_BUDGET_MS) {
      if (!state.warned) {
        console.warn('[SafeScreen] Analyzer exceeded scan budget of ' + SCAN_BUDGET_MS + 'ms. Some nodes may be skipped.');
        state.warned = true;
      }
      return null;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      if (SKIP_TAGS.has(node.tagName)) return null;

      // Handle Cross-Origin IFrames
      if (node.tagName === 'IFRAME') {
        var rect = node.getBoundingClientRect();
        if (!isVisible(node, rect)) return null;

        try {
          var iframeDoc = node.contentDocument;
          if (iframeDoc && iframeDoc.body) {
            var info = extractElementInfo(node, root, rect);
            state.nodeCount++;
            var childTree = walkNode(iframeDoc.body, iframeDoc, depth + 1, state);
            if (childTree) info.children.push(childTree);
            return info;
          }
        } catch (e) {
          // Cross-origin - return opaque placeholder
          return { type: 'opaque-region', tag: 'iframe', boundingBox: rect, stableRef: generateStableRef(node), reason: 'cross-origin' };
        }
      }

      var rect = node.getBoundingClientRect();
      if (!isVisible(node, rect)) return null;

      var info = extractElementInfo(node, root, rect);
      state.nodeCount++;

      // Shadow DOM
      if (node.shadowRoot) {
        try {
          var childTree = walkNode(node.shadowRoot, node.shadowRoot, depth + 1, state);
          if (childTree) info.children.push(childTree);
        } catch (e) {
           info.children.push({ type: 'opaque-region', tag: 'shadow-root', boundingBox: rect, reason: 'closed-shadow' });
        }
      }

      var child = node.firstElementChild;
      while (child) {
        var childInfo = walkNode(child, root, depth + 1, state);
        if (childInfo) info.children.push(childInfo);
        child = child.nextElementSibling;
      }
      return info;
    }
    return null;
  }

  function analyzeDOM(doc) {
    var t0 = performance.now();
    var state = { nodeCount: 0, startTime: t0, warned: false };
    registry.clear(); // Reset registry for full re-walk

    var root = doc.body || doc.documentElement || doc;
    var tree = walkNode(root, doc, 0, state);

    var t1 = performance.now();
    stats.lastScanDuration = t1 - t0;
    stats.totalNodes = state.nodeCount;
    stats.scanCount++;

    return {
      tree: tree,
      registry: registry, // In-memory element mapping
      stats: stats
    };
  }

  // Returns true if a node is (or is inside) one of SafeScreen's own
  // redaction overlay boxes, so we can tell mutations WE caused apart
  // from mutations caused by the page itself.
  function isOwnOverlayNode(n) {
    if (!n || n.nodeType !== 1) return false; // only element nodes carry the class
    if (n.classList && n.classList.contains('safescreen-overlay')) return true;
    if (n.closest) {
      try { return !!n.closest('.safescreen-overlay'); } catch (_) { return false; }
    }
    return false;
  }

  function startObserving(doc, onMutation) {
    stopObserving();
    var target = doc.body || doc.documentElement;
    if (!target) return;

    mutationObserver = new MutationObserver(function (mutations) {
      // Ignore mutations that are just SafeScreen adding/removing its own
      // overlay boxes (showOverlays/clearOverlays in content-script.js).
      // Without this, drawing the overlay retriggers the observer, which
      // reruns the pipeline, which redraws the overlay — an infinite loop.
      var relevant = mutations.some(function (m) {
        if (isOwnOverlayNode(m.target)) return false;

        var added   = m.addedNodes   ? Array.prototype.slice.call(m.addedNodes)   : [];
        var removed = m.removedNodes ? Array.prototype.slice.call(m.removedNodes) : [];
        var touched = added.concat(removed);

        if (touched.length === 0) return true; // attribute-only mutation on a real node
        return touched.some(function (n) { return !isOwnOverlayNode(n); });
      });
      if (!relevant) return;

      if (mutationDebounceTimer) clearTimeout(mutationDebounceTimer);
      mutationDebounceTimer = setTimeout(function () {
        console.log('[SafeScreen] Incremental scan triggered');
        // Currently triggering full re-analyze, but in future can be optimized to specific subtrees
        if (onMutation) onMutation();
      }, MUTATION_DEBOUNCE_MS);
    });

    mutationObserver.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'value'] });
  }

  function stopObserving() {
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    if (mutationDebounceTimer) {
      clearTimeout(mutationDebounceTimer);
      mutationDebounceTimer = null;
    }
  }

  function getStats() {
    return stats;
  }

  return {
    analyzeDOM: analyzeDOM,
    startObserving: startObserving,
    stopObserving: stopObserving,
    getStats: getStats
  };
})();