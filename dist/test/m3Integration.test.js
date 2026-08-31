import assert from 'node:assert';
import { test } from 'node:test';
import { LocalOcrEngine } from '../src/perception/ocr/ocrEngine.js';
test('M3 Local OCR - Empty PerceptionInput Handling', async () => {
    const ocrEngine = new LocalOcrEngine();
    const emptyInput = {};
    const response = await ocrEngine.recognizeText(emptyInput);
    assert.strictEqual(response.success, false, 'Should fail gracefully on invalid input');
    assert.strictEqual(response.detections.length, 0);
    assert.strictEqual(response.words.length, 0);
});
test('M3 Local OCR - Output Contract and Schema Validity', async () => {
    const ocrEngine = new LocalOcrEngine();
    const dummyInput = {
        image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        width: 1920,
        height: 1080,
        coordinateSpace: 'SCREENSHOT',
        devicePixelRatio: 1,
        timestamp: Date.now(),
        locality: {
            isLocal: true,
            externalAiUsed: false,
            uploadPerformed: false
        }
    };
    const response = await ocrEngine.recognizeText(dummyInput);
    assert.strictEqual(response.success, true, 'OCR call must succeed');
    assert.strictEqual(Array.isArray(response.detections), true);
    assert.ok(response.latencyMs >= 0, 'Latency must be non-negative');
});
