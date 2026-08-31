import { DetectionResult } from '../../schema/detection.js';
import { PerceptionInput } from '../input/perceptionInput.js';
export interface FaceDetectionResponse {
    success: boolean;
    detections: DetectionResult[];
    latencyMs: number;
    modelInfo: string;
    error?: string;
}
export interface IFaceDetector {
    init(): Promise<void>;
    detectFaces(input: PerceptionInput, imageSource?: HTMLImageElement | HTMLCanvasElement | ImageBitmap): Promise<FaceDetectionResponse>;
}
export declare class LocalFaceDetector implements IFaceDetector {
    private isInitialized;
    private modelName;
    init(): Promise<void>;
    /**
     * Main face detection method. Accepts a PerceptionInput frame and optional image source.
     */
    detectFaces(input: PerceptionInput, imageSource?: HTMLImageElement | HTMLCanvasElement | ImageBitmap): Promise<FaceDetectionResponse>;
    /**
     * Multi-region visual analyzer inspecting image pixel buffer for human faces.
     */
    private analyzeImageBuffer;
}
