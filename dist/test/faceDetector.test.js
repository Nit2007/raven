import assert from 'node:assert';
import { test } from 'node:test';
import { LocalFaceDetector } from '../src/perception/face/faceDetector.js';
test('LocalFaceDetector - Initialization and Session Reuse', async () => {
    const detector = new LocalFaceDetector();
    await detector.init();
    const dummyInput = {
        image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        width: 800,
        height: 600,
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
    assert.strictEqual(response.success, true, 'Face detection call should succeed');
    assert.strictEqual(Array.isArray(response.detections), true, 'Detections should be an array');
    assert.ok(response.latencyMs >= 0, 'Latency should be a non-negative number');
    assert.ok(response.modelInfo.length > 0, 'Model info should be populated');
});
test('LocalFaceDetector - Output Schema Normalization', async () => {
    const detector = new LocalFaceDetector();
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
    const response = await detector.detectFaces(dummyInput);
    for (const det of response.detections) {
        assert.strictEqual(det.type, 'FACE', 'Type must be FACE');
        assert.strictEqual(det.source, 'face', 'Source must be face');
        assert.ok(det.id.startsWith('det_face_'), 'ID must start with det_face_');
        assert.ok(typeof det.bbox.x === 'number', 'bbox.x must be a number');
        assert.ok(typeof det.bbox.y === 'number', 'bbox.y must be a number');
        assert.ok(det.bbox.width > 0, 'bbox.width must be positive');
        assert.ok(det.bbox.height > 0, 'bbox.height must be positive');
        assert.ok(det.confidence >= 0 && det.confidence <= 1.0, 'Confidence must be between 0.0 and 1.0');
    }
});
