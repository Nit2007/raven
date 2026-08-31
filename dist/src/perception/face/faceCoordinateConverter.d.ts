import { BoundingBox } from '../../schema/detection.js';
export interface NormalizedBBox {
    xMin: number;
    yMin: number;
    width: number;
    height: number;
}
export declare class FaceCoordinateConverter {
    /**
     * Converts normalized bounding box (0.0 to 1.0) into SCREENSHOT pixel coordinates.
     * Clamps values to screenshot dimensions to prevent out-of-bounds bounding boxes.
     */
    static toScreenshotPixelCoords(normalizedBox: NormalizedBBox, screenshotWidth: number, screenshotHeight: number): BoundingBox;
}
