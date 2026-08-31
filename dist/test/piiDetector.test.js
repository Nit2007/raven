import assert from 'node:assert';
import { test } from 'node:test';
import { PiiCandidateDetector } from '../src/perception/pii/piiDetector.js';
test('PART B - Regression Test 1: +91 63609 55761', () => {
    const detector = new PiiCandidateDetector();
    const tokens = [
        { text: '+91', bbox: { x: 100, y: 50, width: 30, height: 18 }, confidence: 0.96 },
        { text: '63609', bbox: { x: 135, y: 50, width: 50, height: 18 }, confidence: 0.95 },
        { text: '55761', bbox: { x: 190, y: 50, width: 50, height: 18 }, confidence: 0.97 }
    ];
    const res = detector.detectPiiFromOcr(tokens);
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].metadata?.category, 'PHONE');
    assert.notStrictEqual(res[0].metadata?.category, 'PAYMENT_CARD');
});
test('PART B - Regression Test 2: +92 318 9664771', () => {
    const detector = new PiiCandidateDetector();
    const tokens = [
        { text: '+92', bbox: { x: 100, y: 50, width: 30, height: 18 }, confidence: 0.96 },
        { text: '318', bbox: { x: 135, y: 50, width: 30, height: 18 }, confidence: 0.95 },
        { text: '9664771', bbox: { x: 170, y: 50, width: 60, height: 18 }, confidence: 0.97 }
    ];
    const res = detector.detectPiiFromOcr(tokens);
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].metadata?.category, 'PHONE');
    assert.notStrictEqual(res[0].metadata?.category, 'PAYMENT_CARD');
});
test('PART B - Regression Test 3: +39 339 214 9566', () => {
    const detector = new PiiCandidateDetector();
    const tokens = [
        { text: '+39', bbox: { x: 100, y: 50, width: 30, height: 18 }, confidence: 0.96 },
        { text: '339', bbox: { x: 135, y: 50, width: 30, height: 18 }, confidence: 0.95 },
        { text: '214', bbox: { x: 170, y: 50, width: 30, height: 18 }, confidence: 0.97 },
        { text: '9566', bbox: { x: 205, y: 50, width: 40, height: 18 }, confidence: 0.98 }
    ];
    const res = detector.detectPiiFromOcr(tokens);
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].metadata?.category, 'PHONE');
    assert.notStrictEqual(res[0].metadata?.category, 'PAYMENT_CARD');
});
test('PART B - Regression Test 4: +966 55 955 4737', () => {
    const detector = new PiiCandidateDetector();
    const tokens = [
        { text: '+966', bbox: { x: 100, y: 50, width: 40, height: 18 }, confidence: 0.96 },
        { text: '55', bbox: { x: 145, y: 50, width: 20, height: 18 }, confidence: 0.95 },
        { text: '955', bbox: { x: 170, y: 50, width: 30, height: 18 }, confidence: 0.97 },
        { text: '4737', bbox: { x: 205, y: 50, width: 40, height: 18 }, confidence: 0.98 }
    ];
    const res = detector.detectPiiFromOcr(tokens);
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].metadata?.category, 'PHONE');
    assert.notStrictEqual(res[0].metadata?.category, 'PAYMENT_CARD');
});
test('PART B - Regression Test 5: 4111 1111 1111 1111 (Multi-token Spaced Card)', () => {
    const detector = new PiiCandidateDetector();
    const tokens = [
        { text: '4111', bbox: { x: 100, y: 100, width: 40, height: 18 }, confidence: 0.96 },
        { text: '1111', bbox: { x: 145, y: 100, width: 40, height: 18 }, confidence: 0.95 },
        { text: '1111', bbox: { x: 190, y: 100, width: 40, height: 18 }, confidence: 0.97 },
        { text: '1111', bbox: { x: 235, y: 100, width: 40, height: 18 }, confidence: 0.98 }
    ];
    const res = detector.detectPiiFromOcr(tokens);
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].metadata?.category, 'PAYMENT_CARD');
});
test('PART B - Regression Test 6: 4111111111111111 (Single-token Card)', () => {
    const detector = new PiiCandidateDetector();
    const tokens = [
        { text: '4111111111111111', bbox: { x: 100, y: 150, width: 160, height: 20 }, confidence: 0.96 }
    ];
    const res = detector.detectPiiFromOcr(tokens);
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].metadata?.category, 'PAYMENT_CARD');
});
test('PART B - Regression Test 7: Order ID: 9876543210 (False Positive Filter)', () => {
    const detector = new PiiCandidateDetector();
    const tokens = [
        { text: 'Order ID:', bbox: { x: 50, y: 200, width: 60, height: 20 }, confidence: 0.99 },
        { text: '9876543210', bbox: { x: 120, y: 200, width: 100, height: 20 }, confidence: 0.90 }
    ];
    const res = detector.detectPiiFromOcr(tokens);
    assert.strictEqual(res.length, 0, 'Order ID must NOT be classified as PHONE or PAYMENT_CARD');
});
test('PART B - Regression Test 8: Year: 2026 (False Positive Filter)', () => {
    const detector = new PiiCandidateDetector();
    const tokens = [
        { text: 'Year:', bbox: { x: 50, y: 250, width: 40, height: 20 }, confidence: 0.99 },
        { text: '2026', bbox: { x: 100, y: 250, width: 40, height: 20 }, confidence: 0.90 }
    ];
    const res = detector.detectPiiFromOcr(tokens);
    assert.strictEqual(res.length, 0, 'Year must NOT be classified as PHONE or PAYMENT_CARD');
});
test('PART B - Regression Test 9: Version: 1.2.3 (False Positive Filter)', () => {
    const detector = new PiiCandidateDetector();
    const tokens = [
        { text: 'Version:', bbox: { x: 50, y: 300, width: 50, height: 20 }, confidence: 0.99 },
        { text: '1.2.3', bbox: { x: 110, y: 300, width: 40, height: 20 }, confidence: 0.90 }
    ];
    const res = detector.detectPiiFromOcr(tokens);
    assert.strictEqual(res.length, 0, 'Version must NOT be classified as PHONE or PAYMENT_CARD');
});
