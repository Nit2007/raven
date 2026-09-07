/**
 * tests/coordinate-redaction.test.js — Regression & Coordinate Lifecycle Test Suite
 * 
 * Implements all 12 required tests from Section 20 of RAVEN Specification:
 * - Test 1: One face → one localized region.
 * - Test 2: Two faces → two localized regions.
 * - Test 3: Ten faces → ten independent regions.
 * - Test 4: Face coordinates with DPR scaling.
 * - Test 5: CSS viewport ≠ screenshot pixel dimensions.
 * - Test 6: Invalid bbox → rejected, never full-screen.
 * - Test 7: Face near viewport edge → correctly clamped.
 * - Test 8: Multiple distant faces → never converted into one union box.
 * - Test 9: Correct M5 box → unchanged after M6 normalization.
 * - Test 10: Correct normalized box → exact final canvas redaction.
 * - Test 11: Google Images → page remains visible except face regions.
 * - Test 12: GitHub profile → only face region redacted.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CANONICAL_COORDINATE_SPACE,
  normalizeVisualRegionToM1,
  validateBoundingBox,
  createCoordinateTelemetry
} from '../gemini-browser-agent/gemini-browser-agent/coordinate-utils.js';
import { runM6PerceptionFusion, redactVisualCanvas } from '../gemini-browser-agent/gemini-browser-agent/m6-fusion.js';

// Mock helper to create synthetic Canvas-like object
function createMockCanvas(width, height) {
  const operations = [];
  return {
    width,
    height,
    getContext(type) {
      return {
        save() { operations.push({ op: 'save' }); },
        restore() { operations.push({ op: 'restore' }); },
        fillStyle: '#000000',
        strokeStyle: '#000000',
        lineWidth: 1,
        fillRect(x, y, w, h) { operations.push({ op: 'fillRect', x, y, w, h }); },
        strokeRect(x, y, w, h) { operations.push({ op: 'strokeRect', x, y, w, h }); }
      };
    },
    getOperations() { return operations; }
  };
}

test('Test 1: One face → one localized region', async () => {
  const screenshotW = 1920;
  const screenshotH = 1080;
  const rawFace = {
    id: 'face-1',
    type: 'face',
    category: 'Face / Avatar',
    box: { x: 420, y: 180, width: 120, height: 120 },
    sourceSpace: CANONICAL_COORDINATE_SPACE,
    sourceDimensions: { width: screenshotW, height: screenshotH }
  };

  const m6Result = await runM6PerceptionFusion({
    m1Result: { image: { width: screenshotW, height: screenshotH } },
    m5Result: { items: [rawFace] },
    observation: { url: 'https://example.com', title: 'Single Face' }
  });

  assert.equal(m6Result.ok, true);
  const redactions = m6Result.data.redactionRegions.filter(r => r.type === 'face');
  assert.equal(redactions.length, 1);
  assert.equal(redactions[0].id, 'face-1');
  assert.equal(redactions[0].bbox.x, 420);
  assert.equal(redactions[0].bbox.y, 180);
  assert.equal(redactions[0].bbox.width, 120);
  assert.equal(redactions[0].bbox.height, 120);
  assert.equal(redactions[0].coordinateSpace, CANONICAL_COORDINATE_SPACE);
});

test('Test 2: Two faces → two localized regions', async () => {
  const screenshotW = 1920;
  const screenshotH = 1080;
  const rawFaces = [
    {
      id: 'face-1',
      type: 'face',
      box: { x: 200, y: 150, width: 100, height: 100 },
      sourceSpace: CANONICAL_COORDINATE_SPACE,
      sourceDimensions: { width: screenshotW, height: screenshotH }
    },
    {
      id: 'face-2',
      type: 'face',
      box: { x: 800, y: 300, width: 110, height: 110 },
      sourceSpace: CANONICAL_COORDINATE_SPACE,
      sourceDimensions: { width: screenshotW, height: screenshotH }
    }
  ];

  const m6Result = await runM6PerceptionFusion({
    m1Result: { image: { width: screenshotW, height: screenshotH } },
    m5Result: { items: rawFaces },
    observation: { url: 'https://example.com', title: 'Two Faces' }
  });

  assert.equal(m6Result.ok, true);
  const redactions = m6Result.data.redactionRegions.filter(r => r.type === 'face');
  assert.equal(redactions.length, 2);
  assert.equal(redactions[0].bbox.x, 200);
  assert.equal(redactions[1].bbox.x, 800);
});

test('Test 3: Ten faces → ten independent regions', async () => {
  const screenshotW = 1920;
  const screenshotH = 1080;
  const rawFaces = Array.from({ length: 10 }, (_, i) => ({
    id: `face-${i + 1}`,
    type: 'face',
    box: { x: 50 + (i % 5) * 300, y: 50 + Math.floor(i / 5) * 400, width: 90, height: 90 },
    sourceSpace: CANONICAL_COORDINATE_SPACE,
    sourceDimensions: { width: screenshotW, height: screenshotH }
  }));

  const m6Result = await runM6PerceptionFusion({
    m1Result: { image: { width: screenshotW, height: screenshotH } },
    m5Result: { items: rawFaces },
    observation: { url: 'https://example.com', title: 'Ten Faces' }
  });

  assert.equal(m6Result.ok, true);
  const redactions = m6Result.data.redactionRegions.filter(r => r.type === 'face');
  assert.equal(redactions.length, 10);
  // Ensure every region has unique, localized bounds
  const uniqueX = new Set(redactions.map(r => r.bbox.x));
  assert.equal(uniqueX.size, 5);
});

test('Test 4: Face coordinates with DPR scaling', async () => {
  // CSS viewport 1280x720, screenshot 2560x1440 (DPR = 2.0)
  const cssW = 1280, cssH = 720;
  const imgW = 2560, imgH = 1440;
  const domBox = { x: 100, y: 50, width: 80, height: 80 };

  const norm = normalizeVisualRegionToM1(
    domBox,
    { width: cssW, height: cssH, coordinateSpace: 'dom-css-viewport' },
    { width: imgW, height: imgH, coordinateSpace: CANONICAL_COORDINATE_SPACE }
  );

  assert.equal(norm.isValid, true);
  assert.equal(norm.normalizedBox.x, 200);
  assert.equal(norm.normalizedBox.y, 100);
  assert.equal(norm.normalizedBox.width, 160);
  assert.equal(norm.normalizedBox.height, 160);
  assert.equal(norm.normalizedBox.coordinateSpace, CANONICAL_COORDINATE_SPACE);
  assert.equal(norm.scaleX, 2.0);
  assert.equal(norm.scaleY, 2.0);
});

test('Test 5: CSS viewport ≠ screenshot pixel dimensions (uneven scaling)', async () => {
  // Browser viewport with scrollbar or custom zoom: Wcss=1280, Hcss=800, Wimg=1920, Himg=1080
  const cssW = 1280, cssH = 800;
  const imgW = 1920, imgH = 1080;
  const domBox = { x: 320, y: 200, width: 160, height: 160 };

  const norm = normalizeVisualRegionToM1(
    domBox,
    { width: cssW, height: cssH, coordinateSpace: 'dom-css-viewport' },
    { width: imgW, height: imgH, coordinateSpace: CANONICAL_COORDINATE_SPACE }
  );

  assert.equal(norm.isValid, true);
  // scaleX = 1920 / 1280 = 1.5 -> x = 480, w = 240
  // scaleY = 1080 / 800 = 1.35 -> y = 270, h = 216
  assert.equal(norm.normalizedBox.x, 480);
  assert.equal(norm.normalizedBox.y, 270);
  assert.equal(norm.normalizedBox.width, 240);
  assert.equal(norm.normalizedBox.height, 216);
});

test('Test 6: Invalid bbox → rejected, never full-screen', async () => {
  const screenshotW = 1920;
  const screenshotH = 1080;

  // Case A: NaN coordinates
  const nanBox = validateBoundingBox({ x: NaN, y: 100, width: 100, height: 100 }, screenshotW, screenshotH);
  assert.equal(nanBox.isValid, false);
  assert.equal(nanBox.reason, 'non_finite_coordinates');

  // Case B: Infinity coordinates
  const infBox = validateBoundingBox({ x: 0, y: Infinity, width: 100, height: 100 }, screenshotW, screenshotH);
  assert.equal(infBox.isValid, false);
  assert.equal(infBox.reason, 'non_finite_coordinates');

  // Case C: Negative width/height
  const negBox = validateBoundingBox({ x: 100, y: 100, width: -50, height: 50 }, screenshotW, screenshotH);
  assert.equal(negBox.isValid, false);
  assert.equal(negBox.reason, 'zero_or_negative_dimensions');

  // Case D: Zero area
  const zeroBox = validateBoundingBox({ x: 100, y: 100, width: 0, height: 100 }, screenshotW, screenshotH);
  assert.equal(zeroBox.isValid, false);
  assert.equal(zeroBox.reason, 'zero_or_negative_dimensions');

  // Case E: Suspiciously large coverage (>= 45% of entire screenshot)
  const hugeBox = validateBoundingBox({ x: 0, y: 0, width: 1800, height: 1000 }, screenshotW, screenshotH);
  assert.equal(hugeBox.isValid, false);
  assert.match(hugeBox.reason, /suspiciously_large_coverage_ratio/);

  // M6 ingestion of invalid boxes: must reject, NEVER convert to full-screen
  const m6Result = await runM6PerceptionFusion({
    m1Result: { image: { width: screenshotW, height: screenshotH } },
    m5Result: {
      items: [
        { id: 'bad-1', type: 'face', box: { x: NaN, y: 0, width: 100, height: 100 } },
        { id: 'bad-2', type: 'face', box: { x: 0, y: 0, width: screenshotW, height: screenshotH } }
      ]
    },
    observation: { url: 'https://example.com', title: 'Invalid Boxes Test' }
  });

  const redactions = m6Result.data.redactionRegions.filter(r => r.type === 'face');
  assert.equal(redactions.length, 0); // Both invalid regions safely rejected
});

test('Test 7: Face near viewport edge → correctly clamped within image bounds', async () => {
  const screenshotW = 1000;
  const screenshotH = 1000;

  // Box exceeding right and bottom edges
  const edgeBox = { x: 920, y: 950, width: 120, height: 100 };
  const val = validateBoundingBox(edgeBox, screenshotW, screenshotH);

  assert.equal(val.isValid, true);
  assert.equal(val.box.x, 920);
  assert.equal(val.box.y, 950);
  assert.equal(val.box.x + val.box.width <= screenshotW, true);
  assert.equal(val.box.y + val.box.height <= screenshotH, true);
  assert.equal(val.box.width, 80); // clamped from 120 to 80
  assert.equal(val.box.height, 50); // clamped from 100 to 50
});

test('Test 8: Multiple distant faces → never converted into one union box', async () => {
  const screenshotW = 1920;
  const screenshotH = 1080;
  const face1 = { x: 100, y: 100, width: 80, height: 80 };
  const face2 = { x: 1700, y: 900, width: 80, height: 80 };

  const m6Result = await runM6PerceptionFusion({
    m1Result: { image: { width: screenshotW, height: screenshotH } },
    m5Result: {
      items: [
        { id: 'f-left', type: 'face', box: face1, sourceSpace: CANONICAL_COORDINATE_SPACE },
        { id: 'f-right', type: 'face', box: face2, sourceSpace: CANONICAL_COORDINATE_SPACE }
      ]
    },
    observation: { url: 'https://example.com', title: 'Distant Faces' }
  });

  const redactions = m6Result.data.redactionRegions.filter(r => r.type === 'face');
  assert.equal(redactions.length, 2);

  // Verify that neither redaction is a global union box (which would have width >= 1600)
  for (const r of redactions) {
    assert.equal(r.bbox.width <= 100, true);
    assert.equal(r.bbox.height <= 100, true);
  }
});

test('Test 9: Correct M5 box → unchanged after M6 normalization', async () => {
  const screenshotW = 1920;
  const screenshotH = 1080;
  const canonicalBox = { x: 450, y: 220, width: 130, height: 130 };

  const m6Result = await runM6PerceptionFusion({
    m1Result: { image: { width: screenshotW, height: screenshotH } },
    m5Result: {
      items: [
        {
          id: 'face-canon',
          type: 'face',
          box: canonicalBox,
          coordinateSpace: CANONICAL_COORDINATE_SPACE,
          sourceSpace: CANONICAL_COORDINATE_SPACE,
          sourceDimensions: { width: screenshotW, height: screenshotH }
        }
      ]
    },
    observation: { url: 'https://example.com', title: 'Preserved Box' }
  });

  const r = m6Result.data.redactionRegions.find(item => item.id === 'face-canon');
  assert.ok(r);
  assert.equal(r.bbox.x, 450);
  assert.equal(r.bbox.y, 220);
  assert.equal(r.bbox.width, 130);
  assert.equal(r.bbox.height, 130);
});

test('Test 10: Correct normalized box → exact final canvas redaction without double scaling', async () => {
  const canvasW = 1200;
  const canvasH = 800;
  const mockCanvas = createMockCanvas(canvasW, canvasH);

  const redactions = [
    { bbox: { x: 300, y: 200, width: 100, height: 100 } }
  ];

  // Canvas dimensions match coordinate dimensions: scale should be exactly 1.0 (no double scaling)
  await redactVisualCanvas(mockCanvas, redactions, { width: canvasW, height: canvasH });
  const ops = mockCanvas.getOperations();

  const fillOp = ops.find(o => o.op === 'fillRect');
  assert.ok(fillOp);
  // Blur strictly stays inside the image only (zero external padding)
  assert.equal(fillOp.x, 300);
  assert.equal(fillOp.y, 200);
  assert.equal(fillOp.w, 100);
  assert.equal(fillOp.h, 100);

  // User requirement: "dont draw bounding box" -> strictly ZERO strokeRect operations!
  const strokeOps = ops.filter(o => o.op === 'strokeRect');
  assert.equal(strokeOps.length, 0, 'No bounding box outline should ever be drawn on canvas');
});

test('Test 11: Google Images mock → page remains visible except face regions', async () => {
  const screenshotW = 1920;
  const screenshotH = 1080;
  const totalPageArea = screenshotW * screenshotH;

  // 6 faces on an image search result grid
  const gridFaces = [
    { id: 'img-1', type: 'face', box: { x: 100, y: 150, width: 90, height: 90 } },
    { id: 'img-2', type: 'face', box: { x: 350, y: 150, width: 95, height: 95 } },
    { id: 'img-3', type: 'face', box: { x: 600, y: 150, width: 85, height: 85 } },
    { id: 'img-4', type: 'face', box: { x: 100, y: 400, width: 90, height: 90 } },
    { id: 'img-5', type: 'face', box: { x: 350, y: 400, width: 100, height: 100 } },
    { id: 'img-6', type: 'face', box: { x: 600, y: 400, width: 95, height: 95 } }
  ];

  const m6Result = await runM6PerceptionFusion({
    m1Result: { image: { width: screenshotW, height: screenshotH } },
    m5Result: { items: gridFaces },
    observation: {
      url: 'https://images.google.com/search?q=portrait',
      title: 'Google Images - Portrait',
      elements: [
        { target_id: 'btn-search', tag: 'button', text: 'Search', bounds: { x: 800, y: 20, width: 80, height: 35 } }
      ]
    }
  });

  assert.equal(m6Result.ok, true);
  const redactions = m6Result.data.redactionRegions.filter(r => r.type === 'face');
  assert.equal(redactions.length, 6);

  // Calculate total redacted area
  const totalRedactedArea = redactions.reduce((sum, r) => sum + (r.bbox.width * r.bbox.height), 0);
  const totalCoverage = totalRedactedArea / totalPageArea;

  // The total redacted area must be localized (< 5% of total screen)
  assert.equal(totalCoverage < 0.05, true, `Redacted area ${(totalCoverage * 100).toFixed(2)}% must be localized, not full page`);
  // Simple-UI elements remain visible and unredacted
  assert.equal(m6Result.data.sanitizedObservation.elements.length, 1);
});

test('Test 12: GitHub profile mock → only face region redacted', async () => {
  const cssW = 1280, cssH = 800;
  const imgW = 1920, imgH = 1200; // DPR = 1.5
  const profileAvatarDom = { x: 120, y: 160, width: 260, height: 260 };

  // 1. Normalize DOM avatar box to M1 screenshot
  const norm = normalizeVisualRegionToM1(
    profileAvatarDom,
    { width: cssW, height: cssH, coordinateSpace: 'dom-css-viewport' },
    { width: imgW, height: imgH, coordinateSpace: CANONICAL_COORDINATE_SPACE }
  );

  assert.equal(norm.isValid, true);
  // scale = 1.5 -> x = 180, y = 240, w = 390, h = 390
  assert.equal(norm.normalizedBox.x, 180);
  assert.equal(norm.normalizedBox.y, 240);
  assert.equal(norm.normalizedBox.width, 390);
  assert.equal(norm.normalizedBox.height, 390);

  // 2. Pass into M6 fusion
  const m6Result = await runM6PerceptionFusion({
    m1Result: { image: { width: imgW, height: imgH } },
    m5Result: {
      items: [
        {
          id: 'gh-avatar',
          type: 'face',
          category: 'Face / Avatar',
          box: norm.normalizedBox,
          sourceBox: profileAvatarDom,
          sourceSpace: 'dom-css-viewport',
          coordinateSpace: CANONICAL_COORDINATE_SPACE
        }
      ]
    },
    observation: {
      url: 'https://github.com/octocat',
      title: 'octocat (The Octocat) · GitHub',
      elements: [
        { target_id: 'btn-follow', tag: 'button', text: 'Follow', bounds: { x: 120, y: 440, width: 260, height: 32 } },
        { target_id: 'tab-repos', tag: 'a', text: 'Repositories 8', bounds: { x: 420, y: 120, width: 140, height: 30 } }
      ]
    }
  });

  assert.equal(m6Result.ok, true);
  const redactions = m6Result.data.redactionRegions.filter(r => r.type === 'face');
  assert.equal(redactions.length, 1);
  assert.equal(redactions[0].bbox.x, 180);
  assert.equal(redactions[0].bbox.y, 240);
  assert.equal(redactions[0].bbox.width, 390);
  assert.equal(redactions[0].bbox.height, 390);

  // Non-sensitive elements (Follow button, Repositories tab) are untouched
  const elements = m6Result.data.sanitizedObservation.elements;
  assert.equal(elements.length, 2);
  assert.equal(elements[0].text, 'Follow');
  assert.equal(elements[1].text, 'Repositories 8');
});

test('Test 13: Whole image blurred without bounding box, blur strictly inside image', async () => {
  const canvasW = 1920;
  const canvasH = 1080;
  const mockCanvas = createMockCanvas(canvasW, canvasH);

  // Face detected inside a larger profile image card (e.g. face is 60x60 inside a 200x200 photo)
  const faceWithImage = {
    id: 'face-in-photo',
    type: 'face',
    category: 'Face / Avatar',
    box: { x: 170, y: 220, width: 60, height: 60 },
    imageBox: { x: 100, y: 150, width: 200, height: 200 }, // Containing image element
    sourceSpace: CANONICAL_COORDINATE_SPACE,
    sourceDimensions: { width: canvasW, height: canvasH }
  };

  const m6Result = await runM6PerceptionFusion({
    m1Result: { image: { width: canvasW, height: canvasH } },
    m5Result: { items: [faceWithImage] },
    observation: { url: 'https://example.com/profile', title: 'Profile' }
  });

  assert.equal(m6Result.ok, true);
  const redactions = m6Result.data.redactionRegions.filter(r => r.type === 'face');
  assert.equal(redactions.length, 1);
  // Whole image itself is blurred
  assert.equal(redactions[0].bbox.x, 100);
  assert.equal(redactions[0].bbox.y, 150);
  assert.equal(redactions[0].bbox.width, 200);
  assert.equal(redactions[0].bbox.height, 200);

  // Perform canvas redaction
  await redactVisualCanvas(mockCanvas, redactions, { width: canvasW, height: canvasH });
  const ops = mockCanvas.getOperations();

  // Blur strictly stays inside image bounds (100, 150, 200, 200) without external padding
  const fillOp = ops.find(o => o.op === 'fillRect');
  assert.ok(fillOp);
  assert.equal(fillOp.x, 100);
  assert.equal(fillOp.y, 150);
  assert.equal(fillOp.w, 200);
  assert.equal(fillOp.h, 200);

  // Strictly ZERO bounding box outline
  const strokeOps = ops.filter(o => o.op === 'strokeRect');
  assert.equal(strokeOps.length, 0);
});
