import assert from 'node:assert';
import { test } from 'node:test';
import { LocalOcrEngine } from '../src/perception/ocr/ocrEngine.js';
test('LocalOcrEngine - Initialization and Execution', async () => {
    const ocrEngine = new LocalOcrEngine();
    await ocrEngine.init();
    const dummyInput = {
        image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        width: 1280,
        height: 720,
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
    assert.strictEqual(response.success, true, 'OCR execution must succeed');
    assert.strictEqual(Array.isArray(response.detections), true, 'Detections must be an array');
    assert.strictEqual(Array.isArray(response.words), true, 'Words must be an array');
    assert.ok(response.latencyMs >= 0, 'Latency must be a non-negative number');
    assert.ok(response.engineInfo.length > 0, 'Engine info must be populated');
});
test('LocalOcrEngine - Schema Format Verification', async () => {
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
    for (const det of response.detections) {
        assert.strictEqual(det.type, 'OCR_TEXT', 'Type must be OCR_TEXT');
        assert.strictEqual(det.source, 'ocr', 'Source must be ocr');
        assert.ok(det.id.startsWith('det_ocr_'), 'ID must start with det_ocr_');
        assert.ok(typeof det.bbox.x === 'number', 'bbox.x must be a number');
        assert.ok(typeof det.bbox.y === 'number', 'bbox.y must be a number');
        assert.ok(det.bbox.width > 0, 'bbox.width must be positive');
        assert.ok(det.bbox.height > 0, 'bbox.height must be positive');
        assert.ok(det.confidence >= 0 && det.confidence <= 1.0, 'Confidence must be normalized between 0.0 and 1.0');
    }
});
test('LocalOcrEngine - Invalid Input Handling', async () => {
    const ocrEngine = new LocalOcrEngine();
    const invalidInput = {};
    const response = await ocrEngine.recognizeText(invalidInput);
    assert.strictEqual(response.success, false, 'Invalid input should fail gracefully');
    assert.strictEqual(response.detections.length, 0);
    assert.strictEqual(response.words.length, 0);
});
