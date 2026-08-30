import assert from 'node:assert';
import { test } from 'node:test';
import { PerceptionInput } from '../src/perception/input/perceptionInput.js';
import { LocalPerceptionPipeline } from '../src/perception/perceptionPipeline.js';
import { LocalVisualObjectDetector } from '../src/perception/vision/visualObjectDetector.js';

test('M6 - Visual Detector Initialization and Confidence Thresholding', () => {
  const detector = new LocalVisualObjectDetector();
  assert.strictEqual(detector.getConfidenceThreshold(), 0.50);

  detector.setConfidenceThreshold(0.75);
  assert.strictEqual(detector.getConfidenceThreshold(), 0.75);
});

test('M6 - Bounding Box Conversion and Coordinate Space Clamping', () => {
  const bbox = { x: -20, y: -10, width: 2000, height: 1500 };
  const detection = LocalVisualObjectDetector.createVisualDetection(
    'vis_1',
    'PASSPORT',
    bbox,
    0.92,
    1920,
    1080
  );

  assert.strictEqual(detection.type, 'VISUAL_REGION');
  assert.strictEqual(detection.source, 'vision');
  assert.strictEqual(detection.metadata?.category, 'PASSPORT');
  assert.strictEqual(detection.metadata?.coordinateSpace, 'SCREENSHOT');

  // Verify boundary clamping
  assert.strictEqual(detection.bbox.x, 0);
  assert.strictEqual(detection.bbox.y, 0);
  assert.strictEqual(detection.bbox.width, 1920);
  assert.strictEqual(detection.bbox.height, 1080);
});

test('M6 - Model Capability Gap Reporting on Generic Runtimes', async () => {
  const detector = new LocalVisualObjectDetector();
  await detector.init();

  const input: PerceptionInput = {
    image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    width: 1920,
    height: 1080,
    coordinateSpace: 'SCREENSHOT',
    devicePixelRatio: 1,
    timestamp: Date.now(),
    locality: { isLocal: true, externalAiUsed: false, uploadPerformed: false }
  };

  const response = await detector.detectVisualObjects(input);

  assert.strictEqual(response.success, true);
  assert.strictEqual(response.capabilityStatus, 'MODEL_CAPABILITY_GAP_IDENTIFIED');
  assert.ok(Array.isArray(response.detections));
});

test('M6 - Pipeline Integration and Failure Isolation', async () => {
  const pipeline = new LocalPerceptionPipeline();

  const input: PerceptionInput = {
    image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    width: 1920,
    height: 1080,
    coordinateSpace: 'SCREENSHOT',
    devicePixelRatio: 1,
    timestamp: Date.now(),
    locality: { isLocal: true, externalAiUsed: false, uploadPerformed: false }
  };

  const unified = await pipeline.runLocalPerception(input);

  assert.ok(unified);
  assert.strictEqual(unified.schemaVersion, '1.0.0');
  assert.ok(unified.subsystems.vision);
  assert.strictEqual(unified.subsystems.vision.status, 'SUCCESS');
});
