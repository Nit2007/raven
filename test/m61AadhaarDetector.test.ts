import assert from 'node:assert';
import { test } from 'node:test';
import { PerceptionInput } from '../src/perception/input/perceptionInput.js';
import { LocalPerceptionPipeline } from '../src/perception/perceptionPipeline.js';
import { LocalVisualObjectDetector, RawOcrWordForVision } from '../src/perception/vision/visualObjectDetector.js';

test('M6.1 - 1. Aadhaar Card Visual Detection via Multi-Modal Spatial Evidence', async () => {
  const detector = new LocalVisualObjectDetector();

  const mockWords: RawOcrWordForVision[] = [
    { text: 'Government of India', confidence: 0.95, bbox: { x: 120, y: 140, width: 200, height: 25 } },
    { text: 'Unique Identification Authority of India', confidence: 0.92, bbox: { x: 120, y: 170, width: 250, height: 20 } },
    { text: 'Name: SARAN KUMAR', confidence: 0.96, bbox: { x: 220, y: 200, width: 150, height: 20 } },
    { text: 'DOB: 15/08/1995', confidence: 0.94, bbox: { x: 220, y: 225, width: 120, height: 18 } },
    { text: '9944 4900 0004', confidence: 0.98, bbox: { x: 150, y: 260, width: 200, height: 25 } }
  ];

  const input: PerceptionInput = {
    image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    width: 1920,
    height: 1080,
    coordinateSpace: 'SCREENSHOT',
    devicePixelRatio: 1,
    timestamp: Date.now(),
    locality: { isLocal: true, externalAiUsed: false, uploadPerformed: false }
  };

  const response = await detector.detectVisualObjects(input, undefined, mockWords);

  assert.strictEqual(response.success, true);
  assert.strictEqual(response.detections.length, 1);
  assert.strictEqual(response.detections[0].metadata?.category, 'AADHAAR_CARD');
  assert.ok(response.detections[0].confidence >= 0.85);
});

test('M6.1 - 2. Passport Visual Detection', async () => {
  const detector = new LocalVisualObjectDetector();

  const mockWords: RawOcrWordForVision[] = [
    { text: 'PASSPORT', confidence: 0.95, bbox: { x: 300, y: 200, width: 120, height: 30 } },
    { text: 'REPUBLIC OF INDIA', confidence: 0.92, bbox: { x: 300, y: 235, width: 180, height: 20 } },
    { text: 'P<INDDOE<<JOHN<<<<<<<<<<<<<<<<<<<<', confidence: 0.90, bbox: { x: 300, y: 350, width: 350, height: 25 } }
  ];

  const input: PerceptionInput = {
    image: 'data:image/png;base64,dummy',
    width: 1920,
    height: 1080,
    coordinateSpace: 'SCREENSHOT',
    devicePixelRatio: 1,
    timestamp: Date.now(),
    locality: { isLocal: true, externalAiUsed: false, uploadPerformed: false }
  };

  const response = await detector.detectVisualObjects(input, undefined, mockWords);

  assert.strictEqual(response.success, true);
  assert.strictEqual(response.detections.length, 1);
  assert.strictEqual(response.detections[0].metadata?.category, 'PASSPORT');
});

test('M6.1 - 3. Payment Card Visual Detection', async () => {
  const detector = new LocalVisualObjectDetector();

  const mockWords: RawOcrWordForVision[] = [
    { text: 'GLOBAL BANK VISA CARD', confidence: 0.96, bbox: { x: 500, y: 400, width: 220, height: 25 } },
    { text: '4111 1111 1111 1111', confidence: 0.98, bbox: { x: 500, y: 440, width: 200, height: 22 } },
    { text: 'VALID THRU 12/28', confidence: 0.91, bbox: { x: 500, y: 470, width: 140, height: 18 } }
  ];

  const input: PerceptionInput = {
    image: 'data:image/png;base64,dummy',
    width: 1920,
    height: 1080,
    coordinateSpace: 'SCREENSHOT',
    devicePixelRatio: 1,
    timestamp: Date.now(),
    locality: { isLocal: true, externalAiUsed: false, uploadPerformed: false }
  };

  const response = await detector.detectVisualObjects(input, undefined, mockWords);

  assert.strictEqual(response.success, true);
  assert.strictEqual(response.detections.length, 1);
  assert.strictEqual(response.detections[0].metadata?.category, 'PAYMENT_CARD');
});

test('M6.1 - 4 & 8. False Positive Rejection (Normal Webpage UI Card)', async () => {
  const detector = new LocalVisualObjectDetector();

  const mockNonDocWords: RawOcrWordForVision[] = [
    { text: 'Product Specification Card', confidence: 0.95, bbox: { x: 100, y: 100, width: 200, height: 20 } },
    { text: 'Item: Aluminum Laptop Stand', confidence: 0.90, bbox: { x: 100, y: 130, width: 180, height: 20 } },
    { text: 'Price: $29.99', confidence: 0.92, bbox: { x: 100, y: 160, width: 100, height: 20 } }
  ];

  const input: PerceptionInput = {
    image: 'data:image/png;base64,dummy',
    width: 1920,
    height: 1080,
    coordinateSpace: 'SCREENSHOT',
    devicePixelRatio: 1,
    timestamp: Date.now(),
    locality: { isLocal: true, externalAiUsed: false, uploadPerformed: false }
  };

  const response = await detector.detectVisualObjects(input, undefined, mockNonDocWords);

  assert.strictEqual(response.success, true);
  assert.strictEqual(response.detections.length, 0, 'Normal UI cards must not be detected as sensitive document objects');
});

test('M6.1 - 5, 6 & 7. Bounding Box Validation and Coordinate Space Clamping', () => {
  const bbox = { x: -30, y: -20, width: 2500, height: 1800 };
  const detection = LocalVisualObjectDetector.createVisualDetection(
    'vis_aadhaar_1',
    'AADHAAR_CARD',
    bbox,
    0.95,
    1920,
    1080
  );

  assert.strictEqual(detection.bbox.x, 0);
  assert.strictEqual(detection.bbox.y, 0);
  assert.strictEqual(detection.bbox.width, 1920);
  assert.strictEqual(detection.bbox.height, 1080);
});

test('M6.1 - 13 & 14. Pipeline Integration and Detector Failure Isolation', async () => {
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
  assert.strictEqual(unified.subsystems.vision?.status, 'SUCCESS');
  assert.ok(unified.timing.totalMs >= 0);
});
