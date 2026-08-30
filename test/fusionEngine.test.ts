import assert from 'node:assert';
import { test } from 'node:test';
import { PerceptionFusionEngine } from '../src/perception/fusion/perceptionFusion.js';
import { DetectionResult } from '../src/schema/detection.js';

test('TEST 1 - FACE + OCR + PII fusion', () => {
  const fusion = new PerceptionFusionEngine();

  const faceDets: DetectionResult[] = [
    { id: 'f1', type: 'FACE', source: 'face', bbox: { x: 100, y: 100, width: 80, height: 80 }, confidence: 0.95 }
  ];
  const ocrDets: DetectionResult[] = [
    { id: 'o1', type: 'OCR_TEXT', source: 'ocr', bbox: { x: 300, y: 200, width: 150, height: 20 }, confidence: 0.90, metadata: { text: 'Hello World' } }
  ];
  const piiDets: DetectionResult[] = [
    { id: 'p1', type: 'PII_CANDIDATE', source: 'pii', bbox: { x: 500, y: 300, width: 140, height: 20 }, confidence: 0.98, metadata: { category: 'EMAIL', text: 'test@example.com' } }
  ];

  const unified = fusion.buildUnifiedResult({
    screenshotWidth: 1920,
    screenshotHeight: 1080,
    faceResults: { detections: faceDets, status: 'SUCCESS' },
    ocrResults: { detections: ocrDets, status: 'SUCCESS' },
    piiResults: { detections: piiDets, status: 'SUCCESS' },
    timing: { captureMs: 10, faceMs: 20, ocrInitMs: 0, ocrInferenceMs: 50, normalizationMs: 1, piiMs: 1, fusionMs: 1, totalMs: 83 }
  });

  assert.strictEqual(unified.status, 'SUCCESS');
  assert.strictEqual(unified.counts.total, 3);
  assert.strictEqual(unified.counts.faces, 1);
  assert.strictEqual(unified.counts.ocrRegions, 1);
  assert.strictEqual(unified.counts.piiCandidates, 1);
});

test('TEST 2 - FACE only', () => {
  const fusion = new PerceptionFusionEngine();
  const faceDets: DetectionResult[] = [
    { id: 'f1', type: 'FACE', source: 'face', bbox: { x: 100, y: 100, width: 80, height: 80 }, confidence: 0.95 }
  ];

  const unified = fusion.buildUnifiedResult({
    screenshotWidth: 1920,
    screenshotHeight: 1080,
    faceResults: { detections: faceDets, status: 'SUCCESS' },
    ocrResults: { detections: [], status: 'SKIPPED' },
    piiResults: { detections: [], status: 'SKIPPED' },
    timing: { captureMs: 10, faceMs: 20, ocrInitMs: 0, ocrInferenceMs: 0, normalizationMs: 0, piiMs: 0, fusionMs: 1, totalMs: 31 }
  });

  assert.strictEqual(unified.counts.faces, 1);
  assert.strictEqual(unified.counts.ocrRegions, 0);
  assert.strictEqual(unified.counts.piiCandidates, 0);
});

test('TEST 3 - OCR only', () => {
  const fusion = new PerceptionFusionEngine();
  const ocrDets: DetectionResult[] = [
    { id: 'o1', type: 'OCR_TEXT', source: 'ocr', bbox: { x: 300, y: 200, width: 150, height: 20 }, confidence: 0.90, metadata: { text: 'Sample Text' } }
  ];

  const unified = fusion.buildUnifiedResult({
    screenshotWidth: 1920,
    screenshotHeight: 1080,
    faceResults: { detections: [], status: 'SKIPPED' },
    ocrResults: { detections: ocrDets, status: 'SUCCESS' },
    piiResults: { detections: [], status: 'SKIPPED' },
    timing: { captureMs: 10, faceMs: 0, ocrInitMs: 0, ocrInferenceMs: 40, normalizationMs: 1, piiMs: 0, fusionMs: 1, totalMs: 52 }
  });

  assert.strictEqual(unified.counts.ocrRegions, 1);
});

test('TEST 4 - PII only', () => {
  const fusion = new PerceptionFusionEngine();
  const piiDets: DetectionResult[] = [
    { id: 'p1', type: 'PII_CANDIDATE', source: 'pii', bbox: { x: 500, y: 300, width: 140, height: 20 }, confidence: 0.98, metadata: { category: 'EMAIL', text: 'user@domain.com' } }
  ];

  const unified = fusion.buildUnifiedResult({
    screenshotWidth: 1920,
    screenshotHeight: 1080,
    faceResults: { detections: [], status: 'SKIPPED' },
    ocrResults: { detections: [], status: 'SKIPPED' },
    piiResults: { detections: piiDets, status: 'SUCCESS' },
    timing: { captureMs: 10, faceMs: 0, ocrInitMs: 0, ocrInferenceMs: 0, normalizationMs: 0, piiMs: 2, fusionMs: 1, totalMs: 13 }
  });

  assert.strictEqual(unified.counts.piiCandidates, 1);
});

test('TEST 5 - Empty result', () => {
  const fusion = new PerceptionFusionEngine();

  const unified = fusion.buildUnifiedResult({
    screenshotWidth: 1920,
    screenshotHeight: 1080,
    faceResults: { detections: [], status: 'SUCCESS' },
    ocrResults: { detections: [], status: 'SUCCESS' },
    piiResults: { detections: [], status: 'SUCCESS' },
    timing: { captureMs: 10, faceMs: 15, ocrInitMs: 0, ocrInferenceMs: 30, normalizationMs: 1, piiMs: 1, fusionMs: 1, totalMs: 58 }
  });

  assert.strictEqual(unified.status, 'SUCCESS');
  assert.strictEqual(unified.counts.total, 0);
});

