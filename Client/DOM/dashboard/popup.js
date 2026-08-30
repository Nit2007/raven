/**
 * Dashboard popup logic — drives the Analyze/Overlay/Send/ClearCache buttons
 * and renders results into the split-panel view.
 *
 * Shows: cache hit/miss indicator, which PII rule triggered each redaction,
 * rule category for demo transparency.
 */

(function () {
  'use strict';

  var btnAnalyze = document.getElementById('btn-analyze');
  var btnOverlay = document.getElementById('btn-overlay');
  var btnSend = document.getElementById('btn-send');
  var btnAutoRedact = document.getElementById('btn-auto-redact');
  var btnClearCache = document.getElementById('btn-clear-cache');
  var btnOpenViewer = document.getElementById('btn-open-viewer');
  var statsBar = document.getElementById('stats-bar');
  var panelRaw = document.getElementById('panel-raw');
  var panelRedacted = document.getElementById('panel-redacted');
  var gateResult = document.getElementById('gate-result');
  var serverResponse = document.getElementById('server-response');

  var lastResult = null;

  if (btnOpenViewer) {
    btnOpenViewer.addEventListener('click', function () {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/viewer.html') });
    });
  }


  function getActiveTab(cb) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0]) cb(tabs[0]);
    });
  }

  // --- Render helpers ---

  function sensitivityBadge(s) {
    var cls = s === 'SAFE' ? 'el-badge-safe' : s === 'SENSITIVE_FIELD' ? 'el-badge-field' : 'el-badge-text';
    return '<span class="el-badge ' + cls + '">' + s + '</span>';
  }

  function actionBadge(action) {
    var cls = action === 'REDACT' ? 'el-badge-redacted' : action === 'ABSTRACT' ? 'el-badge-abstracted' : 'el-badge-kept';
    return '<span class="el-badge ' + cls + '">' + action + '</span>';
  }

  function esc(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function ruleBadge(ruleId, ruleCategory) {
    if (!ruleId) return '';
    var label = ruleCategory ? ruleCategory : ruleId;
    return '<span class="el-badge el-badge-rule" title="Rule: ' + esc(ruleId) + '">' + esc(label) + '</span>';
  }

  function confidenceMeter(confidence) {
    if (!confidence || confidence <= 0) return '';
    var pct = Math.round(confidence * 100);
    var color = pct >= 90 ? 'var(--red)' : pct >= 70 ? 'var(--yellow)' : 'var(--text-muted)';
    return '<span class="el-confidence" style="color:' + color + '" title="Confidence: ' + pct + '%">' + pct + '%</span>';
  }

  function renderRawCard(el) {
    var html = '<div class="el-card">';
    html += '<div class="el-card-header">';
    html += '<span class="el-tag">&lt;' + esc(el.tag) + '&gt;</span>';
    html += sensitivityBadge(el.sensitivity);
    if (el.ruleId) html += ruleBadge(el.ruleId, el.ruleCategory);
    if (el.confidence) html += confidenceMeter(el.confidence);
    if (el.interactive) html += '<span class="el-badge el-badge-safe">interactive</span>';
    html += '</div>';

    // Meta
    var meta = [];
    if (el.type) meta.push('type="' + esc(el.type) + '"');
    if (el.name) meta.push('name="' + esc(el.name) + '"');
    if (el.id) meta.push('id="' + esc(el.id) + '"');
    if (el.autocomplete) meta.push('autocomplete="' + esc(el.autocomplete) + '"');
    if (meta.length) {
      html += '<div class="el-meta">' + meta.map(function (m) { return '<span>' + m + '</span>'; }).join('') + '</div>';
    }

    // Label
    if (el.labelText) {
      html += '<div class="el-meta"><span>label: "' + esc(el.labelText) + '"</span></div>';
    }

    // Value / text
    var display = el.value || el.visibleText;
    if (display) {
      html += '<div class="el-value">' + esc(display) + '</div>';
    }

    // Reason with rule ID
    if (el.reason) {
      var reasonText = '⚠ ' + esc(el.reason);
      if (el.ruleId) reasonText += ' <span class="el-rule-id">[' + esc(el.ruleId) + ']</span>';
      html += '<div class="el-reason">' + reasonText + '</div>';
    }

    html += '</div>';
    return html;
  }

  function renderRedactedCard(el) {
    var html = '<div class="el-card">';
    html += '<div class="el-card-header">';
    html += '<span class="el-tag">&lt;' + esc(el.tag) + '&gt;</span>';
    if (el.policyAction) html += actionBadge(el.policyAction);
    if (el.ruleId) html += ruleBadge(el.ruleId, el.ruleCategory);
    html += '</div>';

    // Meta (same as raw, but showing what's preserved)
    var meta = [];
    if (el.type) meta.push('type="' + esc(el.type) + '"');
    if (el.name) meta.push('name="' + esc(el.name) + '"');
    if (el.id) meta.push('id="' + esc(el.id) + '"');
    if (meta.length) {
      html += '<div class="el-meta">' + meta.map(function (m) { return '<span>' + m + '</span>'; }).join('') + '</div>';
    }

    // Value / text — show masked version
    var display = el.value || el.visibleText;
    if (display) {
      var isMasked = el.redacted && (el.policyAction === 'REDACT' || display.indexOf('[') !== -1 || display.indexOf('{') !== -1);
      html += '<div class="el-value' + (isMasked ? ' masked' : '') + '">' + esc(display) + '</div>';
    }

    html += '</div>';
    return html;
  }

  // --- Core actions ---

  btnAnalyze.addEventListener('click', function () {
    btnAnalyze.disabled = true;
    btnAnalyze.textContent = 'Scanning…';

    getActiveTab(function (tab) {
      chrome.tabs.sendMessage(tab.id, { action: 'analyze' }, function (response) {
        btnAnalyze.disabled = false;
        btnAnalyze.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85zm-5.242.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/></svg> Analyze Page';

        if (chrome.runtime.lastError) {
          panelRaw.innerHTML = '<div class="empty-state" style="color:var(--red)">Error: ' + esc(chrome.runtime.lastError.message) + '<br><br>Make sure you\'re on a regular web page (not chrome:// or extensions page).</div>';
          return;
        }
        if (!response || !response.success) {
          panelRaw.innerHTML = '<div class="empty-state" style="color:var(--red)">Pipeline error: ' + esc(response ? response.error : 'No response from content script') + '</div>';
          return;
        }

        lastResult = response;
        btnOverlay.disabled = false;
        btnSend.disabled = false;

        // Stats
        statsBar.classList.remove('hidden');
        document.getElementById('stat-total').textContent = response.stats.total;
        document.getElementById('stat-sensitive').textContent = response.stats.sensitive;
        document.getElementById('stat-redacted').textContent = response.stats.redacted;

        // Cache stats
        var cacheEl = document.getElementById('stat-cache');
        var hits = response.stats.cacheHits || 0;
        var misses = response.stats.cacheMisses || 0;
        cacheEl.textContent = hits + '/' + (hits + misses);
        cacheEl.title = hits + ' cache hits, ' + misses + ' misses';

        // Gate
        var gateEl = document.getElementById('stat-gate');
        if (response.check.safe) {
          gateEl.textContent = 'PASS';
          gateEl.style.color = 'var(--green)';
          gateResult.className = 'gate-result gate-pass';
          gateResult.textContent = '✓ Outbound gate passed — no PII leaks detected in payload';
        } else {
          gateEl.textContent = 'FAIL';
          gateEl.style.color = 'var(--red)';
          gateResult.className = 'gate-result gate-fail';
          gateResult.innerHTML = '✗ Outbound gate BLOCKED — leaks detected:<br>' + response.check.leaks.map(esc).join('<br>');
        }
        gateResult.classList.remove('hidden');

        // Render raw panel
        if (response.raw.length === 0) {
          panelRaw.innerHTML = '<div class="empty-state">No elements found</div>';
        } else {
          panelRaw.innerHTML = response.raw.map(renderRawCard).join('');
        }

        // Render redacted panel
        if (response.redacted.length === 0) {
          panelRedacted.innerHTML = '<div class="empty-state">No elements</div>';
        } else {
          panelRedacted.innerHTML = response.redacted.map(renderRedactedCard).join('');
        }

        // Hide server response until explicit send
        serverResponse.classList.add('hidden');
      });
    });
  });

  btnOverlay.addEventListener('click', function () {
    getActiveTab(function (tab) {
      chrome.tabs.sendMessage(tab.id, { action: 'toggleOverlay' }, function (response) {
        if (response && response.overlayActive) {
          btnOverlay.textContent = '🟢 Overlay ON';
        } else {
          btnOverlay.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3.5a4.5 4.5 0 0 0-4.207 2.9A.5.5 0 0 1 3.3 6.8 5.5 5.5 0 0 1 8 2.5a5.5 5.5 0 0 1 4.7 4.3.5.5 0 0 1-.493.6A4.5 4.5 0 0 0 8 3.5zM2 8a6 6 0 1 1 12 0 6 6 0 0 1-12 0z"/></svg> Toggle Overlay';
        }
      });
    });
  });

  btnSend.addEventListener('click', function () {
    if (!lastResult) return;
    serverResponse.classList.remove('hidden');
    var sr = lastResult.serverResponse;
    if (sr) {
      var html = '<div class="sr-label">Server Response</div>';
      html += '<div>Status: ' + sr.status + (sr.ok ? ' OK' : ' Error') + '</div>';
      if (sr.body) {
        html += '<div>Action: ' + (sr.body.action || 'N/A') + '</div>';
        if (sr.body.requestId) html += '<div>Request ID: ' + sr.body.requestId + '</div>';
        if (sr.body.message) html += '<div>Message: ' + sr.body.message + '</div>';
      }
      html += '<div>Payload size: ' + JSON.stringify(lastResult.payload).length + ' bytes</div>';
      serverResponse.innerHTML = html;
    } else {
      serverResponse.innerHTML = '<div class="sr-label">Server Response</div>' +
        '<div style="color:var(--red)">Payload was blocked by outbound gate — not sent.</div>';
    }
  });

  btnClearCache.addEventListener('click', function () {
    getActiveTab(function (tab) {
      chrome.tabs.sendMessage(tab.id, { action: 'clearCache' }, function (response) {
        btnClearCache.textContent = '✓ Cleared';
        setTimeout(function () {
          btnClearCache.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H5.5l1-1h3l1 1H13.5a1 1 0 0 1 1 1v1z"/></svg> Clear Cache';
        }, 1500);
      });
    });
  });

  // Auto Redact Logic
  btnAutoRedact.addEventListener('click', function () {
    chrome.storage.local.get(['autoRedactActive'], function (res) {
      var newState = !res.autoRedactActive;
      chrome.storage.local.set({ autoRedactActive: newState }, function () {
        if (newState) {
          btnAutoRedact.textContent = '🟢 Auto Redact ON';
        } else {
          btnAutoRedact.textContent = 'Auto Redact';
        }
        
        // Broadcast the new state to ALL open tabs
        chrome.tabs.query({}, function (tabs) {
          tabs.forEach(function(tab) {
            chrome.tabs.sendMessage(tab.id, { action: 'setAutoRedact', value: newState }, function() {
              // Ignore errors for tabs where content script isn't injected (e.g. chrome:// pages)
              if (chrome.runtime.lastError) {
                // do nothing
              }
            });
          });
        });
      });
    });
  });

  chrome.storage.local.get(['autoRedactActive'], function (res) {
    if (res.autoRedactActive) {
      btnAutoRedact.textContent = '🟢 Auto Redact ON';
    }
  });

})();
