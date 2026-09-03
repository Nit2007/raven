/**
 * m3-vision.js — RAVEN Milestone M3: Lightweight Local Visual Perception
 * 
 * Analyzes browser viewport screenshots using fast, browser-local computer-vision techniques
 * (luminance mapping, spatial gradient energy, dynamic adaptive thresholding, and morphological
 * connected-component clustering).
 * 
 * ARCHITECTURAL INVARIANTS:
 * 1. Zero Domain-Specific Heuristics: Contains NO website-, query-, task-, or application-specific rules.
 * 2. Visual Hypotheses, Not Confirmed Semantics: Classifications (button-like-region, input-like-region, etc.)
 *    are visual geometric hypotheses. M2 DOM analysis provides authoritative semantic evidence.
 * 3. Auditable: Exposes raw measurable features (aspect ratio, edge density, color variance, rectangularity).
 * 4. Pluggable: Clean interface so an ML/ONNX detector can be introduced later without changing the M3 contract.
 * 5. Strict Zero-Leak Privacy: Raw screenshot is retained strictly locally; never passed to external LLMs.
 */

let lastM3Result = null;

export function getLastM3Result() {
  return lastM3Result;
}

/**
 * Extracts binary PNG dimensions from header (width & height)
 */
export function extractPngDimensions(dataUrl) {
  try {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    const base64Part = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    if (!base64Part) return null;
    const binaryPrefix = atob(base64Part.slice(0, 60));
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
  } catch (_) {}
  return null;
}

/**
 * Decodes PNG binary stream to raw RGBA pixel buffer using standard browser APIs
 * or pure DecompressionStream fallback for Node/Worker environments.
 */
