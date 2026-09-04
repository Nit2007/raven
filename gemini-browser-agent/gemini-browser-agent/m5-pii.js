/**
 * m5-pii.js — RAVEN Milestone M5: Face & PII / Sensitive Content Detection
 *
 * Detects faces inside avatar/profile-photo regions and blurs them LOCALLY,
 * before anything is sent onward. Runs entirely inside the extension's
 * service worker — no image data ever leaves the machine.
 *
 * KEY DESIGN CHOICE: face detection runs on the M1 viewport SCREENSHOT
 * (chrome.tabs.captureVisibleTab), not on <img src> directly. Reading pixels
 * from a cross-origin <img> via canvas throws a SecurityError on most real
 * websites (CDN-hosted avatars almost never set crossorigin="anonymous").
 * A browser-captured screenshot has no such restriction, so this approach
 * works reliably on arbitrary live sites instead of only same-origin test
 * pages.
 *
 * PRIVACY GUARANTEE: the redacted crop/screenshot sent to the Debug Center
 * has blurring already baked into the pixels (not a CSS overlay) before it
 * is broadcast anywhere.
 */

import { getLastM1Result } from './m1-capture.js';

let lastM5Result = null;
export function getLastM5Result() {
  return lastM5Result;
}

// ---------- Config ----------
const CFG = {
  MAX_REGIONS: 12,
  DOWNSCALE_WIDTH: 64,          // per-region mask resolution for speed
  MIN_BLOB_AREA_RATIO: 0.02,
  MAX_BLOB_AREA_RATIO: 0.92,
  MIN_ASPECT: 0.5,
  MAX_ASPECT: 1.8,
  MERGE_DISTANCE_PX: 3,
  PADDING_RATIO: 0.28,
  BLUR_PASSES: 4,
  BLUR_RADIUS_RATIO: 0.18,
  MIN_BLUR_RADIUS: 6,
  MAX_BLUR_RADIUS: 40,
  THUMB_SIZE: 120,
  M1_REUSE_WINDOW_MS: 4000       // reuse M1's screenshot if captured this recently
};

// ---------- Skin-tone chrominance classifier (RGB heuristic, Kovac et al.) ----------
function isSkinPixel(r, g, b) {
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const spread = maxC - minC;
  const uniformLight = r > 95 && g > 40 && b > 20 && spread > 15 && Math.abs(r - g) > 15 && r > g && r > b;
  const lateralLight = r > 220 && g > 210 && b > 170 && Math.abs(r - g) <= 15 && r > b && g > b;
  return uniformLight || lateralLight;
}

function buildSkinMask(ctx, x, y, w, h) {
  const scale = CFG.DOWNSCALE_WIDTH / w;
  const mw = Math.max(6, Math.round(w * scale));
  const mh = Math.max(6, Math.round(h * scale));

  const small = new OffscreenCanvas(mw, mh);
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(ctx.canvas, x, y, w, h, 0, 0, mw, mh);
  const data = sctx.getImageData(0, 0, mw, mh).data;

  const mask = new Uint8Array(mw * mh);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (isSkinPixel(data[i], data[i + 1], data[i + 2])) mask[p] = 1;
  }
  return { mask, mw, mh, scaleX: w / mw, scaleY: h / mh };
}

function findBlobs(mask, w, h) {
  const visited = new Uint8Array(w * h);
  const blobs = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!mask[idx] || visited[idx]) continue;
      let minX = x, maxX = x, minY = y, maxY = y, area = 0;
      const queue = [idx];
      visited[idx] = 1;
      while (queue.length) {
        const cur = queue.pop();
        const cx = cur % w, cy = (cur - cx) / w;
        area++;
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const nIdx = ny * w + nx;
          if (mask[nIdx] && !visited[nIdx]) { visited[nIdx] = 1; queue.push(nIdx); }
        }
      }
      blobs.push({ minX, maxX, minY, maxY, area });
    }
  }
  return blobs;
}

