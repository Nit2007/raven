import assert from 'node:assert';
import { test } from 'node:test';
import { PiiCandidateDetector } from '../src/perception/pii/piiDetector.js';
test('PiiCandidateDetector - Email and Phone detection', () => {
    const detector = new PiiCandidateDetector();
    const ocrWords = [
        {
            text: 'contact@company.org',
            bbox: { x: 10, y: 20, width: 150, height: 20 },
            confidence: 0.95
        },
        {
            text: 'Hello',
            bbox: { x: 200, y: 20, width: 50, height: 20 },
            confidence: 0.99
        },
        {
            text: '+1-555-019-2834',
            bbox: { x: 300, y: 20, width: 120, height: 20 },
            confidence: 0.92
        }
    ];
    const results = detector.detectPiiFromOcr(ocrWords);
    assert.strictEqual(results.length, 2, 'Should detect 2 PII candidates');
    assert.strictEqual(results[0].metadata?.piiType, 'EMAIL');
    assert.strictEqual(results[1].metadata?.piiType, 'PHONE');
});
