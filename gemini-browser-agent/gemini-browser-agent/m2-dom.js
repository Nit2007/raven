/**
 * m2-dom.js — RAVEN Milestone M2: Semantic DOM Perception & Spatial DOM Analysis
 * Orchestrates DOM hierarchy traversal, ARIA role mapping, visibility categorization,
 * occlusion hit-testing, and M1-aligned spatial coordinate extraction.
 * 
 * PRIVACY GUARANTEE: Raw DOM data is retained strictly locally for M1-M6 perception
 * and is NEVER transmitted to external LLM APIs (Gemini).
 */

let lastM2Result = null;

export function getLastM2Result() {
  return lastM2Result;
}

/**
 * Broadcasts M2 events and telemetry to Debug Center tabs, WebSocket relay, and runtime listeners
 */
async function broadcastTelemetry(payload) {
  // 1. Send via chrome.runtime for popup & background listeners
  chrome.runtime.sendMessage(payload).catch(() => {});

  // 2. Query open tabs to find RAVEN Debug Center (http://localhost:5173 or 127.0.0.1:5173)
  try {
    const debugTabs = await chrome.tabs.query({
      url: ['*://localhost:5173/*', '*://127.0.0.1:5173/*']
    });
    for (const tab of debugTabs) {
      chrome.tabs.sendMessage(tab.id, { ravenTelemetry: true, payload }, async () => {
        if (chrome.runtime.lastError) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['debug-bridge.js']
            });
            chrome.tabs.sendMessage(tab.id, { ravenTelemetry: true, payload });
          } catch (_) {}
        }
      });
    }
  } catch (_) {}

  // 3. Send to local Telemetry Relay server on port 8765 (bridges to WebSocket clients)
  fetch('http://localhost:8765/telemetry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(() => {});

  // 4. Send via BroadcastChannel (for same-origin or compatible worker contexts)
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const bc = new BroadcastChannel('raven-telemetry');
      bc.postMessage(payload);
      bc.close();
    } catch (_) {}
  }
}

/**
 * Main M2 Execution: Semantic DOM Perception & Spatial Analysis
 */
export async function runM2DomAnalysis(tabId, context = {}) {
  const startTime = performance.now();
  const timestamp = new Date().toISOString();
  const perceptionCycleId = context.perceptionCycleId || `cycle-${context.iteration || 1}-${Date.now()}`;

  // If no tabId passed, locate the currently focused active tab
  if (!tabId) {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      tabId = activeTab?.id;
    } catch (_) {}
  }

  // Emit M2_DOM_ANALYSIS_STARTED lifecycle event
  await broadcastTelemetry({
    type: 'EVENT',
    event: 'M2_DOM_ANALYSIS_STARTED',
    component: 'M2_DOM',
    status: 'running',
    perceptionCycleId,
    timestamp,
    metadata: {
      tabId,
      iteration: context.iteration || 1
    }
  });

  try {
    if (!tabId) {
      throw new Error('Valid target tabId is required for DOM analysis.');
    }

    const targetTab = await chrome.tabs.get(tabId);
    if (!targetTab) {
      throw new Error(`Target tab ${tabId} could not be found.`);
    }

    // Ensure content script is injected
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    } catch (_) {}

    // Send request to content script for comprehensive semantic DOM analysis
    const analysisResponse = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { type: 'GET_M2_DOM_ANALYSIS' }, (res) => {
        if (chrome.runtime.lastError || !res || !res.ok) {
          reject(new Error(chrome.runtime.lastError?.message || res?.error || 'No response from DOM analyzer in content script'));
        } else {
          resolve(res.data);
        }
      });
    });

    const latencyMs = Math.round(performance.now() - startTime);

    const m2Result = {
      status: 'success',
      perceptionCycleId,
      timestamp: new Date().toISOString(),
      latencyMs,
      page: {
        url: analysisResponse.url || targetTab.url || '',
        title: analysisResponse.title || targetTab.title || ''
      },
      viewport: analysisResponse.viewport || {
        width: targetTab.width || 0,
        height: targetTab.height || 0,
        devicePixelRatio: 1
      },
      counts: analysisResponse.counts || {
        total: 0,
        visible: 0,
        interactive: 0,
        editable: 0,
        occluded: 0,
        partiallyOccluded: 0
      },
      roles: analysisResponse.roles || {},
      elements: analysisResponse.elements || [],
      tree: analysisResponse.tree || []
    };

    lastM2Result = m2Result;
    await chrome.storage.local.set({ last_m2_result: m2Result });

    // Emit M2_DOM_ANALYSIS_COMPLETED lifecycle event
    await broadcastTelemetry({
      type: 'EVENT',
      event: 'M2_DOM_ANALYSIS_COMPLETED',
      component: 'M2_DOM',
      status: 'success',
      perceptionCycleId,
      timestamp: m2Result.timestamp,
      latencyMs,
      metadata: {
        totalElements: m2Result.counts.total,
        visibleElements: m2Result.counts.visible,
        interactiveElements: m2Result.counts.interactive,
        occludedElements: m2Result.counts.occluded,
        rolesSummary: m2Result.roles
      }
    });

    // Send M2 result update to Debug Center
    await broadcastTelemetry({
      type: 'M2_RESULT',
      status: 'success',
      executionTimeMs: latencyMs,
      summary: `${m2Result.counts.total} elements indexed (${m2Result.counts.interactive} interactive, ${m2Result.counts.visible} visible)`,
      totalElements: m2Result.counts.total,
      interactiveElements: m2Result.counts.interactive,
      visibleElements: m2Result.counts.visible,
      roles: m2Result.roles,
      tree: m2Result.elements, // List of elements with bounds for table & inspector
      details: {
        perceptionCycleId,
        latencyMs,
        counts: m2Result.counts,
        roles: m2Result.roles,
        viewport: m2Result.viewport,
        elementsCount: m2Result.elements.length,
        timestamp: m2Result.timestamp
      }
    });

    return { ok: true, data: m2Result };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - startTime);
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Emit M2_DOM_ANALYSIS_FAILED lifecycle event
    await broadcastTelemetry({
      type: 'EVENT',
      event: 'M2_DOM_ANALYSIS_FAILED',
      component: 'M2_DOM',
      status: 'error',
      perceptionCycleId,
      timestamp: new Date().toISOString(),
      latencyMs,
      metadata: {
        error: errorMessage,
        tabId
      }
    });

    // Broadcast M2 error state to Debug Center
    await broadcastTelemetry({
      type: 'M2_RESULT',
      status: 'error',
      executionTimeMs: latencyMs,
      summary: `DOM analysis failed: ${errorMessage}`,
      details: {
        perceptionCycleId,
        error: errorMessage,
        latencyMs
      }
    });

    return {
      ok: false,
      status: 'error',
      error: errorMessage,
      perceptionCycleId,
      latencyMs
    };
  }
}