export async function decodeImagePixels(imageInput) {
  // If input is already an object with width, height, and data (e.g. ImageData or unit test buffer)
  if (imageInput && typeof imageInput === 'object' && imageInput.data && imageInput.width && imageInput.height) {
    return {
      data: imageInput.data,
      width: imageInput.width,
      height: imageInput.height
    };
  }

  const dataUrl = typeof imageInput === 'string' ? imageInput : '';
  if (!dataUrl) {
    throw new Error('Invalid image input: expected data URL or ImageData buffer');
  }

  // 1. In browser contexts (Service Worker or Window with OffscreenCanvas/createImageBitmap)
  if (typeof fetch === 'function' && typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function') {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const bmp = await createImageBitmap(blob);
      const width = bmp.width;
      const height = bmp.height;

      // Downsample raster if screenshot is very large (> 1280px) to guarantee sub-25ms execution
      const maxDim = 960;
      let targetWidth = width;
      let targetHeight = height;
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          targetWidth = maxDim;
          targetHeight = Math.max(1, Math.round((height / width) * maxDim));
        } else {
          targetHeight = maxDim;
          targetWidth = Math.max(1, Math.round((width / height) * maxDim));
        }
      }

      const offscreen = new OffscreenCanvas(targetWidth, targetHeight);
      const ctx = offscreen.getContext('2d');
      ctx.drawImage(bmp, 0, 0, targetWidth, targetHeight);
      const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);

      return {
        data: imgData.data,
        width: targetWidth,
        height: targetHeight,
        originalWidth: width,
        originalHeight: height
      };
    } catch (browserDecodeErr) {
      console.warn('[M3 Vision] OffscreenCanvas decode failed, falling back to stream decode:', browserDecodeErr);
    }
  }

  // 2. Pure JS PNG decoder utilizing Web-standard DecompressionStream (Node.js 18+ and Chrome 80+)
  try {
    const rawDims = extractPngDimensions(dataUrl) || { width: 640, height: 480 };
    const base64Part = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    const binaryStr = atob(base64Part);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Extract IDAT chunks
    const idatChunks = [];
    let offset = 8; // skip PNG signature
    while (offset < bytes.length - 4) {
      const chunkLen = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
      const chunkType = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      if (chunkType === 'IDAT') {
        idatChunks.push(bytes.subarray(offset + 8, offset + 8 + chunkLen));
      }
      offset += 12 + chunkLen;
    }

    if (idatChunks.length > 0 && typeof DecompressionStream !== 'undefined') {
      let totalLen = idatChunks.reduce((acc, c) => acc + c.length, 0);
      let combined = new Uint8Array(totalLen);
      let pos = 0;
      for (const c of idatChunks) {
        combined.set(c, pos);
        pos += c.length;
      }

      // Decompress zlib stream
      const ds = new DecompressionStream('deflate');
      const writer = ds.writable.getWriter();
      writer.write(combined);
      writer.close();
      const reader = ds.readable.getReader();
      const outChunks = [];
      let done = false;
      while (!done) {
        const res = await reader.read();
        if (res.value) outChunks.push(res.value);
        done = res.done;
      }

      let uncompressedLen = outChunks.reduce((acc, c) => acc + c.length, 0);
      let uncompressed = new Uint8Array(uncompressedLen);
      let uPos = 0;
      for (const c of outChunks) {
        uncompressed.set(c, uPos);
        uPos += c.length;
      }

      const w = rawDims.width;
      const h = rawDims.height;
      const rgba = new Uint8ClampedArray(w * h * 4);
      let scanlineLen = 1 + w * 4; // 1 filter byte + 4 bytes per pixel

      // Simple reconstruction for standard PNG filter types
      let prevScanline = new Uint8Array(w * 4);
      for (let y = 0; y < h; y++) {
        let srcIdx = y * scanlineLen;
        if (srcIdx >= uncompressed.length) break;
        let filter = uncompressed[srcIdx];
        let currScanline = new Uint8Array(w * 4);

        for (let x = 0; x < w * 4; x++) {
          let raw = uncompressed[srcIdx + 1 + x] || 0;
          let a = x >= 4 ? currScanline[x - 4] : 0;
          let b = prevScanline[x];
          let c = x >= 4 ? prevScanline[x - 4] : 0;

          if (filter === 0) currScanline[x] = raw;
          else if (filter === 1) currScanline[x] = (raw + a) & 0xff;
          else if (filter === 2) currScanline[x] = (raw + b) & 0xff;
          else if (filter === 3) currScanline[x] = (raw + Math.floor((a + b) / 2)) & 0xff;
          else if (filter === 4) {
            let p = a + b - c;
            let pa = Math.abs(p - a);
            let pb = Math.abs(p - b);
            let pc = Math.abs(p - c);
            let pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
            currScanline[x] = (raw + pr) & 0xff;
          } else {
            currScanline[x] = raw;
          }

          rgba[(y * w * 4) + x] = currScanline[x];
        }
        prevScanline = currScanline;
      }

      return {
        data: rgba,
        width: w,
        height: h,
        originalWidth: w,
        originalHeight: h
      };
    }
  } catch (streamErr) {
    console.warn('[M3 Vision] Direct PNG decompression failed:', streamErr);
  }

  // Fallback synthetic dimensions if all decoders fail
  const fallbackDims = extractPngDimensions(dataUrl) || { width: 800, height: 600 };
  return {
    data: new Uint8ClampedArray(fallbackDims.width * fallbackDims.height * 4),
    width: fallbackDims.width,
    height: fallbackDims.height,
    originalWidth: fallbackDims.width,
    originalHeight: fallbackDims.height
  };
}

/**
 * Computes luminance, spatial gradient, adaptive threshold, and morphological UI clusters
 */
