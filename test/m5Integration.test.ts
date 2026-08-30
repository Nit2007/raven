import assert from 'node:assert';
import { test } from 'node:test';
import { PerceptionInput } from '../src/perception/input/perceptionInput.js';
import { LocalPerceptionPipeline } from '../src/perception/perceptionPipeline.js';

test('M5 End-to-End Integration Test - Unified Perception Result Contract', async () => {
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

  assert.ok(unified, 'UnifiedPerceptionResult must be generated');
  assert.strictEqual(unified.schemaVersion, '1.0.0');
  assert.strictEqual(unified.screenshot.width, 1920);
  assert.strictEqual(unified.screenshot.height, 1080);
  assert.strictEqual(unified.screenshot.coordinateSpace, 'SCREENSHOT');

  // Verify locality report
  assert.strictEqual(unified.locality.isLocal, true);
  assert.strictEqual(unified.locality.externalAiUsed, false);
  assert.strictEqual(unified.locality.networkUploadPerformed, false);

  // Verify timing structure
  assert.ok(typeof unified.timing.totalMs === 'number');
  assert.ok(typeof unified.timing.fusionMs === 'number');

  // Verify subsystem statuses
  assert.ok(unified.subsystems.face);
  assert.ok(unified.subsystems.ocr);
  assert.ok(unified.subsystems.pii);
});
