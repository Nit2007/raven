import { DetectionResult, PerceptionFrameInput } from '../schema/detection.js';
export declare class LocalPerceptionPipeline {
    private faceDetector;
    private ocrEngine;
    private piiDetector;
    private fusionEngine;
    constructor();
    init(): Promise<void>;
    /**
     * Main entry point for local perception processing.
     * Transforms raw frame image into structured DetectionResult[] evidence for Person 1.
     */
    perceiveFrame(input: PerceptionFrameInput, canvasSource?: CanvasImageSource): Promise<DetectionResult[]>;
}