function mergeBlobs(blobs, dist) {
  const merged = [];
  const used = new Array(blobs.length).fill(false);
  for (let i = 0; i < blobs.length; i++) {
    if (used[i]) continue;
    let cur = { ...blobs[i] };
    used[i] = true;
    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < blobs.length; j++) {
        if (used[j]) continue;
        const b = blobs[j];
        const ox = cur.minX - dist <= b.maxX && b.minX - dist <= cur.maxX;
        const oy = cur.minY - dist <= b.maxY && b.minY - dist <= cur.maxY;
        if (ox && oy) {
          cur.minX = Math.min(cur.minX, b.minX); cur.maxX = Math.max(cur.maxX, b.maxX);
          cur.minY = Math.min(cur.minY, b.minY); cur.maxY = Math.max(cur.maxY, b.maxY);
          cur.area += b.area; used[j] = true; changed = true;
        }
      }
    }
    merged.push(cur);
  }
  return merged;
}

function filterFaceCandidates(blobs, w, h) {
  const total = w * h;
  return blobs.filter(b => {
    const bw = b.maxX - b.minX + 1, bh = b.maxY - b.minY + 1;
    const areaRatio = b.area / total;
    const boxAreaRatio = (bw * bh) / total;
    const aspect = bw / bh;
    const fill = b.area / (bw * bh);
    return areaRatio >= CFG.MIN_BLOB_AREA_RATIO && boxAreaRatio <= CFG.MAX_BLOB_AREA_RATIO &&
      aspect >= CFG.MIN_ASPECT && aspect <= CFG.MAX_ASPECT && fill >= 0.35;
  });
}

// ---------- Separable sliding-window box blur (O(1)/px/pass regardless of radius) ----------
function blurH(src, dst, w, h, r) {
  const win = r * 2 + 1;
  for (let row = 0; row < h; row++) {
    const base = row * w * 4;
    let R = 0, G = 0, B = 0, A = 0;
    for (let dx = -r; dx <= r; dx++) {
      const xx = Math.min(w - 1, Math.max(0, dx));
      const idx = base + xx * 4;
      R += src[idx]; G += src[idx + 1]; B += src[idx + 2]; A += src[idx + 3];
    }
    for (let col = 0; col < w; col++) {
      const o = base + col * 4;
      dst[o] = R / win; dst[o + 1] = G / win; dst[o + 2] = B / win; dst[o + 3] = A / win;
      const addX = Math.min(w - 1, col + r + 1), remX = Math.max(0, col - r);
      const ai = base + addX * 4, ri = base + remX * 4;
      R += src[ai] - src[ri]; G += src[ai + 1] - src[ri + 1];
      B += src[ai + 2] - src[ri + 2]; A += src[ai + 3] - src[ri + 3];
    }
  }
}

function blurV(src, dst, w, h, r) {
  const win = r * 2 + 1;
  for (let col = 0; col < w; col++) {
    let R = 0, G = 0, B = 0, A = 0;
    for (let dy = -r; dy <= r; dy++) {
      const yy = Math.min(h - 1, Math.max(0, dy));
      const idx = (yy * w + col) * 4;
      R += src[idx]; G += src[idx + 1]; B += src[idx + 2]; A += src[idx + 3];
    }
    for (let row = 0; row < h; row++) {
      const o = (row * w + col) * 4;
      dst[o] = R / win; dst[o + 1] = G / win; dst[o + 2] = B / win; dst[o + 3] = A / win;
      const addY = Math.min(h - 1, row + r + 1), remY = Math.max(0, row - r);
      const ai = (addY * w + col) * 4, ri = (remY * w + col) * 4;
      R += src[ai] - src[ri]; G += src[ai + 1] - src[ri + 1];
      B += src[ai + 2] - src[ri + 2]; A += src[ai + 3] - src[ri + 3];
    }
  }
}

function blurRegion(ctx, x, y, w, h, radius) {
  if (w <= 0 || h <= 0) return;
  const imgData = ctx.getImageData(x, y, w, h);
  let a = new Uint8ClampedArray(imgData.data);
  let b = new Uint8ClampedArray(a.length);
  for (let p = 0; p < CFG.BLUR_PASSES; p++) {
    blurH(a, b, w, h, radius);
    blurV(b, a, w, h, radius);
  }
  imgData.data.set(a);
  ctx.putImageData(imgData, x, y);
}

/**
 * Broadcasts telemetry to Debug Center tabs, WS relay, BroadcastChannel — same
 * pattern as m1-capture.js / m2-dom.js, kept local (not shared) to match style.
 */
