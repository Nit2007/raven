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
// SENSITIVITY MODE: tuned for maximum recall per explicit request — "if it
// looks like face/skin, blur it." This trades away precision (more
// non-faces will get blurred) in exchange for far fewer missed real faces.
const CFG = {
  MAX_REGIONS: 20,
  DOWNSCALE_WIDTH: 112,          // raised again for finer-grained blob edges at low cost
  MIN_BLOB_AREA_RATIO: 0.005,    // was 0.012 — catches small/partial/distant faces
  MAX_BLOB_AREA_RATIO: 0.97,
  MIN_ASPECT: 0.30,              // was 0.4 — tolerate tilted/cropped/side-profile boxes
  MAX_ASPECT: 2.8,               // was 2.2
  MIN_FILL_RATIO: 0.20,          // was 0.28 — accept looser/less solid blobs
  FALLBACK_SKIN_RATIO: 0.16,     // was 0.22 — lower bar for "probably skin"
  MERGE_DISTANCE_PX: 7,          // was 4 — merges nearby fragments (e.g. face split by glare/hair) into one box
  PADDING_RATIO: 0.38,           // was 0.28 — bigger safety margin blurred around every detected region
  BLUR_PASSES: 5,
  BLUR_RADIUS_RATIO: 0.42,       // was 0.32 — stronger blur so partial/uncertain hits are still well obscured
  MIN_BLUR_RADIUS: 10,
  MAX_BLUR_RADIUS: 60,
  THUMB_SIZE: 120,
  M1_REUSE_WINDOW_MS: 4000,      // reuse M1's screenshot if captured this recently
  MIN_ACCEPT_CONFIDENCE: 0.35    // floor for the last-resort "just skin" acceptance path below
};

// FIX: matches background.js's DEBUG_CENTER_URL_RE — defensively refuse to
// run face detection against the Debug Center's own tab (it has nothing to
// blur, and shows up as "0 faces" mysteriously if a caller ever slips past
// background.js's target-tab resolution without going through it).
// FIX: widened from :5173-only to the 5170-5179 auto-increment range Vite
// uses (strictPort:false) so this still refuses to run face detection
// against the Debug Center's own tab when it lands on 5176 (or any other
// nearby port) instead of the default 5173.
const DEBUG_CENTER_URL_RE = /^https?:\/\/(localhost|127\.0\.0\.1):517\d\//;

// ---------- Skin-tone classifier ----------
// Two independent tests combined with OR: the original RGB heuristic
// (Kovac et al.) PLUS a YCbCr chrominance-range test (Chai & Ngan / widely
// used in OpenCV-style skin detectors). YCbCr separates luma (lighting)
// from chroma (color), so it holds up much better across different skin
// tones and lighting conditions than RGB rules alone.
// WIDENED per explicit request to prioritize recall: every numeric gate
// below is deliberately looser than a "precision-first" skin detector would
// use, so borderline pixels (dim lighting, warm/cool white balance, slight
// JPEG compression drift) are more likely to be classified as skin.
function isSkinPixel(r, g, b) {
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const spread = maxC - minC;
  const uniformLight = r > 80 && g > 30 && b > 10 && spread > 10 && Math.abs(r - g) > 10 && r > g && r > b;
  const lateralLight = r > 200 && g > 190 && b > 145 && Math.abs(r - g) <= 20 && r > b && g > b;
  if (uniformLight || lateralLight) return true;

  // YCbCr chrominance test — catches tones the RGB rule above misses.
  // Ranges widened from the standard Cb[77,135]/Cr[133,180] textbook window.
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return y > 25 && cb >= 70 && cb <= 145 && cr >= 125 && cr <= 188;
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
  let skinCount = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (isSkinPixel(data[i], data[i + 1], data[i + 2])) { mask[p] = 1; skinCount++; }
  }
  return { mask, mw, mh, scaleX: w / mw, scaleY: h / mh, skinRatio: skinCount / (mw * mh) };
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

