import { PerceptionInput } from '../input/perceptionInput.js';
export interface CaptureResult {
    success: boolean;
    input?: PerceptionInput;
    error?: string;
}
export declare class CaptureManager {
    /**
     * Captures the current visible tab and constructs a PerceptionInput.
     * Handles errors gracefully (e.g., restricted chrome:// pages or permission errors).
     */
    captureVisibleViewport(): Promise<CaptureResult>;
    /**
     * Decodes image data URL locally to measure pixel dimensions.
     */
    private getImageDimensions;
}
