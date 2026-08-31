export class FaceCoordinateConverter {
    /**
     * Converts normalized bounding box (0.0 to 1.0) into SCREENSHOT pixel coordinates.
     * Clamps values to screenshot dimensions to prevent out-of-bounds bounding boxes.
     */
    static toScreenshotPixelCoords(normalizedBox, screenshotWidth, screenshotHeight) {
        // Convert normalized coordinates to raw pixel coordinates
        let x = Math.round(normalizedBox.xMin * screenshotWidth);
        let y = Math.round(normalizedBox.yMin * screenshotHeight);
        let width = Math.round(normalizedBox.width * screenshotWidth);
        let height = Math.round(normalizedBox.height * screenshotHeight);
        // Boundary clamping
        x = Math.max(0, Math.min(x, screenshotWidth - 1));
        y = Math.max(0, Math.min(y, screenshotHeight - 1));
        width = Math.max(1, Math.min(width, screenshotWidth - x));
        height = Math.max(1, Math.min(height, screenshotHeight - y));
        return { x, y, width, height };
    }
}