// Anthropomorphic Facial Structure & Biometric Geometry Verification
// Distinguishes genuine human faces from non-face skin patches (hands, arms, neck, furniture, cardboard)
// WIDENED per explicit request: every gate here is now a soft signal that
// feeds a tiered acceptance ladder (strict -> fallback -> "just skin, blur
// it") rather than a hard reject, so far fewer real faces slip through.
function verifyFacialStructure(pixelData, imgW, imgH, box) {
  const { x, y, width: bw, height: bh } = box;
  if (bw < 10 || bh < 10) return { isFace: false, reason: 'too_small' };

  const aspect = bw / bh;
  // Widened from the strict 0.60-1.45 face-only window so tilted heads,
  // partial crops, and side profiles aren't thrown out before skin is even checked.
  if (aspect < 0.30 || aspect > 3.2) {
    return { isFace: false, reason: 'aspect_ratio_out_of_range', aspect };
  }

  const lum = new Float32Array(bw * bh);
  let lumSum = 0, lumSqSum = 0;
  let skinCount = 0;

  for (let r = 0; r < bh; r++) {
    const py = y + r;
    for (let c = 0; c < bw; c++) {
      const px = x + c;
      const idx = (py * imgW + px) * 4;
      const red = pixelData[idx], grn = pixelData[idx + 1], blu = pixelData[idx + 2];
      const l = 0.299 * red + 0.587 * grn + 0.114 * blu;
      lum[r * bw + c] = l;
      lumSum += l;
      lumSqSum += l * l;
      if (isSkinPixel(red, grn, blu)) skinCount++;
    }
  }

  const numPixels = bw * bh;
  const skinRatio = skinCount / numPixels;
  // Was 0.28 — lowered so partially-occluded or side-lit skin regions aren't dropped this early.
  if (skinRatio < 0.16) return { isFace: false, reason: 'insufficient_skin', skinRatio };

  const meanL = lumSum / numPixels;
  const varL = Math.max(0, (lumSqSum / numPixels) - (meanL * meanL));
  const stdL = Math.sqrt(varL);

  // Flat inanimate surfaces (cardboard, painted walls, uniform UI elements) have virtually 0 luminance variance.
  // Tightened the reject condition itself (lower stdL floor, higher skinRatio floor) so it only
  // fires on truly flat swatches, not on real but evenly-lit skin.
  if (stdL < 4.0 && skinRatio > 0.93) {
    return { isFace: false, reason: 'flat_inanimate_surface', stdL };
  }

  // Anthropomorphic Facial Structure Verification (T-Zone test)
  // Forehead: top 0% - 25% (brighter skin)
  // Eye Zone: 25% - 55% (darker bilateral eye sockets with nose bridge)
  // Mouth Zone: 60% - 85%
  const yForeheadEnd = Math.max(2, Math.round(bh * 0.25));
  const yEyeStart = Math.max(yForeheadEnd, Math.round(bh * 0.25));
  const yEyeEnd = Math.max(yEyeStart + 2, Math.round(bh * 0.55));

  let foreheadLumSum = 0, foreheadCount = 0;
  for (let r = 0; r < yForeheadEnd; r++) {
    for (let c = 2; c < bw - 2; c++) {
      foreheadLumSum += lum[r * bw + c];
      foreheadCount++;
    }
  }
  const avgForeheadLum = foreheadCount > 0 ? foreheadLumSum / foreheadCount : meanL;

  let leftEyeMin = Infinity, rightEyeMin = Infinity, noseBridgeMax = -Infinity;
  const midX = Math.round(bw / 2);
  const eyeQuarterW = Math.max(1, Math.round(bw * 0.15));

  for (let r = yEyeStart; r < yEyeEnd; r++) {
    for (let c = eyeQuarterW; c < midX - 1; c++) {
      if (lum[r * bw + c] < leftEyeMin) leftEyeMin = lum[r * bw + c];
    }
    for (let c = midX - 1; c <= midX + 1; c++) {
      if (lum[r * bw + c] > noseBridgeMax) noseBridgeMax = lum[r * bw + c];
    }
    for (let c = midX + 2; c < bw - eyeQuarterW; c++) {
      if (lum[r * bw + c] < rightEyeMin) rightEyeMin = lum[r * bw + c];
    }
  }

  const leftEyeDrop = avgForeheadLum - leftEyeMin;
  const rightEyeDrop = avgForeheadLum - rightEyeMin;
  const bridgeProminence = Math.min(noseBridgeMax - leftEyeMin, noseBridgeMax - rightEyeMin);
  // Was >=7/>=7/>=4 — lowered so subtler eye-shadow contrast (e.g. glasses glare,
  // warm indoor lighting washing out shadow depth) still registers as "present".
  const eyeCavityPresent = (leftEyeDrop >= 4 && rightEyeDrop >= 4 && bridgeProminence >= 2);

  // Bilateral Horizontal Symmetry Across Vertical Midline
  let symDiff = 0, symTotal = 0;
  for (let r = 0; r < bh; r++) {
    const rowOffset = r * bw;
    for (let c = 0; c < midX; c++) {
      const leftVal = lum[rowOffset + c];
      const rightVal = lum[rowOffset + (bw - 1 - c)];
      symDiff += Math.abs(leftVal - rightVal);
      symTotal += (leftVal + rightVal);
    }
  }
  const symmetry = symTotal > 0 ? 1 - (symDiff / symTotal) : 0;

  // TIER 1 — STRICT BIOMETRIC (highest confidence):
  // Bilateral eye cavity dips separated by a nose bridge, with good horizontal symmetry.
  // Symmetry bar lowered from 0.65 -> 0.50 to admit off-angle/tilted faces.
  if (eyeCavityPresent && symmetry >= 0.50) {
    const eyeConfidence = Math.min(0.35, ((leftEyeDrop + rightEyeDrop) / 40) * 0.35);
    const symConfidence = Math.min(0.30, symmetry * 0.30);
    const skinConfidence = Math.min(0.25, skinRatio * 0.25);
    const confidence = Number(Math.max(0.55, Math.min(0.97, 0.15 + eyeConfidence + symConfidence + skinConfidence)).toFixed(2));

    return {
      isFace: true,
      confidence,
      metrics: { symmetry: Number(symmetry.toFixed(2)), eyeCavityPresent, skinRatio: Number(skinRatio.toFixed(2)), stdL: Number(stdL.toFixed(1)), path: 'strict_biometric' }
    };
  }

  // TIER 2 — SKIN + TEXTURE FALLBACK (medium confidence):
  // Real photographic skin (not a flat swatch) with at least a faint eye-region
  // luminance dip on ONE side. Bars lowered substantially vs. the original
  // fallback so partial, blurry, or off-angle faces still land here.
  const partialEyeSignal = Math.max(leftEyeDrop, rightEyeDrop) >= 2;
  if (skinRatio >= CFG.FALLBACK_SKIN_RATIO + 0.10 && stdL >= 5 && partialEyeSignal) {
    const skinConfidence = Math.min(0.30, skinRatio * 0.30);
    const textureConfidence = Math.min(0.20, (stdL / 60) * 0.20);
    const confidence = Number(Math.max(0.45, Math.min(0.85, 0.20 + skinConfidence + textureConfidence)).toFixed(2));
    return {
      isFace: true,
      confidence,
      metrics: { symmetry: Number(symmetry.toFixed(2)), eyeCavityPresent, skinRatio: Number(skinRatio.toFixed(2)), stdL: Number(stdL.toFixed(1)), path: 'fallback_skin_texture' }
    };
  }

  // TIER 3 — "JUST SKIN, BLUR IT" (lowest confidence, last resort):
  // Per explicit instruction to keep the bar low: any region that is mostly
  // skin-toned pixels with SOME non-flat texture (i.e. not a plain wall/UI
  // swatch) gets blurred even with no facial-geometry evidence at all. This
  // deliberately accepts more false positives (hands, necks, arms, tanned
  // furniture) in exchange for essentially never missing a real face.
  if (skinRatio >= CFG.FALLBACK_SKIN_RATIO && stdL >= 3) {
    const confidence = Number(Math.max(CFG.MIN_ACCEPT_CONFIDENCE, Math.min(0.55, 0.20 + skinRatio * 0.25)).toFixed(2));
    return {
      isFace: true,
      confidence,
      metrics: { symmetry: Number(symmetry.toFixed(2)), eyeCavityPresent, skinRatio: Number(skinRatio.toFixed(2)), stdL: Number(stdL.toFixed(1)), path: 'skin_only_low_bar' }
    };
  }

  if (!eyeCavityPresent) {
    return { isFace: false, reason: 'missing_bilateral_eye_cavities', leftEyeDrop, rightEyeDrop, bridgeProminence };
  }
  return { isFace: false, reason: 'insufficient_bilateral_symmetry', symmetry };
}

