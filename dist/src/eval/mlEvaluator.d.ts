import { BoundingBox, DetectionResult, DetectionType } from '../schema/detection.js';
export interface GroundTruthAnnotation {
    id: string;
    type: DetectionType;
    bbox: BoundingBox;
    expectedText?: string;
    expectedCategory?: string;
}
export interface EvaluationMetrics {
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
    precision: number;
    recall: number;
    f1Score: number;
    accuracyPercentage: number;
}
export interface CategoryEvaluationReport {
    category: string;
    metrics: EvaluationMetrics;
}
export declare class MlEvaluator {
    /**
     * Evaluates predicted detections against ground-truth annotations using IoU matching.
     */
    evaluateDetections(predictions: DetectionResult[], groundTruth: GroundTruthAnnotation[], iouThreshold?: number): EvaluationMetrics;
}
