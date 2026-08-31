import { DetectionResult, PerceptionFrameInput, UnifiedPerceptionResult } from '../schema/detection.js';
import { FaceDetectionResponse } from './face/faceDetector.js';
import { PerceptionInput } from './input/perceptionInput.js';
import { OcrResponse } from './ocr/ocrEngine.js';
import { VisualDetectorResponse } from './vision/visualObjectDetector.js';
export interface PiiDetectionResponse {
    success: boolean;
    detections: DetectionResult[];
    latencyMs: number;
    engineInfo: string;
    error?: string;
}
export declare class LocalPerceptionPipeline {
    private faceDetector;
    private ocrEngine;
    private tokenNormalizer;
    private piiDetector;
    private visualDetector;
    private fusionEngine;
    private isOcrInitialized;
    constructor();
    init(): Promise<void>;
    /**
     * M2 Local Face Detection interface entry point.
     */
    detectFaces(input: PerceptionInput, imageSource?: HTMLImageElement | HTMLCanvasElement | ImageBitmap): Promise<FaceDetectionResponse>;
    /**
     * M3 Local OCR interface entry point.
     */
    recognizeText(input: PerceptionInput, imageSource?: HTMLImageElement | HTMLCanvasElement | ImageBitmap): Promise<OcrResponse>;
    /**
     * M4 Local PII Candidate Detection entry point.
     */
    detectPii(input: PerceptionInput, imageSource?: HTMLImageElement | HTMLCanvasElement | ImageBitmap): Promise<PiiDetectionResponse>;
    /**
     * M6/M6.1 Local Visual Sensitive Document Detector entry point.
     */
    detectVisualObjects(input: PerceptionInput, imageSource?: HTMLImageElement | HTMLCanvasElement | ImageBitmap, ocrWords?: any[]): Promise<VisualDetectorResponse>;
    /**
     * M5/M6/M6.1 Main Entry Point: Person 1 Local Handoff Function.
     * Executes local perception across Face, OCR, PII, and Visual Document modules with failure isolation and constructs UnifiedPerceptionResult.
     */
    runLocalPerception(input: PerceptionInput, imageSource?: HTMLImageElement | HTMLCanvasElement | ImageBitmap): Promise<UnifiedPerceptionResult>;
    /**
     * Main entry point for local perception frame processing.
     */
    perceiveFrame(input: PerceptionFrameInput, canvasSource?: HTMLCanvasElement): Promise<DetectionResult[]>;
}