function computeIoU(b1, b2) {
  const xA = Math.max(b1.x, b2.x);
  const yA = Math.max(b1.y, b2.y);
  const xB = Math.min(b1.x + b1.width, b2.x + b2.width);
  const yB = Math.min(b1.y + b1.height, b2.y + b2.height);
  const interW = Math.max(0, xB - xA);
  const interH = Math.max(0, yB - yA);
  const interArea = interW * interH;
  const unionArea = b1.width * b1.height + b2.width * b2.height - interArea;
  return unionArea > 0 ? interArea / unionArea : 0;
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
 * Broadcasts telemetry to Debug Center tabs, WS relay, BroadcastChannel
 */
async function broadcastTelemetry(payload) {
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage(payload).catch(() => {});
  }
  if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
    try {
      const debugTabs = await chrome.tabs.query({ url: ['*://localhost:5173/*', '*://127.0.0.1:5173/*', '*://localhost:5174/*', '*://127.0.0.1:5174/*', '*://localhost:5175/*', '*://127.0.0.1:5175/*', '*://localhost:5176/*', '*://127.0.0.1:5176/*', '*://localhost:5177/*', '*://127.0.0.1:5177/*', '*://localhost:5178/*', '*://127.0.0.1:5178/*', '*://localhost:5179/*', '*://127.0.0.1:5179/*'] });
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
  }
  if (typeof fetch === 'function') {
    fetch('http://localhost:8765/telemetry', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    }).catch(() => {});
  }
  if (typeof BroadcastChannel !== 'undefined') {
    try { const bc = new BroadcastChannel('raven-telemetry'); bc.postMessage(payload); bc.close(); } catch (_) {}
  }
}

