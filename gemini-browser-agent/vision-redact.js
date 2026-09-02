// vision-redact.js
// On-device face detection and PII text redaction before transmission.
// Strictly detect-and-blur only: no facial recognition/biometric identification.

import { FaceDetector, FilesetResolver } from './vendor/mediapipe/vision_bundle.mjs';

let detectorInstance = null;
let detectorPromise = null;

/**
 * Lazily loads and caches the MediaPipe FaceDetector instance
 * using locally vendored WASM and model files.
 */
async function getFaceDetector() {
  if (detectorInstance) return detectorInstance;
  if (!detectorPromise) {
    detectorPromise = (async () => {
      try {
        const wasmDir = chrome.runtime.getURL('vendor/mediapipe/wasm');
        // Second param = true requests vision_wasm_module_internal.js (ES module)
        const wasmFileset = await FilesetResolver.forVisionTasks(wasmDir, true);
        const modelPath = chrome.runtime.getURL('vendor/mediapipe/models/blaze_face_short_range.tflite');

        detectorInstance = await FaceDetector.createFromOptions(wasmFileset, {
          baseOptions: {
            modelAssetPath: modelPath,
            delegate: 'CPU'
          },
          runningMode: 'IMAGE'
        });
        return detectorInstance;
      } catch (err) {
        console.warn('FaceDetector initialization warning:', err);
        detectorPromise = null;
        return null;
      }
    })();
  }
  return detectorPromise;
}

/**
 * Irreversible mosaic pixelation blur over a bounding box on an OffscreenCanvas.
 * Averages pixel color values in blockSize x blockSize tiles.
 */
function blurRegion(ctx, x, y, width, height, blockSize = 14) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const w = Math.min(ctx.canvas.width - x0, Math.ceil(width));
  const h = Math.min(ctx.canvas.height - y0, Math.ceil(height));
  if (w <= 0 || h <= 0) return;

  const imgData = ctx.getImageData(x0, y0, w, h);
  const data = imgData.data;

  for (let py = 0; py < h; py += blockSize) {
    for (let px = 0; px < w; px += blockSize) {
      let r = 0, g = 0, b = 0, count = 0;
      const curW = Math.min(blockSize, w - px);
      const curH = Math.min(blockSize, h - py);

      for (let dy = 0; dy < curH; dy++) {
        for (let dx = 0; dx < curW; dx++) {
          const idx = ((py + dy) * w + (px + dx)) * 4;
          r += data[idx];
          g += data[idx + 1];
          b += data[idx + 2];
          count++;
        }
      }

      if (count === 0) continue;
      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);

      for (let dy = 0; dy < curH; dy++) {
        for (let dx = 0; dx < curW; dx++) {
          const idx = ((py + dy) * w + (px + dx)) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
        }
      }
    }
  }

  ctx.putImageData(imgData, x0, y0);
}

/**
 * Converts an OffscreenCanvas to a data URL without using FileReader.
 */
async function canvasToDataUrl(canvas, quality = 0.7) {
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000; // 32KB chunks to prevent call stack overflow
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

/**
 * Main redaction entrypoint.
 * Receives the raw screenshot dataUrl, blurs all detected face regions and
 * PII text bounding boxes on an offscreen canvas, discards unredacted bytes,
 * and returns the redacted data URL along with redaction telemetry.
 *
 * @param {string} dataUrl - Raw base64 data URL from captureVisibleTab
 * @param {Array<{x: number, y: number, width: number, height: number}>} [piiBoundingBoxes] - Text PII bounding boxes
 * @returns {Promise<{ dataUrl: string, facesRedacted: number, textRegionsRedacted: number }>}
 */
export async function redactScreenshot(dataUrl, piiBoundingBoxes = []) {
  let facesRedacted = 0;
  let textRegionsRedacted = 0;

  // 1. Decode screenshot into an OffscreenCanvas
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close(); // Immediately discard raw bitmap resource

  // 2. On-Device Face Detection & Blurring
  try {
    const detector = await getFaceDetector();
    if (detector) {
      const detectionResult = detector.detect(canvas);
      if (detectionResult && Array.isArray(detectionResult.detections)) {
        for (const detection of detectionResult.detections) {
          const box = detection.boundingBox;
          if (!box) continue;

          // Expand bounding box by 15% to guarantee full coverage of chin, forehead, hairline
          const padX = box.width * 0.15;
          const padY = box.height * 0.15;
          const x = Math.max(0, box.originX - padX);
          const y = Math.max(0, box.originY - padY);
          const w = Math.min(canvas.width - x, box.width + padX * 2);
          const h = Math.min(canvas.height - y, box.height + padY * 2);

          blurRegion(ctx, x, y, w, h, 16);
          facesRedacted++;
        }
      }
    }
  } catch (err) {
    console.warn('Face detection error during redaction pass:', err);
  }

  // 3. PII Text Redaction & Blurring
  if (Array.isArray(piiBoundingBoxes) && piiBoundingBoxes.length > 0) {
    for (const box of piiBoundingBoxes) {
      if (!box || typeof box.x !== 'number') continue;
      // Add slight padding around detected text box
      const pad = 4;
      const x = Math.max(0, box.x - pad);
      const y = Math.max(0, box.y - pad);
      const w = Math.min(canvas.width - x, box.width + pad * 2);
      const h = Math.min(canvas.height - y, box.height + pad * 2);

      blurRegion(ctx, x, y, w, h, 10);
      textRegionsRedacted++;
    }
  }

  // 4. Export redacted image; original raw capture bytes are never held or logged
  const redactedDataUrl = await canvasToDataUrl(canvas, 0.7);

  return {
    dataUrl: redactedDataUrl,
    facesRedacted,
    textRegionsRedacted
  };
}