async function broadcastTelemetry(payload) {
  chrome.runtime.sendMessage(payload).catch(() => {});
  try {
    const debugTabs = await chrome.tabs.query({ url: ['*://localhost:5173/*', '*://127.0.0.1:5173/*'] });
    for (const tab of debugTabs) {
      chrome.tabs.sendMessage(tab.id, { ravenTelemetry: true, payload }, async () => {
        if (chrome.runtime.lastError) {
          try {
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['debug-bridge.js'] });
            chrome.tabs.sendMessage(tab.id, { ravenTelemetry: true, payload });
          } catch (_) {}
        }
      });
    }
  } catch (_) {}
  fetch('http://localhost:8765/telemetry', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  }).catch(() => {});
  if (typeof BroadcastChannel !== 'undefined') {
    try { const bc = new BroadcastChannel('raven-telemetry'); bc.postMessage(payload); bc.close(); } catch (_) {}
  }
}

/**
 * Main M5 execution: capture (or reuse M1's) screenshot, ask content.js for
 * avatar-region candidates, run local face detection + blur on those regions
 * of the screenshot bitmap, broadcast the results.
 */
export async function runM5PiiAnalysis(tabId, context = {}) {
  const startTime = performance.now();
  const timestamp = new Date().toISOString();
  const perceptionCycleId = context.perceptionCycleId || `cycle-${context.iteration || 1}-${Date.now()}`;

  if (!tabId) {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      tabId = activeTab?.id;
    } catch (_) {}
  }

  await broadcastTelemetry({
    type: 'EVENT', event: 'M5_PII_ANALYSIS_STARTED', component: 'M5_PII', status: 'running',
    perceptionCycleId, timestamp, metadata: { tabId, iteration: context.iteration || 1 }
  });

  try {
    if (!tabId) throw new Error('Valid target tabId is required for M5 analysis.');
    const targetTab = await chrome.tabs.get(tabId);
    if (!targetTab) throw new Error(`Target tab ${tabId} could not be found.`);

    // 1. Get a screenshot — reuse M1's if it was captured moments ago this cycle
    const m1 = getLastM1Result();
    let dataUrl;
    let dpr = 1;
    if (m1 && m1.screenshot && (Date.now() - new Date(m1.timestamp).getTime()) < CFG.M1_REUSE_WINDOW_MS) {
      dataUrl = m1.screenshot;
      dpr = m1.devicePixelRatio || 1;
    } else {
      dataUrl = await chrome.tabs.captureVisibleTab(targetTab.windowId, { format: 'png' });
      dpr = 1; // unknown here without a metrics round-trip; regions are clamped below regardless
    }
    if (!dataUrl) throw new Error('No screenshot available for M5 face analysis.');

    // 2. Ask content.js for avatar/profile image region candidates (CSS coords)
    const regionData = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { type: 'GET_M5_AVATAR_REGIONS' }, (res) => {
        if (chrome.runtime.lastError || !res || !res.ok) {
          reject(new Error(chrome.runtime.lastError?.message || res?.error || 'No response from content script for M5 regions'));
        } else {
          resolve(res.data);
        }
      });
    });
    if (regionData?.viewport?.devicePixelRatio) dpr = regionData.viewport.devicePixelRatio;

    const regions = (regionData?.regions || []).slice(0, CFG.MAX_REGIONS);

    // 3. Decode screenshot into an OffscreenCanvas (service worker context — no CORS taint, ever)
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);

    const items = [];
    let facesDetected = 0;

    for (const region of regions) {
      const x = Math.max(0, Math.round(region.x * dpr));
      const y = Math.max(0, Math.round(region.y * dpr));
      const w = Math.min(canvas.width - x, Math.round(region.width * dpr));
      const h = Math.min(canvas.height - y, Math.round(region.height * dpr));
      if (w < 8 || h < 8) continue;

      let maskInfo;
      try {
        maskInfo = buildSkinMask(ctx, x, y, w, h);
      } catch (_) {
        continue; // shouldn't happen (no CORS issue here) but stay non-fatal
      }

      const candidates = filterFaceCandidates(
        mergeBlobs(findBlobs(maskInfo.mask, maskInfo.mw, maskInfo.mh), CFG.MERGE_DISTANCE_PX),
        maskInfo.mw, maskInfo.mh
      );
      if (candidates.length === 0) continue;

      // Treat the whole region as one face box (avatar photos are single-subject)
      const best = candidates.reduce((a, b) => (a.area > b.area ? a : b));
      const bw = best.maxX - best.minX + 1, bh = best.maxY - best.minY + 1;
      const padX = bw * CFG.PADDING_RATIO, padY = bh * CFG.PADDING_RATIO;

      const fx = Math.max(0, x + Math.round((best.minX - padX) * maskInfo.scaleX));
      const fy = Math.max(0, y + Math.round((best.minY - padY) * maskInfo.scaleY));
      const fw = Math.min(canvas.width - fx, Math.round((bw + 2 * padX) * maskInfo.scaleX));
      const fh = Math.min(canvas.height - fy, Math.round((bh + 2 * padY) * maskInfo.scaleY));

      const radius = Math.min(CFG.MAX_BLUR_RADIUS, Math.max(CFG.MIN_BLUR_RADIUS, Math.round(fw * CFG.BLUR_RADIUS_RATIO)));
      blurRegion(ctx, fx, fy, fw, fh, radius);
      facesDetected++;

      // Compact thumbnail of the (now-blurred) crop for the M5 table/gallery
      const thumb = new OffscreenCanvas(CFG.THUMB_SIZE, CFG.THUMB_SIZE);
      const tctx = thumb.getContext('2d');
      tctx.drawImage(canvas, fx, fy, fw, fh, 0, 0, CFG.THUMB_SIZE, CFG.THUMB_SIZE);
      const thumbBlob = await thumb.convertToBlob({ type: 'image/png' });
      const thumbDataUrl = await blobToDataUrl(thumbBlob);

      items.push({
        id: `FACE-${items.length + 1}`,
        category: 'Face / Avatar',
        confidence: Math.min(0.95, 0.5 + best.area / (maskInfo.mw * maskInfo.mh)),
        box: { x: fx, y: fy, width: fw, height: fh },
        stage: 'sanitized', // already blurred in-pixel before this ever left the page
        thumbnailDataUrl: thumbDataUrl,
        matchType: region.matchType
      });
    }

    // Full-page screenshot with all detected faces blurred — for a dashboard hero visual
    const fullBlob = await canvas.convertToBlob({ type: 'image/png' });
    const redactedScreenshotUrl = await blobToDataUrl(fullBlob);

    const latencyMs = Math.round(performance.now() - startTime);
    const m5Result = {
      status: 'success', perceptionCycleId, timestamp: new Date().toISOString(), latencyMs,
      facesDetected, piiDetected: 0, sensitiveRegions: facesDetected,
      items, redactedScreenshotUrl, regionsScanned: regions.length
    };
    lastM5Result = m5Result;
    await chrome.storage.local.set({ last_m5_result: m5Result });

    await broadcastTelemetry({
      type: 'EVENT', event: 'M5_PII_ANALYSIS_COMPLETED', component: 'M5_PII', status: 'success',
      perceptionCycleId, timestamp: m5Result.timestamp, latencyMs,
      metadata: { facesDetected, regionsScanned: regions.length }
    });

    await broadcastTelemetry({
      type: 'M5_RESULT', status: 'success', executionTimeMs: latencyMs,
      summary: `${facesDetected} face${facesDetected === 1 ? '' : 's'} detected & blurred across ${regions.length} candidate region(s)`,
      items, facesDetected, piiDetected: 0, sensitiveRegions: facesDetected, gateStatus: 'passed',
      details: { perceptionCycleId, latencyMs, regionsScanned: regions.length, redactedScreenshotUrl, timestamp: m5Result.timestamp }
    });

    return { ok: true, data: m5Result };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - startTime);
    const errorMessage = err instanceof Error ? err.message : String(err);

    await broadcastTelemetry({
      type: 'EVENT', event: 'M5_PII_ANALYSIS_FAILED', component: 'M5_PII', status: 'error',
      perceptionCycleId, timestamp: new Date().toISOString(), latencyMs, metadata: { error: errorMessage, tabId }
    });
    await broadcastTelemetry({
      type: 'M5_RESULT', status: 'error', executionTimeMs: latencyMs,
      summary: `M5 face/PII analysis failed: ${errorMessage}`,
      details: { perceptionCycleId, error: errorMessage, latencyMs }
    });

    return { ok: false, status: 'error', error: errorMessage, perceptionCycleId, latencyMs };
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}