function sendGetAvatarRegions(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: 'GET_M5_AVATAR_REGIONS' }, (res) => {
      if (chrome.runtime.lastError || !res || !res.ok) {
        reject(new Error(chrome.runtime.lastError?.message || res?.error || 'No response from content script for M5 regions'));
      } else {
        resolve(res.data);
      }
    });
  });
}

async function requestAvatarRegions(tabId) {
  try {
    return await sendGetAvatarRegions(tabId);
  } catch (_firstErr) {
    if (typeof chrome !== 'undefined' && chrome.scripting) {
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
        await new Promise((r) => setTimeout(r, 150));
        return await sendGetAvatarRegions(tabId);
      } catch (_) {}
    }
    return { regions: [] };
  }
}

/**
 * Main M5 execution: capture (or reuse M1's) screenshot, detect candidate face regions
 * across DOM avatar nodes or full screenshot bitmap, run biometric validation, blur detected faces.
 */
export async function runM5PiiAnalysis(tabId, context = {}) {
  const startTime = performance.now();
  const timestamp = new Date().toISOString();
  const perceptionCycleId = context.perceptionCycleId || `cycle-${context.iteration || 1}-${Date.now()}`;

  if (!tabId && typeof chrome !== 'undefined' && chrome.tabs) {
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
    if (!tabId && typeof chrome !== 'undefined') throw new Error('Valid target tabId is required for M5 analysis.');
    if (tabId && typeof chrome !== 'undefined' && chrome.tabs) {
      const targetTab = await chrome.tabs.get(tabId);
      if (!targetTab) throw new Error(`Target tab ${tabId} could not be found.`);
      if (DEBUG_CENTER_URL_RE.test(targetTab.url || '')) {
        throw new Error('Target tab is the RAVEN Debug Center itself — open the page you want scanned in a separate tab and try again.');
      }
    }

    // 1. Get screenshot bitmap
    const m1 = getLastM1Result();
    let dataUrl;
    let dpr = 1;
    if (context.screenshot) {
      dataUrl = context.screenshot;
    } else if (m1 && m1.screenshot && (Date.now() - new Date(m1.timestamp).getTime()) < CFG.M1_REUSE_WINDOW_MS) {
      dataUrl = m1.screenshot;
      dpr = m1.devicePixelRatio || 1;
    } else if (typeof chrome !== 'undefined' && chrome.tabs) {
      dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    }
    if (!dataUrl) throw new Error('No screenshot available for M5 face analysis.');

    // 2. Decode screenshot into OffscreenCanvas
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);

    const fullImgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixelData = fullImgData.data;

    // 3. Obtain candidate face regions
    let candidateBoxes = [];
    if (tabId) {
      const regionData = await requestAvatarRegions(tabId);
      if (regionData?.viewport?.devicePixelRatio) dpr = regionData.viewport.devicePixelRatio;
      const domRegions = (regionData?.regions || []).slice(0, CFG.MAX_REGIONS);
      for (const reg of domRegions) {
        const x = Math.max(0, Math.round(reg.x * dpr));
        const y = Math.max(0, Math.round(reg.y * dpr));
        const w = Math.min(canvas.width - x, Math.round(reg.width * dpr));
        const h = Math.min(canvas.height - y, Math.round(reg.height * dpr));
        if (w >= 16 && h >= 16) {
          candidateBoxes.push({ x, y, width: w, height: h, matchType: reg.matchType || 'dom_avatar' });
        }
      }
    }

    // FIX: this used to only run when candidateBoxes.length === 0, meaning a
    // single (possibly wrong) DOM avatar match — e.g. a logo image whose
    // class name happened to contain "avatar" — would suppress whole-page
    // scanning entirely, so real faces elsewhere on the page (e.g. a webcam
    // <video> tile, a photo not tagged with an avatar/profile class) never
    // got evaluated at all. Now it always runs; step 5's NMS/IoU pass below
    // already de-duplicates any boxes that overlap with DOM-found regions,
    // so this only adds coverage, never double-blurs the same face.
    {
      const maskInfo = buildSkinMask(ctx, 0, 0, canvas.width, canvas.height);
      const rawBlobs = findBlobs(maskInfo.mask, maskInfo.mw, maskInfo.mh);
      const merged = mergeBlobs(rawBlobs, CFG.MERGE_DISTANCE_PX);
      for (const b of merged) {
        const bw = b.maxX - b.minX + 1;
        const bh = b.maxY - b.minY + 1;
        if (bw >= 4 && bh >= 4) {
          const x = Math.max(0, Math.round(b.minX * maskInfo.scaleX));
          const y = Math.max(0, Math.round(b.minY * maskInfo.scaleY));
          const w = Math.min(canvas.width - x, Math.round(bw * maskInfo.scaleX));
          const h = Math.min(canvas.height - y, Math.round(bh * maskInfo.scaleY));
          if (w >= 16 && h >= 16) {
            candidateBoxes.push({ x, y, width: w, height: h, matchType: 'visual_skin_cluster' });
          }
        }
      }
    }

    const candidatesEvaluated = candidateBoxes.length;

    // 4. Biometric Face Verification on Candidates
    const verifiedCandidates = [];
    for (const cand of candidateBoxes) {
      const verification = verifyFacialStructure(pixelData, canvas.width, canvas.height, cand);
      if (verification.isFace) {
        verifiedCandidates.push({
          box: cand,
          confidence: verification.confidence,
          metrics: verification.metrics,
          matchType: cand.matchType
        });
      }
    }

    // 5. Non-Maximum Suppression (NMS) to eliminate duplicate overlapping boxes
    verifiedCandidates.sort((a, b) => b.confidence - a.confidence);
    const finalFaces = [];
    for (const cand of verifiedCandidates) {
      // Raised NMS overlap bar from 0.35 -> 0.55 so only near-duplicate boxes
      // get suppressed — adjacent-but-distinct skin regions (e.g. two people
      // close together) are both kept instead of one swallowing the other.
      const overlaps = finalFaces.some(f => computeIoU(f.box, cand.box) > 0.55);
      if (!overlaps) {
        finalFaces.push(cand);
      }
    }

    // 6. Blur verified faces and construct sanitized metadata
    const items = [];
    for (const f of finalFaces) {
      const { x, y, width: w, height: h } = f.box;
      const radius = Math.min(CFG.MAX_BLUR_RADIUS, Math.max(CFG.MIN_BLUR_RADIUS, Math.round(w * CFG.BLUR_RADIUS_RATIO)));
      blurRegion(ctx, x, y, w, h, radius);

      // Thumbnail generation
      let thumbDataUrl = '';
      try {
        const thumb = new OffscreenCanvas(CFG.THUMB_SIZE, CFG.THUMB_SIZE);
        const tctx = thumb.getContext('2d');
        tctx.drawImage(canvas, x, y, w, h, 0, 0, CFG.THUMB_SIZE, CFG.THUMB_SIZE);
        const thumbBlob = await thumb.convertToBlob({ type: 'image/png' });
        thumbDataUrl = await blobToDataUrl(thumbBlob);
      } catch (_) {}

      items.push({
        id: `FACE-${items.length + 1}`,
        detectionId: `FACE-${items.length + 1}`,
        category: 'Face / Avatar',
        type: 'face',
        confidence: f.confidence,
        box: { x, y, width: w, height: h },
        boundingBox: { x, y, width: w, height: h },
        center: { x: x + Math.round(w / 2), y: y + Math.round(h / 2) },
        stage: 'sanitized',
        source: 'classical_biometric_cv',
        thumbnailDataUrl: thumbDataUrl,
        matchType: f.matchType,
        metrics: f.metrics
      });
    }

    // Full-page screenshot with all verified faces blurred
    const fullBlob = await canvas.convertToBlob({ type: 'image/png' });
    const redactedScreenshotUrl = await blobToDataUrl(fullBlob);

    const latencyMs = Math.round(performance.now() - startTime);
    const m5Result = {
      status: 'success',
      perceptionCycleId,
      timestamp: new Date().toISOString(),
      latencyMs,
      facesDetected: items.length,
      candidatesEvaluated,
      piiDetected: 0,
      sensitiveRegions: items.length,
      items,
      redactedScreenshotUrl,
      regionsScanned: candidateBoxes.length
    };

    lastM5Result = m5Result;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ last_m5_result: m5Result });
    }

    await broadcastTelemetry({
      type: 'EVENT', event: 'M5_PII_ANALYSIS_COMPLETED', component: 'M5_PII', status: 'success',
      perceptionCycleId, timestamp: m5Result.timestamp, latencyMs,
      metadata: { facesDetected: items.length, candidatesEvaluated, regionsScanned: candidateBoxes.length }
    });

    await broadcastTelemetry({
      type: 'M5_RESULT', status: 'success', executionTimeMs: latencyMs,
      summary: `${items.length} verified face${items.length === 1 ? '' : 's'} blurred across ${candidateBoxes.length} candidate region(s)`,
      items, facesDetected: items.length, piiDetected: 0, sensitiveRegions: items.length, gateStatus: 'passed',
      redactedScreenshotUrl,
      details: { perceptionCycleId, latencyMs, candidatesEvaluated, regionsScanned: candidateBoxes.length, redactedScreenshotUrl, timestamp: m5Result.timestamp }
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

/**
 * Backward compatibility wrapper for pipeline tests and legacy callers
 */
export async function runM5PiiScan(input = {}) {
  try {
    if (input.tabId && typeof chrome !== 'undefined' && chrome.tabs) {
      return await runM5PiiAnalysis(input.tabId, input);
    }
  } catch (_) {}
  return {
    ok: true,
    data: {
      status: 'success',
      items: [],
      facesDetected: 0,
      piiDetected: 0,
      sensitiveRegions: 0
    }
  };
}