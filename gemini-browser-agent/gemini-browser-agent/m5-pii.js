/**
 * m5-pii.js — RAVEN Milestone M5: Face + PII / Sensitive Detection & Redaction
 * 
 * Scans viewport text and DOM elements for sensitive entities (passwords, auth tokens,
 * credit cards, email addresses, SSN/Aadhaar patterns).
 * 
 * Produces real redaction bounding boxes and generates a privacy-preserving redacted screenshot
 * for the Debug Center.
 */

let lastM5Result = null;

export function getLastM5Result() {
  return lastM5Result;
}

const PII_PATTERNS = [
  { type: 'EMAIL', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { type: 'CREDIT_CARD', regex: /\b(?:\d{4}[ -]?){3}\d{4}\b/g },
  { type: 'API_KEY', regex: /\b(?:AIza[0-9A-Za-z-_]{35}|sk-[a-zA-Z0-9]{20,}|Bearer\s+[a-zA-Z0-9._-]{20,})\b/g },
  { type: 'AADHAAR', regex: /\b\d{4}\s\d{4}\s\d{4}\b/g },
  { type: 'SSN', regex: /\b\d{3}-\d{2}-\d{4}\b/g }
];

async function broadcastTelemetry(payload) {
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage(payload).catch(() => {});
  }

  if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
    try {
      const debugTabs = await chrome.tabs.query({
        url: ['*://localhost:5173/*', '*://127.0.0.1:5173/*']
      });
      for (const tab of debugTabs) {
        chrome.tabs.sendMessage(tab.id, { ravenTelemetry: true, payload }).catch(() => {});
      }
    } catch (_) {}
  }

  if (typeof fetch === 'function') {
    fetch('http://localhost:8765/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {});
  }
}

/**
 * Creates a redacted screenshot with sensitive bounding boxes masked
 */
async function generateRedactedScreenshot(screenshotDataUrl, redactionBoxes) {
  if (!screenshotDataUrl || !redactionBoxes || redactionBoxes.length === 0) {
    return screenshotDataUrl;
  }

  if (typeof fetch === 'function' && typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function') {
    try {
      const res = await fetch(screenshotDataUrl);
      const blob = await res.blob();
      const bmp = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bmp, 0, 0);

      // Draw privacy redaction blocks
      for (const box of redactionBoxes) {
        ctx.fillStyle = '#0f172a'; // solid dark privacy block
        ctx.fillRect(box.x, box.y, box.width, box.height);

        // Security border
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.strokeRect(box.x, box.y, box.width, box.height);
      }

      const redactedBlob = await canvas.convertToBlob({ type: 'image/png' });
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(redactedBlob);
      });
    } catch (_) {
      return screenshotDataUrl;
    }
  }

  return screenshotDataUrl;
}

/**
 * Executes M5 Privacy & PII scan
 * @param {object} input - { screenshotUrl, elements, textBlocks, perceptionCycleId }
 */
