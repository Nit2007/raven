import { BoundingBox, DetectionResult, StageTiming, UnifiedPerceptionResult } from '../../schema/detection.js';
export interface PerceptionFusionInput {
    screenshotWidth: number;
    screenshotHeight: number;
    faceResults?: {
        detections: DetectionResult[];
        status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
        error?: string;
    };
    ocrResults?: {
        detections: DetectionResult[];
        status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
        error?: string;
    };
    piiResults?: {
        detections: DetectionResult[];
        status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
        error?: string;
    };
    visionResults?: {
        detections: DetectionResult[];
        status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
        error?: string;
    };
    timing: StageTiming;
}
export declare class PerceptionFusionEngine {
    /**
     * Computes Intersection over Union (IoU) between two bounding boxes.
     */
    static computeIoU(a: BoundingBox, b: BoundingBox): number;
    /**
     * Validates and clamps a bounding box to SCREENSHOT dimensions.
     * x >= 0, y >= 0, x + width <= screenshotWidth, y + height <= screenshotHeight.
     */
    static validateAndClampBBox(bbox: BoundingBox, imgWidth: number, imgHeight: number): BoundingBox;
    /**
     * Fuses multi-source detection arrays (Face, OCR, PII, Vision) into a single deduplicated list.
     * Priority: PII_CANDIDATE > FACE > VISUAL_REGION > OCR_TEXT
     * Deduplication preserves distinct detection types and nearby distinct text values.
     */
    fuseDetections(detectionGroups: DetectionResult[][], imgWidthOrIou?: number, imgHeight?: number, iouThreshold?: number): DetectionResult[];
    /**
     * Main entry point constructing UnifiedPerceptionResult for Person 1 handoff.
     */
    buildUnifiedResult(input: PerceptionFusionInput): UnifiedPerceptionResult;
}
