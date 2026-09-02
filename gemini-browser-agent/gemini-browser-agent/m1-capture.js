/**
 * m1-capture.js — RAVEN Milestone M1: Real Browser Viewport / Screenshot Capture
 * Captures real visible browser viewport with dynamic aspect ratio, DPR, image dimensions,
 * latency metrics, and real lifecycle event broadcasting.
 * 
 * PRIVACY GUARANTEE: Raw screenshot is retained strictly locally for M1-M6 perception
 * and is NEVER transmitted to external LLM APIs (Gemini).
 */

let lastM1Result = null;

export function getLastM1Result() {
  return lastM1Result;
}

/**
 * Calculates dynamic aspect ratio:
 * - Numerical aspect ratio: width / height
 * - Human-readable ratio representation (e.g. "approximately 16:9" or dynamic simplified ratio)
 */
export function calculateAspectRatio(width, height) {
  if (!width || !height || height === 0) {
    return { aspectRatio: 0, ratio: '—' };
  }

  const numerical = Number((width / height).toFixed(4));

  // Common display standard aspect ratios (with +/- 0.035 tolerance)
  const standards = [
    { name: '16:9', val: 16 / 9 },
    { name: '16:10', val: 16 / 10 },
    { name: '4:3', val: 4 / 3 },
    { name: '3:2', val: 3 / 2 },
    { name: '5:4', val: 5 / 4 },
    { name: '1:1', val: 1 },
    { name: '21:9', val: 21 / 9 },
    { name: '32:9', val: 32 / 9 },
    { name: '9:16', val: 9 / 16 },
    { name: '9:21', val: 9 / 21 }
  ];

  for (const s of standards) {
    if (Math.abs(numerical - s.val) <= 0.035) {
      return {
        aspectRatio: numerical,
        ratio: `approximately ${s.name}`
      };
    }
  }

  // Greatest Common Divisor for dynamic fraction reduction
  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
      const t = b;
      b = a % b;
      a = t;
    }
    return a;
  }

  const divisor = gcd(Math.round(width), Math.round(height));
  const simW = Math.round(width / divisor);
  const simH = Math.round(height / divisor);

  if (simW <= 60 && simH <= 60) {
    return {
      aspectRatio: numerical,
      ratio: `${simW}:${simH}`
    };
  }

  return {
    aspectRatio: numerical,
    ratio: `${numerical}:1`
  };
}

/**
 * Parses PNG binary header to extract exact encoded image dimensions without Canvas DOM overhead
 */
