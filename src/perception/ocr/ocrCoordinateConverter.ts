import { BoundingBox } from '../../schema/detection.js';

export interface RawOcrBBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export class OcrCoordinateConverter {
  /**
   * Converts raw OCR bounding box (x0, y0, x1, y1) into SCREENSHOT pixel coordinates.
   * Clamps values within screenshot bounds.
   */
  public static toScreenshotPixelCoords(
    rawBox: RawOcrBBox,
    screenshotWidth: number,
    screenshotHeight: number
  ): BoundingBox {
    let x = Math.round(rawBox.x0);
    let y = Math.round(rawBox.y0);
    let width = Math.round(rawBox.x1 - rawBox.x0);
    let height = Math.round(rawBox.y1 - rawBox.y0);

    // Boundary clamping
    x = Math.max(0, Math.min(x, screenshotWidth - 1));
    y = Math.max(0, Math.min(y, screenshotHeight - 1));
    width = Math.max(1, Math.min(width, screenshotWidth - x));
    height = Math.max(1, Math.min(height, screenshotHeight - y));

    return { x, y, width, height };
  }
}
