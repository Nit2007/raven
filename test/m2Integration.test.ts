import assert from 'node:assert';
import { test } from 'node:test';
import { LocalFaceDetector } from '../src/perception/face/faceDetector.js';
import { PerceptionInput } from '../src/perception/input/perceptionInput.js';

test('M2 Face Detection - Empty Input Handling', async () => {
  const detector = new LocalFaceDetector();

  const emptyInput = {} as PerceptionInput;

  const response = await detector.detectFaces(emptyInput);

  assert.strictEqual(response.success, false, 'Should fail gracefully on invalid input');
  assert.strictEqual(response.detections.length, 0, 'Detections array should be empty');
});

test('M2 Face Detection - No Face Output Contract', async () => {
  const detector = new LocalFaceDetector();

  const dummyInput: PerceptionInput = {
    image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    width: 1000,
    height: 1000,
    coordinateSpace: 'SCREENSHOT',
    devicePixelRatio: 1,
    timestamp: Date.now(),
    locality: {
      isLocal: true,
      externalAiUsed: false,
      uploadPerformed: false
    }
  };

  const response = await detector.detectFaces(dummyInput);

  assert.strictEqual(response.success, true, 'Execution must succeed');
  assert.strictEqual(Array.isArray(response.detections), true, 'Must return detections array');
  assert.ok(response.latencyMs >= 0, 'Latency must be non-negative');
});