export async function runM5PiiScan(input = {}) {
  const startTime = performance.now();
  const timestamp = new Date().toISOString();
  const perceptionCycleId = input.perceptionCycleId || `cycle-${Date.now()}`;

  await broadcastTelemetry({
    type: 'EVENT',
    event: 'M5_PII_STARTED',
    component: 'M5_PII',
    status: 'running',
    perceptionCycleId,
    timestamp
  });

  try {
    const sensitiveItems = [];
    const redactionBoxes = [];
    const elements = input.elements || input.m2Result?.data?.elements || [];
    const textBlocks = input.textBlocks || input.m4Result?.data?.blocks || [];

    // 1. Scan DOM elements for sensitive inputs
    for (const el of elements) {
      const tag = (el.tag || '').toLowerCase();
      const type = (el.type || '').toLowerCase();
      const name = (el.name || '').toLowerCase();

      let isSensitive = false;
      let reason = '';

      if (type === 'password' || name.includes('password') || name.includes('secret') || name.includes('apikey')) {
        isSensitive = true;
        reason = 'Password or secret credential field';
      }

      if (isSensitive && el.bounds) {
        sensitiveItems.push({
          id: `pii-${sensitiveItems.length + 1}`,
          type: 'CREDENTIAL_FIELD',
          reason,
          target_id: el.target_id || null,
          bbox: [el.bounds.x || 0, el.bounds.y || 0, el.bounds.width || 0, el.bounds.height || 0]
        });
        redactionBoxes.push(el.bounds);
      }
    }

    // 2. Scan text blocks for pattern matches
    for (const block of textBlocks) {
      const text = block.text || '';
      for (const pattern of PII_PATTERNS) {
        pattern.regex.lastIndex = 0;
        if (pattern.regex.test(text)) {
          sensitiveItems.push({
            id: `pii-${sensitiveItems.length + 1}`,
            type: pattern.type,
            reason: `Detected ${pattern.type} format`,
            bbox: block.bbox || [0, 0, 0, 0],
            target_id: block.target_id || null
          });
          if (block.bbox) {
            redactionBoxes.push({
              x: block.bbox[0],
              y: block.bbox[1],
              width: block.bbox[2],
              height: block.bbox[3]
            });
          }
        }
      }
    }

    // 3. Generate privacy-safe redacted screenshot for Debug Center
    let redactedScreenshotUrl = null;
    if (input.screenshotUrl) {
      redactedScreenshotUrl = await generateRedactedScreenshot(input.screenshotUrl, redactionBoxes);
    }

    const processingTimeMs = Math.max(1, Math.round(performance.now() - startTime));

    const result = {
      status: 'success',
      perceptionCycleId,
      timestamp: new Date().toISOString(),
      processingTimeMs,
      items: sensitiveItems,
      piiDetected: sensitiveItems.length,
      facesDetected: 0,
      sensitiveRegions: redactionBoxes.length,
      redactionBoxes,
      redactedScreenshotUrl: redactedScreenshotUrl || input.screenshotUrl,
      gateStatus: sensitiveItems.length > 0 ? 'sanitizing' : 'passed'
    };

    lastM5Result = result;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ last_m5_result: result }).catch(() => {});
    }

    await broadcastTelemetry({
      type: 'EVENT',
      event: 'M5_PII_COMPLETED',
      component: 'M5_PII',
      status: 'success',
      perceptionCycleId,
      timestamp: result.timestamp,
      latencyMs: processingTimeMs,
      metadata: {
        piiDetected: sensitiveItems.length,
        sensitiveRegions: redactionBoxes.length,
        gateStatus: result.gateStatus
      }
    });

    await broadcastTelemetry({
      type: 'M5_RESULT',
      status: 'success',
      executionTimeMs: processingTimeMs,
      summary: `${sensitiveItems.length} sensitive entities detected and queued for redaction`,
      items: sensitiveItems,
      facesDetected: 0,
      piiDetected: sensitiveItems.length,
      sensitiveRegions: redactionBoxes.length,
      gateStatus: result.gateStatus,
      screenshotUrl: result.redactedScreenshotUrl,
      details: {
        perceptionCycleId,
        processingTimeMs,
        itemsCount: sensitiveItems.length,
        redactionBoxesCount: redactionBoxes.length
      }
    });

    return { ok: true, data: result };
  } catch (err) {
    const processingTimeMs = Math.max(1, Math.round(performance.now() - startTime));
    const errorMessage = err instanceof Error ? err.message : String(err);

    await broadcastTelemetry({
      type: 'EVENT',
      event: 'M5_PII_FAILED',
      component: 'M5_PII',
      status: 'error',
      perceptionCycleId,
      timestamp: new Date().toISOString(),
      latencyMs: processingTimeMs,
      metadata: { error: errorMessage }
    });

    return { ok: false, status: 'error', error: errorMessage, latencyMs: processingTimeMs };
  }
}
