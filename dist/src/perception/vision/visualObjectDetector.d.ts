import { BoundingBox, DetectionResult } from '../../schema/detection.js';
import { PerceptionInput } from '../input/perceptionInput.js';
export interface VisualDetectorResponse {
    success: boolean;
    detections: DetectionResult[];
    latencyMs: number;
    engineInfo: string;
    capabilityStatus: 'MODEL_CAPABILITY_GAP_IDENTIFIED' | 'PARTIAL_MULTI_MODAL_READY' | 'READY';
    error?: string;
}
export type VisualSensitiveCategory = 'AADHAAR_CARD' | 'ID_DOCUMENT' | 'PASSPORT' | 'PAYMENT_CARD';
export interface RawOcrWordForVision {
    text: string;
    confidence: number;
    bbox: BoundingBox;
}
export declare class LocalVisualObjectDetector {
    private isInitialized;
    private confidenceThreshold;
    init(): Promise<void>;
    setConfidenceThreshold(threshold: number): void;
    getConfidenceThreshold(): number;
    /**
     * Performs visual document object detection (AADHAAR_CARD, ID_DOCUMENT, PASSPORT, PAYMENT_CARD).
     * Combines visual aspect-ratio region proposals with multi-modal spatial OCR evidence.
     */
    detectVisualObjects(input: PerceptionInput, imageSource?: HTMLImageElement | HTMLCanvasElement | ImageBitmap, ocrWords?: RawOcrWordForVision[]): Promise<VisualDetectorResponse>;
    /**
     * Extracts visual document bounding regions by clustering spatially aligned OCR words that contain document context evidence,
     * enforcing ID-1 document aspect ratio constraints (1.30 - 1.80).
     */
    private extractMultiModalDocumentRegions;
    /**
     * Helper function to normalize visual object detections to SCREENSHOT coordinate space.
     */
    static createVisualDetection(id: string, category: VisualSensitiveCategory, bbox: BoundingBox, confidence: number, imgWidth: number, imgHeight: number): DetectionResult;
}
