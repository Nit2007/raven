import assert from 'node:assert';
import { test } from 'node:test';
import { OcrCoordinateConverter } from '../src/perception/ocr/ocrCoordinateConverter.js';
test('OcrCoordinateConverter - Bounding Box Conversion', () => {
    const rawBox = {
        x0: 100.4,
        y0: 200.6,
        x1: 350.2,
        y1: 240.8
    };
    const screenshotWidth = 1920;
    const screenshotHeight = 1080;
    const bbox = OcrCoordinateConverter.toScreenshotPixelCoords(rawBox, screenshotWidth, screenshotHeight);
    assert.strictEqual(bbox.x, 100);
    assert.strictEqual(bbox.y, 201);
    assert.strictEqual(bbox.width, 250);
    assert.strictEqual(bbox.height, 40);
});
test('OcrCoordinateConverter - Boundary Clamping', () => {
    const outOfBoundsBox = {
        x0: -10,
        y0: 1050,
        x1: 2000,
        y1: 1150
    };
    const bbox = OcrCoordinateConverter.toScreenshotPixelCoords(outOfBoundsBox, 1920, 1080);
    assert.strictEqual(bbox.x, 0);
    assert.strictEqual(bbox.y, 1050);
    assert.strictEqual(bbox.width, 1920);
    assert.strictEqual(bbox.height, 30);
});
