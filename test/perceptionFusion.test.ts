import assert from 'node:assert';
import { test } from 'node:test';
import { PerceptionFusionEngine } from '../src/perception/fusion/perceptionFusion.js';
import { DetectionResult } from '../src/schema/detection.js';

test('PerceptionFusionEngine - IoU calculation', () => {
  const boxA = { x: 0, y: 0, width: 100, height: 100 };
  const boxB = { x: 50, y: 0, width: 100, height: 100 };

  const iou = PerceptionFusionEngine.computeIoU(boxA, boxB);
  // Intersection is 50x100 = 5000. Union is 10000 + 10000 - 5000 = 15000. IoU = 5000 / 15000 = 0.333
  assert.ok(Math.abs(iou - 0.3333) < 0.01, `Expected IoU ~0.333, got ${iou}`);
});

test('PerceptionFusionEngine - Deduplication and Priority', () => {
  const fusion = new PerceptionFusionEngine();

  const ocrDet: DetectionResult = {
    id: 'det_ocr_1',
    type: 'OCR_TEXT',
    source: 'ocr',
    bbox: { x: 10, y: 10, width: 100, height: 30 },
    confidence: 0.9,
    metadata: { text: 'john@example.com' }
  };

  const piiDet: DetectionResult = {
    id: 'det_pii_1',
    type: 'PII_CANDIDATE',
    source: 'pii',
    bbox: { x: 12, y: 10, width: 95, height: 28 },
    confidence: 0.98,
    metadata: { text: 'john@example.com', piiType: 'EMAIL' }
  };

  const results = fusion.fuseDetections([[ocrDet], [piiDet]], 0.5);

  assert.strictEqual(results.length, 1, 'Should deduplicate overlapping detections');
  assert.strictEqual(results[0].type, 'PII_CANDIDATE', 'Higher priority PII candidate should be preserved');
  assert.strictEqual(results[0].id, 'det_pii_1');
});
