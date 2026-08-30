import assert from 'node:assert';
import { test } from 'node:test';
import { FaceCoordinateConverter, NormalizedBBox } from '../src/perception/face/faceCoordinateConverter.js';

test('FaceCoordinateConverter - Normalized to Screenshot Pixel Conversion', () => {
  const normalizedBox: NormalizedBBox = {
    xMin: 0.1,
    yMin: 0.2,
    width: 0.3,
    height: 0.4
  };

  const screenshotWidth = 1920;
  const screenshotHeight = 1080;

  const bbox = FaceCoordinateConverter.toScreenshotPixelCoords(normalizedBox, screenshotWidth, screenshotHeight);

  assert.strictEqual(bbox.x, 192, 'x should be 10% of 1920 = 192');
  assert.strictEqual(bbox.y, 216, 'y should be 20% of 1080 = 216');
  assert.strictEqual(bbox.width, 576, 'width should be 30% of 1920 = 576');
  assert.strictEqual(bbox.height, 432, 'height should be 40% of 1080 = 432');
});

test('FaceCoordinateConverter - Boundary Clamping', () => {
  const outOfBoundsBox: NormalizedBBox = {
    xMin: -0.1,
    yMin: 0.9,
    width: 1.5,
    height: 0.5
  };

  const bbox = FaceCoordinateConverter.toScreenshotPixelCoords(outOfBoundsBox, 1000, 1000);

  assert.strictEqual(bbox.x, 0, 'x should clamp to 0');
  assert.strictEqual(bbox.y, 900, 'y should be 900');
  assert.strictEqual(bbox.width, 1000, 'width should clamp to remaining width (1000)');
  assert.strictEqual(bbox.height, 100, 'height should clamp to remaining height (100)');
});