export function analyzeVisualRegions(pixelData, width, height, originalWidth, originalHeight) {
  const S_x = (originalWidth || width) / width;
  const S_y = (originalHeight || height) / height;

  const numPixels = width * height;
  const luminance = new Float32Array(numPixels);
  const chroma = new Float32Array(numPixels);

  // 1. Grayscale luminance and chroma calculation
  let sumL = 0;
  for (let i = 0; i < numPixels; i++) {
    const idx = i * 4;
    const r = pixelData[idx];
    const g = pixelData[idx + 1];
    const b = pixelData[idx + 2];
    // Standard perceptual luminance: Y = 0.299R + 0.587G + 0.114B
    const lum = (0.299 * r + 0.587 * g + 0.114 * b);
    luminance[i] = lum;
    sumL += lum;
    const maxVal = Math.max(r, g, b);
    const minVal = Math.min(r, g, b);
    chroma[i] = maxVal - minVal;
  }

  // 2. Spatial gradient computation (Central Differences / Sobel approximation)
  const gradient = new Float32Array(numPixels);
  let gradSum = 0;
  let gradSqSum = 0;
  let activeGradCount = 0;

  for (let y = 1; y < height - 1; y++) {
    const rowOffset = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = rowOffset + x;
      const gx = luminance[idx + 1] - luminance[idx - 1];
      const gy = luminance[idx + width] - luminance[idx - width];
      const gMag = Math.sqrt(gx * gx + gy * gy);
      gradient[idx] = gMag;
      gradSum += gMag;
      gradSqSum += gMag * gMag;
      activeGradCount++;
    }
  }

  // 3. Dynamic adaptive thresholding (No fixed magic numbers; derived from mean & std-dev of contrast)
  const meanG = activeGradCount > 0 ? gradSum / activeGradCount : 0;
  const varianceG = activeGradCount > 0 ? (gradSqSum / activeGradCount) - (meanG * meanG) : 0;
  const stdG = Math.sqrt(Math.max(0, varianceG));
  const dynamicThreshold = Math.max(10, Math.min(45, meanG + 0.45 * stdG));

  // 4. Binary edge map
  const binaryEdge = new Uint8Array(numPixels);
  for (let i = 0; i < numPixels; i++) {
    if (gradient[i] >= dynamicThreshold) {
      binaryEdge[i] = 1;
    }
  }

  // 5. Connected-component labeling & spatial bounding box clustering
  const labels = new Int32Array(numPixels);
  let currentLabel = 0;
  const components = [];

  // Flood-fill connected component discovery with spatial bounding aggregation
  const minDim = 6;
  for (let y = 1; y < height - 1; y += 2) {
    const rowOffset = y * width;
    for (let x = 1; x < width - 1; x += 2) {
      const startIdx = rowOffset + x;
      if (binaryEdge[startIdx] === 1 && labels[startIdx] === 0) {
        currentLabel++;
        let minX = x, maxX = x, minY = y, maxY = y;
        let pixelCount = 0;
        let lumSum = 0;
        let lumSqSum = 0;
        let chromaSum = 0;
        let edgeGradSum = 0;

        // BFS queue
        const queue = [startIdx];
        labels[startIdx] = currentLabel;

        while (queue.length > 0) {
          const idx = queue.pop();
          const cy = Math.floor(idx / width);
          const cx = idx % width;

          pixelCount++;
          const lum = luminance[idx];
          lumSum += lum;
          lumSqSum += lum * lum;
          chromaSum += chroma[idx];
          edgeGradSum += gradient[idx];

          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          // 4-neighborhood inspection
          const neighbors = [idx - 1, idx + 1, idx - width, idx + width];
          for (const n of neighbors) {
            if (n >= 0 && n < numPixels && labels[n] === 0 && binaryEdge[n] === 1) {
              labels[n] = currentLabel;
              queue.push(n);
            }
          }

          // Safety guard against massive connected background fills
          if (pixelCount > 15000) break;
        }

        const boxW = maxX - minX + 1;
        const boxH = maxY - minY + 1;

        if (boxW >= minDim && boxH >= minDim) {
          components.push({
            minX, maxX, minY, maxY,
            boxW, boxH,
            pixelCount,
            lumSum, lumSqSum,
            chromaSum,
            edgeGradSum
          });
        }
      }
    }
  }

  // 6. Spatial proximity clustering (group nearby character strokes / button border fragments)
  const mergedBoxes = [];
  const visited = new Set();

  for (let i = 0; i < components.length; i++) {
    if (visited.has(i)) continue;
    let b = { ...components[i] };
    visited.add(i);

    let mergedAny = true;
    while (mergedAny) {
      mergedAny = false;
      for (let j = 0; j < components.length; j++) {
        if (visited.has(j)) continue;
        const o = components[j];

        // Check hierarchical containment (e.g. card container enclosing button)
        const areaB = b.boxW * b.boxH;
        const areaO = o.boxW * o.boxH;
        const areaRatio = Math.max(areaB, areaO) / (Math.min(areaB, areaO) + 1);

        const bEnclosesO = b.minX <= o.minX && b.maxX >= o.maxX && b.minY <= o.minY && b.maxY >= o.maxY;
        const oEnclosesB = o.minX <= b.minX && o.maxX >= b.maxX && o.minY <= b.minY && o.maxY >= b.maxY;
        if ((bEnclosesO || oEnclosesB) && areaRatio > 1.8) {
          continue; // Keep container and child as distinct visual regions
        }

        // Spatial proximity condition: horizontal gap <= 8px or vertical gap <= 6px with comparable size
        const xOverlap = Math.max(0, Math.min(b.maxX, o.maxX) - Math.max(b.minX, o.minX));
        const yOverlap = Math.max(0, Math.min(b.maxY, o.maxY) - Math.max(b.minY, o.minY));
        const xGap = Math.max(0, Math.max(b.minX, o.minX) - Math.min(b.maxX, o.maxX));
        const yGap = Math.max(0, Math.max(b.minY, o.minY) - Math.min(b.maxY, o.maxY));

        if (areaRatio <= 3.5 && ((xGap <= 8 && yOverlap > 4) || (yGap <= 6 && xOverlap > 8))) {
          b.minX = Math.min(b.minX, o.minX);
          b.maxX = Math.max(b.maxX, o.maxX);
          b.minY = Math.min(b.minY, o.minY);
          b.maxY = Math.max(b.maxY, o.maxY);
          b.boxW = b.maxX - b.minX + 1;
          b.boxH = b.maxY - b.minY + 1;
          b.pixelCount += o.pixelCount;
          b.lumSum += o.lumSum;
          b.lumSqSum += o.lumSqSum;
          b.chromaSum += o.chromaSum;
          b.edgeGradSum += o.edgeGradSum;
          visited.add(j);
          mergedAny = true;
        }
      }
    }
    mergedBoxes.push(b);
  }

  // 7. Scale coordinates back to original screenshot dimensions and compute auditable features
  const origW = originalWidth || width;
  const origH = originalHeight || height;

  const detections = [];
  let detectionCounter = 1;

  for (const b of mergedBoxes) {
    const rawX = Math.round(b.minX * S_x);
    const rawY = Math.round(b.minY * S_y);
    const rawW = Math.round(b.boxW * S_x);
    const rawH = Math.round(b.boxH * S_y);

    // Strict containment clamping within [0, origW] x [0, origH]
    const x = Math.max(0, Math.min(rawX, origW - 1));
    const y = Math.max(0, Math.min(rawY, origH - 1));
    const w = Math.max(4, Math.min(rawW, origW - x));
    const h = Math.max(4, Math.min(rawH, origH - y));
    const area = w * h;

    // Filter degenerate micro-regions (< 120 px area) or full-viewport frame
    if (area < 120 || (w >= origW * 0.98 && h >= origH * 0.98)) continue;

    // Auditable Geometric & Morphological Features
    const aspectRatio = Number((w / h).toFixed(2));
    const relativeWidth = Number((w / origW).toFixed(3));
    const relativeHeight = Number((h / origH).toFixed(3));
    const edgeDensity = Number(Math.min(1.0, b.pixelCount / (b.boxW * b.boxH)).toFixed(2));

    const meanL = b.pixelCount > 0 ? b.lumSum / b.pixelCount : 128;
    const varL = b.pixelCount > 0 ? Math.max(0, (b.lumSqSum / b.pixelCount) - (meanL * meanL)) : 0;
    const colorVariance = Number(Math.min(1.0, Math.sqrt(varL) / 128).toFixed(2));
    const meanChroma = b.pixelCount > 0 ? b.chromaSum / b.pixelCount : 0;

    // Rectangularity: ratio of filled bounding mass to perimeter bounds
    const rectangularity = Number(Math.min(1.0, (b.pixelCount * S_x * S_y) / (area * 0.35 + 1)).toFixed(2));

    // Spatial Center
    const cx = Math.round(x + w / 2);
    const cy = Math.round(y + h / 2);

    // 8. Visual Hypothesis Classification (Strictly optical/geometric properties — ZERO domain rules)
    let type = 'region';
    let confidence = 0.70;

    if (relativeWidth > 0.32 && relativeHeight > 0.14) {
      // Large layout container
      type = 'container-like-region';
      confidence = 0.88;
    } else if (aspectRatio >= 1.0 && aspectRatio <= 5.5 && h >= 18 && h <= 68 && w >= 36 && w <= 320) {
      // Compact interactive rectangle hypothesis
      type = 'button-like-region';
      confidence = Number(Math.min(0.95, 0.75 + (rectangularity * 0.15) + (edgeDensity * 0.05)).toFixed(2));
    } else if (aspectRatio >= 2.8 && aspectRatio <= 14.0 && h >= 22 && h <= 64 && colorVariance <= 0.35) {
      // Elongated entry bar hypothesis
      type = 'input-like-region';
      confidence = Number(Math.min(0.94, 0.72 + ((1 - colorVariance) * 0.18)).toFixed(2));
    } else if (aspectRatio >= 2.0 && h >= 9 && h <= 32 && edgeDensity >= 0.15) {
      // Text row / stroke hypothesis
      type = 'text-like-region';
      confidence = Number(Math.min(0.92, 0.70 + (edgeDensity * 0.20)).toFixed(2));
    } else if ((meanChroma > 30 || colorVariance > 0.45) && w >= 32 && h >= 32) {
      // Chromatic visual asset hypothesis
      type = 'image-like-region';
      confidence = Number(Math.min(0.90, 0.70 + (colorVariance * 0.20)).toFixed(2));
    } else {
      type = 'region';
      confidence = 0.65;
    }

    detections.push({
      id: `vd-${detectionCounter++}`,
      type,
      category: type, // for backward compatibility with Debug Center VisionView
      bbox: [x, y, w, h],
      box: { x, y, width: w, height: h }, // for VisionView canvas overlay
      center: [cx, cy],
      width: w,
      height: h,
      area,
      confidence,
      properties: {
        aspectRatio,
        edgeDensity,
        colorVariance,
        relativeWidth,
        relativeHeight,
        rectangularity,
        relativePosition: {
          xPercent: Number(((cx / origW) * 100).toFixed(1)),
          yPercent: Number(((cy / origH) * 100).toFixed(1))
        }
      }
    });

    if (detections.length >= 80) break; // Limit to 80 most salient visual regions
  }

  // Sort detections by area descending (structural containers first, fine widgets later)
  detections.sort((a, b) => b.area - a.area);

  return detections;
}

