import { DetectionResult } from '../../schema/detection.js';
import { PerceptionInput } from '../input/perceptionInput.js';
import { RawOcrWord } from '../pii/piiDetector.js';
import { NormalizedOcrRegion } from './ocrTokenNormalizer.js';
export interface OcrResponse {
    success: boolean;
    detections: DetectionResult[];
    words: RawOcrWord[];
    normalizedRegions: NormalizedOcrRegion[];
    latencyMs: number;
    engineInfo: string;
    rawText?: string;
    error?: string;
}
export interface IOcrEngine {
    init(): Promise<void>;
    recognizeText(input: PerceptionInput, imageSource?: HTMLImageElement | HTMLCanvasElement | ImageBitmap): Promise<OcrResponse>;
}
export declare class LocalOcrEngine implements IOcrEngine {
    private isInitialized;
    private engineInfo;
    private normalizer;
    init(): Promise<void>;
    /**
     * Main entry point for Local OCR text recognition.
     * Uses genuine Tesseract.js WASM engine to recognize visual text.
     */
    recognizeText(input: PerceptionInput, imageSource?: HTMLImageElement | HTMLCanvasElement | ImageBitmap): Promise<OcrResponse>;
}