test('TEST 6 - Duplicate detection', () => {
  const fusion = new PerceptionFusionEngine();

  const dupFace1: DetectionResult = { id: 'f1', type: 'FACE', source: 'face', bbox: { x: 100, y: 100, width: 80, height: 80 }, confidence: 0.95 };
  const dupFace2: DetectionResult = { id: 'f2', type: 'FACE', source: 'face', bbox: { x: 102, y: 102, width: 80, height: 80 }, confidence: 0.80 };

  const fused = fusion.fuseDetections([[dupFace1, dupFace2]]);
  assert.strictEqual(fused.length, 1, 'Overlapping duplicate faces must be suppressed');
  assert.strictEqual(fused[0].id, 'f1');
});

test('TEST 7 - Two nearby but different phone numbers', () => {
  const fusion = new PerceptionFusionEngine();

  const phone1: DetectionResult = {
    id: 'p1',
    type: 'PII_CANDIDATE',
    source: 'pii',
    bbox: { x: 100, y: 50, width: 140, height: 20 },
    confidence: 0.98,
    metadata: { category: 'PHONE', text: '+91 9876543210' }
  };
  const phone2: DetectionResult = {
    id: 'p2',
    type: 'PII_CANDIDATE',
    source: 'pii',
    bbox: { x: 100, y: 75, width: 140, height: 20 },
    confidence: 0.97,
    metadata: { category: 'PHONE', text: '+91 8765432109' }
  };

  const fused = fusion.fuseDetections([[phone1, phone2]]);
  assert.strictEqual(fused.length, 2, 'Two distinct phone numbers must both be preserved');
});

test('TEST 8 & 9 - Invalid bounding box & Coordinate-space validation', () => {
  const outOfBounds: DetectionResult = {
    id: 'oob1',
    type: 'OCR_TEXT',
    source: 'ocr',
    bbox: { x: -50, y: -20, width: 2500, height: 1500 },
    confidence: 0.90,
    metadata: { text: 'Boundary Test' }
  };

  const clamped = PerceptionFusionEngine.validateAndClampBBox(outOfBounds.bbox, 1920, 1080);
  assert.strictEqual(clamped.x, 0);
  assert.strictEqual(clamped.y, 0);
  assert.strictEqual(clamped.width, 1920);
  assert.strictEqual(clamped.height, 1080);
});

test('TEST 10 - Confidence preservation', () => {
  const fusion = new PerceptionFusionEngine();
  const det: DetectionResult = { id: 'c1', type: 'FACE', source: 'face', bbox: { x: 50, y: 50, width: 60, height: 60 }, confidence: 0.887 };

  const unified = fusion.buildUnifiedResult({
    screenshotWidth: 1920,
    screenshotHeight: 1080,
    faceResults: { detections: [det], status: 'SUCCESS' },
    timing: { captureMs: 10, faceMs: 10, ocrInitMs: 0, ocrInferenceMs: 0, normalizationMs: 0, piiMs: 0, fusionMs: 1, totalMs: 21 }
  });

  assert.strictEqual(unified.detections[0].confidence, 0.887);
});

test('TEST 11 - Detector failure isolation', () => {
  const fusion = new PerceptionFusionEngine();

  const ocrDets: DetectionResult[] = [
    { id: 'o1', type: 'OCR_TEXT', source: 'ocr', bbox: { x: 100, y: 100, width: 200, height: 20 }, confidence: 0.95, metadata: { text: 'OCR Succeeded' } }
  ];

  const unified = fusion.buildUnifiedResult({
    screenshotWidth: 1920,
    screenshotHeight: 1080,
    faceResults: { detections: [], status: 'FAILED', error: 'BlazeFace WASM initialization failed' },
    ocrResults: { detections: ocrDets, status: 'SUCCESS' },
    piiResults: { detections: [], status: 'SUCCESS' },
    timing: { captureMs: 10, faceMs: 5, ocrInitMs: 0, ocrInferenceMs: 40, normalizationMs: 1, piiMs: 1, fusionMs: 1, totalMs: 58 }
  });

  assert.strictEqual(unified.status, 'PARTIAL_SUCCESS');
  assert.strictEqual(unified.subsystems.face.status, 'FAILED');
  assert.strictEqual(unified.subsystems.face.error, 'BlazeFace WASM initialization failed');
  assert.strictEqual(unified.subsystems.ocr.status, 'SUCCESS');
  assert.strictEqual(unified.detections.length, 1);
});

test('TEST 12 - Locality flags', () => {
  const fusion = new PerceptionFusionEngine();

  const unified = fusion.buildUnifiedResult({
    screenshotWidth: 1920,
    screenshotHeight: 1080,
    timing: { captureMs: 10, faceMs: 10, ocrInitMs: 0, ocrInferenceMs: 10, normalizationMs: 0, piiMs: 0, fusionMs: 1, totalMs: 31 }
  });

  assert.strictEqual(unified.locality.isLocal, true);
  assert.strictEqual(unified.locality.externalAiUsed, false);
  assert.strictEqual(unified.locality.networkUploadPerformed, false);
});

test('TEST 13 - Person-1 handoff schema validity', () => {
  const fusion = new PerceptionFusionEngine();

  const unified = fusion.buildUnifiedResult({
    screenshotWidth: 1920,
    screenshotHeight: 1080,
    timing: { captureMs: 10, faceMs: 10, ocrInitMs: 0, ocrInferenceMs: 10, normalizationMs: 0, piiMs: 0, fusionMs: 1, totalMs: 31 }
  });

  assert.strictEqual(unified.schemaVersion, '1.0.0');
  assert.strictEqual(unified.screenshot.coordinateSpace, 'SCREENSHOT');
  assert.ok(typeof unified.generatedAt === 'number');
});