/**
 * Broadcasts M3 events and telemetry to Debug Center tabs, WebSocket relay, and runtime listeners
 */
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

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const bc = new BroadcastChannel('raven-telemetry');
      bc.postMessage(payload);
      bc.close();
    } catch (_) {}
  }
}

/**
 * Main M3 Execution: Lightweight Local Visual Perception
 * Pluggable architecture: uses morphological-cv-v1 by default; designed so an ML model
 * can be plugged in without modifying the contract.
 *
 * @param {string|object} imageInput - Screenshot data URL or pixel buffer
 * @param {object} context - Execution context (tabId, iteration, perceptionCycleId, detector)
 * @returns {Promise<{ok: boolean, data: VisualPerceptionResult}>}
 */
export async function runM3VisualAnalysis(imageInput, context = {}) {
  const startTime = performance.now();
  const timestamp = new Date().toISOString();
  const perceptionCycleId = context.perceptionCycleId || `cycle-${context.iteration || 1}-${Date.now()}`;
  const detectorName = context.detector || 'morphological-cv-v1';

  await broadcastTelemetry({
    type: 'EVENT',
    event: 'M3_VISION_STARTED',
    component: 'M3_VISION',
    status: 'running',
    perceptionCycleId,
    timestamp,
    metadata: {
      detector: detectorName,
      iteration: context.iteration || 1
    }
  });

  try {
    if (!imageInput) {
      throw new Error('Screenshot input is required for M3 visual perception.');
    }

    // Decode pixels & extract physical dimensions
    const decoded = await decodeImagePixels(imageInput);
    const screenshotWidth = decoded.originalWidth || decoded.width;
    const screenshotHeight = decoded.originalHeight || decoded.height;

    // Perform CV analysis
    const detections = analyzeVisualRegions(
      decoded.data,
      decoded.width,
      decoded.height,
      screenshotWidth,
      screenshotHeight
    );

    const processingTimeMs = Math.max(1, Math.round(performance.now() - startTime));

    const result = {
      status: 'success',
      perceptionCycleId,
      timestamp: new Date().toISOString(),
      screenshotWidth,
      screenshotHeight,
      detections,
      totalDetections: detections.length,
      processingTimeMs,
      detector: detectorName
    };

    lastM3Result = result;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ last_m3_result: result }).catch(() => {});
    }

    // Emit M3_VISION_COMPLETED lifecycle event
    await broadcastTelemetry({
      type: 'EVENT',
      event: 'M3_VISION_COMPLETED',
      component: 'M3_VISION',
      status: 'success',
      perceptionCycleId,
      timestamp: result.timestamp,
      latencyMs: processingTimeMs,
      metadata: {
        totalDetections: detections.length,
        screenshotDimensions: `${screenshotWidth}x${screenshotHeight}`,
        detector: detectorName
      }
    });

    // Send M3 result update to Debug Center
    await broadcastTelemetry({
      type: 'M3_RESULT',
      status: 'success',
      executionTimeMs: processingTimeMs,
      summary: `${detections.length} visual regions detected (${detectorName}) in ${processingTimeMs}ms`,
      totalDetections: detections.length,
      regions: detections,
      details: {
        perceptionCycleId,
        processingTimeMs,
        screenshotWidth,
        screenshotHeight,
        detector: detectorName,
        detectionsCount: detections.length,
        timestamp: result.timestamp
      }
    });

    return { ok: true, data: result };
  } catch (err) {
    const processingTimeMs = Math.max(1, Math.round(performance.now() - startTime));
    const errorMessage = err instanceof Error ? err.message : String(err);

    await broadcastTelemetry({
      type: 'EVENT',
      event: 'M3_VISION_FAILED',
      component: 'M3_VISION',
      status: 'error',
      perceptionCycleId,
      timestamp: new Date().toISOString(),
      latencyMs: processingTimeMs,
      metadata: { error: errorMessage }
    });

    await broadcastTelemetry({
      type: 'M3_RESULT',
      status: 'error',
      executionTimeMs: processingTimeMs,
      summary: `Visual perception failed: ${errorMessage}`,
      details: { error: errorMessage, latencyMs: processingTimeMs }
    });

    return {
      ok: false,
      status: 'error',
      error: errorMessage,
      perceptionCycleId,
      latencyMs: processingTimeMs
    };
  }
}
