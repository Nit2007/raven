import assert from 'node:assert';
import { test } from 'node:test';
import { OcrTokenNormalizer } from '../src/perception/ocr/ocrTokenNormalizer.js';
import { PiiCandidateDetector } from '../src/perception/pii/piiDetector.js';
test('OcrTokenNormalizer - Spatially Adjacent Token Grouping (+91 733 961 3670)', () => {
    const normalizer = new OcrTokenNormalizer();
    const rawTokens = [
        { text: '+91', bbox: { x: 100, y: 50, width: 30, height: 18 }, confidence: 0.96 },
        { text: '733', bbox: { x: 135, y: 50, width: 30, height: 18 }, confidence: 0.95 },
        { text: '961', bbox: { x: 170, y: 50, width: 30, height: 18 }, confidence: 0.97 },
        { text: '3670', bbox: { x: 205, y: 50, width: 40, height: 18 }, confidence: 0.98 }
    ];
    const normalized = normalizer.normalizeTokens(rawTokens);
    assert.strictEqual(normalized.length, 1, 'Should group 4 tokens into 1 normalized region');
    assert.strictEqual(normalized[0].groupedText, '+91 733 961 3670');
    assert.deepStrictEqual(normalized[0].combinedBBox, { x: 100, y: 50, width: 145, height: 18 });
    assert.strictEqual(normalized[0].sourceTokens.length, 4);
    // Pass normalized OCR words array into M4 PiiCandidateDetector
    const piiDetector = new PiiCandidateDetector();
    const piiResults = piiDetector.detectPiiFromOcr(rawTokens);
    assert.strictEqual(piiResults.length, 1, 'M4 must produce 1 PII candidate');
    assert.strictEqual(piiResults[0].metadata?.category, 'PHONE');
    assert.strictEqual(piiResults[0].metadata?.text, '+91 733 961 3670');
});
test('OcrTokenNormalizer - Distinguishes Unrelated Adjacent Text (Order ID: 9876543210)', () => {
    const normalizer = new OcrTokenNormalizer();
    const piiDetector = new PiiCandidateDetector();
    const rawTokens = [
        { text: 'Order ID:', bbox: { x: 50, y: 200, width: 60, height: 20 }, confidence: 0.99 },
        { text: '9876543210', bbox: { x: 120, y: 200, width: 100, height: 20 }, confidence: 0.90 }
    ];
    const normalized = normalizer.normalizeTokens(rawTokens);
    assert.strictEqual(normalized.length, 1);
    assert.strictEqual(normalized[0].groupedText, 'Order ID: 9876543210');
    const piiResults = piiDetector.detectPiiFromOcr(rawTokens);
    assert.strictEqual(piiResults.length, 0, 'Order ID number must NOT become a PHONE candidate');
});