function extractPngDimensions(dataUrl) {
  try {
    const base64Part = dataUrl.split(',')[1];
    if (!base64Part) return null;
    // Decode first 48 bytes of the binary data
    const binaryPrefix = atob(base64Part.slice(0, 60));
    // Verify PNG signature: 0x89 'P' 'N' 'G'
    if (binaryPrefix.charCodeAt(0) === 0x89 && binaryPrefix.charCodeAt(1) === 0x50) {
      const width = ((binaryPrefix.charCodeAt(16) << 24) >>> 0) +
                    (binaryPrefix.charCodeAt(17) << 16) +
                    (binaryPrefix.charCodeAt(18) << 8) +
                    binaryPrefix.charCodeAt(19);
      const height = ((binaryPrefix.charCodeAt(20) << 24) >>> 0) +
                     (binaryPrefix.charCodeAt(21) << 16) +
                     (binaryPrefix.charCodeAt(22) << 8) +
                     binaryPrefix.charCodeAt(23);
      return { width, height };
    }
  } catch (err) {
    console.warn('[M1 Capture] Error parsing PNG header:', err);
  }
  return null;
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Broadcasts events and telemetry to Debug Center tabs and runtime listeners
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
      chrome.tabs.sendMessage(tab.id, { ravenTelemetry: true, payload }, async (response) => {
        if (chrome.runtime.lastError) {
          // If content script wasn't injected (tab was open before extension reload), inject it now and re-send!
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
 * Main M1 Execution: Real Viewport / Screenshot Capture
 */
export async function captureViewportM1(tabId, context = {}) {
  const startTime = performance.now();
  const timestamp = new Date().toISOString();
  const captureId = `cap-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const perceptionCycleId = context.perceptionCycleId || `cycle-${context.iteration || 1}-${Date.now()}`;

  // If no tabId passed, locate the currently focused active tab
  if (!tabId) {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      tabId = activeTab?.id;
    } catch (_) {}
  }

  // Emit M1_CAPTURE_STARTED lifecycle event
  await broadcastTelemetry({
    type: 'EVENT',
    event: 'M1_CAPTURE_STARTED',
    component: 'M1_SCREENSHOT',
    status: 'running',
    captureId,
    perceptionCycleId,
    timestamp,
    metadata: {
      tabId,
      iteration: context.iteration || 1
    }
  });

  try {
    if (!tabId) {
      throw new Error('Valid target tabId is required for viewport capture.');
    }

    const targetTab = await chrome.tabs.get(tabId);
    if (!targetTab) {
      throw new Error(`Target tab ${tabId} could not be found.`);
    }

    // Attempt to query content script for real CSS viewport metrics
    let cssWidth = targetTab.width || 0;
    let cssHeight = targetTab.height || 0;
    let devicePixelRatio = 1;
    let pageUrl = targetTab.url || '';
    let pageTitle = targetTab.title || '';

    try {
      const metrics = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { type: 'GET_VIEWPORT_METRICS' }, (res) => {
          if (chrome.runtime.lastError || !res || !res.ok) {
            reject(new Error(chrome.runtime.lastError?.message || 'No metrics response'));
          } else {
            resolve(res.data);
          }
        });
      });

      if (metrics) {
        if (metrics.cssWidth) cssWidth = metrics.cssWidth;
        if (metrics.cssHeight) cssHeight = metrics.cssHeight;
        if (metrics.devicePixelRatio) devicePixelRatio = metrics.devicePixelRatio;
        if (metrics.url) pageUrl = metrics.url;
        if (metrics.title) pageTitle = metrics.title;
      }
    } catch (_metricsErr) {
      // Content script may not be ready or page restricted; tab metrics serve as fallback
    }

    // Execute actual browser viewport capture
    const dataUrl = await chrome.tabs.captureVisibleTab(targetTab.windowId, { format: 'png' });

    if (!dataUrl || !dataUrl.startsWith('data:image/png')) {
      throw new Error('captureVisibleTab returned empty or invalid image stream.');
    }

    const latencyMs = Math.round(performance.now() - startTime);

    // Parse encoded physical image dimensions and byte size
    const base64Data = dataUrl.split(',')[1] || '';
    const sizeBytes = Math.round((base64Data.length * 3) / 4);
    const pngDims = extractPngDimensions(dataUrl) || {
      width: Math.round(cssWidth * devicePixelRatio),
      height: Math.round(cssHeight * devicePixelRatio)
    };

    const imageWidth = pngDims.width;
    const imageHeight = pngDims.height;

    // Calculate dynamic aspect ratio
    const viewportRatio = calculateAspectRatio(cssWidth, cssHeight);
    const imageRatio = calculateAspectRatio(imageWidth, imageHeight);

    const m1Result = {
      status: 'success',
      captureId,
      perceptionCycleId,
      timestamp: new Date().toISOString(),
      viewport: {
        width: cssWidth,
        height: cssHeight,
        aspectRatio: viewportRatio.aspectRatio,
        ratio: viewportRatio.ratio
      },
      devicePixelRatio,
      image: {
        format: 'image/png',
        width: imageWidth,
        height: imageHeight,
        sizeBytes,
        sizeFormatted: formatBytes(sizeBytes),
        aspectRatio: imageRatio.aspectRatio,
        ratio: imageRatio.ratio
      },
      latencyMs,
      screenshot: dataUrl,
      page: {
        url: pageUrl,
        title: pageTitle
      }
    };

    lastM1Result = m1Result;
    await chrome.storage.local.set({ last_m1_result: m1Result });

    // Emit M1_CAPTURE_COMPLETED lifecycle event
    await broadcastTelemetry({
      type: 'EVENT',
      event: 'M1_CAPTURE_COMPLETED',
      component: 'M1_SCREENSHOT',
      status: 'success',
      captureId,
      perceptionCycleId,
      timestamp: m1Result.timestamp,
      latencyMs,
      metadata: {
        viewport: m1Result.viewport,
        devicePixelRatio,
        imageSize: m1Result.image.sizeFormatted,
        imageDimensions: `${imageWidth}x${imageHeight}`
      }
    });

    // Send M1 result update to Debug Center
    await broadcastTelemetry({
      type: 'M1_RESULT',
      status: 'success',
      executionTimeMs: latencyMs,
      summary: `Viewport captured (${cssWidth}x${cssHeight}, DPR ${devicePixelRatio})`,
      screenshotUrl: dataUrl,
      details: {
        captureId,
        perceptionCycleId,
        viewport: m1Result.viewport,
        image: m1Result.image,
        devicePixelRatio,
        latencyMs,
        timestamp: m1Result.timestamp
      }
    });

    // Also update browser state in Debug Center
    await broadcastTelemetry({
      type: 'BROWSER_STATE_CHANGED',
      url: pageUrl,
      title: pageTitle,
      iteration: context.iteration || 1,
      state: 'Active (Captured)',
      screenshotUrl: dataUrl
    });

    return { ok: true, data: m1Result };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - startTime);
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Emit M1_CAPTURE_FAILED lifecycle event
    await broadcastTelemetry({
      type: 'EVENT',
      event: 'M1_CAPTURE_FAILED',
      component: 'M1_SCREENSHOT',
      status: 'error',
      captureId,
      perceptionCycleId,
      timestamp: new Date().toISOString(),
      latencyMs,
      metadata: {
        error: errorMessage,
        tabId
      }
    });

    // Broadcast M1 failure state to Debug Center
    await broadcastTelemetry({
      type: 'M1_RESULT',
      status: 'error',
      executionTimeMs: latencyMs,
      summary: `Capture failed: ${errorMessage}`,
      details: {
        captureId,
        perceptionCycleId,
        error: errorMessage,
        latencyMs
      }
    });

    return {
      ok: false,
      status: 'error',
      error: errorMessage,
      captureId,
      perceptionCycleId,
      latencyMs
    };
  }
}
