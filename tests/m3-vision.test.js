/**
 * tests/m3-vision.test.js — RAVEN Milestone M3 Perception & Privacy Pipeline Test Suite
 * 
 * Tests:
 * 1. Contract validity: screenshotWidth, screenshotHeight, detections, processingTimeMs, detector.
 * 2. Bounding box validity: 0 <= x < W, 0 <= y < H, x + w <= W, y + h <= H.
 * 3. Geometric consistency: area === width * height, center coordinates [cx, cy].
 * 4. Confidence normalization: 0.0 <= confidence <= 1.0.
 * 5. Auditable measurable properties: aspectRatio, edgeDensity, rectangularity, colorVariance.
 * 6. Crash resilience: blank, solid black, solid white, low contrast images do not crash.
 * 7. Layout sensitivity: distinct visual layouts produce distinct detections.
 * 8. Rule integrity audit: zero website-specific words (github, saucedemo, etc.), zero queries, zero Gemini calls in M3.
 * 9. Fail-closed privacy gate: M5/M6 fails closed when unredacted PII is encountered.
 * 10. Zero-leak boundary: raw screenshot never enters Gemini context.
 * 11. End-to-end flow: M1 -> M3 -> M4 -> M5 -> M6 multimodal fusion.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runM3VisualAnalysis,
  analyzeVisualRegions,
  extractPngDimensions
} from '../gemini-browser-agent/gemini-browser-agent/m3-vision.js';
import { runM4Ocr } from '../gemini-browser-agent/gemini-browser-agent/m4-ocr.js';
import { runM5PiiScan } from '../gemini-browser-agent/gemini-browser-agent/m5-pii.js';
import { runM6PerceptionFusion, validateZeroLeakPrivacy } from '../gemini-browser-agent/gemini-browser-agent/m6-fusion.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to create synthetic RGBA pixel buffer
function createSyntheticCanvas(width, height, background = [255, 255, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = background[0];
    data[i * 4 + 1] = background[1];
    data[i * 4 + 2] = background[2];
    data[i * 4 + 3] = 255;
  }

  function drawFilledRect(x, y, w, h, color) {
    for (let r = y; r < y + h && r < height; r++) {
      for (let c = x; c < x + w && c < width; c++) {
        const idx = (r * width + c) * 4;
        data[idx] = color[0];
        data[idx + 1] = color[1];
        data[idx + 2] = color[2];
        data[idx + 3] = 255;
      }
    }
  }

  function drawBorderRect(x, y, w, h, borderColor, borderWidth = 2, fillColor = null) {
    if (fillColor) drawFilledRect(x, y, w, h, fillColor);
    for (let r = y; r < y + h && r < height; r++) {
      for (let c = x; c < x + w && c < width; c++) {
        if (r < y + borderWidth || r >= y + h - borderWidth || c < x + borderWidth || c >= x + w - borderWidth) {
          const idx = (r * width + c) * 4;
          data[idx] = borderColor[0];
          data[idx + 1] = borderColor[1];
          data[idx + 2] = borderColor[2];
          data[idx + 3] = 255;
        }
      }
    }
  }

  return { data, width, height, drawFilledRect, drawBorderRect };
}

// 1. Contract Validity Test
test('M3 Contract: produces valid structured perception result matching contract schema', async () => {
  const canvas = createSyntheticCanvas(800, 600);
  // Draw a button-like rectangle
  canvas.drawBorderRect(100, 150, 120, 40, [37, 99, 235], 2, [59, 130, 246]);

  const result = await runM3VisualAnalysis(canvas);
  assert.equal(result.ok, true);
  const data = result.data;

  assert.equal(typeof data.screenshotWidth, 'number');
  assert.equal(typeof data.screenshotHeight, 'number');
  assert.equal(data.screenshotWidth, 800);
  assert.equal(data.screenshotHeight, 600);
  assert.equal(typeof data.detector, 'string');
  assert.equal(data.detector, 'morphological-cv-v1');
  assert.equal(typeof data.processingTimeMs, 'number');
  assert.ok(Array.isArray(data.detections));
  assert.ok(data.detections.length > 0);

  const d = data.detections[0];
  assert.ok(d.id.startsWith('vd-'));
  assert.equal(typeof d.type, 'string');
  assert.ok(Array.isArray(d.bbox));
  assert.equal(d.bbox.length, 4);
  assert.ok(Array.isArray(d.center));
  assert.equal(d.center.length, 2);
  assert.equal(typeof d.width, 'number');
  assert.equal(typeof d.height, 'number');
  assert.equal(typeof d.area, 'number');
  assert.equal(typeof d.confidence, 'number');
  assert.equal(typeof d.properties, 'object');
});

// 2. Bounding Box Containment Test
test('M3 Bounding Boxes: all detected boxes are strictly within screenshot dimensions', async () => {
  const W = 1024, H = 768;
  const canvas = createSyntheticCanvas(W, H);
  // Draw multiple UI components (container, button, input bar, text line)
  canvas.drawBorderRect(50, 50, 700, 300, [203, 213, 225], 2, [248, 250, 252]); // container
  canvas.drawBorderRect(80, 100, 240, 38, [100, 116, 139], 1, [255, 255, 255]); // input
  canvas.drawBorderRect(340, 100, 100, 38, [14, 165, 233], 2, [2, 132, 199]);   // button
  canvas.drawBorderRect(80, 160, 400, 16, [148, 163, 184], 1);                   // text line

  const result = await runM3VisualAnalysis(canvas);
  assert.equal(result.ok, true);
  const detections = result.data.detections;

  for (const d of detections) {
    const [x, y, w, h] = d.bbox;
    assert.ok(x >= 0, `x (${x}) must be >= 0`);
    assert.ok(y >= 0, `y (${y}) must be >= 0`);
    assert.ok(w > 0, `width (${w}) must be > 0`);
    assert.ok(h > 0, `height (${h}) must be > 0`);
    assert.ok(x + w <= W, `x+w (${x+w}) must be <= W (${W})`);
    assert.ok(y + h <= H, `y+h (${y+h}) must be <= H (${H})`);
  }
});

// 3. Geometric Consistency Test
test('M3 Geometry: area and center coordinates are mathematically consistent with width/height', async () => {
  const canvas = createSyntheticCanvas(640, 480);
  canvas.drawBorderRect(150, 200, 140, 44, [16, 185, 129], 2, [5, 150, 105]);

  const result = await runM3VisualAnalysis(canvas);
  assert.equal(result.ok, true);

  for (const d of result.data.detections) {
    assert.equal(d.area, d.width * d.height);
    const expectedCx = Math.round(d.bbox[0] + d.width / 2);
    const expectedCy = Math.round(d.bbox[1] + d.height / 2);
    assert.equal(d.center[0], expectedCx);
    assert.equal(d.center[1], expectedCy);
  }
});

// 4. Normalized Confidence Test
test('M3 Confidence: all confidence scores fall strictly in range [0.0, 1.0]', async () => {
  const canvas = createSyntheticCanvas(800, 600);
  canvas.drawBorderRect(60, 80, 120, 36, [100, 100, 100], 2);

  const result = await runM3VisualAnalysis(canvas);
  assert.equal(result.ok, true);

  for (const d of result.data.detections) {
    assert.ok(d.confidence >= 0.0, `Confidence ${d.confidence} must be >= 0.0`);
    assert.ok(d.confidence <= 1.0, `Confidence ${d.confidence} must be <= 1.0`);
  }
});

// 5. Auditable Measurable Properties Test
test('M3 Auditability: properties object exposes raw measurable features for full transparency', async () => {
  const canvas = createSyntheticCanvas(800, 600);
  canvas.drawBorderRect(200, 200, 120, 40, [220, 38, 38], 2, [239, 68, 68]);

  const result = await runM3VisualAnalysis(canvas);
  assert.equal(result.ok, true);
  assert.ok(result.data.detections.length > 0);

  const d = result.data.detections[0];
  const p = d.properties;
  assert.ok(p, 'Properties must exist');
  assert.equal(typeof p.aspectRatio, 'number');
  assert.equal(typeof p.edgeDensity, 'number');
  assert.equal(typeof p.colorVariance, 'number');
  assert.equal(typeof p.relativeWidth, 'number');
  assert.equal(typeof p.relativeHeight, 'number');
  assert.equal(typeof p.rectangularity, 'number');
  assert.equal(typeof p.relativePosition, 'object');
  assert.equal(typeof p.relativePosition.xPercent, 'number');
  assert.equal(typeof p.relativePosition.yPercent, 'number');
});

// 6. Crash Resilience Test on Solid / Empty Canvases
test('M3 Crash Resilience: empty, solid black, solid white, and low contrast canvases do not crash', async () => {
  const whiteCanvas = createSyntheticCanvas(400, 300, [255, 255, 255]);
  const resWhite = await runM3VisualAnalysis(whiteCanvas);
  assert.equal(resWhite.ok, true);
  assert.equal(resWhite.data.detections.length, 0);

  const blackCanvas = createSyntheticCanvas(400, 300, [0, 0, 0]);
  const resBlack = await runM3VisualAnalysis(blackCanvas);
  assert.equal(resBlack.ok, true);
  assert.equal(resBlack.data.detections.length, 0);

  const grayCanvas = createSyntheticCanvas(400, 300, [128, 128, 128]);
  const resGray = await runM3VisualAnalysis(grayCanvas);
  assert.equal(resGray.ok, true);
  assert.equal(resGray.data.detections.length, 0);
});

// 7. Layout Sensitivity Test
test('M3 Layout Sensitivity: different visual layouts produce different detections', async () => {
  // Layout A: Single button
  const layoutA = createSyntheticCanvas(640, 480);
  layoutA.drawBorderRect(100, 100, 100, 35, [30, 64, 175], 2, [59, 130, 246]);
  const resA = await runM3VisualAnalysis(layoutA);

  // Layout B: Multiple distinct elements (card container + two buttons + text row)
  const layoutB = createSyntheticCanvas(640, 480);
  layoutB.drawBorderRect(40, 40, 500, 350, [226, 232, 240], 2, [241, 245, 249]);
  layoutB.drawBorderRect(80, 80, 120, 36, [14, 165, 233], 2, [2, 132, 199]);
  layoutB.drawBorderRect(220, 80, 120, 36, [16, 185, 129], 2, [5, 150, 105]);
  layoutB.drawBorderRect(80, 160, 350, 18, [71, 85, 105], 2);
  const resB = await runM3VisualAnalysis(layoutB);

  assert.equal(resA.ok, true);
  assert.equal(resB.ok, true);
  assert.notEqual(resA.data.detections.length, resB.data.detections.length);
  assert.ok(resB.data.detections.length > resA.data.detections.length);
});

// 8. Rule Integrity Audit Test
test('M3 Rule Integrity: contains zero website names, zero user queries, and zero calls to Gemini', () => {
  const m3Source = fs.readFileSync(
    path.join(__dirname, '../gemini-browser-agent/gemini-browser-agent/m3-vision.js'),
    'utf-8'
  ).toLowerCase();

  // Check forbidden domain terms
  const forbiddenKeywords = ['github', 'saucedemo', 'google', 'amazon', 'checkout', 'add to cart', 'login', 'searchbar'];
  for (const kw of forbiddenKeywords) {
    assert.equal(m3Source.includes(kw), false, `m3-vision.js must not contain domain keyword "${kw}"`);
  }

  // Check that M3 does not call Gemini or LLM endpoints
  assert.equal(m3Source.includes('gemini'), false, 'm3-vision.js must not contain references to Gemini');
  assert.equal(m3Source.includes('generativelanguage'), false, 'm3-vision.js must not call Gemini API endpoints');
});

// 9. Fail-Closed Privacy Gate Test
test('M5/M6 Privacy Gate: fails closed when unredacted sensitive PII is encountered, passes when clean', () => {
  // Case A: Clean payload -> Passes
  const cleanPayload = {
    elements: [{ target_id: 'el-1', tag: 'button', text: 'Submit' }],
    visibleText: ['Welcome to our platform'],
    visualDetections: [{ id: 'vd-1', type: 'button-like-region', bbox: [10, 10, 80, 30] }]
  };
  const cleanCheck = validateZeroLeakPrivacy(cleanPayload, []);
  assert.equal(cleanCheck.passed, true);
  assert.equal(cleanCheck.leaks.length, 0);

  // Case B: Unredacted sensitive token present -> Fails closed
  const dirtyPayload = {
    elements: [{ target_id: 'el-2', tag: 'input', text: 'secret-auth-token-12345' }]
  };
  const sensitiveItems = [{ type: 'SECRET', value: 'secret-auth-token-12345' }];
  const dirtyCheck = validateZeroLeakPrivacy(dirtyPayload, sensitiveItems);
  assert.equal(dirtyCheck.passed, false);
  assert.ok(dirtyCheck.leaks.length > 0);

  // Case C: Raw screenshot leak attempt -> Fails closed
  const leakingPayload = {
    screenshot: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...'
  };
  const leakCheck = validateZeroLeakPrivacy(leakingPayload, []);
  assert.equal(leakCheck.passed, false);
  assert.ok(leakCheck.leaks.some(l => l.includes('Raw image bitmap')));
});

// 10. Zero-Leak Gemini Test
test('Zero-Leak Guarantee: raw screenshot is NEVER included in the sanitized observation', async () => {
  const canvas = createSyntheticCanvas(400, 300);
  canvas.drawBorderRect(50, 50, 100, 35, [30, 64, 175], 2);
  const m3Res = await runM3VisualAnalysis(canvas);

  const fakeM1 = { screenshot: 'data:image/png;base64,SECRET_RAW_IMAGE_DATA...' };
  const fakeM2 = { data: { elements: [{ target_id: 'el-0', tag: 'button', text: 'Click Me', bounds: { x: 50, y: 50, width: 100, height: 35 } }] } };

  const m6Res = await runM6PerceptionFusion({
    m1Result: fakeM1,
    m2Result: fakeM2,
    m3Result: m3Res,
    observation: { url: 'https://example.com', title: 'Example', pageHash: 'hash-123', elements: fakeM2.data.elements, visibleText: ['Click Me'] }
  });

  assert.equal(m6Res.ok, true);
  const sanitized = m6Res.data.sanitizedObservation;

  // Verify that sanitizedObservation NEVER contains the raw screenshot
  const sanitizedStr = JSON.stringify(sanitized);
  assert.equal(sanitizedStr.includes('SECRET_RAW_IMAGE_DATA'), false);
  assert.equal(sanitizedStr.includes('data:image/png;base64'), false);

  // Verify that M3 visual hypotheses are included in sanitizedObservation
  assert.ok(Array.isArray(sanitized.visualDetections));
  assert.ok(sanitized.visualDetections.length > 0);
});

// 11. End-to-End Perception Pipeline Flow Test
test('End-to-End Flow: M1 -> M3 -> M4 -> M5 -> M6 multimodal fusion', async () => {
  const canvas = createSyntheticCanvas(800, 600);
  canvas.drawBorderRect(100, 100, 120, 36, [14, 165, 233], 2, [2, 132, 199]); // button-like

  // 1. M1 screenshot
  const m1Result = { screenshotWidth: 800, screenshotHeight: 600 };

  // 2. M2 DOM
  const m2Result = {
    data: {
      elements: [
        { target_id: 'el-1', tag: 'button', text: 'Confirm', bounds: { x: 100, y: 100, width: 120, height: 36 } }
      ]
    }
  };

  // 3. M3 Visual Perception
  const m3Result = await runM3VisualAnalysis(canvas);
  assert.equal(m3Result.ok, true);
  assert.ok(m3Result.data.detections.length > 0);

  // 4. M4 OCR
  const m4Result = await runM4Ocr({ m2Result });
  assert.equal(m4Result.ok, true);

  // 5. M5 Privacy Scan
  const m5Result = await runM5PiiScan({ elements: m2Result.data.elements, textBlocks: m4Result.data.blocks });
  assert.equal(m5Result.ok, true);

  // 6. M6 Multimodal Fusion & Gate
  const m6Result = await runM6PerceptionFusion({
    m1Result,
    m2Result,
    m3Result,
    m4Result,
    m5Result,
    observation: {
      url: 'https://test.local',
      title: 'Local Test',
      pageHash: 'hash-abc',
      elements: m2Result.data.elements,
      visibleText: ['Confirm']
    }
  });

  assert.equal(m6Result.ok, true);
  assert.equal(m6Result.data.privacyGatePassed, true);
  assert.equal(m6Result.data.leakCheckPassed, true);
  assert.ok(m6Result.data.regionsMerged >= 1, 'M2 element should be spatially correlated with M3 hypothesis');

  // Verify safe observation
  const obs = m6Result.data.sanitizedObservation;
  assert.equal(obs.url, 'https://test.local');
  assert.ok(obs.elements[0].visualHypothesis !== null, 'Element should have visualHypothesis attached');
  assert.ok(Array.isArray(obs.visualDetections));
});
