import { BoundingBox } from '../../schema/detection.js';
export interface RawOcrBBox {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}
export declare class OcrCoordinateConverter {
    /**
     * Converts raw OCR bounding box (x0, y0, x1, y1) into SCREENSHOT pixel coordinates.
     * Clamps values within screenshot bounds.
     */
    static toScreenshotPixelCoords(rawBox: RawOcrBBox, screenshotWidth: number, screenshotHeight: number): BoundingBox;
}
