import { BoundingBox, DetectionResult } from '../../schema/detection.js';
export declare class PerceptionFusionEngine {
    /**
     * Computes Intersection over Union (IoU) between two bounding boxes.
     */
    static computeIoU(a: BoundingBox, b: BoundingBox): number;
    /**
     * Fuses multi-source detection arrays (Face, OCR, PII, Vision) into a single deduplicated list.
     * Priority: PII_CANDIDATE > FACE > VISUAL_REGION > OCR_TEXT
     */
    fuseDetections(detectionGroups: DetectionResult[][], iouThreshold?: number): DetectionResult[];
}
